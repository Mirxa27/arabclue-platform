/**
 * Guard tests for environment-setting secrecy.
 *
 * Two separate paths let an ADMIN read a platform secret in plaintext:
 *
 * 1. Secrecy was derived from a naming heuristic
 *    (`includes("KEY") || includes("SECRET") || includes("PASSWORD")`), which
 *    classified DATABASE_URL, REDIS_URL and BLOB_READ_WRITE_TOKEN as
 *    non-secret — served unmasked, with no reveal audit.
 * 2. The PATCH handler accepted `isSecret: false` on any key, so an ADMIN could
 *    downgrade NEXTAUTH_SECRET and then read it from the list endpoint,
 *    sidestepping the SUPER_ADMIN reveal gate.
 *
 * As with the provider credential allowlist, this is a positive allowlist:
 * a denylist silently fails to protect every key added after it is written.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ENV_CATALOG,
  NON_SECRET_ENV_KEYS,
  isSecretEnvKey,
} from "@/lib/constants";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

describe("isSecretEnvKey", () => {
  test.each([
    "DATABASE_URL",
    "POSTGRES_PRISMA_URL",
    "REDIS_URL",
    "BLOB_READ_WRITE_TOKEN",
    "WEBHOOK_URL",
    "VECTOR_DB_URL",
    "NEXTAUTH_SECRET",
    "ARABCLUE_ENC_KEY",
    "JWT_SECRET",
    "CRON_SECRET",
    "MYFATOORAH_API_KEY",
    "MYFATOORAH_WEBHOOK_SECRET",
    "RESEND_API_KEY",
    "OPENAI_API_KEY",
  ])("treats %s as secret", (key) => {
    expect(isSecretEnvKey(key)).toBe(true);
  });

  test.each([...NON_SECRET_ENV_KEYS])(
    "treats the allowlisted key %s as displayable",
    (key) => {
      expect(isSecretEnvKey(key)).toBe(false);
    }
  );

  test("an unknown key defaults to secret", () => {
    // Fail closed: a key introduced later must not leak before someone
    // deliberately allowlists it.
    expect(isSecretEnvKey("SOME_FUTURE_INTEGRATION_TOKEN")).toBe(true);
    expect(isSecretEnvKey("ANYTHING_AT_ALL")).toBe(true);
  });

  test("every catalog key is classified", () => {
    for (const entry of ENV_CATALOG) {
      expect(typeof isSecretEnvKey(entry.key)).toBe("boolean");
    }
  });

  test("the allowlist contains nothing credential-shaped", () => {
    for (const key of NON_SECRET_ENV_KEYS) {
      expect(key).not.toMatch(/SECRET|PASSWORD|_KEY$|TOKEN/);
    }
  });
});

describe("the list endpoint cannot be tricked into revealing", () => {
  const source = read("src/app/api/admin/env/route.ts");

  test("effective secrecy ORs the stored flag with the allowlist verdict", () => {
    expect(source).toContain("s.isSecret || isSecretEnvKey(s.key)");
  });

  test("masking and the isMasked flag both use the effective value", () => {
    expect(source).toContain("value: secret && !reveal ? maskSecret(plain) : plain");
    expect(source).toContain("isMasked: secret && !reveal");
  });
});

describe("secrecy cannot be downgraded by PATCH", () => {
  const source = read("src/app/api/admin/env/[key]/route.ts");

  test("a downgrade below the allowlist verdict is rejected", () => {
    expect(source).toContain("ENV_SECRECY_REQUIRED");
    expect(source).toContain("requestedSecret === false && nextSecret === true");
  });

  test("the stored value is raised, never lowered", () => {
    expect(source).toContain("requestedSecret || isSecretEnvKey(key)");
  });

  test("the metadata branch now writes an audit entry", () => {
    expect(source).toContain('action: "METADATA_UPDATE"');
  });
});

describe("bootstrap seeds secrecy from the allowlist", () => {
  const source = read("src/lib/bootstrap.ts");

  test("no naming heuristic remains", () => {
    expect(source).not.toContain('e.key.includes("KEY")');
    expect(source).toContain("isSecret: isSecretEnvKey(e.key)");
  });
});
