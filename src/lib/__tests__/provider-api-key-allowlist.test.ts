/**
 * Guard tests for the provider credential env allowlist.
 *
 * A provider connection carries an administrator-supplied `apiKeyEnvKey` that
 * is resolved against `process.env` and then sent as a bearer token to the
 * connection's `apiBase`. Without a positive allowlist that reads any variable
 * in the process, which turns one admin session into exfiltration of
 * `NEXTAUTH_SECRET`, `ARABCLUE_ENC_KEY`, or `DATABASE_URL`.
 *
 * The named-secret cases below are the point of the test: they must stay
 * rejected even as new secrets are introduced, which is why the implementation
 * is an allowlist and not a denylist.
 */
import { describe, expect, test } from "bun:test";
import {
  PROVIDER_API_KEY_ENV_BASES,
  defaultApiKeyEnvKey,
  isAllowedProviderApiKeyEnv,
} from "@/lib/llm/model-catalog";

describe("isAllowedProviderApiKeyEnv", () => {
  test.each([
    "OPENAI_API_KEY",
    "AZURE_OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "MISTRAL_API_KEY",
    "ZAI_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GOOGLE_API_KEY",
    "GEMINI_API_KEY",
  ])("accepts the provider credential slot %s", (key) => {
    expect(isAllowedProviderApiKeyEnv(key)).toBe(true);
  });

  test.each([
    "OPENAI_API_KEY_TEAM_B",
    "ANTHROPIC_API_KEY_EU",
    "GOOGLE_API_KEY_SANDBOX",
  ])("accepts the multi-account suffix form %s", (key) => {
    expect(isAllowedProviderApiKeyEnv(key)).toBe(true);
  });

  test.each([
    "NEXTAUTH_SECRET",
    "ARABCLUE_ENC_KEY",
    "DATABASE_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL_NON_POOLING",
    "CRON_SECRET",
    "MYFATOORAH_API_KEY",
    "MYFATOORAH_WEBHOOK_SECRET",
    "RESEND_API_KEY",
    "BLOB_READ_WRITE_TOKEN",
    "REDIS_URL",
    "WEBHOOK_URL",
    "BOOTSTRAP_ADMIN_PASSWORD",
  ])("rejects the platform secret %s", (key) => {
    expect(isAllowedProviderApiKeyEnv(key)).toBe(false);
  });

  test.each([null, undefined, "", "   "])("rejects empty input %p", (key) => {
    expect(isAllowedProviderApiKeyEnv(key as string | null | undefined)).toBe(
      false
    );
  });

  test("rejects lowercase and mixed case rather than normalising them", () => {
    // Normalising would let `database_url` through to a case-insensitive lookup
    // on platforms that tolerate it.
    expect(isAllowedProviderApiKeyEnv("openai_api_key")).toBe(false);
    expect(isAllowedProviderApiKeyEnv("OpenAI_Api_Key")).toBe(false);
  });

  test("rejects a prefix match that is not a full segment", () => {
    // `OPENAI_API_KEYCHAIN` shares a prefix but is a different variable.
    expect(isAllowedProviderApiKeyEnv("OPENAI_API_KEYCHAIN")).toBe(false);
  });

  test("rejects a secret that merely contains an allowed base", () => {
    expect(isAllowedProviderApiKeyEnv("MY_OPENAI_API_KEY")).toBe(false);
  });

  test("every default provider key the catalog emits is itself allowed", () => {
    // Guards against a new provider whose default key would be rejected by the
    // very allowlist that is supposed to permit it.
    const providers = [
      "openai",
      "openai_compatible",
      "azure_openai",
      "anthropic",
      "mistral",
      "zai",
      "google",
    ];
    for (const provider of providers) {
      const key = defaultApiKeyEnvKey(provider);
      if (!key) continue;
      expect(isAllowedProviderApiKeyEnv(key)).toBe(true);
    }
  });

  test("the allowlist is non-empty and frozen", () => {
    expect(PROVIDER_API_KEY_ENV_BASES.length).toBeGreaterThan(0);
    expect(Object.isFrozen(PROVIDER_API_KEY_ENV_BASES)).toBe(true);
  });
});
