/**
 * Security contract: `fetchLiveProviderModels` must refuse an administrator-
 * supplied `apiBase` that the resolved credential does not belong to, and must
 * refuse it *before* dispatching any request.
 *
 * Historical hole: POST /api/admin/ai-providers/models with
 * `{ provider: "openai", apiBase: "https://attacker.example" }` resolved the
 * platform's real OPENAI_API_KEY and sent it as a Bearer token to the attacker
 * host. Google is worse still — that provider puts the key in the URL query.
 *
 * Credentials are supplied through `process.env`, which `getDecryptedEnv` reads
 * before the database. Mocking `@/lib/env-settings` here would replace
 * `getDecryptedEnv` for every other suite sharing this process.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

const fetchCalls: string[] = [];
const originalFetch = globalThis.fetch;
const CREDENTIAL_VARS = [
  "OPENAI_API_KEY",
  "OPENAI_API_KEY_GATEWAY",
  "GEMINI_API_KEY",
] as const;
const previousEnv = new Map<string, string | undefined>();

let fetchLiveProviderModels: typeof import("@/lib/llm/fetch-models").fetchLiveProviderModels;

beforeAll(async () => {
  for (const name of CREDENTIAL_VARS) {
    previousEnv.set(name, process.env[name]);
    process.env[name] = `sk-${name.toLowerCase()}`;
  }

  globalThis.fetch = mock(async (input: RequestInfo | URL) => {
    fetchCalls.push(String(input));
    return new Response(JSON.stringify({ data: [{ id: "gpt-4o" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;

  ({ fetchLiveProviderModels } = await import("@/lib/llm/fetch-models"));
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of previousEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

beforeEach(() => {
  fetchCalls.length = 0;
});

describe("fetchLiveProviderModels credential-origin enforcement", () => {
  test("refuses an attacker apiBase for openai without dispatching a request", async () => {
    await expect(
      fetchLiveProviderModels({
        provider: "openai",
        apiBase: "https://attacker.example/v1",
        apiKeyEnvKey: null,
      })
    ).rejects.toThrow(/OPENAI_API_KEY may only be sent to/);

    expect(fetchCalls).toHaveLength(0);
  });

  test("refuses an attacker apiBase for google without leaking the key in a URL", async () => {
    await expect(
      fetchLiveProviderModels({
        provider: "google",
        apiBase: "https://attacker.example/v1beta",
        apiKeyEnvKey: "GEMINI_API_KEY",
      })
    ).rejects.toThrow(/GEMINI_API_KEY may only be sent to/);

    expect(fetchCalls).toHaveLength(0);
  });

  test("refuses a private-network apiBase even for a bring-your-own-gateway key", async () => {
    await expect(
      fetchLiveProviderModels({
        provider: "openai_compatible",
        apiBase: "https://169.254.169.254/latest",
        apiKeyEnvKey: "OPENAI_API_KEY_GATEWAY",
      })
    ).rejects.toThrow(/loopback, private, or internal/);

    expect(fetchCalls).toHaveLength(0);
  });

  test("allows the canonical vendor origin and dispatches", async () => {
    const result = await fetchLiveProviderModels({
      provider: "openai",
      apiBase: "https://api.openai.com/v1",
      apiKeyEnvKey: "OPENAI_API_KEY",
    });

    expect(result.models.map((m) => m.id)).toContain("gpt-4o");
    expect(fetchCalls).toEqual(["https://api.openai.com/v1/models"]);
  });

  test("allows a suffixed operator credential to reach a public gateway", async () => {
    // The named credential is the only one that resolves — `resolveProviderApiKey`
    // does not substitute the canonical `OPENAI_API_KEY` — so a bring-your-own
    // gateway stays supported without putting the platform key on the wire.
    const result = await fetchLiveProviderModels({
      provider: "openai",
      apiBase: "https://gateway.mycompany.example/v1",
      apiKeyEnvKey: "OPENAI_API_KEY_GATEWAY",
    });

    expect(result.models.map((m) => m.id)).toContain("gpt-4o");
    expect(fetchCalls).toEqual(["https://gateway.mycompany.example/v1/models"]);
  });

  test("allows a keyless local gateway (ollama) to keep working", async () => {
    const result = await fetchLiveProviderModels({
      provider: "ollama",
      apiBase: "http://127.0.0.1:11434/v1",
      apiKeyEnvKey: null,
    });

    expect(result.source).toBe("ollama");
    expect(fetchCalls).toEqual(["http://127.0.0.1:11434/v1/models"]);
  });
});
