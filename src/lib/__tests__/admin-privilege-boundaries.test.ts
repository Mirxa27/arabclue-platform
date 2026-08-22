/**
 * Guard tests for privilege boundaries in the admin surface.
 *
 * Three separate ways an ADMIN could reach past their own rank:
 * modifying a SUPER_ADMIN, writing a secret env row, and rotating the payment
 * credential through a panel that skipped the env route's SUPER_ADMIN gate.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

describe("a SUPER_ADMIN cannot be modified by an ADMIN", () => {
  const source = read("src/app/api/admin/users/[id]/route.ts");

  test("the rank check is not nested inside the role branch", () => {
    const guardAt = source.indexOf('before.role === "SUPER_ADMIN"');
    const roleBranchAt = source.indexOf("if (body.role) {");
    expect(guardAt).toBeGreaterThan(-1);
    expect(roleBranchAt).toBeGreaterThan(-1);
    // The regression: the guard lived after `if (body.role) {`, so an update
    // carrying only { active: false } or { mfaEnabled: false } skipped it.
    expect(guardAt).toBeLessThan(roleBranchAt);
  });

  test("the check runs before any field is written", () => {
    const guardAt = source.indexOf('before.role === "SUPER_ADMIN"');
    const updateAt = source.indexOf("db.user.update(");
    expect(guardAt).toBeLessThan(updateAt);
  });
});

describe("env writes cannot dodge the SUPER_ADMIN gate", () => {
  const source = read("src/app/api/admin/env/route.ts");

  test("secrecy for the write gate is not taken from the request", () => {
    // `isSecret ?? heuristic` let a caller post { isSecret: false } on a
    // credential key and slip past the gate below it.
    expect(source).not.toMatch(/const secret = isSecret \?\?/);
    expect(source).toContain("isSecretEnvKey(key) || isSecret === true");
  });

  test("the SUPER_ADMIN gate still guards secret and critical keys", () => {
    expect(source).toContain("CRITICAL_ENV_KEYS.has(key)");
    expect(source).toContain('session.user.role !== "SUPER_ADMIN"');
  });
});

describe("payment credentials require SUPER_ADMIN wherever they are written", () => {
  const source = read("src/app/api/admin/myfatoorah/route.ts");

  test("rotating the API key or webhook secret is gated", () => {
    expect(source).toContain("SUPER_ADMIN_REQUIRED");
    expect(source).toContain("rotatingSecrets");
  });

  test("the gate precedes the secret write", () => {
    const gateAt = source.indexOf("rotatingSecrets");
    const writeAt = source.indexOf('upsertSecret(\n          "MYFATOORAH_API_KEY"');
    expect(gateAt).toBeGreaterThan(-1);
    if (writeAt > -1) expect(gateAt).toBeLessThan(writeAt);
  });

  test("non-secret actions stay available to ADMIN", () => {
    // Connection and signature self-tests, and the environment switch, are
    // operational actions and must not require SUPER_ADMIN.
    expect(source).toContain('action === "test_connection"');
    expect(source).toContain('action === "test_webhook_signature"');
  });
});

describe("the cron plane is not firable from a URL", () => {
  const source = read("src/lib/cron-auth.ts");

  test("the query-string secret form is gone", () => {
    expect(source).not.toMatch(/searchParams\.get\("secret"\)\?\.trim\(\)\s*\?\?/);
  });

  test("comparison is constant time", () => {
    expect(source).toContain("timingSafeEqual");
    expect(source).not.toMatch(/bearer === secret/);
  });
});

describe("precheck is not a silent credential oracle", () => {
  const source = read("src/app/api/auth/precheck/route.ts");

  test("failures are audited", () => {
    expect(source).toContain("AUDIT_ACTIONS.LOGIN_FAILED");
  });

  test("reserved development identities are refused as at login", () => {
    expect(source).toContain("isProductionBlockedDevelopmentIdentity");
  });

  test("a missing account costs the same as a wrong password", () => {
    expect(source).toContain("getDummyHash");
  });

  test("the account holder's name is no longer disclosed", () => {
    expect(source).not.toContain("name: user.name");
  });

  test("the limit matches the credentials provider", () => {
    expect(source).toMatch(/limit: 10,/);
  });
});
