/**
 * Workspace invitation acceptance (requirements 3.2, 3.3, 3.4, 3.9, 3.10, 3.11).
 *
 * Public account route: no tenant resolution, the shared bilingual validation
 * and failure mapper, and one delegation to the Invitation_Service, which owns
 * the serializable transaction that re-reads token, address, account,
 * membership, role, and seat state before creating anything.
 */

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonApiFailure, jsonOk, withPublicRoute } from "@/lib/api-controller";
import { createPrismaInvitationService } from "@/lib/invitation-service-prisma";
import {
  describeRateLimitDenial,
  rateLimitAsync as rateLimit,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function clientAddress(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip")?.trim() ?? null;
}

export async function POST(req: NextRequest) {
  return withPublicRoute("invitations accept", async () => {
    // Before anything reads the body or opens a transaction. The token is 32
    // random bytes, so this is not about guessing it — acceptInvitation runs a
    // serializable transaction, and an unauthenticated caller must not be able
    // to open an unbounded number of them.
    const address = clientAddress(req) ?? "unknown";
    const rl = await rateLimit({
      key: `invitations:accept:${address}`,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (!rl.ok) {
      const denial = describeRateLimitDenial(rl);
      return jsonApiFailure(
        denial.status === 503
          ? "INVITATION_RATE_LIMIT_UNAVAILABLE"
          : "INVITATION_RATE_LIMITED",
        { status: denial.status, retryAfterSeconds: denial.retryAfterSeconds }
      );
    }

    const payload = await req.json().catch(() => null);
    const session = await getServerSession(authOptions);
    const sessionUser =
      session?.user?.id && session.user.email
        ? { userId: session.user.id, email: session.user.email }
        : null;

    const result = await createPrismaInvitationService().acceptInvitation({
      payload,
      session: sessionUser,
      sourceAddress: clientAddress(req),
    });

    if (!result.ok) {
      return jsonApiFailure(result.code, {
        status: result.status,
        ...(result.code === "INVITATION_ACCEPTANCE_INVALID"
          ? {
              fieldPaths: result.fieldPaths,
              values: { fieldPath: result.fieldPaths.join(", ") },
            }
          : {}),
      });
    }

    return jsonOk(
      {
        ok: true,
        code: result.code,
        workspaceId: result.workspaceId,
        role: result.role,
        userId: result.userId,
        accountCreated: result.createdUser,
      },
      { status: result.status }
    );
  });
}
