import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateMfaSecret, buildMfaQrDataUrl, verifyMfaToken } from "@/lib/mfa";
import { requireSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * POST — generate MFA secret + QR.
 * Requires authenticated session. If MFA is already enabled, requires current TOTP.
 * Rate-limited: 5 setups / 15min per user.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession({ allowMustChangePassword: true });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimit({ key: `mfa:setup:${session.user.id}`, limit: 5, windowMs: 15 * 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited_try_later" }, { status: 429 });
  }

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let body: { currentToken?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (user.mfaEnabled) {
    const currentToken = body.currentToken?.trim() ?? "";
    if (!user.mfaSecret || !currentToken || !verifyMfaToken(user.mfaSecret, currentToken)) {
      return NextResponse.json(
        { error: "Current MFA token required to rotate MFA" },
        { status: 403 }
      );
    }
  }

  const secret = generateMfaSecret();
  await db.user.update({
    where: { id: user.id },
    data: { mfaSecret: secret, mfaEnabled: false },
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
    details: { rotated: user.mfaEnabled },
  });

  // Do not return raw secret — QR / otpauth URL is enough for authenticator apps
  return NextResponse.json({
    otpauthUrl,
    qrDataUrl,
    message: "Scan the QR code, then POST /api/auth/mfa/verify to enable MFA",
  });
}
