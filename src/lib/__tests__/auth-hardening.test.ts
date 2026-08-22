import { describe, expect, test } from "bun:test";
import { generateSync } from "otplib";
import {
  classifyMfaToken,
  formatRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  isRecoveryCodeToken,
  isTotpToken,
  normalizeRecoveryCode,
} from "../mfa-recovery";
import {
  isSealedMfaSecret,
  mfaSecretNeedsReseal,
  sealMfaSecret,
  unsealMfaSecret,
} from "../mfa-secret";
import {
  generateMfaSecret,
  MFA_PERIOD_SECONDS,
  verifyMfaToken,
  verifyMfaTokenDetailed,
} from "../mfa";
import {
  extractClientIp,
  loginRateLimitKeys,
  sanitizeClientIp,
} from "../login-rate-limit";
import { toPublicAdminUser } from "../admin-user-public";

describe("MFA secret sealing", () => {
  test("round-trips a live secret and marks plaintext for reseal", () => {
    const plain = generateMfaSecret();
    const sealed = sealMfaSecret(plain);
    expect(isSealedMfaSecret(sealed)).toBe(true);
    expect(unsealMfaSecret(sealed)).toBe(plain);
    expect(mfaSecretNeedsReseal(sealed)).toBe(false);
    expect(unsealMfaSecret(plain)).toBe(plain);
    expect(mfaSecretNeedsReseal(plain)).toBe(true);
  });

  test("does not treat a base32 secret as ciphertext", () => {
    expect(isSealedMfaSecret("JBSWY3DPEHPK3PXP")).toBe(false);
    expect(unsealMfaSecret(null)).toBeNull();
    expect(unsealMfaSecret("")).toBeNull();
  });
});

describe("TOTP window and replay", () => {
  test("accepts the current step and rejects the same step again", () => {
    const secret = generateMfaSecret();
    const nowMs = Date.now();
    const epoch = Math.floor(nowMs / 1000);
    const token = generateSync({ secret, epoch, period: MFA_PERIOD_SECONDS });
    const first = verifyMfaTokenDetailed(secret, token, { nowMs });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const replay = verifyMfaTokenDetailed(secret, token, {
      nowMs,
      lastUsedStep: first.step,
    });
    expect(replay).toEqual({ ok: false, reason: "replay" });
    expect(verifyMfaToken(secret, "000000")).toBe(false);
  });
});

describe("recovery codes", () => {
  test("issues unique dashed codes and hashes them per user", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/);
      expect(isRecoveryCodeToken(code)).toBe(true);
      expect(isTotpToken(code)).toBe(false);
    }
    const a = hashRecoveryCode("user-1", codes[0]);
    const b = hashRecoveryCode("user-1", normalizeRecoveryCode(codes[0]));
    const otherUser = hashRecoveryCode("user-2", codes[0]);
    expect(a).toBe(b);
    expect(a).not.toBe(otherUser);
  });

  test("classifies TOTP, recovery, and garbage", () => {
    expect(classifyMfaToken("123456")).toBe("totp");
    expect(classifyMfaToken("a1b2c-d3e4f")).toBe("recovery");
    expect(classifyMfaToken(formatRecoveryCode("0123456789"))).toBe("recovery");
    expect(classifyMfaToken("not-a-code")).toBe("unknown");
    expect(classifyMfaToken("")).toBe("unknown");
  });
});

describe("login rate-limit keys", () => {
  test("split the email dimension from the IP dimension", () => {
    expect(loginRateLimitKeys("Ada@Example.com", "203.0.113.9")).toEqual({
      emailKey: "login:email:ada@example.com",
      ipKey: "login:ip:203.0.113.9",
    });
  });

  test("reads the first X-Forwarded-For hop and sanitizes the key", () => {
    expect(
      extractClientIp({
        get: (name: string) =>
          name.toLowerCase() === "x-forwarded-for"
            ? "203.0.113.10, 10.0.0.1"
            : null,
      })
    ).toBe("203.0.113.10");
    expect(sanitizeClientIp("203.0.113.10\nlogin:email:victim")).toBe(
      "203.0.113.10"
    );
    expect(extractClientIp(undefined)).toBe("unknown");
  });
});

describe("admin user responses omit credential material", () => {
  test("strips hash, MFA secret, pending secret, and last-used step", () => {
    const publicUser = toPublicAdminUser({
      id: "u1",
      email: "ada@example.com",
      passwordHash: "scrypt$hide",
      mfaSecret: "sealed:or:plain",
      pendingMfaSecret: "pending",
      mfaLastUsedStep: 99,
      mfaEnabled: true,
    });
    expect(publicUser).toEqual({
      id: "u1",
      email: "ada@example.com",
      mfaEnabled: true,
    });
  });
});
