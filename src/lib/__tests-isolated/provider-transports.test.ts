/**
 * `generateCompletion` and `embedText` against every OpenAI-compatible provider
 * type, observed at the network boundary: the URL that is dialled, the auth
 * headers, and the `model` field. Only the database row and `fetch` are stood
 * in; the dispatch, target resolution, request shaping and stream parsing are
 * the shipped code.
 *
 * Before this suite, `google` rows failed with "Unsupported provider", Azure
 * rows were dialled at whatever path the admin typed (never the `/openai/v1`
 * root, never with `api-key`), and `aws_bedrock` did not exist.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

type Row = {
  provider: string;
  apiBase: string | null;
  apiKeyEnvKey: string | null;
  modelId: string;
  engine?: string;
  enginesJson?: string | null;
};

let activeRow: Row | null = null;

function providerRow(row: Row) {
  return {
    id: "row",
    name: "Test connection",
    engine: row.engine ?? "DEFAULT",
    enginesJson: row.enginesJson ?? JSON.stringify([row.engine ?? "DEFAULT"]),
    isActive: true,
    isDefault: false,
    priority: 0,
    contextWindow: 128000,
    supportsVision: false,
    supportsJsonMode: true,
    supportsTools: false,
    temperature: 0.2,
    maxTokens: 4096,
    topP: 0.9,
    frequencyPenalty: 0,
    presencePenalty: 0,
    confidenceThreshold: 0.5,
    toxicityFilter: false,
    piiFilter: false,
    hallucinationGuard: false,
    maxRetries: 0,
    timeoutMs: 10_000,
    inputCostPer1k: 0,
    outputCostPer1k: 0,
    modelsCacheJson: null,
    modelsFetchedAt: null,
    metadata: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...row,
  };
}

mock.module("../db", () => ({
  db: {
    aIProviderConfig: {
      findMany: mock(() => Promise.resolve(activeRow ? [providerRow(activeRow)] : [])),
    },
    envSetting: {
      findUnique: mock(() => Promise.resolve(null)),
    },
  },
}));

type Captured = { url: string; headers: Record<string, string>; body: Record<string, unknown> };
const calls: Captured[] = [];
const originalFetch = globalThis.fetch;

const CREDENTIAL_VARS = [
  "AZURE_OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "AWS_BEARER_TOKEN_BEDROCK",
  "OPENAI_API_KEY",
] as const;
const GATEWAY_VARS = ["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN", "AI_GATEWAY_OIDC"] as const;
const savedEnv = new Map<string, string | undefined>();

const COMPLETION_TEXT =
  "The technical approach covers migration, integration testing and handover, with weekly steering reviews.";

let generateCompletion: typeof import("../llm").generateCompletion;
let embedText: typeof import("../llm").embedText;

beforeAll(async () => {
  for (const name of [...CREDENTIAL_VARS, ...GATEWAY_VARS, "ARABCLUE_LLM_DETERMINISTIC"]) {
    savedEnv.set(name, process.env[name]);
  }
  for (const name of GATEWAY_VARS) delete process.env[name];
  delete process.env.ARABCLUE_LLM_DETERMINISTIC;
  for (const name of CREDENTIAL_VARS) process.env[name] = `secret-${name.toLowerCase()}`;

  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ url: String(input), headers, body });

    if (String(input).endsWith("/embeddings")) {
      return Response.json({ data: [{ embedding: [0.1, 0.2, 0.3] }] });
    }
    if (body.stream === true) {
      const chunks = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: COMPLETION_TEXT }, finish_reason: null }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { total_tokens: 42 } })}\n\n`,
        "data: [DONE]\n\n",
      ];
      return new Response(chunks.join(""), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }
    return Response.json({
      choices: [{ message: { role: "assistant", content: COMPLETION_TEXT }, finish_reason: "stop" }],
      usage: { total_tokens: 42 },
    });
  }) as unknown as typeof fetch;

  ({ generateCompletion, embedText } = await import("../llm"));
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

beforeEach(() => {
  calls.length = 0;
});

const MESSAGES = [
  { role: "system" as const, content: "You are a bid writer." },
  { role: "user" as const, content: "Summarise the technical approach." },
];

describe("Azure OpenAI", () => {
  test("a bare resource endpoint is dialled at /openai/v1/chat/completions with api-key auth", async () => {
    activeRow = {
      provider: "azure_openai",
      apiBase: "https://contoso.openai.azure.com",
      apiKeyEnvKey: "AZURE_OPENAI_API_KEY",
      modelId: "gpt-4.1-mini",
    };

    const result = await generateCompletion(MESSAGES);

    expect(result.fallback).toBe(false);
    expect(result.provider).toBe("azure_openai");
    expect(result.content).toBe(COMPLETION_TEXT);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://contoso.openai.azure.com/openai/v1/chat/completions");
    expect(calls[0].headers["api-key"]).toBe("secret-azure_openai_api_key");
    expect(calls[0].headers.authorization).toBe("Bearer secret-azure_openai_api_key");
    expect(calls[0].body.model).toBe("gpt-4.1-mini");
  });

  test("a legacy deployments URL still reaches v1, with the deployment as the model", async () => {
    activeRow = {
      provider: "azure_openai",
      apiBase: "https://contoso.openai.azure.com/openai/deployments/prod-gpt4o",
      apiKeyEnvKey: "AZURE_OPENAI_API_KEY",
      modelId: "gpt-4o",
    };

    const result = await generateCompletion(MESSAGES);

    expect(result.fallback).toBe(false);
    expect(calls[0].url).toBe("https://contoso.openai.azure.com/openai/v1/chat/completions");
    expect(calls[0].body.model).toBe("prod-gpt4o");
  });
});

describe("Google Gemini", () => {
  test("chat goes to the OpenAI-compatibility root with a bearer token, streaming when asked", async () => {
    activeRow = {
      provider: "google",
      apiBase: "https://generativelanguage.googleapis.com/v1beta",
      apiKeyEnvKey: "GOOGLE_GENERATIVE_AI_API_KEY",
      modelId: "gemini-2.5-flash",
    };
    const deltas: string[] = [];

    const result = await generateCompletion(MESSAGES, { onDelta: (t) => deltas.push(t) });

    expect(result.fallback).toBe(false);
    expect(result.provider).toBe("google");
    expect(result.content).toBe(COMPLETION_TEXT);
    expect(deltas.join("")).toBe(COMPLETION_TEXT);
    expect(calls[0].url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    );
    expect(calls[0].headers.authorization).toBe("Bearer secret-google_generative_ai_api_key");
    expect(calls[0].url).not.toContain("key=");
    expect(calls[0].body.model).toBe("gemini-2.5-flash");
    expect(calls[0].body.stream).toBe(true);
    // Not documented for the Gemini compat layer; only OpenAI-family vendors get it.
    expect(calls[0].body.stream_options).toBeUndefined();
  });

  test("embeddings go to the compat /embeddings endpoint", async () => {
    activeRow = {
      provider: "google",
      apiBase: null,
      apiKeyEnvKey: "GOOGLE_GENERATIVE_AI_API_KEY",
      modelId: "gemini-embedding-001",
      engine: "EMBEDDING",
    };

    const vector = await embedText("tender scope");

    expect(vector).toEqual([0.1, 0.2, 0.3]);
    expect(calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/embeddings");
    expect(calls[0].headers.authorization).toBe("Bearer secret-google_generative_ai_api_key");
    expect(calls[0].body.model).toBe("gemini-embedding-001");
  });
});

describe("Amazon Bedrock", () => {
  test("a regional runtime host is dialled at /openai/v1/chat/completions with the bearer token", async () => {
    activeRow = {
      provider: "aws_bedrock",
      apiBase: "https://bedrock-runtime.eu-central-1.amazonaws.com",
      apiKeyEnvKey: null,
      modelId: "openai.gpt-oss-120b",
    };

    const result = await generateCompletion(MESSAGES);

    expect(result.fallback).toBe(false);
    expect(result.provider).toBe("aws_bedrock");
    expect(calls[0].url).toBe(
      "https://bedrock-runtime.eu-central-1.amazonaws.com/openai/v1/chat/completions"
    );
    expect(calls[0].headers.authorization).toBe("Bearer secret-aws_bearer_token_bedrock");
    expect(calls[0].body.model).toBe("openai.gpt-oss-120b");
  });

  test("no base at all means the documented us-east-1 runtime root", async () => {
    activeRow = {
      provider: "aws_bedrock",
      apiBase: null,
      apiKeyEnvKey: "AWS_BEARER_TOKEN_BEDROCK",
      modelId: "openai.gpt-oss-20b",
    };

    await generateCompletion(MESSAGES);

    expect(calls[0].url).toBe(
      "https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/chat/completions"
    );
  });
});

describe("an unknown provider type is still refused, not guessed", () => {
  test("reports the failure instead of dialling anything", async () => {
    activeRow = {
      provider: "made_up_vendor",
      apiBase: "https://api.example",
      apiKeyEnvKey: "OPENAI_API_KEY",
      modelId: "m",
    };

    const result = await generateCompletion(MESSAGES);

    expect(result.fallback).toBe(true);
    expect(calls).toHaveLength(0);
  });
});
