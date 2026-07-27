/**
 * Account_Service — self-serve registration and email verification
 * (requirements 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 1.8, 1.9, 1.11, 1.12, 1.13).
 *
 * The module is a pure domain service: persistence, email delivery, audit
 * writing, rate limiting, hashing, the clock, and cryptographic randomness are
 * injected. `account-service-prisma.ts` supplies the production adapters, while
 * unit and property tests drive the same code with in-memory repositories and
 * provider fakes, so no test performs network I/O or a shared-database mutation
 * (design sections 3.1 and 4.1).
 *
 * Ordering guarantees implemented here:
 * 1. rolling source-address rate limit (criteria 1.8, 1.12);
 * 2. field bounds and email format (criterion 1.11);
 * 3. reserved development identity (criterion 1.3) — always before uniqueness;
 * 4. normalized uniqueness (criterion 1.2);
 * 5. one serializable transaction creating user, workspace, writer membership,
 *    and one 24-hour verification token (criteria 1.1, 1.4);
 * 6. post-commit audit and bounded email delivery, which can never roll the
 *    committed records back (criteria 1.9, 1.13).
 *
 * A raw token value exists only inside the outgoing message. It is never
 * persisted, returned, logged, or written to an audit entry.
 */

import {
  createTokenDigest,
  getTokenDigestLookup,
  nodeCryptographicRandomSource,
  verifyTokenDigest,
  MAX_RAW_TOKEN_LENGTH,
  type CryptographicRandomSource,
} from "./token-digest";
import {
  addUtcMilliseconds,
  fixedUtcClock,
  systemUtcClock,
  utcNow,
  type UtcClock,
} from "./time";
import {
  ProviderDeadlineExceededError,
  systemDeadlineScheduler,
  withProviderDeadline,
  type DeadlineScheduler,
} from "./provider-timeout";
import {
  isProductionBlockedDevelopmentIdentity,
  type IdentityRuntimeEnvironment,
} from "./production-identities";
import { buildWorkspaceSlug, getAppBaseUrl } from "./tokens";
import { systemRandomUuid, type RandomUuid } from "./runtime-id";
import { hashPassword } from "./password";
import { rateLimitAsync } from "./rate-limit";
import {
  buildVerificationEmailContent,
  VERIFICATION_LINK_EXPIRY_HOURS,
  type VerificationEmailContent,
} from "./account-verification-email";
import type { Locale } from "./types";

/* -------------------------------------------------------------------------- */
/* Contract constants                                                         */
/* -------------------------------------------------------------------------- */

/** Exact field bounds required by criterion 1.1 and enforced by criterion 1.11. */
export const REGISTRATION_FIELD_BOUNDS = Object.freeze({
  email: Object.freeze({ min: 5, max: 254 }),
  password: Object.freeze({ min: 10, max: 128 }),
  name: Object.freeze({ min: 2, max: 80 }),
  workspaceName: Object.freeze({ min: 2, max: 80 }),
});

/** Membership role granted to the registering user (Writer_Role, criterion 1.1). */
export const REGISTRATION_MEMBERSHIP_ROLE = "OWNER" as const;

/** Platform role granted to the registering user. */
export const REGISTRATION_PLATFORM_ROLE = "BIDDER" as const;

export const ONE_HOUR_MS = 60 * 60 * 1000;

/** Verification token lifetime measured from its stored creation timestamp. */
export const VERIFICATION_TOKEN_TTL_MS =
  VERIFICATION_LINK_EXPIRY_HOURS * ONE_HOUR_MS;

/** Rolling 60-minute source-address limits (criterion 1.8). */
export const REGISTRATION_RATE_LIMIT = Object.freeze({
  limit: 5,
  windowMs: ONE_HOUR_MS,
});
export const VERIFICATION_RATE_LIMIT = Object.freeze({
  limit: 20,
  windowMs: ONE_HOUR_MS,
});

/** Verification-email delivery deadline (criterion 1.13). */
export const VERIFICATION_EMAIL_DEADLINE_MS = 30_000;

/**
 * Bounds for the committed-records phase so the 201 contract in criterion 1.1
 * stays inside five seconds even when the database is slow to answer.
 */
export const REGISTRATION_TRANSACTION_MAX_WAIT_MS = 1_500;
export const REGISTRATION_TRANSACTION_TIMEOUT_MS = 4_000;

const DEFAULT_LOCALE: Locale = "ar";
const SUPPORTED_LOCALES: readonly Locale[] = ["ar", "en"];
const UNKNOWN_SOURCE_ADDRESS = "unknown";
const MIN_RAW_TOKEN_LENGTH = 10;
const MAX_SOURCE_ADDRESS_LENGTH = 128;

/**
 * Deliberately strict address grammar: one `@`, no whitespace or quoting, a
 * bounded local part, and a dotted domain of letter/digit/hyphen labels.
 */
const EMAIL_PATTERN =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/u;
const MAX_EMAIL_LOCAL_PART_LENGTH = 64;

/** Stable order used when a failure names more than one offending field. */
export const REGISTRATION_FIELD_ORDER = [
  "email",
  "password",
  "name",
  "workspaceName",
  "locale",
] as const;

export type RegistrationFieldPath = (typeof REGISTRATION_FIELD_ORDER)[number];

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export type NormalizedRegistration = Readonly<{
  /** Trimmed and case-folded address used for uniqueness and persistence. */
  email: string;
  password: string;
  name: string;
  workspaceName: string;
  locale: Locale;
}>;

export type RegistrationValidation =
  | Readonly<{ ok: true; value: NormalizedRegistration }>
  | Readonly<{ ok: false; fieldPaths: readonly RegistrationFieldPath[] }>;

/** Trimmed, case-folded address form used for uniqueness (criterion 1.2). */
export function normalizeAccountEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Validates a registration payload against the exact bounds in criterion 1.1
 * and names every offending field (criterion 1.11). Pure and side-effect free.
 */
export function validateRegistrationPayload(
  payload: unknown
): RegistrationValidation {
  const offending = new Set<RegistrationFieldPath>();
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return {
      ok: false,
      fieldPaths: ["email", "password", "name", "workspaceName"],
    };
  }

  const record = payload as Readonly<Record<string, unknown>>;
  const email = readTrimmedText(record.email);
  const password = typeof record.password === "string" ? record.password : null;
  const name = readTrimmedText(record.name);
  const workspaceName = readTrimmedText(record.workspaceName);

  if (
    email === null ||
    !withinBounds(email.length, REGISTRATION_FIELD_BOUNDS.email) ||
    !isEmailAddressFormat(email)
  ) {
    offending.add("email");
  }
  if (
    password === null ||
    !withinBounds(password.length, REGISTRATION_FIELD_BOUNDS.password)
  ) {
    offending.add("password");
  }
  if (name === null || !withinBounds(name.length, REGISTRATION_FIELD_BOUNDS.name)) {
    offending.add("name");
  }
  if (
    workspaceName === null ||
    !withinBounds(workspaceName.length, REGISTRATION_FIELD_BOUNDS.workspaceName)
  ) {
    offending.add("workspaceName");
  }

  let locale: Locale = DEFAULT_LOCALE;
  if (record.locale !== undefined && record.locale !== null) {
    if (
      typeof record.locale === "string" &&
      SUPPORTED_LOCALES.includes(record.locale as Locale)
    ) {
      locale = record.locale as Locale;
    } else {
      offending.add("locale");
    }
  }

  if (offending.size > 0) {
    return {
      ok: false,
      fieldPaths: REGISTRATION_FIELD_ORDER.filter((field) =>
        offending.has(field)
      ),
    };
  }

  return {
    ok: true,
    value: {
      email: normalizeAccountEmail(email as string),
      password: password as string,
      name: name as string,
      workspaceName: workspaceName as string,
      locale,
    },
  };
}

function readTrimmedText(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

function withinBounds(
  length: number,
  bounds: Readonly<{ min: number; max: number }>
): boolean {
  return length >= bounds.min && length <= bounds.max;
}

function isEmailAddressFormat(value: string): boolean {
  if (!EMAIL_PATTERN.test(value)) return false;
  const localPart = value.slice(0, value.lastIndexOf("@"));
  return localPart.length <= MAX_EMAIL_LOCAL_PART_LENGTH;
}

/* -------------------------------------------------------------------------- */
/* Injected boundaries                                                        */
/* -------------------------------------------------------------------------- */

export type AccountTokenDigest = Readonly<{
  tokenHash: string;
  hashSalt: string;
  hashVersion: number;
  createdAt: Date;
  expiresAt: Date;
}>;

export type CreateAccountRecordsInput = Readonly<{
  email: string;
  name: string;
  passwordHash: string;
  locale: Locale;
  platformRole: string;
  workspaceName: string;
  workspaceSlug: string;
  membershipRole: string;
  createdAt: Date;
  verificationToken: AccountTokenDigest;
}>;

export type CreatedAccountRecords = Readonly<{
  userId: string;
  workspaceId: string;
  membershipId: string;
  verificationTokenId: string;
}>;

export type StoredVerificationToken = Readonly<{
  id: string;
  userId: string;
  /** Persisted address of the token owner, used only for the audit entry. */
  userEmail: string;
  tokenHash: string;
  hashSalt: string | null;
  hashVersion: number | null;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
}>;

export type ConsumeVerificationTokenInput = Readonly<{
  tokenId: string;
  userId: string;
  verifiedAt: Date;
}>;

/**
 * Persistence boundary. `createAccountRecords` must commit user, workspace,
 * writer membership, and verification token together or persist none of them
 * (criterion 1.1); `consumeVerificationToken` must mark the user verified and
 * consume the token in one transaction, returning `false` when another request
 * consumed it first (criteria 1.6, 1.7).
 */
export interface AccountRepository {
  findUserIdByNormalizedEmail(normalizedEmail: string): Promise<string | null>;
  createAccountRecords(
    input: CreateAccountRecordsInput
  ): Promise<CreatedAccountRecords>;
  findVerificationTokenByHash(
    tokenHash: string
  ): Promise<StoredVerificationToken | null>;
  consumeVerificationToken(
    input: ConsumeVerificationTokenInput
  ): Promise<boolean>;
}

/** Raised by a repository when the normalized-email unique index rejects a write. */
export class DuplicateAccountEmailError extends Error {
  readonly code = "EMAIL_ALREADY_REGISTERED" as const;

  constructor(options?: { readonly cause?: unknown }) {
    super("An account already exists for the normalized email address.");
    this.name = "DuplicateAccountEmailError";
    if (options && "cause" in options) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export type EmailSendOutcome = Readonly<{
  ok: boolean;
  /** True when the provider declined because it is not configured. */
  skipped?: boolean;
}>;

export interface AccountEmailProvider {
  /** Whether the email Configuration_Boundary is set (criteria 1.9, 1.13). */
  isConfigured(): boolean;
  send(
    message: VerificationEmailContent,
    context: Readonly<{ signal: AbortSignal }>
  ): Promise<EmailSendOutcome>;
}

export type RateLimitDecision = Readonly<{
  ok: boolean;
  retryAfterSeconds: number;
}>;

export interface AccountRateLimiter {
  consume(
    request: Readonly<{ key: string; limit: number; windowMs: number }>
  ): Promise<RateLimitDecision>;
}

export type AccountAuditAction =
  | "REGISTRATION_CREATED"
  | "EMAIL_VERIFICATION_PENDING"
  | "EMAIL_VERIFICATION_SEND_FAILED"
  | "EMAIL_VERIFIED";

export type AccountAuditReason =
  | "email_unconfigured"
  | "delivery_failed"
  | "delivery_timeout";

/**
 * Audit entry appended after commit. The typed detail shape carries the affected
 * email address and a UTC timestamp (criteria 1.9, 1.13) and structurally cannot
 * carry token material.
 */
export type AccountAuditEntry = Readonly<{
  action: AccountAuditAction;
  userId: string;
  resource: "User" | "VerificationToken";
  resourceId?: string;
  severity: "INFO" | "WARN";
  sourceAddress: string;
  details: Readonly<{
    email: string;
    occurredAt: string;
    workspaceId?: string;
    reason?: AccountAuditReason;
  }>;
}>;

export interface AccountAuditSink {
  append(entry: AccountAuditEntry): Promise<void>;
}

export interface PasswordHasher {
  hash(plainPassword: string): Promise<string>;
}

export const defaultPasswordHasher: PasswordHasher = Object.freeze({
  hash: (plainPassword) => hashPassword(plainPassword),
});

/**
 * Shared sliding-window limiter used unless a caller injects another.
 *
 * An exhausted window and an unavailable distributed backend both deny the
 * request: the limiter fails closed, and the caller receives the rate-limited
 * code with a retry delay rather than an unlimited registration path.
 */
export const defaultAccountRateLimiter: AccountRateLimiter = Object.freeze({
  consume: async (request) => {
    const result = await rateLimitAsync(request);
    return {
      ok: result.ok,
      retryAfterSeconds: Math.max(1, Math.ceil(result.retryAfterMs / 1_000)),
    };
  },
});

export type AccountServiceDependencies = Readonly<{
  repository: AccountRepository;
  email: AccountEmailProvider;
  audit: AccountAuditSink;
  rateLimiter?: AccountRateLimiter;
  passwordHasher?: PasswordHasher;
  clock?: UtcClock;
  randomness?: CryptographicRandomSource;
  randomUuid?: RandomUuid;
  /** Runtime used to classify reserved development identities (criterion 1.3). */
  identityEnvironment?: IdentityRuntimeEnvironment;
  /** Absolute base URL used to build the verification link. */
  baseUrl?: string;
  emailDeadlineMs?: number;
  /** Injected only so a test can drive the delivery deadline without waiting. */
  deadlineScheduler?: DeadlineScheduler;
}>;

/* -------------------------------------------------------------------------- */
/* Results                                                                    */
/* -------------------------------------------------------------------------- */

export type VerificationEmailDelivery = "SENT" | "UNCONFIGURED" | "FAILED";

/** Exact persisted state returned by a successful registration. */
export type RegisteredAccountState = Readonly<{
  userId: string;
  workspaceId: string;
  membershipId: string;
  membershipRole: string;
  platformRole: string;
  email: string;
  name: string;
  workspaceName: string;
  workspaceSlug: string;
  locale: Locale;
  emailVerified: false;
  verificationTokenId: string;
  verificationTokenCreatedAt: string;
  verificationTokenExpiresAt: string;
}>;

export type RegistrationSuccess = Readonly<{
  ok: true;
  status: 201 | 202;
  code:
    | "REGISTRATION_CREATED"
    | "VERIFICATION_EMAIL_UNCONFIGURED"
    | "VERIFICATION_EMAIL_SEND_FAILED";
  emailDelivery: VerificationEmailDelivery;
  account: RegisteredAccountState;
}>;

export type RegistrationFailure =
  | Readonly<{
      ok: false;
      status: 400;
      code: "REGISTRATION_INVALID";
      fieldPaths: readonly RegistrationFieldPath[];
    }>
  | Readonly<{ ok: false; status: 400; code: "RESERVED_IDENTITY" }>
  | Readonly<{ ok: false; status: 409; code: "EMAIL_ALREADY_REGISTERED" }>
  | Readonly<{
      ok: false;
      status: 429;
      code: "REGISTRATION_RATE_LIMITED";
      retryAfterSeconds: number;
    }>;

export type RegistrationResult = RegistrationSuccess | RegistrationFailure;

export type VerificationResult =
  | Readonly<{
      ok: true;
      status: 200;
      code: "EMAIL_VERIFIED";
      userId: string;
      verifiedAt: string;
    }>
  | Readonly<{ ok: false; status: 400; code: "VERIFICATION_TOKEN_INVALID" }>
  | Readonly<{
      ok: false;
      status: 429;
      code: "VERIFICATION_RATE_LIMITED";
      retryAfterSeconds: number;
    }>;

export type RegistrationCommand = Readonly<{
  /** Unvalidated request payload. */
  payload: unknown;
  /** Source address used by the rolling rate limit (criterion 1.8). */
  sourceAddress?: string | null;
}>;

export type VerificationCommand = Readonly<{
  token: unknown;
  sourceAddress?: string | null;
}>;

export interface AccountService {
  register(command: RegistrationCommand): Promise<RegistrationResult>;
  verifyEmail(command: VerificationCommand): Promise<VerificationResult>;
}

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

export function createAccountService(
  dependencies: AccountServiceDependencies
): AccountService {
  const repository = dependencies.repository;
  const emailProvider = dependencies.email;
  const auditSink = dependencies.audit;
  const rateLimiter = dependencies.rateLimiter ?? defaultAccountRateLimiter;
  const passwordHasher = dependencies.passwordHasher ?? defaultPasswordHasher;
  const clock = dependencies.clock ?? systemUtcClock;
  const randomness = dependencies.randomness ?? nodeCryptographicRandomSource;
  const randomUuid = dependencies.randomUuid ?? systemRandomUuid;
  const identityEnvironment = dependencies.identityEnvironment ?? process.env;
  const emailDeadlineMs =
    dependencies.emailDeadlineMs ?? VERIFICATION_EMAIL_DEADLINE_MS;
  const deadlineScheduler =
    dependencies.deadlineScheduler ?? systemDeadlineScheduler;

  async function appendAudit(entry: AccountAuditEntry): Promise<void> {
    try {
      await auditSink.append(entry);
    } catch (error) {
      // An audit sink failure must never roll back or fail a committed account.
      console.error("[account-service] audit append failed", {
        action: entry.action,
        errorName: error instanceof Error ? error.name : typeof error,
      });
    }
  }

  async function register(
    command: RegistrationCommand
  ): Promise<RegistrationResult> {
    const sourceAddress = normalizeSourceAddress(command.sourceAddress);

    const limit = await rateLimiter.consume({
      key: `register:ip:${sourceAddress}`,
      limit: REGISTRATION_RATE_LIMIT.limit,
      windowMs: REGISTRATION_RATE_LIMIT.windowMs,
    });
    if (!limit.ok) {
      return {
        ok: false,
        status: 429,
        code: "REGISTRATION_RATE_LIMITED",
        retryAfterSeconds: limit.retryAfterSeconds,
      };
    }

    const validation = validateRegistrationPayload(command.payload);
    if (!validation.ok) {
      return {
        ok: false,
        status: 400,
        code: "REGISTRATION_INVALID",
        fieldPaths: validation.fieldPaths,
      };
    }
    const request = validation.value;

    // Criterion 1.3: the reserved-identity check precedes the uniqueness check.
    if (
      isProductionBlockedDevelopmentIdentity(request.email, identityEnvironment)
    ) {
      return { ok: false, status: 400, code: "RESERVED_IDENTITY" };
    }

    const existingUserId = await repository.findUserIdByNormalizedEmail(
      request.email
    );
    if (existingUserId) {
      return { ok: false, status: 409, code: "EMAIL_ALREADY_REGISTERED" };
    }

    const passwordHash = await passwordHasher.hash(request.password);
    const issued = createTokenDigest({ randomness });
    const createdAt = utcNow(clock);
    const expiresAt = addUtcMilliseconds(createdAt, VERIFICATION_TOKEN_TTL_MS);
    const workspaceSlug = buildWorkspaceSlug(request.workspaceName, randomUuid);

    let created: CreatedAccountRecords;
    try {
      created = await repository.createAccountRecords({
        email: request.email,
        name: request.name,
        passwordHash,
        locale: request.locale,
        platformRole: REGISTRATION_PLATFORM_ROLE,
        workspaceName: request.workspaceName,
        workspaceSlug,
        membershipRole: REGISTRATION_MEMBERSHIP_ROLE,
        createdAt,
        verificationToken: {
          tokenHash: issued.tokenHash,
          hashSalt: issued.hashSalt,
          hashVersion: issued.hashVersion,
          createdAt,
          expiresAt,
        },
      });
    } catch (error) {
      // The unique index on the normalized address closes the race left by the
      // pre-query; the loser reports the duplicate rather than a generic 500.
      if (error instanceof DuplicateAccountEmailError) {
        return { ok: false, status: 409, code: "EMAIL_ALREADY_REGISTERED" };
      }
      throw error;
    }

    const account: RegisteredAccountState = {
      userId: created.userId,
      workspaceId: created.workspaceId,
      membershipId: created.membershipId,
      membershipRole: REGISTRATION_MEMBERSHIP_ROLE,
      platformRole: REGISTRATION_PLATFORM_ROLE,
      email: request.email,
      name: request.name,
      workspaceName: request.workspaceName,
      workspaceSlug,
      locale: request.locale,
      emailVerified: false,
      verificationTokenId: created.verificationTokenId,
      verificationTokenCreatedAt: createdAt.toISOString(),
      verificationTokenExpiresAt: expiresAt.toISOString(),
    };

    await appendAudit({
      action: "REGISTRATION_CREATED",
      userId: account.userId,
      resource: "User",
      resourceId: account.userId,
      severity: "INFO",
      sourceAddress,
      details: {
        email: account.email,
        occurredAt: createdAt.toISOString(),
        workspaceId: account.workspaceId,
      },
    });

    const delivery = await deliverVerificationEmail({
      account,
      rawToken: issued.rawToken,
      sourceAddress,
    });

    if (delivery === "SENT") {
      return {
        ok: true,
        status: 201,
        code: "REGISTRATION_CREATED",
        emailDelivery: "SENT",
        account,
      };
    }

    // Criteria 1.9 and 1.13: the committed records and the persisted token are
    // retained; only the reported status and audit differ.
    return {
      ok: true,
      status: 202,
      code:
        delivery === "UNCONFIGURED"
          ? "VERIFICATION_EMAIL_UNCONFIGURED"
          : "VERIFICATION_EMAIL_SEND_FAILED",
      emailDelivery: delivery,
      account,
    };
  }

  async function deliverVerificationEmail(input: {
    readonly account: RegisteredAccountState;
    readonly rawToken: string;
    readonly sourceAddress: string;
  }): Promise<VerificationEmailDelivery> {
    const { account, sourceAddress } = input;

    if (!emailProvider.isConfigured()) {
      await appendDeliveryAudit(account, sourceAddress, "email_unconfigured");
      return "UNCONFIGURED";
    }

    const message = buildVerificationEmailContent({
      to: account.email,
      locale: account.locale,
      workspaceName: account.workspaceName,
      verificationUrl: buildVerificationUrl(
        dependencies.baseUrl ?? getAppBaseUrl(),
        input.rawToken
      ),
      expiryHours: VERIFICATION_LINK_EXPIRY_HOURS,
    });

    try {
      const outcome = await withProviderDeadline(
        (signal) => emailProvider.send(message, { signal }),
        {
          provider: "verification-email",
          timeoutMs: emailDeadlineMs,
          scheduler: deadlineScheduler,
        }
      );
      if (outcome.ok) return "SENT";
      const reason: AccountAuditReason = outcome.skipped
        ? "email_unconfigured"
        : "delivery_failed";
      await appendDeliveryAudit(account, sourceAddress, reason);
      return outcome.skipped ? "UNCONFIGURED" : "FAILED";
    } catch (error) {
      // Timeout and provider exception share the failure branch; the message
      // itself is never logged, so no token can reach a log sink.
      const reason: AccountAuditReason =
        error instanceof ProviderDeadlineExceededError
          ? "delivery_timeout"
          : "delivery_failed";
      await appendDeliveryAudit(account, sourceAddress, reason);
      return "FAILED";
    }
  }

  async function appendDeliveryAudit(
    account: RegisteredAccountState,
    sourceAddress: string,
    reason: AccountAuditReason
  ): Promise<void> {
    await appendAudit({
      action:
        reason === "email_unconfigured"
          ? "EMAIL_VERIFICATION_PENDING"
          : "EMAIL_VERIFICATION_SEND_FAILED",
      userId: account.userId,
      resource: "VerificationToken",
      resourceId: account.verificationTokenId,
      severity: reason === "email_unconfigured" ? "INFO" : "WARN",
      sourceAddress,
      details: {
        email: account.email,
        occurredAt: utcNow(clock).toISOString(),
        workspaceId: account.workspaceId,
        reason,
      },
    });
  }

  async function verifyEmail(
    command: VerificationCommand
  ): Promise<VerificationResult> {
    const sourceAddress = normalizeSourceAddress(command.sourceAddress);

    const limit = await rateLimiter.consume({
      key: `verify-email:ip:${sourceAddress}`,
      limit: VERIFICATION_RATE_LIMIT.limit,
      windowMs: VERIFICATION_RATE_LIMIT.windowMs,
    });
    if (!limit.ok) {
      return {
        ok: false,
        status: 429,
        code: "VERIFICATION_RATE_LIMITED",
        retryAfterSeconds: limit.retryAfterSeconds,
      };
    }

    const rawToken = readSubmittedToken(command.token);
    if (!rawToken) return invalidVerificationToken();

    const lookup = getTokenDigestLookup(rawToken);
    if (!lookup) return invalidVerificationToken();

    const stored = await repository.findVerificationTokenByHash(
      lookup.tokenHash
    );
    if (!stored || stored.consumedAt !== null) {
      return invalidVerificationToken();
    }

    const now = utcNow(clock);
    const matches = verifyTokenDigest(rawToken, stored, {
      clock: fixedUtcClock(now),
      legacy: { maxAgeMs: VERIFICATION_TOKEN_TTL_MS },
    });
    if (!matches) return invalidVerificationToken();

    const consumed = await repository.consumeVerificationToken({
      tokenId: stored.id,
      userId: stored.userId,
      verifiedAt: now,
    });
    if (!consumed) return invalidVerificationToken();

    await appendAudit({
      action: "EMAIL_VERIFIED",
      userId: stored.userId,
      resource: "User",
      resourceId: stored.userId,
      severity: "INFO",
      sourceAddress,
      details: { email: stored.userEmail, occurredAt: now.toISOString() },
    });

    return {
      ok: true,
      status: 200,
      code: "EMAIL_VERIFIED",
      userId: stored.userId,
      verifiedAt: now.toISOString(),
    };
  }

  return Object.freeze({ register, verifyEmail });
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function invalidVerificationToken(): VerificationResult {
  return { ok: false, status: 400, code: "VERIFICATION_TOKEN_INVALID" };
}

/** Bounded, non-empty raw token, or null when the submission cannot be a token. */
function readSubmittedToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (
    token.length < MIN_RAW_TOKEN_LENGTH ||
    token.length > MAX_RAW_TOKEN_LENGTH
  ) {
    return null;
  }
  return token;
}

export function normalizeSourceAddress(value: string | null | undefined): string {
  if (typeof value !== "string") return UNKNOWN_SOURCE_ADDRESS;
  const address = value.trim();
  if (address.length === 0 || address.length > MAX_SOURCE_ADDRESS_LENGTH) {
    return UNKNOWN_SOURCE_ADDRESS;
  }
  return address;
}

/** Verification link carrying the single-use raw token as a query parameter. */
export function buildVerificationUrl(baseUrl: string, rawToken: string): string {
  const base = baseUrl.replace(/\/+$/u, "");
  return `${base}/verify-email?token=${encodeURIComponent(rawToken)}`;
}
