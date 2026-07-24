import { describe, expect, test } from "bun:test";
import { productionInfrastructureReadiness } from "../production-readiness";

describe("production infrastructure readiness", () => {
  test("fails closed when production cron or Vercel Blob is absent", () => {
    const checks = productionInfrastructureReadiness({
      NODE_ENV: "production",
      VERCEL: "1",
    });
    expect(checks.storage.ok).toBe(false);
    expect(checks.rateLimit.ok).toBe(true);
    expect(checks.rateLimit.detail).toBe("memory_vercel");
    expect(checks.cron.ok).toBe(false);
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
