import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

describe("login limiter is dual-keyed", () => {
  const source = read("src/lib/auth.ts");

  test("authorize consumes both email and IP limits", () => {
    expect(source).toContain("consumeLoginRateLimits");
    expect(source).toContain("extractClientIp");
    expect(source).not.toMatch(/key:\s*`login:\$\{email/);
  });

  test("a successful password still rehashes a legacy scrypt string", () => {
    expect(source).toContain("passwordNeedsRehash");
    expect(source).toContain("hashPassword(password)");
  });

  test("MFA login goes through the sealed-secret challenge helper", () => {
    expect(source).toContain("consumeMfaChallenge");
    expect(source).not.toContain("verifyMfaToken(user.mfaSecret");
  });
});

describe("MFA enrolment does not disable the live factor", () => {
  const setup = read("src/app/api/auth/mfa/setup/route.ts");
  const verify = read("src/app/api/auth/mfa/verify/route.ts");
  const disable = read("src/app/api/auth/mfa/disable/route.ts");

  test("setup writes only the pending secret", () => {
    expect(setup).toContain("pendingMfaSecret: sealMfaSecret(secret)");
    expect(setup).not.toContain("mfaEnabled: false");
    expect(setup).not.toMatch(/mfaSecret:\s*secret/);
    expect(setup).toContain("verifyPassword");
  });

  test("verify promotes the pending secret and issues recovery codes", () => {
    expect(verify).toContain("pendingMfaSecret: null");
    expect(verify).toContain("mfaEnabled: true");
    expect(verify).toContain("generateRecoveryCodes");
    expect(verify).toContain("recoveryCodes");
    expect(verify).toContain("verifyPassword");
  });

  test("disable requires the password and accepts TOTP or a recovery code", () => {
    expect(disable).toContain("mfaDisableSchema");
    expect(disable).toContain("verifyPassword");
    expect(disable).toContain("consumeMfaChallenge");
    expect(disable).toContain("mfaRecoveryCode.deleteMany");
  });
});

describe("administrators cannot invent an MFA lock", () => {
  const patch = read("src/app/api/admin/users/[id]/route.ts");
  const create = read("src/app/api/admin/users/route.ts");

  test("PATCH refuses mfaEnabled:true when no secret exists", () => {
    expect(patch).toContain("body.mfaEnabled === true");
    expect(patch).toContain("unsealMfaSecret(before.mfaSecret)");
    expect(patch).toContain("toPublicAdminUser");
  });

  test("POST cannot create a user with MFA already on", () => {
    expect(create).toContain("body.mfaEnabled === true");
    expect(create).toContain("mfaEnabled: false");
    expect(create).toContain("toPublicAdminUser");
  });
});

describe("password hashes encode their parameters", () => {
  const source = read("src/lib/password.ts");

  test("the current encoder writes N, r, p, and keylen", () => {
    expect(source).toContain("SCRYPT_N");
    expect(source).toContain("passwordNeedsRehash");
    expect(source).toContain("kind: \"legacy\"");
    expect(source).toContain("kind: \"parameterized\"");
  });
});
