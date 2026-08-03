import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import {
  describeRateLimitDenial,
  rateLimitAsync as rateLimit,
} from "@/lib/rate-limit";
import { parseJsonBody, passwordChangeSchema } from "@/lib/validation";
import { jsonApiFailure } from "@/lib/api-controller";

export const dynamic = "force-dynamic";

/** POST { currentPassword, newPassword } — change password; clears mustChangePassword */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession({ allowMustChangePassword: true });
    if (!session) {
      return jsonApiFailure("AUTHENTICATION_REQUIRED", { status: 401 });
    }

    const rl = await rateLimit({
      key: `pwd:${session.user.id}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (!rl.ok) {
      const denial = describeRateLimitDenial(rl);
      return NextResponse.json(
        { error: denial.error, code: "PASSWORD_CHANGE_RATE_LIMITED" },
        {
          status: denial.status,
          headers: { "Retry-After": String(denial.retryAfterSeconds) },
        }
      );
    }

    const parsed = await parseJsonBody(req, passwordChangeSchema);
    if (!parsed.ok) return parsed.response;
    const { currentPassword, newPassword } = parsed.data;

    const user = await db.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return jsonApiFailure("RESOURCE_NOT_FOUND", { status: 404 });
    }

    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) {
      return jsonApiFailure("PASSWORD_INCORRECT", { status: 400 });
    }

    const passwordHash = await hashPassword(newPassword);
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });

    await audit({
      userId: user.id,
      action: "PASSWORD_CHANGE",
      resource: "User",
      resourceId: user.id,
      severity: "WARN",
    });

    return NextResponse.json({ ok: true, mustChangePassword: false });
  } catch (err) {
    console.error("[auth/password]", err);
    return jsonApiFailure("INTERNAL_ERROR", { status: 500 });
  }
}
