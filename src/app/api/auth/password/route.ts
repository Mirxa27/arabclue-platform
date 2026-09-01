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
import {
  jsonApiFailure,
  jsonRateLimitFailure,
} from "@/lib/api-controller";

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
      return jsonRateLimitFailure(
        describeRateLimitDenial(rl),
        "PASSWORD_CHANGE_RATE_LIMITED",
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
    const changedAt = new Date();
    // A password change is how someone answers a suspected compromise, so the
    // old password's reach has to end with it: every other signed-in session,
    // and any reset link still in flight. Rewriting the hash alone left both
    // alive — and redeeming a stale reset link *does* revoke sessions, so the
    // attacker would have ended up holding the only live one. The reset path
    // has always done both together (recovery-service-prisma.ts:197-203); this
    // is the same invariant reached through the other door. One transaction,
    // because a crash between the steps produces exactly the state the change
    // was meant to prevent.
    const [, revokedSessions, consumedResets] = await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false },
      }),
      db.userSession.deleteMany({
        where: session.sessionToken
          ? { userId: user.id, NOT: { token: session.sessionToken } }
          : { userId: user.id },
      }),
      db.recoveryToken.updateMany({
        where: {
          userId: user.id,
          consumedAt: null,
          expiresAt: { gt: changedAt },
        },
        data: { consumedAt: changedAt },
      }),
    ]);

    await audit({
      userId: user.id,
      action: "PASSWORD_CHANGE",
      resource: "User",
      resourceId: user.id,
      severity: "WARN",
      details: {
        revokedSessions: revokedSessions.count,
        consumedResetTokens: consumedResets.count,
        keptCurrentSession: Boolean(session.sessionToken),
      },
    });

    return NextResponse.json({ ok: true, mustChangePassword: false });
  } catch (err) {
    console.error("[auth/password]", err);
    return jsonApiFailure("INTERNAL_ERROR", { status: 500 });
  }
}
