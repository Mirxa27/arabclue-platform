import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { verifyMfaToken } from "@/lib/mfa";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { parseJsonBody, mfaDisableSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** POST { currentToken } — disable MFA after verifying current TOTP */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = rateLimit({
      key: `mfa:disable:${session.user.id}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (!rl.ok) {
      return NextResponse.json({ error: "rate_limited_try_later" }, { status: 429 });
    }

    const parsed = await parseJsonBody(req, mfaDisableSchema);
    if (!parsed.ok) return parsed.response;

    const user = await db.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!user.mfaEnabled || !user.mfaSecret) {
      return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
    }
    if (!verifyMfaToken(user.mfaSecret, parsed.data.currentToken)) {
      return NextResponse.json({ error: "Invalid MFA token" }, { status: 400 });
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
