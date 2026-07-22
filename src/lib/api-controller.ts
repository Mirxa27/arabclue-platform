/**
 * Shared API route controllers — replaces per-route session/tenant/error boilerplate.
 *
 * Prefer `withTenant("session" | "writer")` for tenant APIs.
 * Prefer `withAdmin()` for platform admin APIs.
 * Throw `ApiError` from handlers for expected failures (4xx).
 */

import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import {
  requireAdmin,
  requireSession,
  requireWriter,
} from "@/lib/auth";
import {
  getTenantContext,
  type TenantContext,
} from "@/lib/workspace-context";
import { QuotaExceededError } from "@/lib/quotas";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number = 400,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function jsonOk<T>(data: T, init?: { status?: number }) {
  return NextResponse.json(data, { status: init?.status ?? 200 });
}

export function jsonError(
  message: string,
  status = 500,
  code?: string
): NextResponse {
  return NextResponse.json(
    code ? { error: message, code } : { error: message },
    { status }
  );
}

export type TenantHandlerContext = {
  session: Session;
  workspace: TenantContext["workspace"];
  brandProfile: TenantContext["brandProfile"];
  userId: string;
  membershipRole: string;
};

type AuthMode = "session" | "writer";

function toErrorResponse(err: unknown, label: string): NextResponse {
  if (err instanceof ApiError) {
    return jsonError(err.message, err.status, err.code);
  }
  if (err instanceof QuotaExceededError) {
    return jsonError(err.message, 402, err.code);
  }
  console.error(`[${label}]`, err);
  return jsonError(err instanceof Error ? err.message : "unknown", 500);
}

/**
 * Authenticate, resolve tenant workspace, run handler, map errors.
 * Use for all workspace-scoped `/api/*` routes (not `/api/admin/*`).
 */
export async function withTenant(
  mode: AuthMode,
  handler: (ctx: TenantHandlerContext) => Promise<NextResponse>,
  label = "api"
): Promise<NextResponse> {
  try {
    const session =
      mode === "writer" ? await requireWriter() : await requireSession();

    if (!session) {
      return jsonError(
        mode === "writer" ? "Forbidden" : "Unauthorized",
        mode === "writer" ? 403 : 401
      );
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
 * this ensures a valid session exists for handlers that still need user id.
 */
export async function withAdmin(
  handler: (session: Session) => Promise<NextResponse>,
  label = "admin"
): Promise<NextResponse> {
  try {
    const session = await requireAdmin();
    if (!session) {
      return jsonError("Forbidden", 403);
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
