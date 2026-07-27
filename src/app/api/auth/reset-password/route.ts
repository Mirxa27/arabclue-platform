import { NextRequest, NextResponse } from "next/server";
import { rateLimitAsync, describeRateLimitDenial } from "@/lib/rate-limit";
import { RECOVERY_TOKEN_SUBMISSION_RATE_LIMIT } from "@/lib/recovery-service";
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
        { code: "RECOVERY_TOKEN_INVALID", message: t.RECOVERY_TOKEN_INVALID?.en ?? "Invalid token" },
        { status: 400 }
      );
    }

    const sourceAddress = getClientIp(req);

    // Rate limit by source address (criterion 2.6: 20 per IP per 60min)
    const rl = await rateLimitAsync({
      key: `recovery:reset:${sourceAddress}`,
      limit: RECOVERY_TOKEN_SUBMISSION_RATE_LIMIT.limit,
      windowMs: RECOVERY_TOKEN_SUBMISSION_RATE_LIMIT.windowMs,
    });

    if (!rl.ok) {
      const denial = describeRateLimitDenial(rl);
      return NextResponse.json(
        { code: "RATE_LIMITED", error: denial.error },
        { status: denial.status, headers: { "Retry-After": String(denial.retryAfterSeconds) } }
      );
    }

    // Delegate to recovery service
    const result = await recoveryService.resetPassword({
      payload: body,
      sourceAddress,
    });

    if (!result.ok) {
      const message = t[result.code]?.en ?? result.code;
      return NextResponse.json(
        {
          code: result.code,
          message,
          ...(result.code === "RECOVERY_PASSWORD_REJECTED" && "fieldPaths" in result
            ? { fieldPaths: result.fieldPaths }
            : {}),
        },
        { status: result.status }
      );
    }

    return NextResponse.json(
      { code: result.code, message: t[result.code]?.en ?? result.code },
      { status: result.status }
    );
  } catch (err) {
    console.error("[auth/reset-password]", err);
    return NextResponse.json(
      { code: "RECOVERY_TOKEN_INVALID", message: "Invalid token" },
      { status: 400 }
    );
  }
}
