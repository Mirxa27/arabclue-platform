/**
 * Which AI SDK model the platform agent builds for each provider type.
 *
 * `createOpenAI(...)(modelId)` in the installed `@ai-sdk/openai` is the
 * *Responses* API (`provider.languageModel = createResponsesModel`,
 * node_modules/@ai-sdk/openai/dist/index.js). OpenAI and Azure OpenAI v1 serve
 * `/responses`; Gemini's compatibility layer, Bedrock, DeepSeek, Groq and the
 * other OpenAI-compatible vendors document `/chat/completions` only, so they
 * must get the chat model or every platform-agent turn 404s.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

let activeRow: {
  provider: string;
  modelId: string;
  apiKeyEnvKey: string | null;
  apiBase: string | null;
} = { provider: "openai", modelId: "gpt-4.1", apiKeyEnvKey: "OPENAI_API_KEY", apiBase: null };

mock.module("../llm", () => ({
  getProviderForEngine: mock(() => Promise.resolve(activeRow)),
}));

mock.module("../env-settings", () => ({
  resolveProviderApiKey: mock(() => Promise.resolve("test-key")),
}));

const gatewayStub = Object.assign(mock(() => ({})), {
  textEmbeddingModel: mock(() => ({})),
});
mock.module("ai", () => ({
  gateway: gatewayStub,
  embed: mock(() => Promise.resolve({ embedding: [] })),
  generateText: mock(() => Promise.resolve({ text: "", usage: {} })),
  streamObject: mock(() => ({ elementStream: (async function* () {})() })),
}));

const GATEWAY_ENV = ["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN", "AI_GATEWAY_OIDC"] as const;
const saved = new Map<string, string | undefined>();

beforeEach(() => {
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

async function resolveFor(row: typeof activeRow) {
  activeRow = row;
  const { resolvePlatformAgentModel } = await import("../agents/platform/model");
  const resolved = await resolvePlatformAgentModel();
  const model = resolved.model as { provider: string; modelId: string };
  return { ...resolved, model };
}

describe("resolvePlatformAgentModel picks the API each vendor serves", () => {
  test("OpenAI keeps the Responses API", async () => {
    const { model } = await resolveFor({
      provider: "openai",
      modelId: "gpt-4.1",
      apiKeyEnvKey: "OPENAI_API_KEY",
      apiBase: "https://api.openai.com/v1",
    });
    expect(model.provider).toBe("openai.responses");
    expect(model.modelId).toBe("gpt-4.1");
  });

  test("Azure OpenAI v1 keeps the Responses API", async () => {
    const { model } = await resolveFor({
      provider: "azure_openai",
      modelId: "my-deployment",
      apiKeyEnvKey: "AZURE_OPENAI_API_KEY",
      apiBase: "https://contoso.openai.azure.com",
    });
    expect(model.provider).toBe("openai.responses");
  });

  test.each([
    ["google", "gemini-2.5-flash", "https://generativelanguage.googleapis.com/v1beta"],
    ["aws_bedrock", "openai.gpt-oss-120b", "https://bedrock-runtime.us-east-1.amazonaws.com"],
    ["openai_compatible", "deepseek-chat", "https://api.deepseek.com/v1"],
    ["mistral", "mistral-large-latest", null],
    ["zai", "glm-4.6", "https://api.z.ai/api/paas/v4"],
    ["ollama", "llama3", null],
  ])("%s uses chat completions", async (provider, modelId, apiBase) => {
    const resolved = await resolveFor({
      provider,
      modelId,
      apiKeyEnvKey: null,
      apiBase,
    });
    expect(resolved.model.provider).toBe("openai.chat");
    expect(resolved.model.modelId).toBe(modelId);
    expect(resolved.providerLabel).toBe(provider);
  });
});
