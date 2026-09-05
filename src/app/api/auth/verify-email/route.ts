import { NextRequest, NextResponse } from "next/server";
import { jsonApiFailure, jsonOk, withPublicRoute } from "@/lib/api-controller";
import { createPrismaAccountService } from "@/lib/account-service-prisma";
import type { AccountService } from "@/lib/account-service";
import {
  noopActivationAnalytics,
  productionActivationAnalytics,
  type ActivationAnalyticsRecorder,
} from "@/lib/activation-analytics";
import { tr } from "@/lib/i18n";
import { extractClientIp } from "@/lib/login-rate-limit";

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
  /**
   * Post-commit funnel analytics. The production recorder is used only when no
   * dependencies are injected at all; a test that injects a service records
   * nothing unless it also injects a recorder.
   */
  analytics: ActivationAnalyticsRecorder;
}>;

export async function handleVerifyEmail(
  req: NextRequest,
  dependencies?: Partial<VerifyEmailRouteDependencies>
): Promise<NextResponse> {
  const service = dependencies?.service ?? createPrismaAccountService();
  const analytics =
    dependencies?.analytics ??
    (dependencies ? noopActivationAnalytics : productionActivationAnalytics);
  return withPublicRoute("auth/verify-email", async () => {
    const payload = await readJsonBodyOrNull(req);
    const token =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>).token
        : undefined;

    const result = await service.verifyEmail({
      token,
      sourceAddress: extractClientIp(req.headers),
    });

    if (!result.ok) {
      return jsonApiFailure(result.code, {
        ...(result.code === "VERIFICATION_RATE_LIMITED"
          ? { retryAfterSeconds: result.retryAfterSeconds }
          : {}),
      });
    }

    // The token was consumed and the user marked verified; the funnel's second
    // event. One bounded attempt that never throws and never changes this
    // response (criterion 4.4).
    await analytics.emailVerified({
      userId: result.userId,
      verifiedAt: result.verifiedAt,
    });

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
