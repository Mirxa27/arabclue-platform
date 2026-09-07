import { describe, expect, test } from "bun:test";
import { productionInfrastructureReadiness } from "../production-readiness";

describe("production infrastructure readiness", () => {
  test("fails closed when production cron or Vercel Blob is absent on Vercel", () => {
    const checks = productionInfrastructureReadiness({
      NODE_ENV: "production",
      VERCEL: "1",
    });
    expect(checks.storage.ok).toBe(false);
    // No Redis on Vercel: the platform database is the shared backend.
    expect(checks.rateLimit).toEqual({ ok: true, detail: "postgres" });
    expect(checks.cron.ok).toBe(false);
  });

  test("fails closed when Vercel production opts out of every shared backend", () => {
    const checks = productionInfrastructureReadiness({
      NODE_ENV: "production",
      VERCEL: "1",
      RATE_LIMIT_BACKEND: "memory",
    });
    // Per-instance memory counters are not a rate limit on Vercel.
    expect(checks.rateLimit).toEqual({
      ok: false,
      detail: "shared_backend_disabled_on_vercel",
    });
  });

  test("Redis wins over the database when both are available", () => {
    const checks = productionInfrastructureReadiness({
      NODE_ENV: "production",
      VERCEL: "1",
      REDIS_URL: "rediss://redis.example.test",
      RATE_LIMIT_BACKEND: "postgres",
    });
    expect(checks.rateLimit.detail).toBe("redis");
  });

  test("a multi-node self-host can ask for the database backend", () => {
    const checks = productionInfrastructureReadiness({
      NODE_ENV: "production",
      RATE_LIMIT_BACKEND: "postgres",
      CRON_SECRET: "0123456789abcdef",
    });
    expect(checks.rateLimit).toEqual({ ok: true, detail: "postgres" });
  });

  test("passes only with all required production infrastructure", () => {
    const checks = productionInfrastructureReadiness({
      NODE_ENV: "production",
      VERCEL: "1",
      BLOB_READ_WRITE_TOKEN: "blob-token",
      REDIS_URL: "rediss://redis.example.test",
      CRON_SECRET: "0123456789abcdef",
    });
    expect(Object.values(checks).every((check) => check.ok)).toBe(true);
    expect(checks.rateLimit.detail).toBe("redis");
  });

  test("allows memory rate limiting on single-node production hosts", () => {
    const checks = productionInfrastructureReadiness({
      NODE_ENV: "production",
      CRON_SECRET: "0123456789abcdef",
    });
    expect(checks.storage.ok).toBe(true);
    expect(checks.rateLimit).toEqual({
      ok: true,
      detail: "memory_single_instance",
    });
    expect(checks.cron.ok).toBe(true);
  });

  test("keeps local development usable without production services", () => {
    const checks = productionInfrastructureReadiness({
      NODE_ENV: "development",
    });
    expect(Object.values(checks).every((check) => check.ok)).toBe(true);
    expect(checks.storage.detail).toBe("local_uploads");
    expect(checks.rateLimit.detail).toBe("memory_development");
  });

  test("rejects short cron secrets in production", () => {
    const checks = productionInfrastructureReadiness({
      NODE_ENV: "production",
      REDIS_URL: "redis://localhost:6379",
      CRON_SECRET: "short",
    });
    expect(checks.cron).toEqual({
      ok: false,
      detail: "CRON_SECRET_missing_or_short",
    });
  });
});
