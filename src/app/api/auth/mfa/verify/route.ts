import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyMfaTokenDetailed } from "@/lib/mfa";
import { requireSession } from "@/lib/auth";
import {
  describeRateLimitDenial,
  rateLimitAsync as rateLimit,
} from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { mfaVerifySchema, zodErrorResponse } from "@/lib/validation";
import {
  jsonApiFailure,
  jsonRateLimitFailure,
} from "@/lib/api-controller";
import { verifyPassword } from "@/lib/password";
import { generateRecoveryCodes } from "@/lib/mfa-recovery";
import { replaceRecoveryCodes } from "@/lib/mfa-challenge";
import { sealMfaSecret, unsealMfaSecret } from "@/lib/mfa-secret";

export const dynamic = "force-dynamic";

/** POST { token, password } — verify the pending TOTP and enable MFA */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession({ allowMustChangePassword: true });
    if (!session) return jsonApiFailure("AUTHENTICATION_REQUIRED", { status: 401 });

    const rl = await rateLimit({ key: `mfa:verify:${session.user.id}`, limit: 5, windowMs: 15 * 60 * 1000 });
    if (!rl.ok) {
      return jsonRateLimitFailure(
        describeRateLimitDenial(rl),
        "MFA_VERIFY_RATE_LIMITED",
      );
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonApiFailure("INVALID_JSON_BODY", { status: 400 });
    }
    const parsed = mfaVerifySchema.safeParse(raw);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    const { token, password } = parsed.data;

    const user = await db.user.findUnique({ where: { id: session.user.id } });
    if (!user) return jsonApiFailure("RESOURCE_NOT_FOUND", { status: 404 });

    if (!(await verifyPassword(password, user.passwordHash))) {
      return jsonApiFailure("PASSWORD_INCORRECT", { status: 403 });
    }

    const pending = unsealMfaSecret(user.pendingMfaSecret);
    const legacyInFlight =
      !pending && !user.mfaEnabled ? unsealMfaSecret(user.mfaSecret) : null;
    const secretToConfirm = pending ?? legacyInFlight;
    if (!secretToConfirm) {
      return jsonApiFailure("MFA_NOT_SET_UP", { status: 400 });
    }

    const evaluated = verifyMfaTokenDetailed(secretToConfirm, token);
    if (!evaluated.ok) {
      await audit({
        userId: user.id,
        action: "LOGIN_FAILED",
        details: { reason: "mfa_verify_failed" },
        severity: "WARN",
        success: false,
      });
      return jsonApiFailure("MFA_TOKEN_INVALID", { status: 400 });
    }

    const recoveryCodes = generateRecoveryCodes();
    await db.user.update({
      where: { id: user.id },
      data: {
        mfaSecret: sealMfaSecret(secretToConfirm),
        pendingMfaSecret: null,
        mfaEnabled: true,
        mfaLastUsedStep: BigInt(evaluated.step),
      },
    });
    await replaceRecoveryCodes(user.id, recoveryCodes);

    await audit({
      userId: user.id,
      action: "MFA_ENABLE",
      resource: "User",
      resourceId: user.id,
      details: { rotated: user.mfaEnabled, recoveryCodesIssued: recoveryCodes.length },
    });

    return NextResponse.json({
      ok: true,
      mfaEnabled: true,
      recoveryCodes,
    });
  } catch (err) {
    console.error("[mfa/verify]", err);
    return jsonApiFailure("INTERNAL_ERROR", { status: 500 });
  }
}
