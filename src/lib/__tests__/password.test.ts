import { describe, expect, test } from "bun:test";
import { hashPassword, verifyPassword, getBootstrapAdminPassword } from "../password";

describe("hashPassword", () => {
  test("hashes a valid password with scrypt prefix", async () => {
    const hash = await hashPassword("StrongPass123!");
    expect(hash.startsWith("scrypt$")).toBe(true);
    const parts = hash.split("$");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("scrypt");
    expect(parts[1].length).toBe(32); // 16 bytes hex
    expect(parts[2].length).toBe(128); // 64 bytes hex
  });

  test("produces different salts for same password", async () => {
    const h1 = await hashPassword("StrongPass123!");
    const h2 = await hashPassword("StrongPass123!");
    expect(h1).not.toBe(h2);
  });

  test("rejects password shorter than 10 chars", async () => {
    await expect(hashPassword("short")).rejects.toThrow(
      "Password must be at least 10 characters"
    );
  });

  test("rejects empty password", async () => {
    await expect(hashPassword("")).rejects.toThrow(
      "Password must be at least 10 characters"
    );
  });

  test("accepts long password", async () => {
    const long = "A".repeat(200);
    const hash = await hashPassword(long);
    expect(hash.startsWith("scrypt$")).toBe(true);
  });
});

describe("verifyPassword", () => {
  test("verifies a correct password", async () => {
    const hash = await hashPassword("StrongPass123!");
    expect(await verifyPassword("StrongPass123!", hash)).toBe(true);
  });

  test("rejects wrong password", async () => {
    const hash = await hashPassword("StrongPass123!");
    expect(await verifyPassword("WrongPassword!", hash)).toBe(false);
  });

  test("returns false for empty plain", async () => {
    const hash = await hashPassword("StrongPass123!");
    expect(await verifyPassword("", hash)).toBe(false);
  });

  test("returns false for empty hash", async () => {
    expect(await verifyPassword("StrongPass123!", "")).toBe(false);
  });

  test("returns false for demo/placeholder hashes", async () => {
    expect(await verifyPassword("StrongPass123!", "$argon2id$demo$abc")).toBe(
      false
    );
    expect(await verifyPassword("StrongPass123!", "placeholder_hash")).toBe(
      false
    );
  });

  test("returns false for unknown hash format", async () => {
    expect(await verifyPassword("StrongPass123!", "bcrypt$abc$def")).toBe(
      false
    );
  });

  test("returns false for malformed scrypt hash", async () => {
    expect(await verifyPassword("StrongPass123!", "scrypt$onlyonepart")).toBe(
      false
    );
    expect(await verifyPassword("StrongPass123!", "scrypt$$")).toBe(false);
  });
});

describe("getBootstrapAdminPassword", () => {
  test("returns password when env is set and valid", () => {
    const prev = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "BootstrapPass123!";
    try {
      expect(getBootstrapAdminPassword()).toBe("BootstrapPass123!");
    } finally {
      if (prev === undefined) delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
      else process.env.BOOTSTRAP_ADMIN_PASSWORD = prev;
    }
  });

  test("returns null when env is not set", () => {
    const prev = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    try {
      expect(getBootstrapAdminPassword()).toBeNull();
    } finally {
      if (prev !== undefined) process.env.BOOTSTRAP_ADMIN_PASSWORD = prev;
    }
  });

  test("returns null when password is shorter than 10 chars", () => {
    const prev = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "short";
    try {
      expect(getBootstrapAdminPassword()).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
      else process.env.BOOTSTRAP_ADMIN_PASSWORD = prev;
    }
  });

  test("trims whitespace before validation", () => {
    const prev = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "  BootstrapPass123!  ";
    try {
      expect(getBootstrapAdminPassword()).toBe("BootstrapPass123!");
    } finally {
      if (prev === undefined) delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
      else process.env.BOOTSTRAP_ADMIN_PASSWORD = prev;
    }
  });
});
