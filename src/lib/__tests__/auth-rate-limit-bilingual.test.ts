/**
 * "rate_limited" is not a sentence anyone can read.
 *
 * Eight routes answered a throttled request with `{ error: denial.error }` —
 * a lowercase machine token — and six of them attached a `code` that was never
 * registered bilingually, so there was no Arabic or English message to fall
 * back to either. Worse, when the limiter backend itself is down those six sent
 * `code: "..._RATE_LIMITED"` alongside `status: 503`: the code tells the caller
 * to slow down while the status says the server is broken, and the two cannot
 * both be true.
 *
 * The split is the whole point. 429 means "you did too much" and names the
 * action. 503 means "the limiter is unreachable, nothing was changed" and is
 * the same sentence everywhere, because from the caller's side it is the same
 * event. One helper owns it so a ninth route cannot invent a third answer.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { describeRateLimitDenial } from "../rate-limit";
import { jsonRateLimitFailure } from "../api-controller";
import { resolveFailureStatus } from "../api-failure";
import { COMPLETION_ERROR_CONTRACTS, type CompletionErrorCode } from "../i18n";

/** Every route that turns a denial into a response, with the code it names. */
const DENIAL_ROUTES = [
  ["src/app/api/auth/precheck/route.ts", "LOGIN_RATE_LIMITED"],
  ["src/app/api/auth/password/route.ts", "PASSWORD_CHANGE_RATE_LIMITED"],
  ["src/app/api/auth/mfa/setup/route.ts", "MFA_SETUP_RATE_LIMITED"],
  ["src/app/api/auth/mfa/verify/route.ts", "MFA_VERIFY_RATE_LIMITED"],
  ["src/app/api/auth/mfa/disable/route.ts", "MFA_DISABLE_RATE_LIMITED"],
  ["src/app/api/auth/profile/route.ts", "PROFILE_UPDATE_RATE_LIMITED"],
  ["src/app/api/auth/avatar/route.ts", "AVATAR_UPLOAD_RATE_LIMITED"],
  [
    "src/app/api/proposals/[id]/download/route.ts",
    "PROPOSAL_DOWNLOAD_RATE_LIMITED",
  ],
] as const satisfies readonly (readonly [string, CompletionErrorCode])[];

const denied = { retryAfterMs: 42_000 } as const;

async function bodyOf(res: Response) {
  return (await res.json()) as {
    code?: string;
    message?: { ar?: string; en?: string };
  };
}

describe("a throttled caller is told what happened, in their language", () => {
  test("the denial descriptor carries no machine token at all", () => {
    // The token used to be the response body. Removing the field rather than
    // renaming it is what makes tsc find every site that echoed it.
    const denial = describeRateLimitDenial({ ...denied, backend: "memory" });
    expect("error" in denial).toBe(false);
    expect(denial.status).toBe(429);
    expect(denial.retryAfterSeconds).toBe(42);
  });

  test("an unreachable limiter is still a 503, not a 429", () => {
    // Anti-vacuous: a descriptor that always said 429 would pass the test above.
    expect(
      describeRateLimitDenial({ ...denied, backend: "unavailable" }).status,
    ).toBe(503);
  });

  test("429 names the action and carries Retry-After", async () => {
    const res = jsonRateLimitFailure(
      describeRateLimitDenial({ ...denied, backend: "redis" }),
      "PASSWORD_CHANGE_RATE_LIMITED",
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    // One caller's denial, with its own countdown. A shared cache replaying it
    // would lock out someone who never hit the limit.
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await bodyOf(res);
    expect(body.code).toBe("PASSWORD_CHANGE_RATE_LIMITED");
    expect(body.message?.ar).toBeTruthy();
    expect(body.message?.en).toBeTruthy();
  });

  test("503 says the limiter failed, not that the caller did", async () => {
    const res = jsonRateLimitFailure(
      describeRateLimitDenial({ ...denied, backend: "unavailable" }),
      "PASSWORD_CHANGE_RATE_LIMITED",
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("42");
    const body = await bodyOf(res);
    // The route's own code would blame the caller for an outage they did not
    // cause, which is exactly the contradiction this replaces.
    expect(body.code).toBe("RATE_LIMIT_UNAVAILABLE");
    expect(body.message?.ar).toBeTruthy();
    expect(body.message?.en).toBeTruthy();
  });
});

describe("every denial route is bilingual and self-consistent", () => {
  test("each route names a registered code with the right status", () => {
    expect(DENIAL_ROUTES.length).toBe(8);
    for (const [, code] of DENIAL_ROUTES) {
      expect(COMPLETION_ERROR_CONTRACTS[code], code).toBeTruthy();
      expect(resolveFailureStatus(code), code).toBe(429);
    }
  });

  test("no route still echoes the raw denial token", () => {
    for (const [path] of DENIAL_ROUTES) {
      const source = readFileSync(path, "utf8");
      expect(source, `${path} still echoes the machine token`).not.toContain(
        "denial.error",
      );
      // Anti-vacuous: the file has to actually handle a denial for the check
      // above to mean anything.
      expect(source, `${path} no longer handles a denial`).toContain(
        "describeRateLimitDenial",
      );
    }
  });

  test("the sign-in refusal is bilingual and answers 401", () => {
    // `invalid_credentials` had no client reader and no translation — a caller
    // who could not read English got a lowercase token under a bare 401.
    expect(COMPLETION_ERROR_CONTRACTS.INVALID_CREDENTIALS).toBeTruthy();
    expect(resolveFailureStatus("INVALID_CREDENTIALS")).toBe(401);
  });
});
