import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { getBootstrapContext } from "@/lib/bootstrap";
import { parseJsonBody, authPrecheckSchema } from "@/lib/validation";
import { rateLimitAsync as rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** POST { email, password } — validate credentials and report whether MFA is required */
export async function POST(req: NextRequest) {
  try {
    await getBootstrapContext();

    const parsed = await parseJsonBody(req, authPrecheckSchema);
    if (!parsed.ok) return parsed.response;
    const email = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password;

    const rl = await rateLimit({
      key: `precheck:${email}`,
      limit: 20,
      windowMs: 15 * 60 * 1000,
    });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user || !user.active) {
      return NextResponse.json(
        { ok: false, error: "invalid_credentials" },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { ok: false, error: "invalid_credentials" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      ok: true,
      mfaRequired: user.mfaEnabled,
      name: user.name,
    });
  } catch (err) {
    console.error("[auth/precheck]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
