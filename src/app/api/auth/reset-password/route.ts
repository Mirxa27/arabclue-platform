import { NextRequest, NextResponse } from "next/server";
import {
  jsonApiFailure,
  jsonOk,
  withPublicRoute,
} from "@/lib/api-controller";
import { rateLimitAsync } from "@/lib/rate-limit";
import {
  RECOVERY_TOKEN_SUBMISSION_RATE_LIMIT,
  type RecoveryService,
} from "@/lib/recovery-service";
import { createPrismaRecoveryService } from "@/lib/recovery-service-prisma";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Public password-reset submission route (requirements 2.3–2.6, 2.9, 2.10).
 *
 * Invalid tokens answer RECOVERY_TOKEN_INVALID without consuming state. Password
 * rejections name field paths. Success returns PASSWORD_RESET_COMPLETE after the
 * domain service has atomically replaced the hash, consumed the token, and
 * revoked every session for the account.
 */
export type ResetPasswordRouteDependencies = Readonly<{
  service: RecoveryService;
}>;

export async function handleResetPassword(
  req: NextRequest,
  dependencies?: Partial<ResetPasswordRouteDependencies>
): Promise<NextResponse> {
  const service = dependencies?.service ?? createPrismaRecoveryService();
  return withPublicRoute("auth/reset-password", async () => {
    const payload = await readJsonBodyOrNull(req);
    const sourceAddress = getClientIp(req);

    const rl = await rateLimitAsync({
      key: `recovery:reset:${sourceAddress}`,
      limit: RECOVERY_TOKEN_SUBMISSION_RATE_LIMIT.limit,
      windowMs: RECOVERY_TOKEN_SUBMISSION_RATE_LIMIT.windowMs,
    });
    if (!rl.ok) {
      return jsonApiFailure("RECOVERY_RATE_LIMITED", {
        retryAfterSeconds: Math.max(1, Math.ceil(rl.retryAfterMs / 1000)),
      });
    }

    const result = await service.resetPassword({
      payload,
      sourceAddress,
    });

    if (!result.ok) {
      return jsonApiFailure(result.code, {
        ...(result.code === "RECOVERY_PASSWORD_REJECTED"
          ? {
              fieldPaths: result.fieldPaths,
              values: { fieldPaths: result.fieldPaths.join(", ") },
            }
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
  return handleResetPassword(req);
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() ?? "unknown";
}

async function readJsonBodyOrNull(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
