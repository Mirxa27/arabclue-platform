/**
 * In-memory invitation persistence and provider fakes for platform-completion
 * invitation tests (design section 12.2).
 *
 * The repository reproduces the atomicity contract of the Prisma adapter:
 * `createPendingInvitation`, `revokePendingInvitation`, and `acceptInvitation`
 * stage every write against a cloned store and publish it only when the whole
 * step succeeds, so an injected failure at any boundary leaves the invitation,
 * user, and member collections untouched. No test using these fakes performs
 * network I/O or touches a database.
 */

import type {
  AcceptInvitationInput,
  AcceptInvitationOutcome,
  CreateInvitationInput,
  CreateInvitationOutcome,
  InvitationAuditEntry,
  InvitationAuditSink,
  InvitationDeliveryState,
  InvitationEmailProvider,
  InvitationRepository,
  InvitationSeatUsage,
  PendingInvitationPageQuery,
  RevokeInvitationInput,
  RevokeInvitationOutcome,
  StoredInvitation,
  StoredPendingInvitation,
} from "../../invitation-service";
import type { InvitationEmailContent } from "../../invitation-email";
import type { EmailSendOutcome } from "../../invitation-service";

export type FakeInvitationUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  locale: string;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  activeWorkspaceId: string | null;
};

export type FakeInvitationMember = {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
  createdAt: Date;
};

export type FakeInvitationRow = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: string;
  tokenHash: string;
  hashSalt: string | null;
  hashVersion: number | null;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
  inviterId: string | null;
  emailDeliveryState: string;
};

export type InvitationStoreSnapshot = Readonly<{
  users: readonly FakeInvitationUser[];
  members: readonly FakeInvitationMember[];
  invitations: readonly FakeInvitationRow[];
}>;

/** Write boundary a test can fail inside a staged transaction. */
export type InvitationWriteBoundary =
  | "replace"
  | "invitation"
  | "user"
  | "member"
  | "consume";

export class InjectedInvitationWriteFailure extends Error {
  constructor(readonly boundary: InvitationWriteBoundary) {
    super(`Injected persistence failure at the ${boundary} write boundary.`);
    this.name = "InjectedInvitationWriteFailure";
  }
}

type InvitationStoreState = {
  users: FakeInvitationUser[];
  members: FakeInvitationMember[];
  invitations: FakeInvitationRow[];
  seatAllowance: number | null;
  workspaceName: string;
};

export type FakeInvitationRepository = InvitationRepository &
  Readonly<{
    snapshot(): InvitationStoreSnapshot;
    setSeatAllowance(allowance: number | null): void;
    seedUser(
      user: Readonly<{
        email: string;
        name?: string;
        locale?: string;
        activeWorkspaceId?: string | null;
      }>
    ): FakeInvitationUser;
    seedMember(
      member: Readonly<{ workspaceId: string; userId: string; role: string }>
    ): FakeInvitationMember;
    seedInvitation(
      invitation: Readonly<{
        workspaceId: string;
        email: string;
        role: string;
        tokenHash: string;
        hashSalt?: string | null;
        hashVersion?: number | null;
        createdAt: Date;
        expiresAt: Date;
        consumedAt?: Date | null;
        revokedAt?: Date | null;
        inviterId?: string | null;
        emailDeliveryState?: string;
      }>
    ): FakeInvitationRow;
    failNextWriteAt(boundary: InvitationWriteBoundary | null): void;
    readonly createCalls: readonly CreateInvitationInput[];
    readonly acceptCalls: readonly AcceptInvitationInput[];
    readonly deliveryStateWrites: readonly Readonly<{
      invitationId: string;
      state: InvitationDeliveryState;
    }>[];
  }>;

export function createFakeInvitationRepository(
  options: Readonly<{ workspaceName?: string; seatAllowance?: number | null }> = {}
): FakeInvitationRepository {
  let state: InvitationStoreState = {
    users: [],
    members: [],
    invitations: [],
    seatAllowance: options.seatAllowance ?? null,
    workspaceName: options.workspaceName ?? "Riyadh Bid Team",
  };
  let sequence = 0;
  let failBoundary: InvitationWriteBoundary | null = null;
  const createCalls: CreateInvitationInput[] = [];
  const acceptCalls: AcceptInvitationInput[] = [];
  const deliveryStateWrites: Array<
    Readonly<{ invitationId: string; state: InvitationDeliveryState }>
  > = [];

  const nextId = (prefix: string): string => {
    sequence += 1;
    return `${prefix}-${String(sequence).padStart(4, "0")}`;
  };

  const clone = (source: InvitationStoreState): InvitationStoreState => ({
    users: source.users.map((user) => ({ ...user })),
    members: source.members.map((member) => ({ ...member })),
    invitations: source.invitations.map((invitation) => ({ ...invitation })),
    seatAllowance: source.seatAllowance,
    workspaceName: source.workspaceName,
  });

  const failIfRequested = (boundary: InvitationWriteBoundary): void => {
    if (failBoundary === boundary) {
      failBoundary = null;
      throw new InjectedInvitationWriteFailure(boundary);
    }
  };

  const normalize = (value: string): string => value.trim().toLowerCase();

  const isPending = (row: FakeInvitationRow, now: Date): boolean =>
    row.consumedAt === null &&
    row.revokedAt === null &&
    row.expiresAt.getTime() > now.getTime();

  const seatUsage = (
    store: InvitationStoreState,
    workspaceId: string,
    now: Date,
    excludeInvitationId?: string
  ): InvitationSeatUsage => ({
    seatAllowance:
      store.seatAllowance !== null && store.seatAllowance > 0
        ? store.seatAllowance
        : null,
    memberCount: store.members.filter(
      (member) => member.workspaceId === workspaceId
    ).length,
    pendingInvitationCount: store.invitations.filter(
      (row) =>
        row.workspaceId === workspaceId &&
        row.id !== excludeInvitationId &&
        isPending(row, now)
    ).length,
  });

  const allowanceExhausted = (usage: InvitationSeatUsage): boolean =>
    usage.seatAllowance !== null &&
    usage.memberCount + usage.pendingInvitationCount >= usage.seatAllowance;

  return Object.freeze({
    createCalls,
    acceptCalls,
    deliveryStateWrites,

    snapshot: () => {
      const copy = clone(state);
      return Object.freeze({
        users: copy.users,
        members: copy.members,
        invitations: copy.invitations,
      });
    },

    setSeatAllowance: (allowance) => {
      state.seatAllowance = allowance;
    },

    seedUser: (user) => {
      const record: FakeInvitationUser = {
        id: nextId("user"),
        email: normalize(user.email),
        name: user.name ?? "Seeded account",
        passwordHash: `seeded$${nextId("hash")}`,
        locale: user.locale ?? "ar",
        emailVerified: true,
        emailVerifiedAt: new Date(0),
        activeWorkspaceId: user.activeWorkspaceId ?? null,
      };
      state.users.push(record);
      return { ...record };
    },

    seedMember: (member) => {
      const record: FakeInvitationMember = {
        id: nextId("member"),
        workspaceId: member.workspaceId,
        userId: member.userId,
        role: member.role,
        createdAt: new Date(0),
      };
      state.members.push(record);
      return { ...record };
    },

    seedInvitation: (invitation) => {
      const record: FakeInvitationRow = {
        id: nextId("invite"),
        workspaceId: invitation.workspaceId,
        workspaceName: state.workspaceName,
        email: normalize(invitation.email),
        role: invitation.role,
        tokenHash: invitation.tokenHash,
        hashSalt: invitation.hashSalt ?? null,
        hashVersion: invitation.hashVersion ?? null,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
        consumedAt: invitation.consumedAt ?? null,
        revokedAt: invitation.revokedAt ?? null,
        inviterId: invitation.inviterId ?? null,
        emailDeliveryState: invitation.emailDeliveryState ?? "PENDING",
      };
      state.invitations.push(record);
      return { ...record };
    },

    failNextWriteAt: (boundary) => {
      failBoundary = boundary;
    },

    findMembershipByEmail: async ({ workspaceId, email }) => {
      const target = normalize(email);
      const user = state.users.find((candidate) => candidate.email === target);
      if (!user) return null;
      const member = state.members.find(
        (candidate) =>
          candidate.workspaceId === workspaceId && candidate.userId === user.id
      );
      return member ? { userId: member.userId, role: member.role } : null;
    },

    readSeatUsage: async ({ workspaceId, now }) =>
      seatUsage(state, workspaceId, now),

    createPendingInvitation: async (
      input: CreateInvitationInput
    ): Promise<CreateInvitationOutcome> => {
      createCalls.push(input);
      const staged = clone(state);
      const target = normalize(input.email);

      const invitedUser = staged.users.find(
        (candidate) => candidate.email === target
      );
      if (
        invitedUser &&
        staged.members.some(
          (member) =>
            member.workspaceId === input.workspaceId &&
            member.userId === invitedUser.id
        )
      ) {
        return { kind: "ALREADY_MEMBER" };
      }

      failIfRequested("replace");
      let replacedCount = 0;
      for (const row of staged.invitations) {
        if (
          row.workspaceId === input.workspaceId &&
          row.email === target &&
          row.consumedAt === null &&
          row.revokedAt === null
        ) {
          row.revokedAt = input.createdAt;
          row.consumedAt = input.createdAt;
          replacedCount += 1;
        }
      }

      if (
        allowanceExhausted(seatUsage(staged, input.workspaceId, input.createdAt))
      ) {
        return { kind: "SEAT_LIMIT_REACHED" };
      }

      failIfRequested("invitation");
      const created: FakeInvitationRow = {
        id: nextId("invite"),
        workspaceId: input.workspaceId,
        workspaceName: staged.workspaceName,
        email: target,
        role: input.role,
        tokenHash: input.token.tokenHash,
        hashSalt: input.token.hashSalt,
        hashVersion: input.token.hashVersion,
        createdAt: input.createdAt,
        expiresAt: input.token.expiresAt,
        consumedAt: null,
        revokedAt: null,
        inviterId: input.inviterId,
        emailDeliveryState: "PENDING",
      };
      staged.invitations.push(created);

      state = staged;
      return {
        kind: "CREATED",
        invitation: {
          id: created.id,
          workspaceId: created.workspaceId,
          email: created.email,
          role: created.role,
          createdAt: created.createdAt,
          expiresAt: created.expiresAt,
          emailDeliveryState: created.emailDeliveryState,
          replacedCount,
        },
      };
    },

    listPendingInvitations: async (
      query: PendingInvitationPageQuery
    ): Promise<readonly StoredPendingInvitation[]> => {
      const ordered = state.invitations
        .filter(
          (row) =>
            row.workspaceId === query.workspaceId && isPending(row, query.now)
        )
        .sort((left, right) => {
          const byCreated =
            right.createdAt.getTime() - left.createdAt.getTime();
          if (byCreated !== 0) return byCreated;
          return right.id.localeCompare(left.id);
        })
        .filter((row) => {
          const after = query.after;
          if (!after) return true;
          const created = row.createdAt.getTime();
          const boundary = after.createdAt.getTime();
          if (created < boundary) return true;
          return created === boundary && row.id.localeCompare(after.id) < 0;
        })
        .slice(0, query.limit);

      return ordered.map((row) => {
        const inviter = row.inviterId
          ? (state.users.find((user) => user.id === row.inviterId) ?? null)
          : null;
        return {
          id: row.id,
          workspaceId: row.workspaceId,
          email: row.email,
          role: row.role,
          createdAt: row.createdAt,
          expiresAt: row.expiresAt,
          emailDeliveryState: row.emailDeliveryState,
          inviter: inviter
            ? { id: inviter.id, name: inviter.name, email: inviter.email }
            : null,
        };
      });
    },

    revokePendingInvitation: async (
      input: RevokeInvitationInput
    ): Promise<RevokeInvitationOutcome> => {
      const staged = clone(state);
      const row = staged.invitations.find(
        (candidate) =>
          candidate.id === input.invitationId &&
          candidate.workspaceId === input.workspaceId
      );
      if (!row) return { kind: "NOT_FOUND" };
      if (row.consumedAt !== null || row.revokedAt !== null) {
        return { kind: "ALREADY_CLOSED" };
      }

      row.revokedAt = input.revokedAt;
      row.consumedAt = input.revokedAt;
      state = staged;
      return { kind: "REVOKED", email: row.email, role: row.role };
    },

    recordEmailDeliveryState: async ({ invitationId, state: deliveryState }) => {
      deliveryStateWrites.push({ invitationId, state: deliveryState });
      const row = state.invitations.find(
        (candidate) => candidate.id === invitationId
      );
      if (row) row.emailDeliveryState = deliveryState;
    },

    findInvitationByTokenHash: async (tokenHash) => {
      const row = state.invitations.find(
        (candidate) => candidate.tokenHash === tokenHash
      );
      if (!row) return null;
      const stored: StoredInvitation = {
        id: row.id,
        workspaceId: row.workspaceId,
        workspaceName: row.workspaceName,
        email: row.email,
        role: row.role,
        tokenHash: row.tokenHash,
        hashSalt: row.hashSalt,
        hashVersion: row.hashVersion,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        consumedAt: row.consumedAt,
        revokedAt: row.revokedAt,
      };
      return stored;
    },

    findUserIdByNormalizedEmail: async (email) => {
      const target = normalize(email);
      return state.users.find((user) => user.email === target)?.id ?? null;
    },

    acceptInvitation: async (
      input: AcceptInvitationInput
    ): Promise<AcceptInvitationOutcome> => {
      acceptCalls.push(input);
      const staged = clone(state);
      const row = staged.invitations.find(
        (candidate) =>
          candidate.id === input.invitationId &&
          candidate.workspaceId === input.workspaceId
      );
      if (
        !row ||
        row.tokenHash !== input.tokenHash ||
        row.email !== input.email ||
        row.expiresAt.getTime() <= input.acceptedAt.getTime()
      ) {
        return { kind: "TOKEN_INVALID" };
      }
      if (row.revokedAt !== null) return { kind: "REVOKED" };
      if (row.consumedAt !== null) return { kind: "TOKEN_INVALID" };

      const existingUser = staged.users.find(
        (user) => user.email === input.email
      );
      if (input.actor.kind === "NEW_USER" && existingUser) {
        return { kind: "ACCOUNT_EXISTS" };
      }

      const memberUserId =
        input.actor.kind === "EXISTING_USER"
          ? input.actor.userId
          : existingUser?.id;

      if (memberUserId) {
        const membership = staged.members.find(
          (member) =>
            member.workspaceId === input.workspaceId &&
            member.userId === memberUserId
        );
        if (membership) {
          failIfRequested("consume");
          row.consumedAt = input.acceptedAt;
          state = staged;
          return {
            kind: "ALREADY_MEMBER",
            workspaceId: input.workspaceId,
            role: membership.role,
          };
        }
      }

      if (
        allowanceExhausted(
          seatUsage(staged, input.workspaceId, input.acceptedAt, row.id)
        )
      ) {
        return { kind: "SEAT_LIMIT_REACHED" };
      }

      let userId = memberUserId ?? null;
      let createdUser = false;

      if (input.actor.kind === "NEW_USER") {
        failIfRequested("user");
        const created: FakeInvitationUser = {
          id: nextId("user"),
          email: input.email,
          name: input.actor.displayName,
          passwordHash: input.actor.passwordHash,
          locale: input.actor.locale,
          emailVerified: true,
          emailVerifiedAt: input.acceptedAt,
          activeWorkspaceId: input.workspaceId,
        };
        staged.users.push(created);
        userId = created.id;
        createdUser = true;
      }

      if (!userId) return { kind: "TOKEN_INVALID" };

      failIfRequested("member");
      staged.members.push({
        id: nextId("member"),
        workspaceId: input.workspaceId,
        userId,
        role: row.role,
        createdAt: input.acceptedAt,
      });

      failIfRequested("consume");
      row.consumedAt = input.acceptedAt;

      if (!createdUser && existingUser && !existingUser.activeWorkspaceId) {
        existingUser.activeWorkspaceId = input.workspaceId;
      }

      state = staged;
      return {
        kind: "ACCEPTED",
        workspaceId: input.workspaceId,
        userId,
        role: row.role,
        createdUser,
      };
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Provider fakes                                                             */
/* -------------------------------------------------------------------------- */

export type FakeInvitationEmailBehavior =
  | Readonly<{ kind: "unconfigured" }>
  | Readonly<{ kind: "sent" }>
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "skipped" }>
  | Readonly<{ kind: "throws" }>
  /** Never settles until the injected deadline aborts the call. */
  | Readonly<{ kind: "hangs" }>;

export type FakeInvitationEmailProvider = InvitationEmailProvider &
  Readonly<{
    readonly messages: readonly InvitationEmailContent[];
    readonly abortReasons: readonly unknown[];
    setBehavior(behavior: FakeInvitationEmailBehavior): void;
  }>;

export function createFakeInvitationEmailProvider(
  initial: FakeInvitationEmailBehavior = { kind: "sent" }
): FakeInvitationEmailProvider {
  let behavior = initial;
  const messages: InvitationEmailContent[] = [];
  const abortReasons: unknown[] = [];

  return Object.freeze({
    messages,
    abortReasons,
    setBehavior: (next) => {
      behavior = next;
    },
    isConfigured: () => behavior.kind !== "unconfigured",
    send: async (message, context): Promise<EmailSendOutcome> => {
      messages.push(message);
      switch (behavior.kind) {
        case "sent":
          return { ok: true };
        case "failed":
          return { ok: false, skipped: false };
        case "skipped":
          return { ok: false, skipped: true };
        case "throws":
          throw new Error("Injected provider failure");
        case "hangs":
          return new Promise<EmailSendOutcome>((_, reject) => {
            context.signal.addEventListener(
              "abort",
              () => {
                abortReasons.push(context.signal.reason);
                reject(context.signal.reason);
              },
              { once: true }
            );
          });
        case "unconfigured":
          return { ok: false, skipped: true };
      }
    },
  });
}

export type RecordingInvitationAuditSink = InvitationAuditSink &
  Readonly<{
    readonly entries: readonly InvitationAuditEntry[];
    failNext(shouldFail: boolean): void;
  }>;

export function createRecordingInvitationAuditSink(): RecordingInvitationAuditSink {
  const entries: InvitationAuditEntry[] = [];
  let shouldFail = false;

  return Object.freeze({
    entries,
    failNext: (next) => {
      shouldFail = next;
    },
    append: async (entry) => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("Injected audit sink failure");
      }
      entries.push(entry);
    },
  });
}

/** Password hasher that records inputs without a real KDF cost. */
export function createFakeInvitationPasswordHasher(): Readonly<{
  hash(plainPassword: string): Promise<string>;
  readonly hashed: readonly string[];
}> {
  const hashed: string[] = [];
  return Object.freeze({
    hashed,
    hash: async (plainPassword: string) => {
      hashed.push(plainPassword);
      return `hashed$${plainPassword.length}`;
    },
  });
}
