import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  describeRateLimitDenial,
  rateLimitAsync as rateLimit,
} from "@/lib/rate-limit";
import { parseJsonBody, mfaDisableSchema } from "@/lib/validation";
import { jsonApiFailure } from "@/lib/api-controller";
import { verifyPassword } from "@/lib/password";
import { consumeMfaChallenge } from "@/lib/mfa-challenge";

export const dynamic = "force-dynamic";

/** POST { password, currentToken } — disable MFA after password + TOTP/recovery */
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
    if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return jsonApiFailure("PASSWORD_INCORRECT", { status: 403 });
    }

    const challenge = await consumeMfaChallenge({
      userId: user.id,
      storedSecret: user.mfaSecret,
      lastUsedStep: user.mfaLastUsedStep,
      token: parsed.data.currentToken,
    });
    if (!challenge.ok) {
      return jsonApiFailure(
        challenge.reason === "replay" ? "MFA_REPLAYED_TOKEN" : "MFA_TOKEN_INVALID",
        { status: 400 }
      );
    }

    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: {
          mfaEnabled: false,
          mfaSecret: null,
          pendingMfaSecret: null,
          mfaLastUsedStep: null,
        },
      }),
      db.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
    ]);

    await audit({
      userId: user.id,
      action: "MFA_DISABLE",
      resource: "User",
      resourceId: user.id,
      severity: "WARN",
      details: { method: challenge.method },
    });

    return NextResponse.json({ ok: true, mfaEnabled: false });
  } catch (err) {
    console.error("[mfa/disable]", err);
    return jsonApiFailure("INTERNAL_ERROR", { status: 500 });
  }
}
