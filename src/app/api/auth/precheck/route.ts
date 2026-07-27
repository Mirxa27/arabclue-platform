import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { getBootstrapContext } from "@/lib/bootstrap";
import { parseJsonBody, authPrecheckSchema } from "@/lib/validation";
import { withPublicRoute } from "@/lib/api-controller";
import {
  describeRateLimitDenial,
  rateLimitAsync as rateLimit,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST { email, password } — validate credentials and report whether MFA is required.
 *
 * Failure mapping is delegated to the shared bilingual mapper: a schema object
 * the connected database lacks becomes 503 `SCHEMA_MIGRATION_PENDING`, and an
 * unrecognized failure becomes a generic bilingual 500. Neither echoes the
 * thrown message, so a driver error can no longer leak SQL, a column name, or a
 * server file path to an unauthenticated caller (requirements 16.2, 18.4, 19.10).
 */
export async function POST(req: NextRequest) {
  return withPublicRoute("auth/precheck", async () => {
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
      const denial = describeRateLimitDenial(rl);
      return NextResponse.json(
        { error: denial.error },
        {
          status: denial.status,
          headers: { "Retry-After": String(denial.retryAfterSeconds) },
        }
      );
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
  });
}
