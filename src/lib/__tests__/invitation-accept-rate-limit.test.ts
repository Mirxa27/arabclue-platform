/**
 * `POST /api/invitations/accept` is unauthenticated by design — the invitee
 * has no session until it succeeds. It was also unthrottled, and that pairing
 * is the problem.
 *
 * Not because the token is guessable: it is 32 random bytes
 * (token-digest.ts DEFAULT_SECRET_BYTES), looked up by digest, so brute force
 * is not the threat. The threat is cost. Every anonymous POST — valid token or
 * not — opens a serializable transaction that re-reads token, address,
 * account, membership, role, and seat state. Serializable is the most
 * expensive isolation level Postgres offers, and this route hands it to the
 * open internet at zero cost to the caller.
 *
 * Seven sibling auth routes already limit. This one is the gap.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describeRateLimitDenial, rateLimitAsync } from "../rate-limit";

const source = readFileSync(
  resolve(process.cwd(), "src/app/api/invitations/accept/route.ts"),
  "utf8"
);

describe("invitation acceptance is throttled per source address", () => {
  test("the route limits before it touches the database", () => {
    expect(source).toContain("rateLimit");
    expect(source).toContain("describeRateLimitDenial");
    // Order matters more than presence. A limiter that runs after the
    // transaction has already opened protects nothing.
    const limitAt = source.indexOf("await rateLimit(");
    const serviceAt = source.indexOf("createPrismaInvitationService()");
    expect(limitAt, "route never calls the limiter").toBeGreaterThan(-1);
    expect(
      limitAt,
      "the limiter runs after the service call — the transaction is already open"
    ).toBeLessThan(serviceAt);
  });

  test("a denial carries Retry-After so clients can back off", async () => {
    // The route hands retryAfterSeconds to jsonApiFailure and lets the shared
    // failure mapper write the header, so assert the header on a real response
    // rather than looking for the string in the route.
    expect(source).toContain("retryAfterSeconds: denial.retryAfterSeconds");
    const { jsonApiFailure } = await import("../api-controller");
    const res = jsonApiFailure("INVITATION_RATE_LIMITED", {
      status: 429,
      retryAfterSeconds: 42,
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    const body = (await res.json()) as { error?: { ar?: string; en?: string } };
    expect(body.error?.en, "the new code is not registered bilingually").toBeTruthy();
    expect(body.error?.ar, "the new code is not registered bilingually").toBeTruthy();
  });

  test("a limiter outage does not read as the invitee's fault", async () => {
    // 503 branch: reachable once REDIS_URL is configured and Redis is down.
    const { jsonApiFailure } = await import("../api-controller");
    const res = jsonApiFailure("INVITATION_RATE_LIMIT_UNAVAILABLE", {
      status: 503,
      retryAfterSeconds: 5,
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: { ar?: string; en?: string } };
    expect(body.error?.en).toBeTruthy();
    expect(body.error?.ar).toBeTruthy();
    expect(body.error?.en).not.toBe(
      ((await jsonApiFailure("INVITATION_RATE_LIMITED", {
        status: 429,
      }).json()) as { error?: { en?: string } }).error?.en
    );
  });

  test("callers without a forwarded address are still bucketed", () => {
    // clientAddress() returns null behind a proxy that strips the header.
    // Falling back to a shared bucket keeps those callers limited together
    // rather than exempting them, which would be the whole hole again.
    expect(source).toMatch(/clientAddress\(req\) \?\? "/);
  });

  test("the configured policy actually denies a flood from one address", () => {
    // Real limiter, real counter — not a source scan. Memory backend, since
    // REDIS_URL is unset in test.
    const policy = { limit: 10, windowMs: 15 * 60 * 1000 };
    const key = `test:invitations:accept:${Math.random()}`;
    return (async () => {
      for (let attempt = 1; attempt <= policy.limit; attempt += 1) {
        const allowed = await rateLimitAsync({ key, ...policy });
        expect(allowed.ok, `attempt ${attempt} should be inside the limit`).toBe(
          true
        );
      }
      const denied = await rateLimitAsync({ key, ...policy });
      expect(denied.ok).toBe(false);
      const denial = describeRateLimitDenial(denied);
      expect(denial.status).toBe(429);
      expect(denial.retryAfterSeconds).toBeGreaterThan(0);
    })();
  });

  test("the route uses that same policy", () => {
    expect(source).toMatch(/limit: 10,/);
    expect(source).toMatch(/windowMs: 15 \* 60 \* 1000,/);
  });
});
