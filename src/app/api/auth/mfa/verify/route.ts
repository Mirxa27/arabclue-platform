import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyMfaToken } from "@/lib/mfa";
import { verifyPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { emailSchema, zodErrorResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

const mfaVerifySchema = z.object({
  token: z.string().regex(/^\d{6}$/),
  email: emailSchema.optional(),
  password: z.string().optional(),
});

/** POST { token, email?, password? } — verify TOTP and enable MFA */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = mfaVerifySchema.safeParse(raw);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    const { token } = parsed.data;
    const email = parsed.data.email?.trim().toLowerCase();
    const password = parsed.data.password ?? "";

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

    if (!user.mfaSecret) {
      return NextResponse.json({ error: "MFA not set up" }, { status: 400 });
    }
    if (!verifyMfaToken(user.mfaSecret, token)) {
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
