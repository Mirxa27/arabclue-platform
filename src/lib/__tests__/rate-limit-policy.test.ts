import { describe, expect, test } from "bun:test";
import {
  describeRateLimitDenial,
  distributedRateLimitBackend,
  isDistributedBackend,
  redisReconnectAllowed,
  requiresDistributedRateLimit,
} from "../rate-limit";

describe("distributed rate-limit policy", () => {
  test("requires a shared backend when Redis is configured or the deployment is Vercel production", () => {
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
    // Vercel production without Redis: the platform database is shared by
    // every instance, so the requirement holds and is met there.
    expect(
      requiresDistributedRateLimit(undefined, {
        NODE_ENV: "production",
        VERCEL: "1",
      })
    ).toBe(true);
    expect(
      requiresDistributedRateLimit(undefined, { NODE_ENV: "development" })
    ).toBe(false);
  });

  test("resolves the shared backend from the environment", () => {
    expect(distributedRateLimitBackend({ NODE_ENV: "development" })).toBeNull();
    expect(
      distributedRateLimitBackend({ NODE_ENV: "production", VERCEL: "1" })
    ).toBe("postgres");
    expect(
      distributedRateLimitBackend({
        NODE_ENV: "production",
        VERCEL: "1",
        REDIS_URL: "rediss://upstash.example",
        RATE_LIMIT_BACKEND: "postgres",
      })
    ).toBe("redis");
    expect(
      distributedRateLimitBackend({
        NODE_ENV: "production",
        RATE_LIMIT_BACKEND: "postgres",
      })
    ).toBe("postgres");
    expect(
      distributedRateLimitBackend({
        NODE_ENV: "production",
        VERCEL: "1",
        RATE_LIMIT_BACKEND: "memory",
      })
    ).toBeNull();
    expect(
      distributedRateLimitBackend({ NODE_ENV: "production", VERCEL: "" })
    ).toBeNull();
  });

  test("Redis and the database both count as distributed; memory and unavailable do not", () => {
    expect(isDistributedBackend("redis")).toBe(true);
    expect(isDistributedBackend("postgres")).toBe(true);
    expect(isDistributedBackend("memory")).toBe(false);
    expect(isDistributedBackend("unavailable")).toBe(false);
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

  test("login authorize must not force a shared backend on a single-node production host", () => {
    // Mirrors src/lib/auth.ts: omit requireDistributed so a single-node
    // self-host stays on in-memory limits unless it asks for the database.
    expect(
      requiresDistributedRateLimit(undefined, { NODE_ENV: "production" })
    ).toBe(false);
    expect(
      requiresDistributedRateLimit(undefined, {
        NODE_ENV: "production",
        RATE_LIMIT_BACKEND: "postgres",
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
