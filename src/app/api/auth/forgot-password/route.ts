import { NextRequest, NextResponse } from "next/server";
import { rateLimitAsync, describeRateLimitDenial } from "@/lib/rate-limit";
import { normalizeRecoveryEmail, RECOVERY_REQUEST_RATE_LIMIT } from "@/lib/recovery-service";
import { createRecoveryService } from "@/lib/recovery-service";
import {
  prismaRecoveryRepository,
  resendRecoveryEmailProvider,
  platformRecoveryAuditSink,
} from "@/lib/recovery-service-prisma";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

function getClientIp(req: NextRequest): string {
  const f = req.headers.get("x-forwarded-for");
  if (f) return f.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() ?? "unknown";
}

const recoveryService = createRecoveryService({
  repository: prismaRecoveryRepository,
  email: resendRecoveryEmailProvider,
  audit: platformRecoveryAuditSink,
});

export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { code: "RECOVERY_REQUEST_ACCEPTED", message: t.RECOVERY_REQUEST_ACCEPTED.en },
        { status: 202 }
      );
    }

    // Extract email for rate limiting (if parseable)
    const emailForRateLimit =
      typeof body === "object" &&
      body !== null &&
      !Array.isArray(body) &&
      typeof (body as Record<string, unknown>).email === "string"
        ? normalizeRecoveryEmail((body as Record<string, unknown>).email as string)
        : "unknown";

    // Rate limit by email (criterion 2.6)
    const rl = await rateLimitAsync({
      key: `recovery:req:${emailForRateLimit}`,
      limit: RECOVERY_REQUEST_RATE_LIMIT.limit,
      windowMs: RECOVERY_REQUEST_RATE_LIMIT.windowMs,
    });

    if (!rl.ok) {
      const denial = describeRateLimitDenial(rl);
      return NextResponse.json(
        { code: "RATE_LIMITED", error: denial.error },
        { status: denial.status, headers: { "Retry-After": String(denial.retryAfterSeconds) } }
      );
    }

    const sourceAddress = getClientIp(req);

    // Delegate to recovery service
    const result = await recoveryService.requestRecovery({
      payload: body,
      sourceAddress,
    });

    return NextResponse.json(
      { code: result.code, message: t[result.code]?.en ?? result.code },
      { status: result.status }
    );
  } catch (err) {
    console.error("[auth/forgot-password]", err);
    return NextResponse.json(
      { code: "RECOVERY_REQUEST_ACCEPTED", message: "Recovery request accepted" },
      { status: 202 }
    );
  }
}
