import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateMfaSecret, buildMfaQrDataUrl } from "@/lib/mfa";
import { verifyPassword } from "@/lib/password";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * POST — generate MFA secret + QR.
 * Requires either an authenticated session OR email+password proof.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const body = await req.json().catch(() => ({}));
  const email = (body.email as string | undefined)?.trim().toLowerCase();
  const password = String(body.password ?? "");

  let user =
    session?.user?.id
      ? await db.user.findUnique({ where: { id: session.user.id } })
      : null;

  if (!user) {
    if (!email || !password) {
      return NextResponse.json(
        { error: "Authentication required (session or email+password)" },
        { status: 401 }
      );
    }
    user = await db.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
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
  });

  return NextResponse.json({
    secret,
    otpauthUrl,
    qrDataUrl,
    message: "Scan the QR code, then POST /api/auth/mfa/verify to enable MFA",
  });
}
