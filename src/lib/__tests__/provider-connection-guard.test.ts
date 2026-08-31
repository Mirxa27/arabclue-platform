import { describe, expect, test } from "bun:test";
import { providerConnectionGuardError } from "@/lib/llm/provider-connection-guard";

/**
 * The admin provider write paths (POST /api/admin/ai-providers, PATCH
 * /api/admin/ai-providers/[id]) and the model-fetch endpoint all persist or act
 * on the same two administrator-supplied fields. This guard is the single place
 * both rules live: the credential must name a provider slot, and it must only
 * be reachable by the vendor it belongs to.
 */

describe("providerConnectionGuardError", () => {
  test("accepts a canonical vendor connection", () => {
    expect(
      providerConnectionGuardError({
        provider: "openai",
        apiBase: "https://api.openai.com/v1",
        apiKeyEnvKey: "OPENAI_API_KEY",
      })
    ).toBeNull();
  });

  test("accepts a bring-your-own-gateway connection on a public host", () => {
    expect(
      providerConnectionGuardError({
        provider: "openai_compatible",
        apiBase: "https://gateway.mycompany.example/v1",
        apiKeyEnvKey: "OPENROUTER_API_KEY_TEAM_B",
      })
    ).toBeNull();
  });

  test("accepts the keyless local ollama connection", () => {
    expect(
      providerConnectionGuardError({
        provider: "ollama",
        apiBase: "http://127.0.0.1:11434/v1",
        apiKeyEnvKey: null,
      })
    ).toBeNull();
  });

  test("rejects an env key outside the provider credential allowlist", async () => {
    const res = providerConnectionGuardError({
      provider: "openai",
      apiBase: "https://api.openai.com/v1",
      apiKeyEnvKey: "NEXTAUTH_SECRET",
    });

    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    const body = (await res!.json()) as { code: string };
    expect(body.code).toBe("api_key_env_not_allowed");
  });

  test("rejects a canonical credential pointed at an attacker host", async () => {
    const res = providerConnectionGuardError({
      provider: "openai",
      apiBase: "https://attacker.example/v1",
      apiKeyEnvKey: "OPENAI_API_KEY",
    });

    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    const body = (await res!.json()) as { code: string; error: string };
    expect(body.code).toBe("api_base_not_allowed");
    expect(body.error).toMatch(/OPENAI_API_KEY/);
  });

  test("rejects a private-network base for a gateway credential", async () => {
    const res = providerConnectionGuardError({
      provider: "openai_compatible",
      apiBase: "https://169.254.169.254/latest",
      apiKeyEnvKey: "OPENROUTER_API_KEY_TEAM_B",
    });

    expect(res).not.toBeNull();
    const body = (await res!.json()) as { code: string };
    expect(body.code).toBe("api_base_not_allowed");
  });

  test("rejects a provider whose default credential would reach an attacker host", () => {
    // No apiKeyEnvKey supplied: `resolveProviderApiKey` falls back to
    // ANTHROPIC_API_KEY, so the connection is still a credential leak.
    expect(
      providerConnectionGuardError({
        provider: "anthropic",
        apiBase: "https://attacker.example",
        apiKeyEnvKey: null,
      })
    ).not.toBeNull();
  });
});
