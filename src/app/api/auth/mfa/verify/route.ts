import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyMfaToken } from "@/lib/mfa";
import { requireSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { zodErrorResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

const mfaVerifySchema = z.object({
  token: z.string().regex(/^\d{6}$/),
});

/** POST { token } — verify TOTP and enable MFA (session only, rate-limited) */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession({ allowMustChangePassword: true });
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = rateLimit({ key: `mfa:verify:${session.user.id}`, limit: 5, windowMs: 15 * 60 * 1000 });
    if (!rl.ok) {
      return NextResponse.json({ error: "rate_limited_try_later" }, { status: 429 });
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = mfaVerifySchema.safeParse(raw);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    const { token } = parsed.data;

    const user = await db.user.findUnique({ where: { id: session.user.id } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (!user.mfaSecret) {
      return NextResponse.json({ error: "MFA not set up" }, { status: 400 });
    }
    if (!verifyMfaToken(user.mfaSecret, token)) {
      await audit({
        userId: user.id,
        action: "LOGIN_FAILED",
        details: { reason: "mfa_verify_failed" },
        severity: "WARN",
        success: false,
      });
      return NextResponse.json({ error: "Invalid MFA token" }, { status: 400 });
    }

    await db.user.update({
      where: { id: user.id },
      data: { mfaEnabled: true },
    });

    await audit({
      userId: user.id,
      action: "MFA_ENABLE",
      resource: "User",
      resourceId: user.id,
    });

    return NextResponse.json({ ok: true, mfaEnabled: true });
  } catch (err) {
    console.error("[mfa/verify]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
