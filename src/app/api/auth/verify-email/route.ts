import { NextRequest, NextResponse } from "next/server";
import { jsonApiFailure, jsonOk, withPublicRoute } from "@/lib/api-controller";
import { createPrismaAccountService } from "@/lib/account-service-prisma";
import type { AccountService } from "@/lib/account-service";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Public account route — email verification (requirements 1.6, 1.7, 1.8, 1.12).
 *
 * The route reads the source address and the submitted token, then delegates to
 * the Account_Service. A valid, unexpired, unconsumed token marks the user
 * verified and consumes the token in one serializable transaction, returning
 * HTTP 200 `EMAIL_VERIFIED`; every expired, unknown, or already-consumed token
 * returns HTTP 400 `VERIFICATION_TOKEN_INVALID` and mutates nothing. The token
 * is never logged or echoed back in the response.
 */
export type VerifyEmailRouteDependencies = Readonly<{
  /** The Account_Service; the production service is used when omitted. */
  service: AccountService;
}>;

export async function handleVerifyEmail(
  req: NextRequest,
  dependencies?: Partial<VerifyEmailRouteDependencies>
): Promise<NextResponse> {
  const service = dependencies?.service ?? createPrismaAccountService();
  return withPublicRoute("auth/verify-email", async () => {
    const payload = await readJsonBodyOrNull(req);
    const token =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>).token
        : undefined;

    const result = await service.verifyEmail({
      token,
      sourceAddress: getClientIp(req),
    });

    if (!result.ok) {
      return jsonApiFailure(result.code, {
        ...(result.code === "VERIFICATION_RATE_LIMITED"
          ? { retryAfterSeconds: result.retryAfterSeconds }
          : {}),
      });
    }

    return jsonOk(
      {
        ok: true as const,
        code: result.code,
        message: { ar: tr(result.code, "ar"), en: tr(result.code, "en") },
        userId: result.userId,
        verifiedAt: result.verifiedAt,
      },
      { status: result.status }
    );
  });
}

export async function POST(req: NextRequest) {
  return handleVerifyEmail(req);
}

/** Best-effort source address for the rolling per-address rate limit (1.8). */
function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() ?? "unknown";
}

/**
 * Reads the JSON body, returning null for an unreadable body. A missing or
 * malformed token is handled by the domain service, which answers
 * `VERIFICATION_TOKEN_INVALID` without a read-through (criterion 1.7).
 */
async function readJsonBodyOrNull(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
