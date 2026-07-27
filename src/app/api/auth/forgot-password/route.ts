import { NextRequest, NextResponse } from "next/server";
import {
  jsonApiFailure,
  jsonOk,
  withPublicRoute,
} from "@/lib/api-controller";
import { rateLimitAsync } from "@/lib/rate-limit";
import {
  RECOVERY_REQUEST_RATE_LIMIT,
  createRecoveryService,
  normalizeRecoveryEmail,
  type RecoveryService,
} from "@/lib/recovery-service";
import { createPrismaRecoveryService } from "@/lib/recovery-service-prisma";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Public recovery request route (requirements 2.1, 2.5, 2.6, 2.7, 2.10).
 *
 * Thin boundary: rate-limit, hand the raw payload to the Recovery_Service, map
 * the typed domain result to the shared bilingual contract. Invalid or unknown
 * addresses intentionally share the 202 anti-enumeration body.
 */
export type ForgotPasswordRouteDependencies = Readonly<{
  service: RecoveryService;
}>;

export async function handleForgotPassword(
  req: NextRequest,
  dependencies?: Partial<ForgotPasswordRouteDependencies>
): Promise<NextResponse> {
  const service = dependencies?.service ?? createPrismaRecoveryService();
  return withPublicRoute("auth/forgot-password", async () => {
    const payload = await readJsonBodyOrNull(req);
    const emailForRateLimit =
      typeof payload === "object" &&
      payload !== null &&
      !Array.isArray(payload) &&
      typeof (payload as Record<string, unknown>).email === "string"
        ? normalizeRecoveryEmail(
            (payload as Record<string, unknown>).email as string
          )
        : "unknown";

    const rl = await rateLimitAsync({
      key: `recovery:req:${emailForRateLimit}`,
      limit: RECOVERY_REQUEST_RATE_LIMIT.limit,
      windowMs: RECOVERY_REQUEST_RATE_LIMIT.windowMs,
    });
    if (!rl.ok) {
      return jsonApiFailure("RECOVERY_RATE_LIMITED", {
        retryAfterSeconds: Math.max(1, Math.ceil(rl.retryAfterMs / 1000)),
      });
    }

    const result = await service.requestRecovery({
      payload,
      sourceAddress: getClientIp(req),
    });

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
  return handleForgotPassword(req);
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
