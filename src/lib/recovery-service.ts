/**
 * Recovery_Service — credential recovery (password reset)
 * (requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10).
 *
 * The module is a pure domain service in the same shape as `account-service.ts`
 * and `invitation-service.ts`: persistence, email delivery, audit writing,
 * password hashing, the clock, and cryptographic randomness are injected.
 * `recovery-service-prisma.ts` supplies the production adapters, so unit and
 * property tests drive these rules with in-memory repositories and provider
 * fakes without a network call or a shared-database mutation.
 *
 * Anti-enumeration ordering (criterion 2.1):
 * - Always return 202 with identical body for any submitted address ≤254 chars
 * - Only create token + send email when address matches active, verified user
 * - Never reveal whether an address exists in the system
 *
 * Atomicity is owned by the repository so one method equals one serializable
 * transaction:
 * - `requestRecovery` invalidates every earlier unconsumed recovery token for
 *   that user and creates exactly one 60-minute token (criteria 2.1, 2.2);
 * - `resetPassword` re-reads the token, replaces the password hash, consumes
 *   the token, revokes all sessions, and appends audit entry in one transaction
 *   (criterion 2.3);
 * - Rejected tokens and passwords leave the hash, token, and sessions unchanged
 *   (criteria 2.4, 2.9).
 *
 * A raw token value exists only inside the outgoing message. It is never
 * persisted, returned, logged, or written to an audit entry (criterion 2.5).
 */

import { z } from "zod";
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
  systemDeadlineScheduler,
  withProviderDeadline,
  ProviderDeadlineExceededError,
  type DeadlineScheduler,
} from "./provider-timeout";
import { getAppBaseUrl } from "./tokens";
import { hashPassword } from "./password";
import type { Locale } from "./types";

/* -------------------------------------------------------------------------- */
/* Contract constants                                                         */
/* -------------------------------------------------------------------------- */

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Single-use recovery token lifetime (criterion 2.2). */
export const RECOVERY_TOKEN_TTL_MS = ONE_HOUR_MS;

/** Email address bounds; the same grammar the account service enforces. */
export const RECOVERY_EMAIL_BOUNDS = Object.freeze({ min: 5, max: 254 });

/** Password bounds for reset (criterion 2.9). */
export const RECOVERY_PASSWORD_BOUNDS = Object.freeze({ min: 10, max: 128 });

/** Recovery-request rate limits (criterion 2.6). */
export const RECOVERY_REQUEST_RATE_LIMIT = Object.freeze({
  limit: 5,
  windowMs: ONE_HOUR_MS,
});

/**
 * Recovery requests allowed from one source address per hour.
 *
 * The per-address limit above caps how often one mailbox can be targeted; it
 * cannot see an attacker who asks once for each of ten thousand mailboxes. This
 * is the second axis OWASP API2:2023 asks for on a credential-recovery
 * endpoint — a limit "by client (e.g. IP address)" alongside the one "by
 * property (e.g. username)".
 * https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/
 *
 * 20 rather than the 5 above because the axes bound different things. Bidders
 * here are companies, and a company reaches us through one corporate egress
 * address, so this bucket is shared by everyone in the office. OWASP Top
 * 10:2025 A07 asks for the limit "while avoiding a denial-of-service
 * scenario", and a limit that locks out a procurement team because a colleague
 * forgot their password first is that scenario. Twenty distinct colleagues
 * losing their password inside the same hour is not a workday; twenty distinct
 * mailboxes per hour is not a mail-bomb.
 */
export const RECOVERY_SOURCE_RATE_LIMIT = Object.freeze({
  limit: 20,
  windowMs: ONE_HOUR_MS,
});

export const RECOVERY_TOKEN_SUBMISSION_RATE_LIMIT = Object.freeze({
  limit: 20,
  windowMs: ONE_HOUR_MS,
});

/** Recovery-email delivery deadline. */
export const RECOVERY_EMAIL_DEADLINE_MS = 30_000;

const DEFAULT_RECOVERY_LOCALE: Locale = "ar";
const SUPPORTED_LOCALES: readonly Locale[] = ["ar", "en"];
const MIN_RAW_TOKEN_LENGTH = 10;
const UNKNOWN_SOURCE_ADDRESS = "unknown";
const MAX_SOURCE_ADDRESS_LENGTH = 128;

/** Same deliberately strict address grammar as the account service. */
const EMAIL_PATTERN =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/u;
const MAX_EMAIL_LOCAL_PART_LENGTH = 64;

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export type NormalizedRecoveryRequest = Readonly<{
  /** Trimmed, case-folded email address (criterion 2.1). */
  email: string;
}>;

export type RecoveryRequestValidation =
  | Readonly<{ ok: true; value: NormalizedRecoveryRequest }>
  | Readonly<{ ok: false }>;

export type NormalizedPasswordReset = Readonly<{
  token: string;
  password: string;
}>;

export type PasswordResetValidation =
  | Readonly<{ ok: true; value: NormalizedPasswordReset }>
  | Readonly<{ ok: false; fieldPaths: readonly string[] }>;

/** Trimmed, case-folded address form used for every recovery comparison. */
export function normalizeRecoveryEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Validates a recovery request. Returns ok:false for any invalid input, and
 * the route will return the same anti-enumeration 202 response (criterion 2.1).
 */
export function validateRecoveryRequest(
  payload: unknown
): RecoveryRequestValidation {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false };
  }

  const record = payload as Readonly<Record<string, unknown>>;
  const email = typeof record.email === "string" ? record.email.trim() : null;
  
  if (
    email === null ||
    email.length < RECOVERY_EMAIL_BOUNDS.min ||
    email.length > RECOVERY_EMAIL_BOUNDS.max ||
    !isEmailAddressFormat(email)
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: { email: normalizeRecoveryEmail(email) },
  };
}

/**
 * Validates a password-reset submission (criteria 2.3, 2.9). Only reached when
 * a valid token is submitted.
 */
export function validatePasswordReset(
  payload: unknown
): PasswordResetValidation {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, fieldPaths: ["token", "password"] };
  }

  const record = payload as Readonly<Record<string, unknown>>;
  const offending: string[] = [];

  const token = typeof record.token === "string" ? record.token.trim() : null;
  if (
    token === null ||
    token.length < MIN_RAW_TOKEN_LENGTH ||
    token.length > MAX_RAW_TOKEN_LENGTH
  ) {
    offending.push("token");
  }

  const password = typeof record.password === "string" ? record.password : null;
  if (
    password === null ||
    password.length < RECOVERY_PASSWORD_BOUNDS.min ||
    password.length > RECOVERY_PASSWORD_BOUNDS.max
  ) {
    offending.push("password");
  }

  if (offending.length > 0) return { ok: false, fieldPaths: offending };
  return {
    ok: true,
    value: {
      token: token as string,
      password: password as string,
    },
  };
}

function isEmailAddressFormat(value: string): boolean {
  if (!EMAIL_PATTERN.test(value)) return false;
  const localPart = value.slice(0, value.lastIndexOf("@"));
  return localPart.length <= MAX_EMAIL_LOCAL_PART_LENGTH;
}

/* -------------------------------------------------------------------------- */
/* Injected boundaries                                                        */
/* -------------------------------------------------------------------------- */

export type RecoveryTokenDigest = Readonly<{
  tokenHash: string;
  hashSalt: string;
  hashVersion: number;
  createdAt: Date;
  expiresAt: Date;
}>;

export type CreateRecoveryTokenInput = Readonly<{
  userId: string;
  email: string;
  createdAt: Date;
  token: RecoveryTokenDigest;
}>;

export type CreatedRecoveryToken = Readonly<{
  id: string;
  userId: string;
  email: string;
  createdAt: Date;
  expiresAt: Date;
  /** Number of earlier unconsumed tokens closed by this replacement. */
  replacedCount: number;
}>;

export type CreateRecoveryTokenOutcome =
  | Readonly<{ kind: "CREATED"; token: CreatedRecoveryToken }>
  | Readonly<{ kind: "USER_NOT_ELIGIBLE" }>;

export type StoredRecoveryToken = Readonly<{
  id: string;
  userId: string;
  email: string;
  tokenHash: string;
  hashSalt: string | null;
  hashVersion: number | null;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
}>;

export type ResetPasswordInput = Readonly<{
  tokenId: string;
  /** Re-read guard: the digest the submitted token resolved to. */
  tokenHash: string;
  userId: string;
  passwordHash: string;
  resetAt: Date;
}>;

export type ResetPasswordOutcome =
  | Readonly<{ kind: "RESET_COMPLETE"; userId: string; sessionsRevoked: number }>
  | Readonly<{ kind: "TOKEN_INVALID" }>;

/**
 * Persistence boundary. Every method that a requirement describes as one atomic
 * step must be one serializable transaction in the adapter.
 */
export interface RecoveryRepository {
  /**
   * Finds an active, verified user by normalized email address.
   * Returns null if no match or user is inactive/unverified (criterion 2.1).
   */
  findEligibleUserByEmail(email: string): Promise<Readonly<{
    id: string;
    email: string;
    locale: Locale;
  }> | null>;

  /**
   * Creates one recovery token and invalidates all earlier unconsumed tokens
   * for that user in one serializable transaction (criterion 2.2).
   */
  createRecoveryToken(
    input: CreateRecoveryTokenInput
  ): Promise<CreateRecoveryTokenOutcome>;

  /**
   * Finds a recovery token by its hash.
   */
  findRecoveryTokenByHash(tokenHash: string): Promise<StoredRecoveryToken | null>;

  /**
   * Resets password, consumes token, revokes all sessions in one serializable
   * transaction (criterion 2.3).
   */
  resetPassword(input: ResetPasswordInput): Promise<ResetPasswordOutcome>;
}

export type RecoveryEmailSendOutcome = Readonly<{
  ok: boolean;
  skipped?: boolean;
  /**
   * What the transport reported, for the operator-only audit row. `reason` is a
   * closed category; this is the only thing that distinguishes one outage
   * (rejected sender, bad relay credentials, blocked port) from another.
   */
  error?: string;
}>;

export interface RecoveryEmailProvider {
  /** Whether the email Configuration_Boundary is set. */
  isConfigured(): boolean;
  send(
    message: RecoveryEmailContent,
    context: Readonly<{ signal: AbortSignal }>
  ): Promise<RecoveryEmailSendOutcome>;
}

export type RecoveryAuditAction =
  | "PASSWORD_RESET_REQUEST"
  | "PASSWORD_RESET_EMAIL_FAILED"
  | "PASSWORD_RESET";

/**
 * Audit entry appended after commit. The typed detail shape carries identifiers,
 * the email, and a UTC timestamp, and structurally cannot carry token material
 * (criterion 2.5).
 */
export type RecoveryAuditEntry = Readonly<{
  action: RecoveryAuditAction;
  userId?: string;
  resource: "RecoveryToken" | "User";
  resourceId?: string;
  severity: "INFO" | "WARN";
  sourceAddress: string;
  details: Readonly<{
    email: string;
    occurredAt: string;
    reason?: string;
    error?: string;
    /** Bounded transport detail. Operator-only: never returned to the caller. */
    providerError?: string;
    replacedCount?: number;
    sessionsRevoked?: number;
  }>;
}>;

export interface RecoveryAuditSink {
  append(entry: RecoveryAuditEntry): Promise<void>;
}

export interface PasswordHasher {
  hash(plainPassword: string): Promise<string>;
}

export const defaultRecoveryPasswordHasher: PasswordHasher = Object.freeze({
  hash: (plainPassword) => hashPassword(plainPassword),
});

export type RecoveryServiceDependencies = Readonly<{
  repository: RecoveryRepository;
  email: RecoveryEmailProvider;
  audit: RecoveryAuditSink;
  passwordHasher?: PasswordHasher;
  clock?: UtcClock;
  randomness?: CryptographicRandomSource;
  /** Absolute base URL used to build the reset link. */
  baseUrl?: string;
  emailDeadlineMs?: number;
  /** Injected only so a test can drive the delivery deadline without waiting. */
  deadlineScheduler?: DeadlineScheduler;
}>;

/* -------------------------------------------------------------------------- */
/* Commands and results                                                       */
/* -------------------------------------------------------------------------- */

export type RecoveryEmailContent = Readonly<{
  to: string;
  subject: string;
  html: string;
  text: string;
}>;

export type RequestRecoveryCommand = Readonly<{
  payload: unknown;
  sourceAddress?: string | null;
}>;

export type RequestRecoveryResult = Readonly<{
  ok: true;
  status: 202;
  code: "RECOVERY_REQUEST_ACCEPTED" | "RECOVERY_EMAIL_UNCONFIGURED";
}>;

export type ResetPasswordCommand = Readonly<{
  payload: unknown;
  sourceAddress?: string | null;
}>;

export type ResetPasswordResult =
  | Readonly<{
      ok: true;
      status: 200;
      code: "PASSWORD_RESET_COMPLETE";
      userId: string;
    }>
  | Readonly<{ ok: false; status: 400; code: "RECOVERY_TOKEN_INVALID" }>
  | Readonly<{
      ok: false;
      status: 400;
      code: "RECOVERY_PASSWORD_REJECTED";
      fieldPaths: readonly string[];
    }>;

export interface RecoveryService {
  requestRecovery(command: RequestRecoveryCommand): Promise<RequestRecoveryResult>;
  resetPassword(command: ResetPasswordCommand): Promise<ResetPasswordResult>;
}

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

export function createRecoveryService(
  dependencies: RecoveryServiceDependencies
): RecoveryService {
  const repository = dependencies.repository;
  const emailProvider = dependencies.email;
  const auditSink = dependencies.audit;
  const passwordHasher =
    dependencies.passwordHasher ?? defaultRecoveryPasswordHasher;
  const clock = dependencies.clock ?? systemUtcClock;
  const randomness = dependencies.randomness ?? nodeCryptographicRandomSource;
  const emailDeadlineMs =
    dependencies.emailDeadlineMs ?? RECOVERY_EMAIL_DEADLINE_MS;
  const deadlineScheduler =
    dependencies.deadlineScheduler ?? systemDeadlineScheduler;

  async function appendAudit(entry: RecoveryAuditEntry): Promise<void> {
    try {
      await auditSink.append(entry);
    } catch (error) {
      // An audit sink failure must never roll back or fail a committed change.
      console.error("[recovery-service] audit append failed", {
        action: entry.action,
        errorName: error instanceof Error ? error.name : typeof error,
      });
    }
  }

  async function requestRecovery(
    command: RequestRecoveryCommand
  ): Promise<RequestRecoveryResult> {
    const validation = validateRecoveryRequest(command.payload);
    const sourceAddress = normalizeSourceAddress(command.sourceAddress);
    
    // Anti-enumeration: always return 202 for invalid requests (criterion 2.1)
    if (!validation.ok) {
      return {
        ok: true,
        status: 202,
        code: "RECOVERY_REQUEST_ACCEPTED",
      };
    }

    const request = validation.value;
    const now = utcNow(clock);

    // Only create token if user is active and verified (criterion 2.1)
    const user = await repository.findEligibleUserByEmail(request.email);

    // Check email configuration before creating token (criterion 2.7). Answered
    // ahead of the unknown-address branch because whether recovery mail can be
    // sent is a property of the deployment, not of the submitted address:
    // reporting it only for a registered address would turn a switched-off
    // transport into an account-enumeration oracle.
    if (!emailProvider.isConfigured()) {
      if (user) {
        await appendAudit({
          action: "PASSWORD_RESET_REQUEST",
          userId: user.id,
          resource: "RecoveryToken",
          severity: "WARN",
          sourceAddress,
          details: {
            email: user.email,
            occurredAt: now.toISOString(),
            reason: "email_unconfigured",
          },
        });
      }
      return {
        ok: true,
        status: 202,
        code: "RECOVERY_EMAIL_UNCONFIGURED",
      };
    }

    // Anti-enumeration: return same response whether user exists or not
    if (!user) {
      return {
        ok: true,
        status: 202,
        code: "RECOVERY_REQUEST_ACCEPTED",
      };
    }

    // Create token and invalidate earlier tokens (criterion 2.2)
    const issued = createTokenDigest({ randomness });
    const expiresAt = addUtcMilliseconds(now, RECOVERY_TOKEN_TTL_MS);

    const outcome = await repository.createRecoveryToken({
      userId: user.id,
      email: user.email,
      createdAt: now,
      token: {
        tokenHash: issued.tokenHash,
        hashSalt: issued.hashSalt,
        hashVersion: issued.hashVersion,
        createdAt: now,
        expiresAt,
      },
    });

    if (outcome.kind === "USER_NOT_ELIGIBLE") {
      // Should not happen since we checked eligibility, but handle gracefully
      return {
        ok: true,
        status: 202,
        code: "RECOVERY_REQUEST_ACCEPTED",
      };
    }

    const created = outcome.token;
    
    // Send recovery email with raw token (criterion 2.5)
    const emailOutcome = await sendRecoveryEmail({
      email: user.email,
      locale: user.locale,
      rawToken: issued.rawToken,
    });

    // Audit the request and email outcome
    if (!emailOutcome.ok) {
      await appendAudit({
        action: "PASSWORD_RESET_EMAIL_FAILED",
        userId: user.id,
        resource: "RecoveryToken",
        resourceId: created.id,
        severity: "WARN",
        sourceAddress,
        details: {
          email: user.email,
          occurredAt: now.toISOString(),
          error: "delivery_failed",
          ...(emailOutcome.error ? { providerError: emailOutcome.error } : {}),
        },
      });
    } else {
      await appendAudit({
        action: "PASSWORD_RESET_REQUEST",
        userId: user.id,
        resource: "RecoveryToken",
        resourceId: created.id,
        severity: "INFO",
        sourceAddress,
        details: {
          email: user.email,
          occurredAt: now.toISOString(),
          replacedCount: created.replacedCount,
        },
      });
    }

    // Always return 202 with same code (anti-enumeration, criterion 2.1)
    return {
      ok: true,
      status: 202,
      code: "RECOVERY_REQUEST_ACCEPTED",
    };
  }

  async function sendRecoveryEmail(input: {
    readonly email: string;
    readonly locale: Locale;
    readonly rawToken: string;
  }): Promise<RecoveryEmailSendOutcome> {
    if (!emailProvider.isConfigured()) return { ok: false, skipped: true };

    const resetUrl = buildResetUrl(
      dependencies.baseUrl ?? getAppBaseUrl(),
      input.rawToken
    );
    
    const message = buildRecoveryEmailContent({
      to: input.email,
      locale: input.locale,
      resetUrl,
    });

    try {
      const outcome = await withProviderDeadline(
        (signal) => emailProvider.send(message, { signal }),
        {
          provider: "recovery-email",
          timeoutMs: emailDeadlineMs,
          scheduler: deadlineScheduler,
        }
      );
      return outcome;
    } catch (error) {
      // Timeout and provider exception share the failure branch; the message is
      // never logged, so the raw token cannot reach a log sink.
      console.error("[recovery-service] recovery email not delivered", {
        errorName: error instanceof Error ? error.name : typeof error,
        timedOut: error instanceof ProviderDeadlineExceededError,
      });
      // The thrown error's own message is deliberately not carried: a provider
      // exception can quote the payload it rejected, and the payload holds the
      // reset token. The class of failure is what an operator needs anyway.
      return {
        ok: false,
        error:
          error instanceof ProviderDeadlineExceededError
            ? "delivery deadline exceeded"
            : `provider threw ${error instanceof Error ? error.name : typeof error}`,
      };
    }
  }

  async function resetPassword(
    command: ResetPasswordCommand
  ): Promise<ResetPasswordResult> {
    const validation = validatePasswordReset(command.payload);
    if (!validation.ok) {
      return {
        ok: false,
        status: 400,
        code: "RECOVERY_PASSWORD_REJECTED",
        fieldPaths: validation.fieldPaths,
      };
    }

    const reset = validation.value;
    const sourceAddress = normalizeSourceAddress(command.sourceAddress);

    // Look up token by hash
    const lookup = getTokenDigestLookup(reset.token);
    if (!lookup) return invalidRecoveryToken();

    const stored = await repository.findRecoveryTokenByHash(lookup.tokenHash);
    if (!stored) return invalidRecoveryToken();

    const now = utcNow(clock);
    
    // Verify token with time check (rejects expired tokens, criterion 2.4)
    const matches = verifyTokenDigest(reset.token, stored, {
      clock: fixedUtcClock(now),
      legacy: { maxAgeMs: RECOVERY_TOKEN_TTL_MS },
    });
    
    if (!matches) return invalidRecoveryToken();

    // Token already consumed (criterion 2.4)
    if (stored.consumedAt !== null) return invalidRecoveryToken();

    // Hash the new password
    const passwordHash = await passwordHasher.hash(reset.password);

    // Atomic: update password + consume token + revoke sessions + audit (criterion 2.3)
    const outcome = await repository.resetPassword({
      tokenId: stored.id,
      tokenHash: stored.tokenHash,
      userId: stored.userId,
      passwordHash,
      resetAt: now,
    });

    if (outcome.kind === "TOKEN_INVALID") {
      return invalidRecoveryToken();
    }

    // Audit the successful reset
    await appendAudit({
      action: "PASSWORD_RESET",
      userId: outcome.userId,
      resource: "User",
      resourceId: outcome.userId,
      severity: "INFO",
      sourceAddress,
      details: {
        email: stored.email,
        occurredAt: now.toISOString(),
        sessionsRevoked: outcome.sessionsRevoked,
      },
    });

    return {
      ok: true,
      status: 200,
      code: "PASSWORD_RESET_COMPLETE",
      userId: outcome.userId,
    };
  }

  return Object.freeze({
    requestRecovery,
    resetPassword,
  });
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function invalidRecoveryToken(): ResetPasswordResult {
  return { ok: false, status: 400, code: "RECOVERY_TOKEN_INVALID" };
}

export function buildResetUrl(baseUrl: string, rawToken: string): string {
  return `${baseUrl}/reset-password?token=${rawToken}`;
}

export function buildRecoveryEmailContent(input: Readonly<{
  to: string;
  locale: Locale;
  resetUrl: string;
}>): RecoveryEmailContent {
  const isArabic = input.locale === "ar";
  
  const subject = isArabic
    ? "إعادة تعيين كلمة المرور — أراب كلاو"
    : "Reset your password — Arabclue";

  const html = buildRecoveryEmailHtml(input.resetUrl, isArabic);
  const text = buildRecoveryEmailText(input.resetUrl);

  return {
    to: input.to,
    subject,
    html,
    text,
  };
}

function buildRecoveryEmailHtml(resetUrl: string, isArabic: boolean): string {
  const dir = isArabic ? "rtl" : "ltr";
  const title = isArabic ? "إعادة تعيين كلمة المرور" : "Reset your password";
  const intro = isArabic
    ? "طلبت إعادة تعيين كلمة المرور. الرابط صالح لمدة 60 دقيقة:"
    : "You requested a password reset. Link valid for 60 minutes:";
  const buttonText = isArabic ? "إعادة تعيين" : "Reset password";
  const ignore = isArabic
    ? "إذا لم تطلب إعادة التعيين تجاهل الرسالة."
    : "If you did not request this, ignore the email.";

  return `
<div dir="${dir}" style="font-family: IBM Plex Sans Arabic, system-ui, sans-serif; max-width:560px;margin:0 auto;padding:24px;">
  <h1 style="font-size:20px;font-weight:700;">${title}</h1>
  <p>${intro}</p>
  <p><a href="${resetUrl}" style="display:inline-block;padding:12px 20px;background:#1E3A8A;color:#fff;border-radius:9999px;text-decoration:none;font-weight:600;">${buttonText}</a></p>
  <p style="font-size:12px;color:#666;word-break:break-all;">${resetUrl}</p>
  <p style="font-size:12px;color:#666">${ignore}</p>
  <p style="font-size:12px;color:#666">EN / AR bilingual — link valid 60min / صالح 60 دقيقة</p>
</div>`;
}

function buildRecoveryEmailText(resetUrl: string): string {
  return `Arabclue password reset / إعادة تعيين
Link valid 60 min / صالح 60 دقيقة: ${resetUrl}
If not requested, ignore. إذا لم تطلب تجاهل.`;
}

export function normalizeSourceAddress(
  value: string | null | undefined
): string {
  if (typeof value !== "string") return UNKNOWN_SOURCE_ADDRESS;
  const address = value.trim();
  if (address.length === 0 || address.length > MAX_SOURCE_ADDRESS_LENGTH) {
    return UNKNOWN_SOURCE_ADDRESS;
  }
  return address;
}
