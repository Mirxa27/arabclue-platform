import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LOGIN_EMAIL_LIMIT,
  consumeLoginRateLimits,
  loginRateLimitKeys,
} from "../login-rate-limit";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

describe("precheck shares the credentials provider's limiter", () => {
  test("the route consumes the shared email and IP buckets, not a private key", () => {
    const source = read("src/app/api/auth/precheck/route.ts");
    expect(source).toContain("consumeLoginRateLimits(email, extractClientIp(req.headers))");
    expect(source).not.toMatch(/key:\s*`precheck:/);
  });

  test("precheck and authorize derive the same bucket keys for one caller", () => {
    // Arrange
    const email = "Ada@Example.com";
    const ip = "203.0.113.9";

    // Act
    const fromPrecheck = loginRateLimitKeys(email, ip);
    const fromAuthorize = loginRateLimitKeys(email.toLowerCase(), ip);

    // Assert — one budget, whichever door is used.
    expect(fromPrecheck).toEqual(fromAuthorize);
    expect(fromPrecheck.emailKey).toBe("login:email:ada@example.com");
  });

  test("attempts through the shared bucket exhaust the email budget together", async () => {
    // Arrange — a unique address so no other test shares the memory bucket.
    const email = `precheck-share-${Date.now()}-${Math.random()}@example.test`;
    const ip = "198.51.100.7";

    // Act — the credentials provider's budget, spent from "precheck".
    for (let attempt = 0; attempt < LOGIN_EMAIL_LIMIT; attempt += 1) {
      const result = await consumeLoginRateLimits(email, ip);
      expect(result.ok).toBe(true);
    }
    const denied = await consumeLoginRateLimits(email, ip);

    // Assert
    expect(denied.ok).toBe(false);
    expect(denied.dimension).toBe("email");
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });
});
