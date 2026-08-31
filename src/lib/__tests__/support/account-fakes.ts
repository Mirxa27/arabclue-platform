/**
 * In-memory account persistence and provider fakes for platform-completion
 * account tests (design section 12.2).
 *
 * The repository implements the same all-or-none contract as the Prisma
 * adapter: staged writes are committed only when every write in the transaction
 * succeeds, so a failure at any boundary leaves the user, workspace, member, and
 * token collections untouched. No test using these fakes performs network I/O or
 * touches a database.
 */

import {
  DuplicateAccountEmailError,
  type AccountAuditEntry,
  type AccountAuditSink,
  type AccountEmailProvider,
  type AccountRateLimiter,
  type AccountRepository,
  type ConsumeVerificationTokenInput,
  type CreateAccountRecordsInput,
  type CreatedAccountRecords,
  type EmailSendOutcome,
  type StoredVerificationToken,
} from "../../account-service";
import type { VerificationEmailContent } from "../../account-verification-email";
import type { DeadlineScheduler } from "../../provider-timeout";

export type FakeUserRecord = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  locale: string;
  platformRole: string;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  activeWorkspaceId: string | null;
  createdAt: Date;
};

export type FakeWorkspaceRecord = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
};

export type FakeMemberRecord = {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
  createdAt: Date;
};

export type FakeVerificationTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  hashSalt: string | null;
  hashVersion: number | null;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
};

export type AccountStoreSnapshot = Readonly<{
  users: readonly FakeUserRecord[];
  workspaces: readonly FakeWorkspaceRecord[];
  members: readonly FakeMemberRecord[];
  tokens: readonly FakeVerificationTokenRecord[];
}>;

/** Write boundary inside the registration transaction that a test can fail. */
export type AccountWriteBoundary = "user" | "workspace" | "member" | "token";

export class InjectedWriteFailure extends Error {
  constructor(readonly boundary: AccountWriteBoundary) {
    super(`Injected persistence failure at the ${boundary} write boundary.`);
    this.name = "InjectedWriteFailure";
  }
}

type AccountStoreState = {
  users: FakeUserRecord[];
  workspaces: FakeWorkspaceRecord[];
  members: FakeMemberRecord[];
  tokens: FakeVerificationTokenRecord[];
};

export type FakeAccountRepository = AccountRepository &
  Readonly<{
    snapshot(): AccountStoreSnapshot;
    isEmpty(): boolean;
    seedUser(
      user: Readonly<{
        email: string;
        name?: string;
        emailVerified?: boolean;
        locale?: string;
      }>
    ): FakeUserRecord;
    seedVerificationToken(
      token: Readonly<{
        userId: string;
        tokenHash: string;
        hashSalt?: string | null;
        hashVersion?: number | null;
        createdAt: Date;
        expiresAt: Date;
        consumedAt?: Date | null;
      }>
    ): FakeVerificationTokenRecord;
    failNextWriteAt(boundary: AccountWriteBoundary | null): void;
    readonly createAccountCalls: readonly CreateAccountRecordsInput[];
    readonly consumeCalls: readonly ConsumeVerificationTokenInput[];
  }>;

export function createFakeAccountRepository(): FakeAccountRepository {
  let state: AccountStoreState = {
    users: [],
    workspaces: [],
    members: [],
    tokens: [],
  };
  let sequence = 0;
  let failBoundary: AccountWriteBoundary | null = null;
  const createAccountCalls: CreateAccountRecordsInput[] = [];
  const consumeCalls: ConsumeVerificationTokenInput[] = [];

  const nextId = (prefix: string): string => {
    sequence += 1;
    return `${prefix}-${String(sequence).padStart(4, "0")}`;
  };

  const cloneState = (source: AccountStoreState): AccountStoreState => ({
    users: source.users.map((user) => ({ ...user })),
    workspaces: source.workspaces.map((workspace) => ({ ...workspace })),
    members: source.members.map((member) => ({ ...member })),
    tokens: source.tokens.map((token) => ({ ...token })),
  });

  const failIfRequested = (boundary: AccountWriteBoundary): void => {
    if (failBoundary === boundary) {
      failBoundary = null;
      throw new InjectedWriteFailure(boundary);
    }
  };

  return Object.freeze({
    createAccountCalls,
    consumeCalls,

    snapshot: () => {
      const copy = cloneState(state);
      return Object.freeze({
        users: copy.users,
        workspaces: copy.workspaces,
        members: copy.members,
        tokens: copy.tokens,
      });
    },

    isEmpty: () =>
      state.users.length === 0 &&
      state.workspaces.length === 0 &&
      state.members.length === 0 &&
      state.tokens.length === 0,

    seedUser: (user) => {
      const record: FakeUserRecord = {
        id: nextId("user"),
        email: user.email.trim().toLowerCase(),
        name: user.name ?? "Seeded account",
        passwordHash: `seeded$${nextId("hash")}`,
        locale: user.locale ?? "ar",
        platformRole: "BIDDER",
        emailVerified: user.emailVerified ?? true,
        emailVerifiedAt: user.emailVerified === false ? null : new Date(0),
        activeWorkspaceId: null,
        createdAt: new Date(0),
      };
      state.users.push(record);
      return { ...record };
    },

    seedVerificationToken: (token) => {
      const record: FakeVerificationTokenRecord = {
        id: nextId("token"),
        userId: token.userId,
        tokenHash: token.tokenHash,
        hashSalt: token.hashSalt ?? null,
        hashVersion: token.hashVersion ?? null,
        createdAt: token.createdAt,
        expiresAt: token.expiresAt,
        consumedAt: token.consumedAt ?? null,
      };
      state.tokens.push(record);
      return { ...record };
    },

    failNextWriteAt: (boundary) => {
      failBoundary = boundary;
    },

    findUserIdByNormalizedEmail: async (normalizedEmail) => {
      const target = normalizedEmail.trim().toLowerCase();
      return state.users.find((user) => user.email === target)?.id ?? null;
    },

    createAccountRecords: async (
      input: CreateAccountRecordsInput
    ): Promise<CreatedAccountRecords> => {
      createAccountCalls.push(input);
      const staged = cloneState(state);
      const normalizedEmail = input.email.trim().toLowerCase();

      failIfRequested("user");
      if (staged.users.some((user) => user.email === normalizedEmail)) {
        throw new DuplicateAccountEmailError();
      }
      const userId = nextId("user");
      staged.users.push({
        id: userId,
        email: normalizedEmail,
        name: input.name,
        passwordHash: input.passwordHash,
        locale: input.locale,
        platformRole: input.platformRole,
        emailVerified: input.emailVerified === true,
        emailVerifiedAt: input.emailVerified === true ? input.createdAt : null,
        activeWorkspaceId: null,
        createdAt: input.createdAt,
      });

      failIfRequested("workspace");
      const workspaceId = nextId("workspace");
      staged.workspaces.push({
        id: workspaceId,
        name: input.workspaceName,
        slug: input.workspaceSlug,
        createdAt: input.createdAt,
      });

      failIfRequested("member");
      const membershipId = nextId("member");
      staged.members.push({
        id: membershipId,
        workspaceId,
        userId,
        role: input.membershipRole,
        createdAt: input.createdAt,
      });
      const stagedUser = staged.users.find((user) => user.id === userId);
      if (stagedUser) stagedUser.activeWorkspaceId = workspaceId;

      failIfRequested("token");
      const tokenId = nextId("token");
      staged.tokens.push({
        id: tokenId,
        userId,
        tokenHash: input.verificationToken.tokenHash,
        hashSalt: input.verificationToken.hashSalt,
        hashVersion: input.verificationToken.hashVersion,
        createdAt: input.verificationToken.createdAt,
        expiresAt: input.verificationToken.expiresAt,
        consumedAt: input.emailVerified === true ? input.createdAt : null,
      });

      state = staged;
      return { userId, workspaceId, membershipId, verificationTokenId: tokenId };
    },

    findVerificationTokenByHash: async (tokenHash) => {
      const token = state.tokens.find(
        (candidate) => candidate.tokenHash === tokenHash
      );
      if (!token) return null;
      const owner = state.users.find((user) => user.id === token.userId);
      const stored: StoredVerificationToken = {
        id: token.id,
        userId: token.userId,
        userEmail: owner?.email ?? "",
        tokenHash: token.tokenHash,
        hashSalt: token.hashSalt,
        hashVersion: token.hashVersion,
        createdAt: token.createdAt,
        expiresAt: token.expiresAt,
        consumedAt: token.consumedAt,
      };
      return stored;
    },

    findUnverifiedAccountByNormalizedEmail: async (normalizedEmail) => {
      const target = normalizedEmail.trim().toLowerCase();
      const user = state.users.find(
        (candidate) => candidate.email === target && !candidate.emailVerified
      );
      if (!user) return null;
      // `activeWorkspaceId` is a plain scalar with no relation, so the
      // workspace is resolved through the membership — as in the Prisma adapter.
      const membership = state.members
        .filter((candidate) => candidate.userId === user.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      const workspace = state.workspaces.find(
        (candidate) => candidate.id === membership?.workspaceId
      );
      if (!workspace) return null;
      return {
        userId: user.id,
        email: user.email,
        locale: user.locale === "en" ? "en" : "ar",
        workspaceId: workspace.id,
        workspaceName: workspace.name,
      };
    },

    replaceVerificationToken: async (input) => {
      const staged = cloneState(state);
      // Same sibling-invalidation semantics as `consumeVerificationToken`: at
      // most one redeemable token per account at any time.
      for (const sibling of staged.tokens) {
        if (sibling.userId === input.userId && sibling.consumedAt === null) {
          sibling.consumedAt = input.token.createdAt;
        }
      }
      const tokenId = nextId("token");
      staged.tokens.push({
        id: tokenId,
        userId: input.userId,
        tokenHash: input.token.tokenHash,
        hashSalt: input.token.hashSalt,
        hashVersion: input.token.hashVersion,
        createdAt: input.token.createdAt,
        expiresAt: input.token.expiresAt,
        consumedAt: null,
      });
      state = staged;
      return tokenId;
    },

    consumeVerificationToken: async (input) => {
      consumeCalls.push(input);
      const staged = cloneState(state);
      const token = staged.tokens.find(
        (candidate) =>
          candidate.id === input.tokenId &&
          candidate.userId === input.userId &&
          candidate.consumedAt === null &&
          candidate.expiresAt.getTime() > input.verifiedAt.getTime()
      );
      if (!token) return false;

      token.consumedAt = input.verifiedAt;
      const owner = staged.users.find((user) => user.id === input.userId);
      if (!owner) return false;
      owner.emailVerified = true;
      owner.emailVerifiedAt = input.verifiedAt;
      for (const sibling of staged.tokens) {
        if (
          sibling.userId === input.userId &&
          sibling.id !== token.id &&
          sibling.consumedAt === null
        ) {
          sibling.consumedAt = input.verifiedAt;
        }
      }

      state = staged;
      return true;
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Provider fakes                                                             */
/* -------------------------------------------------------------------------- */

export type FakeAccountEmailBehavior =
  | Readonly<{ kind: "unconfigured" }>
  | Readonly<{ kind: "sent" }>
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "skipped" }>
  | Readonly<{ kind: "throws" }>
  /** Never settles until the injected deadline aborts the call. */
  | Readonly<{ kind: "hangs" }>;

export type FakeAccountEmailProvider = AccountEmailProvider &
  Readonly<{
    readonly messages: readonly VerificationEmailContent[];
    readonly abortReasons: readonly unknown[];
    setBehavior(behavior: FakeAccountEmailBehavior): void;
  }>;

export function createFakeAccountEmailProvider(
  initial: FakeAccountEmailBehavior = { kind: "sent" }
): FakeAccountEmailProvider {
  let behavior = initial;
  const messages: VerificationEmailContent[] = [];
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

export type RecordingAccountAuditSink = AccountAuditSink &
  Readonly<{
    readonly entries: readonly AccountAuditEntry[];
    failNext(shouldFail: boolean): void;
  }>;

export function createRecordingAccountAuditSink(): RecordingAccountAuditSink {
  const entries: AccountAuditEntry[] = [];
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

export type FakeAccountRateLimiter = AccountRateLimiter &
  Readonly<{
    readonly requests: readonly Readonly<{
      key: string;
      limit: number;
      windowMs: number;
    }>[];
  }>;

/**
 * Rolling-window limiter over an injected clock so a test can assert both the
 * denial inside the window and the recovery once the window has passed.
 */
export function createFakeAccountRateLimiter(
  now: () => Date
): FakeAccountRateLimiter {
  const hits = new Map<string, number[]>();
  const requests: Array<
    Readonly<{ key: string; limit: number; windowMs: number }>
  > = [];

  return Object.freeze({
    requests,
    consume: async (request) => {
      requests.push(request);
      const at = now().getTime();
      const window = (hits.get(request.key) ?? []).filter(
        (stamp) => at - stamp < request.windowMs
      );
      if (window.length >= request.limit) {
        const oldest = window[0] ?? at;
        hits.set(request.key, window);
        return {
          ok: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((request.windowMs - (at - oldest)) / 1_000)
          ),
        };
      }
      window.push(at);
      hits.set(request.key, window);
      return { ok: true, retryAfterSeconds: 0 };
    },
  });
}

/** Limiter that always admits; used when a test is not about rate limiting. */
export const permissiveAccountRateLimiter: AccountRateLimiter = Object.freeze({
  consume: async () => ({ ok: true, retryAfterSeconds: 0 }),
});

/**
 * Scheduler that fires a deadline on the next microtask, so a delivery-timeout
 * branch is exercised without waiting the real 30 seconds.
 */
export function createImmediateDeadlineScheduler(): DeadlineScheduler {
  const cancelled = new Set<object>();
  return Object.freeze({
    schedule: (callback: () => void) => {
      const handle = {};
      queueMicrotask(() => {
        if (!cancelled.has(handle)) callback();
      });
      return handle;
    },
    cancel: (handle: unknown) => {
      if (handle && typeof handle === "object") cancelled.add(handle);
    },
  });
}
