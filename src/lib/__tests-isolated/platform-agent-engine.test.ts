/**
 * Which engine a platform-agent caller asks for.
 *
 * `AGENT_ENGINES` exists so an admin can point each kind of work at its own
 * model, and `/api/ready` reports all ten as credentialed. But every caller
 * went through `resolvePlatformAgentModel()`, which asked for `DEFAULT` and
 * nothing else — so a REWRITE connection configured in Admin → AI Providers was
 * accepted, reported healthy, and never used. The co-pilot is the clearest
 * case: proposing replacement text for a sentence *is* section rewriting.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

/** Every engine `getProviderForEngine` was asked for, in order. */
const engineCalls: string[] = [];

mock.module("../llm", () => ({
  getProviderForEngine: mock((engine: string) => {
    engineCalls.push(engine);
    return Promise.resolve({
      provider: "openai",
      modelId: "test-model",
      apiKeyEnvKey: "OPENAI_API_KEY",
      apiBase: "https://api.openai.com/v1",
    });
  }),
}));

mock.module("../env-settings", () => ({
  resolveProviderApiKey: mock(() => Promise.resolve("test-key")),
}));

// No provider is contacted here: the question is which engine was requested,
// not what a model answers. `gateway.ts` is in this module graph and imports
// the whole transport surface, so a partial stand-in would fail to link.
const gatewayStub = Object.assign(mock(() => ({})), {
  textEmbeddingModel: mock(() => ({})),
});
mock.module("ai", () => ({
  gateway: gatewayStub,
  embed: mock(() => Promise.resolve({ embedding: [] })),
  generateText: mock(() => Promise.resolve({ text: "", usage: {} })),
  streamObject: mock(() => ({
    elementStream: (async function* () {})(),
  })),
}));

const GATEWAY_ENV = [
  "AI_GATEWAY_API_KEY",
  "VERCEL_OIDC_TOKEN",
  "AI_GATEWAY_OIDC",
] as const;
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  engineCalls.length = 0;
  // The gateway branch short-circuits before any engine is resolved, so it has
  // to be absent for this to observe anything at all.
  for (const key of GATEWAY_ENV) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of GATEWAY_ENV) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("resolvePlatformAgentModel", () => {
  test("still resolves DEFAULT when the caller does not name an engine", async () => {
    const { resolvePlatformAgentModel } = await import("../agents/platform/model");
    await resolvePlatformAgentModel();
    expect(engineCalls).toEqual(["DEFAULT"]);
  });

  test("resolves the engine the caller names", async () => {
    const { resolvePlatformAgentModel } = await import("../agents/platform/model");
    await resolvePlatformAgentModel("REWRITE");
    expect(engineCalls).toEqual(["REWRITE"]);
  });
});

describe("openCopilotSuggestionStream", () => {
  test("asks for the section-rewrite engine, not the default one", async () => {
    const { openCopilotSuggestionStream } = await import("../ai/copilot-suggestions");
    const stream = await openCopilotSuggestionStream({
      contentMd: "The vendor shall deliver the system.",
      locale: "en",
      docKind: "proposal",
    });
    // Drain it so the pass has actually run before asserting on it.
    const reader = stream.getReader();
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }
    expect(engineCalls).toEqual(["REWRITE"]);
  });
});
