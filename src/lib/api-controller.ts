/**
 * Shared API route controllers — one request boundary for session, tenant,
 * validation, and error mapping.
 *
 * Prefer `withTenant("session" | "writer")` for tenant APIs.
 * Prefer `withAdmin()` for platform admin APIs.
 * Prefer `withPublicRoute()` for public account APIs (no tenant resolution).
 * Throw `ApiError` (or a typed subclass) from handlers for expected failures.
 *
 * Every failed response is produced by the central bilingual mapper in
 * `api-failure.ts`: stable code, Arabic message, English message. Route handlers
 * must not build their own error bodies, must not answer a missing relation with
 * an empty or synthesized success, and must not return a not-implemented status
 * (requirements 16.2, 16.7, 18.4, 19.9, 19.10).
 */

import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import type { ZodType } from "zod";
import { canWriteRole, requireSession } from "@/lib/auth";
import {
  getTenantContext,
  type TenantContext,
} from "@/lib/workspace-context";
import { QuotaExceededError, quotaFailureCode } from "@/lib/quotas";
import {
  ApiError,
  AuthenticationRequiredError,
  RequestValidationError,
  ResourceNotFoundError,
  TenantAccessForbiddenError,
  WorkspaceRoleForbiddenError,
  failureLogRecord,
  legacyFailureBody,
  mapErrorToApiFailure,
  mappedApiFailure,
  zodFieldPaths,
  type FailureOptions,
  type MappedFailure,
} from "@/lib/api-failure";
import type { CompletionErrorCode } from "@/lib/i18n";

export {
  ApiError,
  AuthenticationRequiredError,
  RequestValidationError,
  ResourceNotFoundError,
  SchemaMigrationPendingError,
  TenantAccessForbiddenError,
  WorkspaceRoleForbiddenError,
  apiFailure,
  mapErrorToApiFailure,
  resolveFailureStatus,
} from "@/lib/api-failure";
export type { ApiFailure } from "@/lib/api-failure";

export function jsonOk<T>(data: T, init?: { status?: number }) {
  return NextResponse.json(data, { status: init?.status ?? 200 });
}

/** Response for an already-mapped failure, including `Retry-After` when set. */
export function jsonFailure(mapped: MappedFailure): NextResponse {
  const retryAfter = mapped.body.retryAfterSeconds;
  return NextResponse.json(mapped.body, {
    status: mapped.status,
    ...(typeof retryAfter === "number"
      ? { headers: { "Retry-After": String(retryAfter) } }
      : {}),
  });
}

/** Bilingual failure response for a registered completion code. */
export function jsonApiFailure(
  code: CompletionErrorCode,
  options: FailureOptions = {}
): NextResponse {
  return jsonFailure(mappedApiFailure(code, options));
}

/**
 * Bilingual API error response.
 *
 * Retained for existing call sites: the `message` argument is no longer echoed
 * to the client. The bilingual pair comes from the completion contract for
 * `code`, from the registry entry for `code`, or from the generic internal entry.
 */
export function jsonError(
  message: string,
  status = 500,
  code?: string
): NextResponse {
  const mapped = mapErrorToApiFailure(new ApiError(message, status, code));
  return jsonFailure({ status, body: mapped.body });
}

export type TenantHandlerContext = {
  session: Session;
  workspace: TenantContext["workspace"];
  brandProfile: TenantContext["brandProfile"];
  userId: string;
  membershipRole: string;
};

type AuthMode = "session" | "writer";

/** Maps any thrown value to the central bilingual failure and logs it redacted. */
export function toErrorResponse(err: unknown, label: string): NextResponse {
  if (err instanceof QuotaExceededError) {
    // `err.code` is the internal enum ("DOCUMENTS"), which is not a registry
    // key — passing it raw degraded every 402 to the generic internal-error
    // sentence. `quotaFailureCode` translates it to the contract code, so the
    // reader learns which limit they hit and that an upgrade is the fix.
    return jsonFailure({
      status: 402,
      body: legacyFailureBody(quotaFailureCode(err)),
    });
  }

  const mapped = mapErrorToApiFailure(err);
  if (mapped.status >= 500 || mapped.body.code === "SCHEMA_MIGRATION_PENDING") {
    console.error(`[${label}]`, failureLogRecord(label, err, mapped));
  }
  return jsonFailure(mapped);
}

/**
 * Authenticate, resolve tenant workspace and role, run handler, map errors.
 * Use for all workspace-scoped `/api/*` routes (not `/api/admin/*`).
 */
export async function withTenant(
  mode: AuthMode,
  handler: (ctx: TenantHandlerContext) => Promise<NextResponse>,
  label = "api"
): Promise<NextResponse> {
  try {
    const session = await requireSession();
    if (!session) throw new AuthenticationRequiredError();

    if (mode === "writer" && !canWriteRole(session.user.role)) {
      throw new WorkspaceRoleForbiddenError();
    }

    if (!session.user.emailVerified) {
      const dbUser = await (await import("./db")).db.user.findUnique({
        where: { id: session.user.id },
        select: { emailVerified: true },
      });
      if (dbUser && !dbUser.emailVerified) {
        throw new ApiError(
          "Email verification required",
          403,
          "EMAIL_VERIFICATION_REQUIRED"
        );
      }
    }

    const tenant = await getTenantContext(session.user.id);
    return await handler({
      session,
      workspace: tenant.workspace,
      brandProfile: tenant.brandProfile,
      userId: tenant.userId,
      membershipRole: tenant.membershipRole,
    });
  } catch (err) {
    return toErrorResponse(err, label);
  }
}

/**
 * Platform admin routes (`/api/admin/*`). Middleware already gates ADMIN roles;
 * this resolves the session and separates an absent session (401) from an
 * insufficient platform role (403 `ADMIN_REQUIRED`).
 */
export async function withAdmin(
  handler: (session: Session) => Promise<NextResponse>,
  label = "admin"
): Promise<NextResponse> {
  try {
    const session = await requireSession();
    if (!session) throw new AuthenticationRequiredError();
    const role = session.user.role;
    if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
      throw new ApiError("Administrator role required", 403, "ADMIN_REQUIRED");
    }
    return await handler(session);
  } catch (err) {
    return toErrorResponse(err, label);
  }
}

/** Wrap any async route body with consistent error mapping (no auth). */
export async function handleRoute(
  label: string,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (err) {
    return toErrorResponse(err, label);
  }
}

/**
 * Public account routes (registration, verification, recovery, invitation
 * acceptance). No tenant resolution, same validation and error mapper.
 */
export async function withPublicRoute(
  label: string,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  return handleRoute(label, handler);
}

/* -------------------------------------------------------------------------- */
/* Server-side validation                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Parses a JSON body against a declared schema. An unreadable body or a schema
 * rejection raises `REQUEST_VALIDATION_FAILED` naming every offending field path
 * and persists nothing (requirements 19.4, 19.9).
 */
export async function parseJsonBody<Output>(
  request: Request,
  schema: ZodType<Output>
): Promise<Output> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new RequestValidationError(["request"]);
  }
  return parseWithSchema(raw, schema);
}

/** Parses search parameters against a declared schema. */
export function parseSearchParams<Output>(
  input: URL | URLSearchParams | Request,
  schema: ZodType<Output>
): Output {
  const params =
    input instanceof URLSearchParams
      ? input
      : input instanceof URL
        ? input.searchParams
        : new URL(input.url).searchParams;
  const record: Record<string, string> = {};
  for (const [key, value] of params.entries()) record[key] = value;
  return parseWithSchema(record, schema);
}

/** Parses an already-read value against a declared schema. */
export function parseWithSchema<Output>(
  value: unknown,
  schema: ZodType<Output>
): Output {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new RequestValidationError(zodFieldPaths(parsed.error));
  }
  return parsed.data;
}

/* -------------------------------------------------------------------------- */
/* Tenant authorization                                                       */
/* -------------------------------------------------------------------------- */

/** Workspace membership roles allowed to manage workspace-level settings. */
export const WORKSPACE_MANAGER_ROLES = ["OWNER", "ADMIN"] as const;

/**
 * Asserts the caller's workspace membership role, before any read or write of a
 * tenant record (requirement 19.5).
 */
export function requireWorkspaceRole(
  ctx: Pick<TenantHandlerContext, "membershipRole">,
  allowed: readonly string[]
): void {
  if (!allowed.includes(ctx.membershipRole)) {
    throw new WorkspaceRoleForbiddenError();
  }
}

/**
 * Asserts that a record resolved by identifier belongs to the caller's
 * workspace.
 *
 * An absent record is a not-found result and a foreign record is a forbidden
 * result; neither path mutates anything (requirement 19.5).
 */
export function requireTenantRecord<
  Record extends { workspaceId?: string | null },
>(record: Record | null | undefined, workspaceId: string): Record {
  if (!record) throw new ResourceNotFoundError();
  if (record.workspaceId !== workspaceId) throw new TenantAccessForbiddenError();
  return record;
}

/** Asserts a resolved owner workspace identifier matches the tenant context. */
export function requireTenantOwnership(
  recordWorkspaceId: string | null | undefined,
  workspaceId: string
): void {
  if (!recordWorkspaceId) throw new ResourceNotFoundError();
  if (recordWorkspaceId !== workspaceId) throw new TenantAccessForbiddenError();
}

export type { MappedFailure };
