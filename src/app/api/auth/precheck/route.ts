import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { getBootstrapContext } from "@/lib/bootstrap";
import { parseJsonBody, authPrecheckSchema } from "@/lib/validation";
import {
  jsonApiFailure,
  jsonRateLimitFailure,
  withPublicRoute,
} from "@/lib/api-controller";
import {
  describeRateLimitDenial,
  rateLimitAsync as rateLimit,
} from "@/lib/rate-limit";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { isProductionBlockedDevelopmentIdentity } from "@/lib/production-identities";
import { hashPassword } from "@/lib/password";

export const dynamic = "force-dynamic";

/**
 * Cost-equalising dummy hash.
 *
 * `verifyPassword` only ran for an existing user, so a missing account answered
 * measurably faster than a wrong password and this endpoint became an
 * unauthenticated account-existence oracle. Verifying against a fixed hash on
 * the miss path costs the same scrypt work as the hit path.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("precheck-timing-equaliser-not-a-secret");
  return dummyHashPromise;
}

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

    // This endpoint verifies a password, so it is a second front door and is
    // limited on the same terms as the credentials provider (10 per 15 minutes)
    // rather than the looser 20 it used to allow.
    const rl = await rateLimit({
      key: `precheck:${email}`,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (!rl.ok) {
      return jsonRateLimitFailure(
        describeRateLimitDenial(rl),
        "LOGIN_RATE_LIMITED"
      );
    }

    // One body for all three refusal paths, so a caller cannot tell a missing
    // account from a wrong password — and it is a sentence in both locales
    // rather than the lowercase token this used to return.
    const invalid = () => jsonApiFailure("INVALID_CREDENTIALS");

    // Mirrors the credentials provider: reserved development identities are
    // refused outright in production. Without this, the gate could be probed
    // here even though login refuses it.
    if (isProductionBlockedDevelopmentIdentity(email)) {
      await audit({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        details: { reason: "reserved_development_identity", via: "precheck" },
        severity: "CRITICAL",
        success: false,
      });
      return invalid();
    }

    const user = await db.user.findUnique({ where: { email } });

    if (!user || !user.active) {
      // Spend the same scrypt work as a real verification so the miss path is
      // not measurably faster.
      await verifyPassword(password, await getDummyHash());
      await audit({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        details: { email, reason: "not_found_or_inactive", via: "precheck" },
        severity: "WARN",
        success: false,
      });
      return invalid();
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      // Failures here were previously invisible, so this endpoint could be
      // brute-forced without producing a single audit record.
      await audit({
        userId: user.id,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        details: { email, reason: "bad_password", via: "precheck" },
        severity: "WARN",
        success: false,
      });
      return invalid();
    }

    // `name` is deliberately not returned: the caller only needs to know
    // whether to render the MFA field, and the login page never read it.
    return NextResponse.json({
      ok: true,
      mfaRequired: user.mfaEnabled,
    });
  });
}
