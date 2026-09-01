import { describe, expect, test } from "bun:test";
import {
  describeRateLimitDenial,
  redisReconnectAllowed,
  requiresDistributedRateLimit,
} from "../rate-limit";

describe("distributed rate-limit policy", () => {
  test("requires Redis only when REDIS_URL is configured", () => {
    expect(
      requiresDistributedRateLimit(undefined, { NODE_ENV: "production" })
    ).toBe(false);
    expect(
      requiresDistributedRateLimit(undefined, {
        NODE_ENV: "development",
        VERCEL: "1",
      })
    ).toBe(false);
    expect(
      requiresDistributedRateLimit(undefined, {
        NODE_ENV: "production",
        VERCEL: "1",
        REDIS_URL: "redis://localhost:6379",
      })
    ).toBe(true);
    expect(
      requiresDistributedRateLimit(undefined, { NODE_ENV: "development" })
    ).toBe(false);
  });

  test("honors explicit requireDistributed overrides", () => {
    expect(
      requiresDistributedRateLimit(true, { NODE_ENV: "development" })
    ).toBe(true);
    expect(
      requiresDistributedRateLimit(false, {
        NODE_ENV: "production",
        REDIS_URL: "redis://localhost:6379",
      })
    ).toBe(false);
  });

  test("login authorize must not force Redis just because runtime is production", () => {
    // Mirrors src/lib/auth.ts: omit requireDistributed so Hobby / single-node
    // production stays on in-memory limits when REDIS_URL is unset.
    expect(
      requiresDistributedRateLimit(undefined, {
        NODE_ENV: "production",
        VERCEL: "1",
      })
    ).toBe(false);
    expect(
      requiresDistributedRateLimit(undefined, {
        NODE_ENV: "production",
        VERCEL: "1",
        REDIS_URL: "rediss://upstash.example",
      })
    ).toBe(true);
  });

  test("distinguishes limiter exhaustion from backend unavailability", () => {
    expect(
      describeRateLimitDenial({
        backend: "redis",
        retryAfterMs: 1_001,
      })
    ).toEqual({
      status: 429,
      retryAfterSeconds: 2,
    });
    expect(
      describeRateLimitDenial({
        backend: "unavailable",
        retryAfterMs: 5_000,
      })
    ).toEqual({
      status: 503,
      retryAfterSeconds: 5,
    });
  });

  test("permits Redis initialization retry only after its cooldown", () => {
    expect(redisReconnectAllowed(10_000, 9_999)).toBe(false);
    expect(redisReconnectAllowed(10_000, 10_000)).toBe(true);
    expect(redisReconnectAllowed(10_000, 10_001)).toBe(true);
  });
});
