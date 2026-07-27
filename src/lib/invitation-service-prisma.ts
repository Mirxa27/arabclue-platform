/**
 * Production adapters for the Invitation_Service (design sections 4.1 and 6).
 *
 * This module owns every external boundary the domain service declares:
 * PostgreSQL through Prisma serializable transactions, the Resend email
 * boundary, and the append-only audit trail. Keeping the adapters here lets
 * `invitation-service.ts` stay free of Prisma and provider SDKs so unit and
 * property tests exercise the domain rules without a network call or a
 * shared-database mutation.
 *
 * Each transactional method is one serializable transaction that re-reads the
 * state its requirement names before writing:
 * - `createPendingInvitation` closes earlier unconsumed invitations for the same
 *   workspace and address, re-checks membership and seats, then inserts the
 *   replacement (criteria 3.1, 3.8);
 * - `acceptInvitation` re-reads the invitation by identifier and digest, the
 *   invited address, the account, the membership, the invited role, and the seat
 *   allowance, then creates and consumes in the same transaction (criteria 3.2,
 *   3.3, 3.4, 3.8);
 * - `revokePendingInvitation` closes a pending row conditionally (criterion 3.6).
 */

import { Prisma } from "@prisma/client";
import { db } from "./db";
import { audit } from "./audit";
import { isEmailConfigured, sendEmail } from "./email";
import { asSchemaMigrationPendingError } from "./api-failure";
import {
  createInvitationService,
  type AcceptInvitationInput,
  type AcceptInvitationOutcome,
  type CreateInvitationInput,
  type CreateInvitationOutcome,
  type InvitationAuditSink,
  type InvitationEmailProvider,
  type InvitationRepository,
  type InvitationSeatUsage,
  type InvitationService,
  type InvitationServiceDependencies,
  type PendingInvitationPageQuery,
  type RevokeInvitationInput,
  type RevokeInvitationOutcome,
  type StoredInvitation,
  type StoredPendingInvitation,
} from "./invitation-service";

type PrismaClientLike = typeof db;
type PrismaTransactionClient = Prisma.TransactionClient;

const STARTER_PLAN_NAME = "STARTER";
const STARTER_PERIOD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const INVITATION_TRANSACTION_MAX_WAIT_MS = 2_000;
const INVITATION_TRANSACTION_TIMEOUT_MS = 10_000;

const PENDING_STATE = Object.freeze({ consumedAt: null, revokedAt: null });

/** Prisma-backed persistence for invitation creation, listing, and acceptance. */
export function createPrismaInvitationRepository(
  client: PrismaClientLike = db
): InvitationRepository {
  return Object.freeze({
    async findMembershipByEmail({ workspaceId, email }) {
      return withMappedFailures(async () => {
        const member = await client.workspaceMember.findFirst({
          where: {
            workspaceId,
            user: { email: { equals: email, mode: "insensitive" } },
          },
          select: { userId: true, role: true },
        });
        return member ? { userId: member.userId, role: member.role } : null;
      });
    },

    async readSeatUsage({ workspaceId, now }) {
      return withMappedFailures(() => readSeatUsage(client, workspaceId, now));
    },

    async createPendingInvitation(input) {
      return withMappedFailures(() => runCreateTransaction(client, input));
    },

    async listPendingInvitations(query) {
      return withMappedFailures(() => listPendingInvitations(client, query));
    },

    async revokePendingInvitation(input) {
      return withMappedFailures(() => runRevokeTransaction(client, input));
    },

    async recordEmailDeliveryState({ invitationId, state }) {
      await withMappedFailures(() =>
        client.workspaceInvitation.updateMany({
          where: { id: invitationId },
          data: { emailDeliveryState: state },
        })
      );
    },

    async findInvitationByTokenHash(tokenHash) {
      return withMappedFailures(async () => {
        const record = await client.workspaceInvitation.findFirst({
          where: { tokenHash },
          select: {
            id: true,
            workspaceId: true,
            email: true,
            role: true,
            tokenHash: true,
            hashSalt: true,
            hashVersion: true,
            createdAt: true,
            expiresAt: true,
            consumedAt: true,
            revokedAt: true,
            workspace: { select: { name: true } },
          },
        });
        if (!record) return null;
        const stored: StoredInvitation = {
          id: record.id,
          workspaceId: record.workspaceId,
          workspaceName: record.workspace.name,
          email: record.email,
          role: record.role,
          tokenHash: record.tokenHash,
          hashSalt: record.hashSalt,
          hashVersion: record.hashVersion,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
          consumedAt: record.consumedAt,
          revokedAt: record.revokedAt,
        };
        return stored;
      });
    },

    async findUserIdByNormalizedEmail(email) {
      return withMappedFailures(async () => {
        const user = await client.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
          select: { id: true },
        });
        return user?.id ?? null;
      });
    },

    async acceptInvitation(input) {
      return withMappedFailures(() => runAcceptTransaction(client, input));
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Seats                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Seat usage of one workspace: the plan allowance of the owner's subscription,
 * the member count, and the pending unexpired invitation count (criterion 3.8).
 */
async function readSeatUsage(
  client: PrismaClientLike | PrismaTransactionClient,
  workspaceId: string,
  now: Date,
  excludeInvitationId?: string
): Promise<InvitationSeatUsage> {
  const [memberCount, pendingInvitationCount, seatAllowance] = await Promise.all([
    client.workspaceMember.count({ where: { workspaceId } }),
    client.workspaceInvitation.count({
      where: {
        workspaceId,
        ...PENDING_STATE,
        expiresAt: { gt: now },
        ...(excludeInvitationId ? { id: { not: excludeInvitationId } } : {}),
      },
    }),
    readSeatAllowance(client, workspaceId),
  ]);

  return { seatAllowance, memberCount, pendingInvitationCount };
}

/** Bounded seat allowance of the workspace owner's active plan, or null. */
async function readSeatAllowance(
  client: PrismaClientLike | PrismaTransactionClient,
  workspaceId: string
): Promise<number | null> {
  const owner = await client.workspaceMember.findFirst({
    where: { workspaceId, role: "OWNER" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!owner) return null;

  const subscription = await client.subscription.findFirst({
    where: { userId: owner.userId },
    select: { plan: { select: { maxSeats: true } } },
  });
  const maxSeats = subscription?.plan?.maxSeats ?? null;
  if (maxSeats === null || !Number.isSafeInteger(maxSeats) || maxSeats <= 0) {
    return null;
  }
  return maxSeats;
}

/* -------------------------------------------------------------------------- */
/* Create                                                                     */
/* -------------------------------------------------------------------------- */

async function runCreateTransaction(
  client: PrismaClientLike,
  input: CreateInvitationInput
): Promise<CreateInvitationOutcome> {
  return client.$transaction(
    async (tx) => {
      const existingMember = await tx.workspaceMember.findFirst({
        where: {
          workspaceId: input.workspaceId,
          user: { email: { equals: input.email, mode: "insensitive" } },
        },
        select: { id: true },
      });
      if (existingMember) return { kind: "ALREADY_MEMBER" as const };

      // Criterion 3.1: every earlier unconsumed invitation for this workspace
      // and address is invalidated before the replacement is inserted. Both
      // state columns are written so a later submission of a replaced token
      // reports the revoked condition required by criterion 3.6.
      const replaced = await tx.workspaceInvitation.updateMany({
        where: {
          workspaceId: input.workspaceId,
          email: { equals: input.email, mode: "insensitive" },
          consumedAt: null,
        },
        data: { revokedAt: input.createdAt, consumedAt: input.createdAt },
      });

      const usage = await readSeatUsage(tx, input.workspaceId, input.createdAt);
      if (
        usage.seatAllowance !== null &&
        usage.memberCount + usage.pendingInvitationCount >= usage.seatAllowance
      ) {
        return { kind: "SEAT_LIMIT_REACHED" as const };
      }

      const invitation = await tx.workspaceInvitation.create({
        data: {
          workspaceId: input.workspaceId,
          email: input.email,
          role: input.role,
          tokenHash: input.token.tokenHash,
          hashSalt: input.token.hashSalt,
          hashVersion: input.token.hashVersion,
          expiresAt: input.token.expiresAt,
          inviterId: input.inviterId,
          emailDeliveryState: "PENDING",
        },
        select: {
          id: true,
          workspaceId: true,
          email: true,
          role: true,
          createdAt: true,
          expiresAt: true,
          emailDeliveryState: true,
        },
      });

      return {
        kind: "CREATED" as const,
        invitation: { ...invitation, replacedCount: replaced.count },
      };
    },
    {
      isolationLevel: "Serializable",
      maxWait: INVITATION_TRANSACTION_MAX_WAIT_MS,
      timeout: INVITATION_TRANSACTION_TIMEOUT_MS,
    }
  );
}

/* -------------------------------------------------------------------------- */
/* List                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Pending unexpired invitations of one workspace in descending creation order
 * with the identifier as the tie-breaker, so the keyset cursor is deterministic
 * (criterion 3.7).
 */
async function listPendingInvitations(
  client: PrismaClientLike,
  query: PendingInvitationPageQuery
): Promise<readonly StoredPendingInvitation[]> {
  const rows = await client.workspaceInvitation.findMany({
    where: {
      workspaceId: query.workspaceId,
      ...PENDING_STATE,
      expiresAt: { gt: query.now },
      ...(query.after
        ? {
            OR: [
              { createdAt: { lt: query.after.createdAt } },
              {
                createdAt: query.after.createdAt,
                id: { lt: query.after.id },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit,
    select: {
      id: true,
      workspaceId: true,
      email: true,
      role: true,
      createdAt: true,
      expiresAt: true,
      emailDeliveryState: true,
      inviter: { select: { id: true, name: true, email: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    email: row.email,
    role: row.role,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    emailDeliveryState: row.emailDeliveryState,
    inviter: row.inviter
      ? { id: row.inviter.id, name: row.inviter.name, email: row.inviter.email }
      : null,
  }));
}

/* -------------------------------------------------------------------------- */
/* Revoke                                                                     */
/* -------------------------------------------------------------------------- */

async function runRevokeTransaction(
  client: PrismaClientLike,
  input: RevokeInvitationInput
): Promise<RevokeInvitationOutcome> {
  return client.$transaction(
    async (tx) => {
      const invitation = await tx.workspaceInvitation.findFirst({
        where: { id: input.invitationId, workspaceId: input.workspaceId },
        select: {
          id: true,
          email: true,
          role: true,
          consumedAt: true,
          revokedAt: true,
        },
      });
      if (!invitation) return { kind: "NOT_FOUND" as const };
      if (invitation.consumedAt !== null || invitation.revokedAt !== null) {
        return { kind: "ALREADY_CLOSED" as const };
      }

      // Criterion 3.6: the invitation is marked consumed and revoked, which
      // removes it from every later pending list and makes a later submission of
      // its token report the revoked condition. No membership row is touched.
      const closed = await tx.workspaceInvitation.updateMany({
        where: { id: input.invitationId, workspaceId: input.workspaceId, ...PENDING_STATE },
        data: { revokedAt: input.revokedAt, consumedAt: input.revokedAt },
      });
      if (closed.count !== 1) return { kind: "ALREADY_CLOSED" as const };

      return {
        kind: "REVOKED" as const,
        email: invitation.email,
        role: invitation.role,
      };
    },
    { isolationLevel: "Serializable" }
  );
}

/* -------------------------------------------------------------------------- */
/* Accept                                                                     */
/* -------------------------------------------------------------------------- */

async function runAcceptTransaction(
  client: PrismaClientLike,
  input: AcceptInvitationInput
): Promise<AcceptInvitationOutcome> {
  return client.$transaction(
    async (tx) => {
      // Re-read the token record by identifier and digest so a concurrent
      // revocation, replacement, or acceptance cannot be overtaken.
      const invitation = await tx.workspaceInvitation.findFirst({
        where: { id: input.invitationId, workspaceId: input.workspaceId },
        select: {
          id: true,
          email: true,
          role: true,
          tokenHash: true,
          expiresAt: true,
          consumedAt: true,
          revokedAt: true,
        },
      });
      if (
        !invitation ||
        invitation.tokenHash !== input.tokenHash ||
        invitation.email.trim().toLowerCase() !== input.email ||
        invitation.expiresAt.getTime() <= input.acceptedAt.getTime()
      ) {
        return { kind: "TOKEN_INVALID" as const };
      }
      if (invitation.revokedAt !== null) return { kind: "REVOKED" as const };
      if (invitation.consumedAt !== null) return { kind: "TOKEN_INVALID" as const };

      const existingUser = await tx.user.findFirst({
        where: { email: { equals: input.email, mode: "insensitive" } },
        select: { id: true, activeWorkspaceId: true },
      });

      if (input.actor.kind === "NEW_USER" && existingUser) {
        // Criterion 3.2: the transaction re-checks the absence of the account.
        return { kind: "ACCOUNT_EXISTS" as const };
      }

      const memberUserId =
        input.actor.kind === "EXISTING_USER" ? input.actor.userId : existingUser?.id;

      if (memberUserId) {
        const membership = await tx.workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: input.workspaceId,
              userId: memberUserId,
            },
          },
          select: { role: true },
        });
        if (membership) {
          // Criterion 3.4: consume the token and leave the stored role alone.
          const consumed = await tx.workspaceInvitation.updateMany({
            where: { id: invitation.id, ...PENDING_STATE },
            data: { consumedAt: input.acceptedAt },
          });
          if (consumed.count !== 1) return { kind: "TOKEN_INVALID" as const };
          return {
            kind: "ALREADY_MEMBER" as const,
            workspaceId: input.workspaceId,
            role: membership.role,
          };
        }
      }

      // Criterion 3.8: the accepted invitation is consumed by this transaction,
      // so it is excluded from the pending count that guards the allowance.
      const usage = await readSeatUsage(
        tx,
        input.workspaceId,
        input.acceptedAt,
        invitation.id
      );
      if (
        usage.seatAllowance !== null &&
        usage.memberCount + usage.pendingInvitationCount >= usage.seatAllowance
      ) {
        return { kind: "SEAT_LIMIT_REACHED" as const };
      }

      let userId = memberUserId ?? null;
      let createdUser = false;

      if (input.actor.kind === "NEW_USER") {
        const created = await tx.user.create({
          data: {
            email: input.email,
            name: input.actor.displayName,
            passwordHash: input.actor.passwordHash,
            role: "BIDDER",
            active: true,
            locale: input.actor.locale,
            // Criterion 3.2: an invited account is created already verified.
            emailVerified: true,
            emailVerifiedAt: input.acceptedAt,
            mustChangePassword: false,
            activeWorkspaceId: input.workspaceId,
          },
          select: { id: true },
        });
        userId = created.id;
        createdUser = true;

        const starterPlan = await tx.subscriptionPlan.findFirst({
          where: { name: STARTER_PLAN_NAME, isActive: true },
          select: { id: true },
        });
        if (starterPlan) {
          await tx.subscription.create({
            data: {
              userId: created.id,
              planId: starterPlan.id,
              status: "ACTIVE",
              billingCycle: "MONTHLY",
              currentPeriodStart: input.acceptedAt,
              currentPeriodEnd: new Date(
                input.acceptedAt.getTime() + STARTER_PERIOD_DAYS * DAY_MS
              ),
            },
          });
        }
      }

      if (!userId) return { kind: "TOKEN_INVALID" as const };

      await tx.workspaceMember.create({
        data: {
          workspaceId: input.workspaceId,
          userId,
          role: invitation.role,
        },
      });

      const consumed = await tx.workspaceInvitation.updateMany({
        where: { id: invitation.id, ...PENDING_STATE },
        data: { consumedAt: input.acceptedAt },
      });
      if (consumed.count !== 1) {
        // Another request consumed the same token first; abandon every write.
        throw new InvitationTokenRaceError();
      }

      if (!createdUser && existingUser && !existingUser.activeWorkspaceId) {
        await tx.user.update({
          where: { id: existingUser.id },
          data: { activeWorkspaceId: input.workspaceId },
        });
      }

      return {
        kind: "ACCEPTED" as const,
        workspaceId: input.workspaceId,
        userId,
        role: invitation.role,
        createdUser,
      };
    },
    {
      isolationLevel: "Serializable",
      maxWait: INVITATION_TRANSACTION_MAX_WAIT_MS,
      timeout: INVITATION_TRANSACTION_TIMEOUT_MS,
    }
  ).catch((error: unknown) => {
    if (error instanceof InvitationTokenRaceError) {
      return { kind: "TOKEN_INVALID" as const };
    }
    throw error;
  });
}

/** Raised inside the acceptance transaction to abandon a lost token race. */
class InvitationTokenRaceError extends Error {
  constructor() {
    super("The invitation token was consumed by another request.");
    this.name = "InvitationTokenRaceError";
  }
}

/* -------------------------------------------------------------------------- */
/* Provider and audit boundaries                                              */
/* -------------------------------------------------------------------------- */

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
 * by the domain service's provider wrapper.
 */
export function createResendInvitationEmailProvider(): InvitationEmailProvider {
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
export function createPrismaInvitationAuditSink(): InvitationAuditSink {
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

/** Production wiring used by the invitation routes. */
export function createPrismaInvitationService(
  overrides: Partial<InvitationServiceDependencies> = {}
): InvitationService {
  return createInvitationService({
    ...overrides,
    repository: overrides.repository ?? createPrismaInvitationRepository(),
    email: overrides.email ?? createResendInvitationEmailProvider(),
    audit: overrides.audit ?? createPrismaInvitationAuditSink(),
  });
}
