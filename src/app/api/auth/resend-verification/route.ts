import { NextRequest, NextResponse } from "next/server";
import { jsonApiFailure, jsonOk, withPublicRoute } from "@/lib/api-controller";
import { createPrismaAccountService } from "@/lib/account-service-prisma";
import type { AccountService } from "@/lib/account-service";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Public account route — reissuing a verification email.
 *
 * Without it a failed send or a lapsed 24-hour token locks the account out
 * permanently: every gated route refuses an unverified session and registration
 * was the only issuance point. The route stays a thin boundary — normalization,
 * the dual rate limit, token replacement and delivery live in the domain
 * service, so an accepted and an unknown address are indistinguishable here.
 */
export type ResendVerificationRouteDependencies = Readonly<{
  /** The Account_Service; the production service is used when omitted. */
  service: AccountService;
}>;

export async function handleResendVerification(
  req: NextRequest,
  dependencies?: Partial<ResendVerificationRouteDependencies>
): Promise<NextResponse> {
  const service = dependencies?.service ?? createPrismaAccountService();
  return withPublicRoute("auth/resend-verification", async () => {
    const body = await readJsonBodyOrNull(req);
    const result = await service.resendVerificationEmail({
      email: readEmailField(body),
      sourceAddress: getClientIp(req),
    });

    if (!result.ok) {
      return jsonApiFailure(result.code, {
        ...(result.code === "VERIFICATION_RESEND_RATE_LIMITED"
          ? { retryAfterSeconds: result.retryAfterSeconds }
          : {}),
      });
    }

    return jsonOk(
      {
        ok: true as const,
        code: result.code,
        message: { ar: tr(result.code, "ar"), en: tr(result.code, "en") },
      },
      { status: result.status }
    );
  });
}

export async function POST(req: NextRequest) {
  return handleResendVerification(req);
}

/** Best-effort source address for the rolling per-address rate limit. */
function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() ?? "unknown";
}

/** Unreadable bodies stay `null`; the domain service rejects them. */
async function readJsonBodyOrNull(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/** Reads `email` without asserting a shape the domain service re-validates. */
function readEmailField(body: unknown): unknown {
  if (typeof body !== "object" || body === null) return null;
  return (body as { email?: unknown }).email;
}
