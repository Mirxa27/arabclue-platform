/**
 * One wire spec per provider type, so Azure OpenAI, Google Gemini and Amazon
 * Bedrock are reachable through the same OpenAI-compatible transport as
 * OpenAI, Mistral, Ollama and the bring-your-own gateways.
 *
 * Sources read on 2026-09-02:
 * - Azure OpenAI v1 API (learn.microsoft.com/azure/foundry/openai/api-version-lifecycle,
 *   ms.date 2026-05-13): base `https://RESOURCE.openai.azure.com/openai/v1/` (also
 *   `RESOURCE.services.ai.azure.com`), no `api-version`, key auth via the
 *   `api-key` header, Entra via `Authorization: Bearer`. The v1 OpenAPI spec
 *   (azure-rest-api-specs …/OpenAI.v1/azure-v1-v1-generated.json) lists
 *   `/models`, `/chat/completions`, `/embeddings` under `{endpoint}/openai/v1`.
 * - Amazon Bedrock Chat Completions API (docs.aws.amazon.com/bedrock/latest/userguide/
 *   inference-chat-completions-mantle.html): `https://bedrock-runtime.{region}.amazonaws.com/openai/v1`
 *   and `https://bedrock-mantle.{region}.api.aws/v1`, `Authorization: Bearer $AWS_BEARER_TOKEN_BEDROCK`,
 *   `GET …/models`, `stream: true` supported.
 * - Gemini OpenAI compatibility (ai.google.dev/gemini-api/docs/openai):
 *   `https://generativelanguage.googleapis.com/v1beta/openai/`, `Authorization: Bearer GEMINI_API_KEY`,
 *   `GET …/openai/models`, streaming supported.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LLM_PROVIDER_TYPES,
  PROVIDER_CONNECTION_TEMPLATES,
  assertProviderCredentialOrigin,
  defaultApiKeyEnvKey,
  isAllowedProviderApiKeyEnv,
} from "@/lib/llm/model-catalog";
import {
  isOpenAiCompatibleChatProvider,
  providerAuthHeaders,
  resolveOpenAiCompatibleTarget,
} from "@/lib/llm/provider-wire";
import { providerDisplayName } from "@/lib/ai/provider-label";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

describe("provider types", () => {
  test("Google and Amazon Bedrock are first-class provider types", () => {
    expect(LLM_PROVIDER_TYPES).toContain("google");
    expect(LLM_PROVIDER_TYPES).toContain("aws_bedrock");
    expect(LLM_PROVIDER_TYPES).toContain("azure_openai");
  });

  test("every provider type that speaks OpenAI chat completions is routed to that transport", () => {
    for (const pid of ["openai", "openai_compatible", "ollama", "azure_openai", "mistral", "zai", "google", "aws_bedrock"]) {
      expect(isOpenAiCompatibleChatProvider(pid)).toBe(true);
    }
    expect(isOpenAiCompatibleChatProvider("anthropic")).toBe(false);
    expect(isOpenAiCompatibleChatProvider("made_up")).toBe(false);
  });

  test("Bedrock reads the AWS-documented bearer token variable", () => {
    expect(defaultApiKeyEnvKey("aws_bedrock")).toBe("AWS_BEARER_TOKEN_BEDROCK");
    expect(isAllowedProviderApiKeyEnv("AWS_BEARER_TOKEN_BEDROCK")).toBe(true);
    expect(isAllowedProviderApiKeyEnv("AWS_BEARER_TOKEN_BEDROCK_EU")).toBe(true);
  });

  test("the display names an operator sees", () => {
    expect(providerDisplayName("aws_bedrock")).toBe("Amazon Bedrock");
    expect(providerDisplayName("google")).toBe("Google Gemini");
  });
});

describe("resolveOpenAiCompatibleTarget — Azure OpenAI", () => {
  test("a bare resource endpoint becomes the v1 root", () => {
    expect(
      resolveOpenAiCompatibleTarget({
        provider: "azure_openai",
        apiBase: "https://contoso.openai.azure.com",
        modelId: "gpt-4.1-nano",
      })
    ).toEqual({
      base: "https://contoso.openai.azure.com/openai/v1",
      modelId: "gpt-4.1-nano",
    });
  });

  test("an already-v1 root is kept, with or without a trailing slash", () => {
    for (const apiBase of [
      "https://contoso.openai.azure.com/openai/v1",
      "https://contoso.openai.azure.com/openai/v1/",
      "https://contoso.services.ai.azure.com/openai/v1/",
    ]) {
      expect(
        resolveOpenAiCompatibleTarget({ provider: "azure_openai", apiBase, modelId: "dep" }).base
      ).toBe(apiBase.replace(/\/$/, ""));
    }
  });

  test("a legacy deployments URL is mapped to v1 and its deployment becomes the model", () => {
    // Legacy: {endpoint}/openai/deployments/{deployment}/chat/completions?api-version=…
    // v1 has no per-deployment path; the deployment name is the `model` field.
    expect(
      resolveOpenAiCompatibleTarget({
        provider: "azure_openai",
        apiBase: "https://contoso.openai.azure.com/openai/deployments/my-gpt4o",
        modelId: "gpt-4o",
      })
    ).toEqual({
      base: "https://contoso.openai.azure.com/openai/v1",
      modelId: "my-gpt4o",
    });
  });

  test("Azure without a resource endpoint cannot be dialled", () => {
    expect(() =>
      resolveOpenAiCompatibleTarget({ provider: "azure_openai", apiBase: "", modelId: "dep" })
    ).toThrow(/Azure OpenAI needs the resource endpoint/);
  });

  test("Azure key auth sends the api-key header as well as the bearer form", () => {
    expect(providerAuthHeaders("azure_openai", "k")).toEqual({
      "api-key": "k",
      Authorization: "Bearer k",
    });
  });
});

describe("resolveOpenAiCompatibleTarget — Google Gemini", () => {
  test("defaults to the OpenAI-compatibility root", () => {
    expect(
      resolveOpenAiCompatibleTarget({ provider: "google", apiBase: "", modelId: "gemini-2.5-flash" }).base
    ).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
  });

  test("the stored native base (used by Gemini Live) is extended to the compat root", () => {
    for (const apiBase of [
      "https://generativelanguage.googleapis.com/v1beta",
      "https://generativelanguage.googleapis.com/v1beta/",
      "https://generativelanguage.googleapis.com",
    ]) {
      expect(
        resolveOpenAiCompatibleTarget({ provider: "google", apiBase, modelId: "m" }).base
      ).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
    }
  });

  test("an explicit compat root is kept, never given a second /v1", () => {
    expect(
      resolveOpenAiCompatibleTarget({
        provider: "google",
        apiBase: "https://generativelanguage.googleapis.com/v1beta/openai/",
        modelId: "m",
      }).base
    ).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
  });

  test("Gemini takes the key as a bearer token, never in the URL", () => {
    expect(providerAuthHeaders("google", "g")).toEqual({ Authorization: "Bearer g" });
  });
});

describe("resolveOpenAiCompatibleTarget — Amazon Bedrock", () => {
  test("defaults to the us-east-1 runtime root", () => {
    expect(
      resolveOpenAiCompatibleTarget({ provider: "aws_bedrock", apiBase: "", modelId: "openai.gpt-oss-120b" }).base
    ).toBe("https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1");
  });

  test("a regional runtime host gets the /openai/v1 path", () => {
    expect(
      resolveOpenAiCompatibleTarget({
        provider: "aws_bedrock",
        apiBase: "https://bedrock-runtime.eu-central-1.amazonaws.com",
        modelId: "m",
      }).base
    ).toBe("https://bedrock-runtime.eu-central-1.amazonaws.com/openai/v1");
  });

  test("the mantle host gets the /v1 path", () => {
    expect(
      resolveOpenAiCompatibleTarget({
        provider: "aws_bedrock",
        apiBase: "https://bedrock-mantle.us-east-1.api.aws",
        modelId: "m",
      }).base
    ).toBe("https://bedrock-mantle.us-east-1.api.aws/v1");
  });

  test("full roots are kept as typed", () => {
    for (const apiBase of [
      "https://bedrock-runtime.ap-south-1.amazonaws.com/openai/v1",
      "https://bedrock-mantle.us-west-2.api.aws/v1/",
    ]) {
      expect(
        resolveOpenAiCompatibleTarget({ provider: "aws_bedrock", apiBase, modelId: "m" }).base
      ).toBe(apiBase.replace(/\/$/, ""));
    }
  });
});

describe("resolveOpenAiCompatibleTarget — existing vendors keep their bases", () => {
  test.each([
    ["openai", "", "https://api.openai.com/v1"],
    ["mistral", "", "https://api.mistral.ai/v1"],
    ["ollama", "", "http://127.0.0.1:11434/v1"],
    ["openai_compatible", "https://api.deepseek.com/v1", "https://api.deepseek.com/v1"],
    ["openai_compatible", "https://api.groq.com/openai", "https://api.groq.com/openai/v1"],
    ["zai", "https://api.z.ai/api/coding/paas/v4", "https://api.z.ai/api/coding/paas/v4"],
  ])("%s with base %p → %s", (provider, apiBase, expected) => {
    expect(resolveOpenAiCompatibleTarget({ provider, apiBase, modelId: "m" }).base).toBe(expected);
  });

  test("bearer-only vendors get exactly one header; a keyless Ollama gets none", () => {
    expect(providerAuthHeaders("openai", "k")).toEqual({ Authorization: "Bearer k" });
    expect(providerAuthHeaders("aws_bedrock", "k")).toEqual({ Authorization: "Bearer k" });
    expect(providerAuthHeaders("ollama", "")).toEqual({});
  });
});

describe("credential origin — the new hosts", () => {
  const ok = (apiBase: string, apiKeyEnvKey: string) =>
    expect(() => assertProviderCredentialOrigin({ apiBase, apiKeyEnvKey })).not.toThrow();
  const blocked = (apiBase: string, apiKeyEnvKey: string) =>
    expect(() => assertProviderCredentialOrigin({ apiBase, apiKeyEnvKey })).toThrow(/may only be sent to/);

  test("the Bedrock token reaches only Bedrock runtime/mantle hosts", () => {
    ok("https://bedrock-runtime.eu-central-1.amazonaws.com/openai/v1", "AWS_BEARER_TOKEN_BEDROCK");
    ok("https://bedrock-mantle.us-east-1.api.aws/v1", "AWS_BEARER_TOKEN_BEDROCK");
    // Anyone can host content under an amazonaws.com subdomain (S3, API Gateway…).
    blocked("https://evil-bucket.s3.amazonaws.com/openai/v1", "AWS_BEARER_TOKEN_BEDROCK");
    blocked("https://attacker.example/openai/v1", "AWS_BEARER_TOKEN_BEDROCK");
  });

  test("the Azure key reaches every documented Azure endpoint family", () => {
    ok("https://contoso.openai.azure.com", "AZURE_OPENAI_API_KEY");
    ok("https://contoso.services.ai.azure.com/openai/v1", "AZURE_OPENAI_API_KEY");
    ok("https://contoso.cognitiveservices.azure.com", "AZURE_OPENAI_API_KEY");
    ok("https://westus.api.cognitive.microsoft.com", "AZURE_OPENAI_API_KEY");
    blocked("https://contoso.azurewebsites.net", "AZURE_OPENAI_API_KEY");
  });

  test("the Gemini key reaches the compat root on the same host", () => {
    ok("https://generativelanguage.googleapis.com/v1beta/openai", "GOOGLE_GENERATIVE_AI_API_KEY");
    ok("https://generativelanguage.googleapis.com/v1beta/openai", "GEMINI_API_KEY");
  });
});

describe("what the operator can pick from", () => {
  test("connection templates exist for Azure OpenAI, Gemini chat and Bedrock", () => {
    const byProvider = new Map(PROVIDER_CONNECTION_TEMPLATES.map((t) => [`${t.provider}:${t.engine}`, t]));
    const azure = PROVIDER_CONNECTION_TEMPLATES.find((t) => t.provider === "azure_openai");
    expect(azure?.apiKeyEnvKey).toBe("AZURE_OPENAI_API_KEY");
    const gemini = byProvider.get("google:DEFAULT");
    expect(gemini?.apiBase).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
    const bedrock = byProvider.get("aws_bedrock:DEFAULT");
    expect(bedrock?.apiBase).toBe("https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1");
    expect(bedrock?.apiKeyEnvKey).toBe("AWS_BEARER_TOKEN_BEDROCK");
  });

  test("the admin provider-type select is driven by LLM_PROVIDER_TYPES, not a second list", () => {
    const source = readFileSync(
      join(REPO_ROOT, "src/components/admin/ai-providers.tsx"),
      "utf8"
    );
    expect(source).toMatch(/LLM_PROVIDER_TYPES\.map\(/);
    // The hand-maintained copy that silently omitted google.
    expect(source).not.toMatch(/\[\s*"openai",\s*"openai_compatible",\s*"ollama"/);
  });
});
