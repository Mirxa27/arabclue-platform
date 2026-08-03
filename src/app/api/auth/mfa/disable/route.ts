import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { verifyMfaToken } from "@/lib/mfa";
import { audit } from "@/lib/audit";
import {
  describeRateLimitDenial,
  rateLimitAsync as rateLimit,
} from "@/lib/rate-limit";
import { parseJsonBody, mfaDisableSchema } from "@/lib/validation";
import { jsonApiFailure } from "@/lib/api-controller";

export const dynamic = "force-dynamic";

/** POST { currentToken } — disable MFA after verifying current TOTP */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return jsonApiFailure("AUTHENTICATION_REQUIRED", { status: 401 });
    }

    const rl = await rateLimit({
      key: `mfa:disable:${session.user.id}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (!rl.ok) {
      const denial = describeRateLimitDenial(rl);
      return NextResponse.json(
        { error: denial.error, code: "MFA_DISABLE_RATE_LIMITED" },
        {
          status: denial.status,
          headers: { "Retry-After": String(denial.retryAfterSeconds) },
        }
      );
    }

    const parsed = await parseJsonBody(req, mfaDisableSchema);
    if (!parsed.ok) return parsed.response;

    const user = await db.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return jsonApiFailure("RESOURCE_NOT_FOUND", { status: 404 });
    }
    if (!user.mfaEnabled || !user.mfaSecret) {
      return jsonApiFailure("MFA_NOT_SET_UP", { status: 400 });
    }
    if (!verifyMfaToken(user.mfaSecret, parsed.data.currentToken)) {
      return jsonApiFailure("MFA_TOKEN_INVALID", { status: 400 });
    }

    await db.user.update({
      where: { id: user.id },
      data: { mfaEnabled: false, mfaSecret: null },
    });

    await audit({
      userId: user.id,
      action: "MFA_DISABLE",
      resource: "User",
      resourceId: user.id,
      severity: "WARN",
    });

    return NextResponse.json({ ok: true, mfaEnabled: false });
  } catch (err) {
    console.error("[mfa/disable]", err);
    return jsonApiFailure("INTERNAL_ERROR", { status: 500 });
  }
}
