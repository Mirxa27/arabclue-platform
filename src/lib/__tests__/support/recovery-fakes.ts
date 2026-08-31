/**
 * In-memory recovery persistence and provider fakes for platform-completion
 * credential-recovery tests (design section 12.2, requirements 2.1–2.10).
 *
 * The repository reproduces the atomicity contract of the Prisma adapter:
 * `createRecoveryToken` invalidates earlier unconsumed tokens for the user and
 * creates exactly one token; `resetPassword` re-checks the token, replaces the
 * password hash, consumes the token, and revokes every session in one staged
 * step. A failure injected at any boundary leaves the store unchanged. No test
 * using these fakes performs network I/O or touches a database.
 */

import type {
  CreateRecoveryTokenInput,
  CreateRecoveryTokenOutcome,
  RecoveryAuditEntry,
  RecoveryAuditSink,
  RecoveryEmailContent,
  RecoveryEmailProvider,
  RecoveryEmailSendOutcome,
  RecoveryRepository,
  ResetPasswordInput,
  ResetPasswordOutcome,
  StoredRecoveryToken,
} from "../../recovery-service";
import type { Locale } from "../../types";
import { FAKE_EMAIL_FAILURE_DETAIL } from "./deterministic-runtime";

export type FakeRecoveryUser = {
  id: string;
  email: string;
  passwordHash: string;
  locale: Locale;
  active: boolean;
  emailVerified: boolean;
};

export type FakeRecoveryTokenRow = {
  id: string;
  userId: string;
  email: string;
  tokenHash: string;
  hashSalt: string | null;
  hashVersion: number | null;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
};

export type FakeRecoverySession = {
  id: string;
  userId: string;
};

export type RecoveryStoreSnapshot = Readonly<{
  users: readonly FakeRecoveryUser[];
  tokens: readonly FakeRecoveryTokenRow[];
  sessions: readonly FakeRecoverySession[];
}>;

/** Write boundary a test can fail inside a staged transaction. */
export type RecoveryWriteBoundary = "invalidate" | "token" | "password" | "consume" | "sessions";

export class InjectedRecoveryWriteFailure extends Error {
  constructor(readonly boundary: RecoveryWriteBoundary) {
    super(`Injected persistence failure at the ${boundary} write boundary.`);
    this.name = "InjectedRecoveryWriteFailure";
  }
}

type RecoveryStoreState = {
  users: FakeRecoveryUser[];
  tokens: FakeRecoveryTokenRow[];
  sessions: FakeRecoverySession[];
};

export type FakeRecoveryRepository = RecoveryRepository &
  Readonly<{
    snapshot(): RecoveryStoreSnapshot;
    seedUser(user: Readonly<{
      email: string;
      locale?: Locale;
      active?: boolean;
      emailVerified?: boolean;
      passwordHash?: string;
      sessions?: number;
    }>): FakeRecoveryUser;
    failNextWriteAt(boundary: RecoveryWriteBoundary | null): void;
  }>;

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter.toString(36)}`;
}

function cloneState(state: RecoveryStoreState): RecoveryStoreState {
  return {
    users: state.users.map((u) => ({ ...u })),
    tokens: state.tokens.map((t) => ({ ...t })),
    sessions: state.sessions.map((s) => ({ ...s })),
  };
}

export function createFakeRecoveryRepository(): FakeRecoveryRepository {
  let state: RecoveryStoreState = { users: [], tokens: [], sessions: [] };
  let failBoundary: RecoveryWriteBoundary | null = null;

  function failIfRequested(boundary: RecoveryWriteBoundary): void {
    if (failBoundary === boundary) {
      failBoundary = null;
      throw new InjectedRecoveryWriteFailure(boundary);
    }
  }

  return Object.freeze({
    snapshot: () => cloneState(state),

    seedUser: (input) => {
      const user: FakeRecoveryUser = {
        id: nextId("user"),
        email: input.email.trim().toLowerCase(),
        passwordHash: input.passwordHash ?? "stored-hash",
        locale: input.locale ?? "ar",
        active: input.active ?? true,
        emailVerified: input.emailVerified ?? true,
      };
      state.users.push(user);
      const sessions = input.sessions ?? 1;
      for (let i = 0; i < sessions; i += 1) {
        state.sessions.push({ id: nextId("session"), userId: user.id });
      }
      return user;
    },

    failNextWriteAt: (boundary) => {
      failBoundary = boundary;
    },

    findEligibleUserByEmail: async (email) => {
      const target = email.trim().toLowerCase();
      const user = state.users.find(
        (candidate) =>
          candidate.email === target && candidate.active && candidate.emailVerified
      );
      if (!user) return null;
      return { id: user.id, email: user.email, locale: user.locale };
    },

    createRecoveryToken: async (
      input: CreateRecoveryTokenInput
    ): Promise<CreateRecoveryTokenOutcome> => {
      const staged = cloneState(state);
      const user = staged.users.find(
        (candidate) =>
          candidate.id === input.userId &&
          candidate.email === input.email.trim().toLowerCase() &&
          candidate.active &&
          candidate.emailVerified
      );
      if (!user) return { kind: "USER_NOT_ELIGIBLE" as const };

      failIfRequested("invalidate");
      let replacedCount = 0;
      for (const token of staged.tokens) {
        if (
          token.userId === input.userId &&
          token.consumedAt === null &&
          token.expiresAt.getTime() > input.createdAt.getTime()
        ) {
          token.consumedAt = input.createdAt;
          replacedCount += 1;
        }
      }

      failIfRequested("token");
      const row: FakeRecoveryTokenRow = {
        id: nextId("rtoken"),
        userId: input.userId,
        email: user.email,
        tokenHash: input.token.tokenHash,
        hashSalt: input.token.hashSalt,
        hashVersion: input.token.hashVersion,
        createdAt: input.token.createdAt,
        expiresAt: input.token.expiresAt,
        consumedAt: null,
      };
      staged.tokens.push(row);
      state = staged;
      return {
        kind: "CREATED" as const,
        token: {
          id: row.id,
          userId: row.userId,
          email: row.email,
          createdAt: row.createdAt,
          expiresAt: row.expiresAt,
          replacedCount,
        },
      };

    },

    findRecoveryTokenByHash: async (tokenHash) => {
      const row = state.tokens.find((candidate) => candidate.tokenHash === tokenHash);
      if (!row) return null;
      const stored: StoredRecoveryToken = {
        id: row.id,
        userId: row.userId,
        email: row.email,
        tokenHash: row.tokenHash,
        hashSalt: row.hashSalt,
        hashVersion: row.hashVersion,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        consumedAt: row.consumedAt,
      };
      return stored;
    },

    resetPassword: async (input: ResetPasswordInput): Promise<ResetPasswordOutcome> => {
      const staged = cloneState(state);
      const token = staged.tokens.find(
        (candidate) =>
          candidate.id === input.tokenId &&
          candidate.tokenHash === input.tokenHash &&
          candidate.consumedAt === null
      );
      if (!token) return { kind: "TOKEN_INVALID" as const };

      failIfRequested("password");
      const user = staged.users.find((candidate) => candidate.id === input.userId);
      if (!user) return { kind: "TOKEN_INVALID" as const };
      user.passwordHash = input.passwordHash;

      failIfRequested("consume");
      token.consumedAt = input.resetAt;

      failIfRequested("sessions");
      const before = staged.sessions.length;
      staged.sessions = staged.sessions.filter((session) => session.userId !== input.userId);
      const sessionsRevoked = before - staged.sessions.length;

      state = staged;
      return { kind: "RESET_COMPLETE" as const, userId: input.userId, sessionsRevoked };
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Provider fakes                                                             */
/* -------------------------------------------------------------------------- */

export type FakeRecoveryEmailBehavior =
  | Readonly<{ kind: "unconfigured" }>
  | Readonly<{ kind: "sent" }>
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "throws" }>
  /** Never settles until the injected deadline aborts the call. */
  | Readonly<{ kind: "hangs" }>;

export type FakeRecoveryEmailProvider = RecoveryEmailProvider &
  Readonly<{
    readonly messages: readonly RecoveryEmailContent[];
    readonly abortReasons: readonly unknown[];
    setBehavior(behavior: FakeRecoveryEmailBehavior): void;
  }>;

export function createFakeRecoveryEmailProvider(
  initial: FakeRecoveryEmailBehavior = { kind: "sent" }
): FakeRecoveryEmailProvider {
  let behavior = initial;
  const messages: RecoveryEmailContent[] = [];
  const abortReasons: unknown[] = [];

  return Object.freeze({
    messages,
    abortReasons,

    setBehavior: (next) => {
      behavior = next;
    },

    isConfigured: () => behavior.kind !== "unconfigured",

    send: async (
      message: RecoveryEmailContent,
      context: Readonly<{ signal: AbortSignal }>
    ): Promise<RecoveryEmailSendOutcome> => {
      switch (behavior.kind) {
        case "unconfigured":
          return { ok: false, skipped: true };
        case "sent":
          messages.push(message);
          return { ok: true };
        case "failed":
          return { ok: false, error: FAKE_EMAIL_FAILURE_DETAIL };
        case "throws":
          throw new Error("Injected recovery email failure");
        case "hangs":
          return await new Promise<RecoveryEmailSendOutcome>((resolve, reject) => {
            const onAbort = () => {
              abortReasons.push(context.signal.reason);
              reject(context.signal.reason);
            };
            if (context.signal.aborted) onAbort();
            else context.signal.addEventListener("abort", onAbort, { once: true });
          });
      }
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Audit fake                                                                 */
/* -------------------------------------------------------------------------- */

export type RecordingRecoveryAuditSink = RecoveryAuditSink &
  Readonly<{
    readonly entries: readonly RecoveryAuditEntry[];
    failNext(): void;
  }>;

export function createRecordingRecoveryAuditSink(): RecordingRecoveryAuditSink {
  const entries: RecoveryAuditEntry[] = [];
  let shouldFail = false;

  return Object.freeze({
    entries,
    failNext: () => {
      shouldFail = true;
    },
    append: async (entry: RecoveryAuditEntry): Promise<void> => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("Injected audit append failure");
      }
      entries.push(entry);
    },
  });
}
