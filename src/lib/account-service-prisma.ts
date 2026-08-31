/**
 * Production adapters for the Account_Service (design sections 4.1 and 6).
 *
 * This module owns every external boundary the domain service declares:
 * PostgreSQL through Prisma serializable transactions, the Resend email
 * boundary, and the append-only audit trail. Keeping the adapters here lets
 * `account-service.ts` stay free of Prisma, provider SDKs, and the database
 * client, so unit and property tests exercise the domain rules without a
 * network call or a shared-database mutation.
 */

import { Prisma } from "@prisma/client";
import { db } from "./db";
import { audit } from "./audit";
import { isEmailConfigured, sendEmail } from "./email";
import { asSchemaMigrationPendingError } from "./api-failure";
import {
  DuplicateAccountEmailError,
  REGISTRATION_TRANSACTION_MAX_WAIT_MS,
  REGISTRATION_TRANSACTION_TIMEOUT_MS,
  createAccountService,
  type AccountAuditSink,
  type AccountEmailProvider,
  type AccountRepository,
  type AccountService,
  type AccountServiceDependencies,
  type ConsumeVerificationTokenInput,
  type CreateAccountRecordsInput,
  type CreatedAccountRecords,
  type ReplaceVerificationTokenInput,
  type StoredVerificationToken,
  type UnverifiedAccountSnapshot,
} from "./account-service";

type PrismaClientLike = typeof db;

const UNIQUE_CONSTRAINT_ERROR = "P2002";
const BRAND_DEFAULTS = Object.freeze({
  primaryColor: "#1E3A8A",
  secondaryColor: "#0F172A",
  accentColor: "#0EA5E9",
  fontFamily: "IBM Plex Sans Arabic",
});
const STARTER_PLAN_NAME = "STARTER";
const STARTER_PERIOD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Prisma-backed persistence for registration and verification. */
export function createPrismaAccountRepository(
  client: PrismaClientLike = db
): AccountRepository {
  return Object.freeze({
    async findUserIdByNormalizedEmail(normalizedEmail) {
      return withMappedFailures(async () => {
        const existing = await client.user.findFirst({
          where: { email: { equals: normalizedEmail, mode: "insensitive" } },
          select: { id: true },
        });
        return existing?.id ?? null;
      });
    },

    async createAccountRecords(input) {
      return withMappedFailures(() => runAccountTransaction(client, input));
    },

    async findVerificationTokenByHash(tokenHash) {
      return withMappedFailures(async () => {
        const record = await client.verificationToken.findFirst({
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
            user: { select: { email: true } },
          },
        });
        if (!record) return null;
        const stored: StoredVerificationToken = {
          id: record.id,
          userId: record.userId,
          userEmail: record.user.email,
          tokenHash: record.tokenHash,
          hashSalt: record.hashSalt,
          hashVersion: record.hashVersion,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
          consumedAt: record.consumedAt,
        };
        return stored;
      });
    },

    async consumeVerificationToken(input) {
      return withMappedFailures(() => runConsumeTransaction(client, input));
    },

    async findUnverifiedAccountByNormalizedEmail(normalizedEmail) {
      return withMappedFailures(async () => {
        const record = await client.user.findFirst({
          where: {
            email: { equals: normalizedEmail, mode: "insensitive" },
            emailVerified: false,
            // A deactivated account has nothing to unlock, so it is not mailed.
            active: true,
          },
          select: {
            id: true,
            email: true,
            locale: true,
            // `activeWorkspaceId` is a plain scalar with no relation field, so
            // the workspace is read through the founding membership.
            workspaces: {
              orderBy: { createdAt: "asc" },
              take: 1,
              select: { workspace: { select: { id: true, name: true } } },
            },
          },
        });
        const workspace = record?.workspaces[0]?.workspace;
        if (!record || !workspace) return null;
        const snapshot: UnverifiedAccountSnapshot = {
          userId: record.id,
          email: record.email,
          locale: record.locale === "en" ? "en" : "ar",
          workspaceId: workspace.id,
          workspaceName: workspace.name,
        };
        return snapshot;
      });
    },

    async replaceVerificationToken(input) {
      return withMappedFailures(() => runReplaceTokenTransaction(client, input));
    },
  });
}

/**
 * Creates user, workspace, writer membership, verification token, and the
 * baseline workspace relations in one serializable transaction. Bounded
 * `maxWait`/`timeout` keep the committed-records phase inside the five-second
 * contract in criterion 1.1.
 */
async function runAccountTransaction(
  client: PrismaClientLike,
  input: CreateAccountRecordsInput
): Promise<CreatedAccountRecords> {
  try {
    return await client.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            name: input.name,
            passwordHash: input.passwordHash,
            role: input.platformRole,
            active: true,
            locale: input.locale,
            emailVerified: input.emailVerified === true,
            emailVerifiedAt: input.emailVerified === true ? input.createdAt : null,
            mustChangePassword: false,
          },
          select: { id: true },
        });

        const workspace = await tx.workspace.create({
          data: {
            name: input.workspaceName,
            slug: input.workspaceSlug,
            plan: STARTER_PLAN_NAME,
            brandProfiles: { create: { ...BRAND_DEFAULTS } },
          },
          select: { id: true },
        });

        const membership = await tx.workspaceMember.create({
          data: {
            workspaceId: workspace.id,
            userId: user.id,
            role: input.membershipRole,
          },
          select: { id: true },
        });

        await tx.user.update({
          where: { id: user.id },
          data: { activeWorkspaceId: workspace.id },
        });

        const starterPlan = await tx.subscriptionPlan.findFirst({
          where: { name: STARTER_PLAN_NAME, isActive: true },
          select: { id: true },
        });
        if (starterPlan) {
          await tx.subscription.create({
            data: {
              userId: user.id,
              planId: starterPlan.id,
              status: "ACTIVE",
              billingCycle: "MONTHLY",
              currentPeriodStart: input.createdAt,
              currentPeriodEnd: new Date(
                input.createdAt.getTime() + STARTER_PERIOD_DAYS * DAY_MS
              ),
            },
          });
        }

        const verification = await tx.verificationToken.create({
          data: {
            userId: user.id,
            tokenHash: input.verificationToken.tokenHash,
            hashSalt: input.verificationToken.hashSalt,
            hashVersion: input.verificationToken.hashVersion,
            expiresAt: input.verificationToken.expiresAt,
            consumedAt:
              input.emailVerified === true ? input.createdAt : null,
          },
          select: { id: true },
        });

        return {
          userId: user.id,
          workspaceId: workspace.id,
          membershipId: membership.id,
          verificationTokenId: verification.id,
        };
      },
      {
        isolationLevel: "Serializable",
        maxWait: REGISTRATION_TRANSACTION_MAX_WAIT_MS,
        timeout: REGISTRATION_TRANSACTION_TIMEOUT_MS,
      }
    );
  } catch (error) {
    if (isEmailUniqueViolation(error)) {
      throw new DuplicateAccountEmailError({ cause: error });
    }
    throw error;
  }
}

/**
 * Marks the user verified and consumes the token in one serializable
 * transaction. The conditional update makes the first submission the only
 * consumer, so a replayed token mutates nothing (criteria 1.6, 1.7).
 */
async function runConsumeTransaction(
  client: PrismaClientLike,
  input: ConsumeVerificationTokenInput
): Promise<boolean> {
  return client.$transaction(
    async (tx) => {
      const claimed = await tx.verificationToken.updateMany({
        where: {
          id: input.tokenId,
          userId: input.userId,
          consumedAt: null,
          expiresAt: { gt: input.verifiedAt },
        },
        data: { consumedAt: input.verifiedAt },
      });
      if (claimed.count !== 1) return false;

      await tx.user.update({
        where: { id: input.userId },
        data: { emailVerified: true, emailVerifiedAt: input.verifiedAt },
      });

      // Every other outstanding token for this user is invalidated so exactly
      // one verification token can ever be redeemed per account.
      await tx.verificationToken.updateMany({
        where: {
          userId: input.userId,
          consumedAt: null,
          id: { not: input.tokenId },
        },
        data: { consumedAt: input.verifiedAt },
      });

      return true;
    },
    { isolationLevel: "Serializable" }
  );
}

/**
 * Retires the account's outstanding tokens and stores the replacement in one
 * serializable transaction, so a reissue can never leave two redeemable links
 * alive and a crash between the two writes cannot strand the account with none.
 */
async function runReplaceTokenTransaction(
  client: PrismaClientLike,
  input: ReplaceVerificationTokenInput
): Promise<string> {
  return client.$transaction(
    async (tx) => {
      await tx.verificationToken.updateMany({
        where: { userId: input.userId, consumedAt: null },
        data: { consumedAt: input.token.createdAt },
      });
      const created = await tx.verificationToken.create({
        data: {
          userId: input.userId,
          tokenHash: input.token.tokenHash,
          hashSalt: input.token.hashSalt,
          hashVersion: input.token.hashVersion,
          expiresAt: input.token.expiresAt,
        },
        select: { id: true },
      });
      return created.id;
    },
    { isolationLevel: "Serializable" }
  );
}

function isEmailUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== UNIQUE_CONSTRAINT_ERROR) return false;
  const target = error.meta?.target;
  const fields = Array.isArray(target)
    ? target.map(String)
    : typeof target === "string"
      ? [target]
      : [];
  return fields.length === 0 || fields.some((field) => /email/iu.test(field));
}

/** Missing relations surface as the typed schema-pending failure (req 16.2). */
async function withMappedFailures<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const pending = asSchemaMigrationPendingError(error);
    if (pending) throw pending;
    throw error;
  }
}

/**
 * Resend-backed email boundary; unset credentials report unconfigured.
 *
 * The SDK cannot observe an `AbortSignal`, so the 30-second deadline is enforced
 * by the domain service's provider wrapper: a slow send still resolves to the
 * failure branch inside the bound instead of holding the response open.
 */
export function createResendAccountEmailProvider(): AccountEmailProvider {
  return Object.freeze({
    isConfigured: () => isEmailConfigured(),
    send: async (message) => {
      const result = await sendEmail({
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      if (result.ok) return { ok: true };
      return { ok: false, skipped: result.skipped === true };
    },
  });
}

/** Append-only audit trail sink. Details carry no token material. */
export function createPrismaAccountAuditSink(): AccountAuditSink {
  return Object.freeze({
    append: async (entry) => {
      await audit({
        userId: entry.userId,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        severity: entry.severity,
        ipAddress: entry.sourceAddress,
        details: { ...entry.details },
      });
    },
  });
}

/** Production wiring used by the public account routes. */
export function createPrismaAccountService(
  overrides: Partial<AccountServiceDependencies> = {}
): AccountService {
  return createAccountService({
    ...overrides,
    repository: overrides.repository ?? createPrismaAccountRepository(),
    email: overrides.email ?? createResendAccountEmailProvider(),
    audit: overrides.audit ?? createPrismaAccountAuditSink(),
  });
}
