/**
 * Central bilingual API failure mapper (design section 3.2).
 *
 * Every failed response in the request boundary is built here so that:
 * - the stable machine-readable code and both locales come from the
 *   localization registry rather than route-local literals (requirements 18.4,
 *   19.9);
 * - a missing relation becomes HTTP 503 `SCHEMA_MIGRATION_PENDING` naming the
 *   relation, never an empty or synthesized success (requirements 16.2, 16.7);
 * - an unknown thrown error becomes a generic bilingual 500 that leaks no SQL,
 *   provider payload, credential, token, document body, or commercial value
 *   (requirements 18.4, 19.7).
 *
 * Response construction (`NextResponse`) lives in `api-controller.ts`; this
 * module stays a pure mapper so domain services and tests can use it directly.
 */

import { ZodError } from "zod";
import {
  getCompletionErrorContract,
  isCompletionErrorCode,
  t,
  type CompletionErrorCode,
} from "./i18n";
import {
  SchemaMigrationPendingError,
  isPrismaMissingTable,
  isSchemaMigrationPendingError,
} from "./prisma-missing-table";
import { extractMissingTableName } from "./schema-guard";
import { migrationForTable } from "./migration-registry";
import type { ApiFailure, BilingualMessage } from "./api-failure-message";

export type { ApiFailure, BilingualMessage } from "./api-failure-message";
export {
  isApiFailure,
  selectApiFailureCode,
  selectApiFailureMessage,
} from "./api-failure-message";
export { SchemaMigrationPendingError } from "./prisma-missing-table";

/** Interpolation values accepted by a registered error message. */
export type FailureValues = Readonly<Record<string, string | number>>;

export type FailureOptions = Readonly<{
  /** Overrides the status derived from the code. */
  status?: number;
  /** Offending field paths for a validation failure (requirement 19.9). */
  fieldPaths?: readonly string[];
  retryAfterSeconds?: number;
  /** Relation reported missing by the driver (requirement 16.2). */
  missingTable?: string | null;
  /** Named values interpolated into the registered message. */
  values?: FailureValues;
}>;

/* -------------------------------------------------------------------------- */
/* Typed failures thrown by routes and domain services                        */
/* -------------------------------------------------------------------------- */

/**
 * Expected failure raised by a handler or service.
 *
 * `code` should be a registered completion code so the mapper can build both
 * locales; the legacy `message` string is retained for compatibility and is
 * never returned to a client when a registered code is present.
 */
export class ApiError extends Error {
  readonly fieldPaths?: readonly string[];
  readonly retryAfterSeconds?: number;
  readonly values?: FailureValues;

  constructor(
    message: string,
    public status: number = 400,
    public code?: string,
    options?: Readonly<{
      fieldPaths?: readonly string[];
      retryAfterSeconds?: number;
      values?: FailureValues;
      cause?: unknown;
    }>
  ) {
    super(message);
    this.name = "ApiError";
    this.fieldPaths = options?.fieldPaths;
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.values = options?.values;
    if (options && "cause" in options) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** 401 — no valid authenticated session. */
export class AuthenticationRequiredError extends ApiError {
  constructor() {
    super("Authentication required", 401, "AUTHENTICATION_REQUIRED");
    this.name = "AuthenticationRequiredError";
  }
}

/** 403 — the caller's workspace role cannot perform the request. */
export class WorkspaceRoleForbiddenError extends ApiError {
  constructor() {
    super("Workspace role forbidden", 403, "WORKSPACE_ROLE_FORBIDDEN");
    this.name = "WorkspaceRoleForbiddenError";
  }
}

/** 403 — the addressed record belongs to another workspace. */
export class TenantAccessForbiddenError extends ApiError {
  constructor() {
    super("Tenant access forbidden", 403, "TENANT_ACCESS_FORBIDDEN");
    this.name = "TenantAccessForbiddenError";
  }
}

/** 404 — the record does not exist inside the resolved workspace. */
export class ResourceNotFoundError extends ApiError {
  constructor() {
    super("Resource not found", 404, "RESOURCE_NOT_FOUND");
    this.name = "ResourceNotFoundError";
  }
}

/** 400 — server-side schema validation rejected the payload. */
export class RequestValidationError extends ApiError {
  constructor(fieldPaths: readonly string[]) {
    super(
      "Request validation failed",
      400,
      "REQUEST_VALIDATION_FAILED",
      validationFailureOptions(fieldPaths)
    );
    this.name = "RequestValidationError";
  }
}

/**
 * Pairs the `fieldPaths` array on the body with the `{{fieldPath}}` the message
 * interpolates.
 *
 * Two fields, one fact, and supplying only the first is silent: the array is
 * correct, the status is correct, and the sentence reads "...because of field
 * {{fieldPath}}" with the braces intact. `zodErrorResponse` shipped that way
 * for exactly as long as it took a test to read the rendered message.
 */
export function validationFailureOptions(
  fieldPaths: readonly string[]
): Required<Pick<FailureOptions, "fieldPaths" | "values">> {
  const paths = fieldPaths.length > 0 ? fieldPaths : ["request"];
  return { fieldPaths: paths, values: { fieldPath: paths.join(", ") } };
}

/* -------------------------------------------------------------------------- */
/* Status resolution                                                          */
/* -------------------------------------------------------------------------- */

const EXPLICIT_FAILURE_STATUS: Readonly<Record<string, number>> = {
  AUTHENTICATION_REQUIRED: 401,
  REQUEST_VALIDATION_FAILED: 400,
  EMAIL_VERIFICATION_REQUIRED: 403,
  WORKSPACE_ROLE_FORBIDDEN: 403,
  TENANT_ACCESS_FORBIDDEN: 403,
  ADMIN_REQUIRED: 403,
  APPROVAL_FORBIDDEN: 403,
  RESOURCE_NOT_FOUND: 404,
  EMAIL_ALREADY_REGISTERED: 409,
  ALREADY_A_MEMBER: 409,
  // Criterion 3.8 states 429 for an exhausted seat allowance, not 409.
  SEAT_LIMIT_REACHED: 429,
  RECURRING_PROFILE_EXISTS: 409,
  RECURRING_STATE_CONFLICT: 409,
  TEMPLATE_KEY_IN_USE: 409,
  TEMPLATE_VERSION_CONFLICT: 409,
  TEMPLATE_VERSION_NOT_FOUND: 404,
  MARKETPLACE_ENTRY_RETIRED: 409,
  KNOWLEDGE_DECISION_ALREADY_RECORDED: 409,
  RECONCILE_ALREADY_APPLIED: 409,
  COMMENT_RESOLVED: 409,
  SCHEMA_MIGRATION_PENDING: 503,
  // No provider answered, so the surface has nothing to show. 503 says
  // "retryable once a provider is connected", which is exactly the fix.
  AI_PROVIDER_UNAVAILABLE: 503,
  // The row is intact and nothing was written; the key is what has to change.
  SECRET_DECRYPTION_FAILED: 503,
  RECURRING_UNAVAILABLE: 503,
  PRESENCE_UNAVAILABLE: 503,
  // Chromium is not installed. Nothing about the request was wrong, and the
  // fix is on the server, so the caller is told to retry rather than to edit.
  PDF_UNAVAILABLE: 503,
  // The suffix rule would read `_REQUIRED` as 403; the proposal is the
  // caller's own and the request is understood — the state is wrong. 409.
  EXPORT_APPROVAL_REQUIRED: 409,
  // The session is real; the account is not allowed to proceed yet.
  MUST_CHANGE_PASSWORD: 403,
  // Refused after being fully understood, like PRICING_REFUSED.
  EXPORT_VALIDATION_BLOCKED: 422,
  DOWNLOAD_FAILED: 500,
  RECURRING_PROVIDER_ERROR: 502,
  XLSX_EXPORT_FAILED: 500,
  NOTIFICATION_DELIVERY_FAILED: 500,
  INTERNAL_ERROR: 500,
  // A refused request is well-formed and understood, so it is 422 rather than
  // the 400 the default suffix rules would give it.
  PRICING_REFUSED: 422,
  // Same reason, and 422 is what `POST /api/agents/run` already answers for an
  // empty project (route.ts:113-118) — the two entry points must not disagree.
  NO_DOCUMENTS: 422,
  LIVE_VOICE_START_FAILED: 500,
  AGENT_TOOL_FAILED: 500,
  EXTENSION_PACK_FAILED: 500,
  // Plan limits answer 402: the request is well-formed and the caller is
  // authorized, but the allowance is spent and the fix is a payment.
  QUOTA_DOCUMENTS_EXCEEDED: 402,
  QUOTA_PROPOSALS_EXCEEDED: 402,
  QUOTA_STORAGE_EXCEEDED: 402,
  QUOTA_TOKENS_EXCEEDED: 402,
  SUBSCRIPTION_INACTIVE: 402,
  // The suffix rules below key off `_FORBIDDEN`/`_REQUIRED`, which the bare
  // forms do not match — they fell through to 400, so "sign in to continue"
  // arrived under a status meaning the request was malformed. These are the
  // two most-used codes in the tree; the default has to be right unasked.
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INVALID_CREDENTIALS: 401,
  // The proposal cannot be written in its current status. Well-formed request,
  // authorized caller, wrong state — 409, and every call site already said so.
  STATUS_LOCKED: 409,
  // Restoring a revision refuses on the state of the *stored* revision, not on
  // the request: the request named a real revision and the caller may read it.
  // The suffix rules would read these as 400 (malformed) and 403 (not allowed),
  // and both would send the reader looking in the wrong place.
  DOCUMENT_VERSION_CHECKSUM_MISSING: 409,
  DOCUMENT_VERSION_BYTES_UNAVAILABLE: 409,
  DOCUMENT_VERSION_INTEGRITY_FAILED: 409,
  // `_FORBIDDEN` would say 403, i.e. "you may not delete documents". The caller
  // may; this one document has been promoted to approved evidence and is now
  // immutable. That is resource state, so 409 — and the route already answers
  // 409 today, which the suffix rule would have quietly changed.
  DOCUMENT_EVIDENCE_DELETE_FORBIDDEN: 409,
};

/**
 * HTTP status for a stable code. Cross-cutting codes are mapped explicitly;
 * domain codes fall back to suffix families so a newly registered
 * `*_NOT_FOUND`/`*_FORBIDDEN`/`*_RATE_LIMITED` code cannot silently answer 400.
 */
export function resolveFailureStatus(code: string): number {
  const explicit = EXPLICIT_FAILURE_STATUS[code];
  if (explicit) return explicit;
  // Before `_RATE_LIMITED`, and its own family rather than a blanket
  // `_UNAVAILABLE` rule: the limiter backend is down, the caller is inside
  // their budget, and nothing was written. 429 would tell them to slow down for
  // no reason and 400 tells them they sent garbage, so neither gets retried.
  if (code.endsWith("RATE_LIMIT_UNAVAILABLE")) return 503;
  if (code.endsWith("_RATE_LIMITED")) return 429;
  if (code.endsWith("_UNCONFIGURED")) return 503;
  if (code.startsWith("READINESS_")) return 503;
  if (code.endsWith("_FORBIDDEN")) return 403;
  if (code.endsWith("_REQUIRED") && code !== "ANALYTICS_DATE_RANGE_REQUIRED") return 403;
  if (code.endsWith("_NOT_FOUND")) return 404;
  if (code.endsWith("_CONFLICT")) return 409;
  return 400;
}

/* -------------------------------------------------------------------------- */
/* Failure construction                                                       */
/* -------------------------------------------------------------------------- */

export type MappedFailure = Readonly<{
  status: number;
  body: ApiFailure;
}>;

function bilingual(
  code: CompletionErrorCode,
  values: FailureValues
): BilingualMessage {
  return getCompletionErrorContract(
    code,
    values as never
  ).message;
}

/** Bilingual failure body for a registered completion code. */
export function apiFailure(
  code: CompletionErrorCode,
  options: FailureOptions = {}
): ApiFailure {
  const message = bilingual(code, options.values ?? {});
  const missingTable = options.missingTable ?? undefined;
  const migration = missingTable ? migrationForTable(missingTable) : null;

  return {
    ok: false,
    code,
    message,
    error: message,
    ...(options.fieldPaths && options.fieldPaths.length > 0
      ? { fieldPaths: options.fieldPaths }
      : {}),
    ...(typeof options.retryAfterSeconds === "number"
      ? { retryAfterSeconds: options.retryAfterSeconds }
      : {}),
    ...(missingTable ? { missingTable } : {}),
    ...(migration
      ? { migration: migration.id, capabilities: migration.capabilities }
      : {}),
  };
}

/** Bilingual failure body plus the status implied by the code. */
export function mappedApiFailure(
  code: CompletionErrorCode,
  options: FailureOptions = {}
): MappedFailure {
  return {
    status: options.status ?? resolveFailureStatus(code),
    body: apiFailure(code, options),
  };
}

/** Generic bilingual 500 used for every unrecognized failure. */
export function internalFailure(): MappedFailure {
  return { status: 500, body: apiFailure("INTERNAL_ERROR") };
}

/* -------------------------------------------------------------------------- */
/* Validation helpers                                                         */
/* -------------------------------------------------------------------------- */

/** Dot/bracket field paths of every Zod issue, deduplicated and ordered. */
export function zodFieldPaths(error: ZodError): readonly string[] {
  const paths = new Set<string>();
  for (const issue of error.issues) {
    paths.add(
      issue.path.length === 0
        ? "request"
        : issue.path
            .map((segment) =>
              typeof segment === "number" ? `[${segment}]` : String(segment)
            )
            .join(".")
            .replace(/\.\[/g, "[")
    );
  }
  return [...paths];
}

/** Validation failure carrying every offending field path. */
export function validationFailure(
  fieldPaths: readonly string[]
): MappedFailure {
  const paths = fieldPaths.length > 0 ? fieldPaths : ["request"];
  return {
    status: 400,
    body: apiFailure("REQUEST_VALIDATION_FAILED", {
      fieldPaths: paths,
      values: { fieldPath: paths.join(", ") },
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Schema-pending mapping                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Converts any missing-relation failure into the typed schema-pending error so
 * services and routes raise one recognizable condition.
 */
export function asSchemaMigrationPendingError(
  error: unknown
): SchemaMigrationPendingError | null {
  if (isSchemaMigrationPendingError(error)) return error;
  if (!isPrismaMissingTable(error)) return null;
  return new SchemaMigrationPendingError(extractMissingTableName(error), {
    cause: error,
  });
}

/** HTTP 503 body naming the missing relation (requirement 16.2). */
export function schemaPendingFailure(
  missingTable: string | null
): MappedFailure {
  return {
    status: 503,
    body: apiFailure("SCHEMA_MIGRATION_PENDING", {
      missingTable,
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Redaction                                                                  */
/* -------------------------------------------------------------------------- */

export const REDACTED = "[redacted]";

const SENSITIVE_PATTERNS: readonly RegExp[] = [
  // Connection strings and any credential-bearing URL.
  /[a-z][a-z0-9+.-]*:\/\/[^\s"']+/gi,
  // key=value secrets.
  /\b(?:password|passwd|pwd|secret|token|api[-_]?key|authorization|signature|cookie)\b\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;)]+)/gi,
  // Bearer/basic credentials.
  /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  // Provider secret key shapes.
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  // Long opaque blobs (tokens, digests, base64 payloads).
  /\b[A-Za-z0-9+/=_-]{40,}\b/g,
  // Decimal amounts, so a commercial value never reaches a log sink.
  /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+\.\d{2,}\b/g,
];

const SQL_STATEMENT_PATTERN =
  /\b(?:select|insert\s+into|update|delete\s+from|create\s+(?:table|index|schema)|alter\s+table|drop\s+(?:table|index)|truncate)\b[\s\S]*/i;

const MAX_LOG_DETAIL_LENGTH = 200;

/**
 * Removes SQL text, credentials, tokens, opaque blobs, and decimal amounts from
 * a diagnostic string before it reaches a log sink. Client responses never carry
 * this text; redaction is defense in depth for operators.
 */
export function redactSensitiveText(input: string): string {
  let output = input.replace(SQL_STATEMENT_PATTERN, REDACTED);
  for (const pattern of SENSITIVE_PATTERNS) {
    output = output.replace(pattern, REDACTED);
  }
  output = output.trim();
  return output.length > MAX_LOG_DETAIL_LENGTH
    ? `${output.slice(0, MAX_LOG_DETAIL_LENGTH)}…`
    : output;
}

export type FailureLogRecord = Readonly<{
  label: string;
  status: number;
  code: string;
  errorName: string;
  detail: string;
}>;

/** Redacted, bounded log record for a mapped failure. */
export function failureLogRecord(
  label: string,
  error: unknown,
  mapped: MappedFailure
): FailureLogRecord {
  const errorName =
    error instanceof Error ? error.name : typeof error === "object" ? "object" : typeof error;
  const detail =
    error instanceof Error ? redactSensitiveText(error.message) : REDACTED;
  return {
    label,
    status: mapped.status,
    code: mapped.body.code,
    errorName,
    detail,
  };
}

/* -------------------------------------------------------------------------- */
/* Central error mapping                                                      */
/* -------------------------------------------------------------------------- */

type LegacyErrorShape = {
  readonly name?: string;
  readonly code?: unknown;
  readonly status?: unknown;
  readonly message?: unknown;
};

function legacyShape(error: unknown): LegacyErrorShape {
  return (error ?? {}) as LegacyErrorShape;
}

/**
 * Maps any thrown value to one bilingual failure.
 *
 * Recognized in order: schema-pending (typed or driver-reported), Zod
 * validation, `ApiError` with a registered code, the email-verification guard,
 * then a generic bilingual 500. No branch echoes the thrown message to the
 * client.
 */
export function mapErrorToApiFailure(error: unknown): MappedFailure {
  const pending = asSchemaMigrationPendingError(error);
  if (pending) return schemaPendingFailure(pending.missingTable);

  if (error instanceof ZodError) {
    return validationFailure(zodFieldPaths(error));
  }

  if (error instanceof ApiError) {
    const code = typeof error.code === "string" ? error.code : null;
    if (code && isCompletionErrorCode(code)) {
      return mappedApiFailure(code, {
        status: error.status,
        fieldPaths: error.fieldPaths,
        retryAfterSeconds: error.retryAfterSeconds,
        values: error.values,
      });
    }
    return { status: error.status, body: legacyFailureBody(code) };
  }

  const shape = legacyShape(error);
  if (shape.name === "EmailVerificationRequiredError") {
    return mappedApiFailure("EMAIL_VERIFICATION_REQUIRED");
  }
  // Matched by name rather than by import: this module is the leaf every route
  // funnels into, and importing the AI layer here would pull the LLM stack into
  // routes that never touch it.
  if (shape.name === "ProviderUnavailableError") {
    return mappedApiFailure("AI_PROVIDER_UNAVAILABLE");
  }
  if (shape.name === "SecretDecryptionError") {
    return mappedApiFailure("SECRET_DECRYPTION_FAILED");
  }

  return internalFailure();
}

/**
 * Compatibility body for a code that predates the completion contract.
 *
 * The bilingual pair comes from the registry entry for that code when one
 * exists, and otherwise from the generic internal entry, so no locale ever
 * receives an empty string and no thrown detail reaches the client.
 */
export function legacyFailureBody(code: string | null): ApiFailure {
  const registered = code ? t[code] : undefined;
  const message: BilingualMessage =
    registered && registered.ar.trim() && registered.en.trim()
      ? { ar: registered.ar, en: registered.en }
      : apiFailure("INTERNAL_ERROR").message;

  return {
    ok: false,
    code: code ?? "INTERNAL_ERROR",
    message,
    error: message,
  };
}
