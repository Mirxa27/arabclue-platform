/**
 * recovery-service-prisma — Prisma adapters for the Recovery_Service.
 *
 * This module provides production implementations of the RecoveryRepository,
 * RecoveryEmailProvider, and RecoveryAuditSink interfaces using Prisma,
 * Resend, and the audit log. Keeping these here follows the pattern set by
 * `account-service-prisma.ts` and `invitation-service-prisma.ts` so the domain
 * rules in `recovery-service.ts` stay driven by injected boundaries and
 * property tests make no network calls or shared-database mutations.
 */

import { db } from "./db";
import { describeEmailFailure, isEmailConfigured, sendEmail } from "./email";
import { audit } from "./audit";
import { createRecoveryService } from "./recovery-service";
import type {
  RecoveryRepository,
  RecoveryService,
  RecoveryServiceDependencies,
  CreateRecoveryTokenInput,
  CreateRecoveryTokenOutcome,
  StoredRecoveryToken,
  ResetPasswordInput,
  ResetPasswordOutcome,
  RecoveryEmailProvider,
  RecoveryEmailContent,
  RecoveryEmailSendOutcome,
  RecoveryAuditSink,
  RecoveryAuditEntry,
} from "./recovery-service";
import type { Locale } from "./types";

/* -------------------------------------------------------------------------- */
/* Prisma Recovery Repository                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Production recovery repository using Prisma and PostgreSQL.
 * Every method is one serializable transaction.
 */
export const prismaRecoveryRepository: RecoveryRepository = Object.freeze({
  async findEligibleUserByEmail(email: string): Promise<Readonly<{
    id: string;
    email: string;
    locale: Locale;
  }> | null> {
    const user = await db.user.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        active: true,
        emailVerified: true,
      },
      select: {
        id: true,
        email: true,
        locale: true,
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      locale: (user.locale as Locale) ?? "ar",
    };
  },

  async createRecoveryToken(
    input: CreateRecoveryTokenInput
  ): Promise<CreateRecoveryTokenOutcome> {
    const result = await db.$transaction(async (tx) => {
      // Re-check user eligibility inside the transaction
      const user = await tx.user.findFirst({
        where: {
          id: input.userId,
          email: { equals: input.email, mode: "insensitive" },
          active: true,
          emailVerified: true,
        },
        select: { id: true },
      });

      if (!user) {
        return { kind: "USER_NOT_ELIGIBLE" as const };
      }

      // Invalidate all earlier unconsumed tokens (criterion 2.2)
      const invalidated = await tx.recoveryToken.updateMany({
        where: {
          userId: input.userId,
          consumedAt: null,
          expiresAt: { gt: input.createdAt },
        },
        data: {
          consumedAt: input.createdAt,
        },
      });

      // Create the new token
      const created = await tx.recoveryToken.create({
        data: {
          userId: input.userId,
          tokenHash: input.token.tokenHash,
          hashSalt: input.token.hashSalt,
          hashVersion: input.token.hashVersion,
          expiresAt: input.token.expiresAt,
          createdAt: input.createdAt,
        },
        select: {
          id: true,
          userId: true,
          createdAt: true,
          expiresAt: true,
        },
      });

      return {
        kind: "CREATED" as const,
        token: {
          id: created.id,
          userId: created.userId,
          email: input.email,
          createdAt: created.createdAt,
          expiresAt: created.expiresAt,
          replacedCount: invalidated.count,
        },
      };
    });

    return result;
  },

  async findRecoveryTokenByHash(tokenHash: string): Promise<StoredRecoveryToken | null> {
    const token = await db.recoveryToken.findFirst({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        tokenHash: true,
        hashSalt: true,
        hashVersion: true,
        createdAt: true,
        expiresAt: true,
        consumedAt: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    if (!token) return null;

    return {
      id: token.id,
      userId: token.userId,
      email: token.user.email,
      tokenHash: token.tokenHash,
      hashSalt: token.hashSalt,
      hashVersion: token.hashVersion,
      createdAt: token.createdAt,
      expiresAt: token.expiresAt,
      consumedAt: token.consumedAt,
    };
  },

  async resetPassword(
    input: ResetPasswordInput
  ): Promise<ResetPasswordOutcome> {
    const result = await db.$transaction(async (tx) => {
      // Re-read token to ensure it hasn't been consumed since lookup
      const token = await tx.recoveryToken.findUnique({
        where: { id: input.tokenId },
        select: {
          id: true,
          userId: true,
          tokenHash: true,
          consumedAt: true,
        },
      });

      if (!token || token.tokenHash !== input.tokenHash || token.consumedAt !== null) {
        return { kind: "TOKEN_INVALID" as const };
      }

      // Update password hash
      await tx.user.update({
        where: { id: input.userId },
        data: { passwordHash: input.passwordHash },
      });

      // Consume the token
      await tx.recoveryToken.update({
        where: { id: input.tokenId },
        data: { consumedAt: input.resetAt },
      });

      // Revoke all sessions (criterion 2.3)
      const revoked = await tx.userSession.deleteMany({
        where: { userId: input.userId },
      });

      return {
        kind: "RESET_COMPLETE" as const,
        userId: input.userId,
        sessionsRevoked: revoked.count,
      };
    });

    return result;
  },
});

/* -------------------------------------------------------------------------- */
/* Recovery Email Provider                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Production email provider using Resend through the shared email boundary.
 * Maps the RecoveryEmailProvider interface to the existing email infrastructure.
 */
export const resendRecoveryEmailProvider: RecoveryEmailProvider = Object.freeze({
  isConfigured(): boolean {
    return isEmailConfigured();
  },

  async send(
    message: RecoveryEmailContent,
    context: Readonly<{ signal: AbortSignal }>
  ): Promise<RecoveryEmailSendOutcome> {
    if (!isEmailConfigured()) {
      return { ok: false, skipped: true };
    }

    try {
      const result = await sendEmail({
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });

      if (result.ok) return { ok: true };
      return {
        ok: false,
        skipped: result.skipped === true,
        // Carried to the audit row only. Without it a real outage is
        // indistinguishable from any other delivery failure.
        error: describeEmailFailure(result),
      };
    } catch (error) {
      console.error("[recovery-email-provider] send failed", {
        errorName: error instanceof Error ? error.name : typeof error,
      });
      return {
        ok: false,
        error: `provider threw ${error instanceof Error ? error.name : typeof error}`,
      };
    }
  },
});

/* -------------------------------------------------------------------------- */
/* Recovery Audit Sink                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Production audit sink using the shared audit log.
 * Maps RecoveryAuditEntry to the platform audit format.
 */
export const platformRecoveryAuditSink: RecoveryAuditSink = Object.freeze({
  async append(entry: RecoveryAuditEntry): Promise<void> {
    await audit({
      userId: entry.userId,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId,
      severity: entry.severity,
      ipAddress: entry.sourceAddress,
      details: entry.details,
    });
  },
});

/**
 * Production Recovery_Service wired to Prisma, Resend, and the platform audit
 * log. Tests inject fakes through `createRecoveryService` instead.
 */
export function createPrismaRecoveryService(
  overrides: Partial<RecoveryServiceDependencies> = {}
): RecoveryService {
  return createRecoveryService({
    ...overrides,
    repository: overrides.repository ?? prismaRecoveryRepository,
    email: overrides.email ?? resendRecoveryEmailProvider,
    audit: overrides.audit ?? platformRecoveryAuditSink,
  });
}
