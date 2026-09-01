import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateMfaSecret, buildMfaQrDataUrl, verifyMfaTokenDetailed } from "@/lib/mfa";
import { requireSession } from "@/lib/auth";
import {
  describeRateLimitDenial,
  rateLimitAsync as rateLimit,
} from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import {
  jsonApiFailure,
  jsonRateLimitFailure,
} from "@/lib/api-controller";
import { parseJsonBody, mfaSetupSchema } from "@/lib/validation";
import { verifyPassword } from "@/lib/password";
import { sealMfaSecret, unsealMfaSecret } from "@/lib/mfa-secret";

export const dynamic = "force-dynamic";

/**
 * POST — generate a pending MFA secret + QR.
 * Requires the current password. If MFA is already enabled, also requires the
 * current TOTP. The live factor is left untouched until /verify promotes the
 * pending secret.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession({ allowMustChangePassword: true });
  if (!session) return jsonApiFailure("AUTHENTICATION_REQUIRED", { status: 401 });

  const rl = await rateLimit({ key: `mfa:setup:${session.user.id}`, limit: 5, windowMs: 15 * 60 * 1000 });
  if (!rl.ok) {
    return jsonRateLimitFailure(
      describeRateLimitDenial(rl),
      "MFA_SETUP_RATE_LIMITED",
    );
  }

  const parsed = await parseJsonBody(req, mfaSetupSchema);
  if (!parsed.ok) return parsed.response;

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user) return jsonApiFailure("RESOURCE_NOT_FOUND", { status: 404 });

  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return jsonApiFailure("PASSWORD_INCORRECT", { status: 403 });
  }

  if (user.mfaEnabled) {
    const currentToken = parsed.data.currentToken?.trim() ?? "";
    const liveSecret = unsealMfaSecret(user.mfaSecret);
    if (
      !liveSecret ||
      !currentToken ||
      !verifyMfaTokenDetailed(liveSecret, currentToken, {
        lastUsedStep: user.mfaLastUsedStep,
      }).ok
    ) {
      return jsonApiFailure("MFA_ROTATION_TOKEN_REQUIRED", { status: 403 });
    }
  }

  const secret = generateMfaSecret();
  await db.user.update({
    where: { id: user.id },
    data: { pendingMfaSecret: sealMfaSecret(secret) },
  });

  const { otpauthUrl, qrDataUrl } = await buildMfaQrDataUrl({
    email: user.email,
    secret,
  });

  await audit({
    userId: user.id,
    action: "MFA_SETUP",
    resource: "User",
    resourceId: user.id,
    details: { rotated: user.mfaEnabled, staged: true },
  });

  return NextResponse.json({
    otpauthUrl,
    qrDataUrl,
    message: "Scan the QR code, then POST /api/auth/mfa/verify to enable MFA",
  });
}
