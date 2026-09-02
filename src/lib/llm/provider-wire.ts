/**
 * Where each provider type's OpenAI-compatible API lives and how it is
 * authenticated. Pure; no database, no network.
 *
 * Every vendor here serves `POST {base}/chat/completions`, `GET {base}/models`
 * and (where supported) `POST {base}/embeddings` in the OpenAI shape. What
 * differs is only the root path and the auth header, and admins type the root
 * in many forms, so the resolution is centralised rather than repeated in the
 * chat, embeddings, model-list and platform-agent call sites.
 *
 * Sources (read 2026-09-02):
 * - Azure OpenAI v1 API: `https://RESOURCE.openai.azure.com/openai/v1/` (also
 *   `RESOURCE.services.ai.azure.com`), no `api-version`; key auth is the
 *   `api-key` header, Entra tokens use `Authorization: Bearer`. The v1 OpenAPI
 *   spec serves `/models`, `/chat/completions`, `/embeddings` under
 *   `{endpoint}/openai/v1`. The legacy shape was
 *   `{endpoint}/openai/deployments/{deployment}/chat/completions?api-version=…`;
 *   in v1 the deployment name is the `model` field.
 *   learn.microsoft.com/azure/foundry/openai/api-version-lifecycle (2026-05-13)
 * - Amazon Bedrock: `https://bedrock-runtime.{region}.amazonaws.com/openai/v1`
 *   (recommended) or `https://bedrock-mantle.{region}.api.aws/v1`, with
 *   `Authorization: Bearer $AWS_BEARER_TOKEN_BEDROCK`.
 *   docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions-mantle.html
 * - Gemini: `https://generativelanguage.googleapis.com/v1beta/openai/` with
 *   `Authorization: Bearer GEMINI_API_KEY`. ai.google.dev/gemini-api/docs/openai
 */

import { normalizeOpenAiBase } from "./model-catalog";

const OPENAI_COMPATIBLE_CHAT_PROVIDERS: ReadonlySet<string> = new Set([
  "openai",
  "openai_compatible",
  "ollama",
  "azure_openai",
  "mistral",
  "zai",
  "google",
  "aws_bedrock",
]);

export const GOOGLE_OPENAI_COMPAT_BASE =
  "https://generativelanguage.googleapis.com/v1beta/openai";
export const BEDROCK_DEFAULT_BASE =
  "https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1";

/** Provider types served by the OpenAI-compatible chat transport. */
export function isOpenAiCompatibleChatProvider(provider: string): boolean {
  return OPENAI_COMPATIBLE_CHAT_PROVIDERS.has(provider.toLowerCase());
}

export type OpenAiCompatibleTarget = {
  /** Root to which `/chat/completions`, `/models`, `/embeddings` are appended. */
  base: string;
  /** The `model` field; for a legacy Azure deployments URL, the deployment. */
  modelId: string | null | undefined;
};

function trimSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/** Origin, host and trailing-slash-free path of a URL; null when unparseable. */
function pathOf(base: string): { origin: string; host: string; path: string } | null {
  try {
    const url = new URL(base);
    return { origin: url.origin, host: url.hostname, path: url.pathname.replace(/\/+$/, "") };
  } catch {
    return null;
  }
}

function azureTarget(apiBase: string, modelId: string | null | undefined): OpenAiCompatibleTarget {
  const base = trimSlash(apiBase);
  if (!base) {
    throw new Error(
      "Azure OpenAI needs the resource endpoint as API Base URL (https://RESOURCE.openai.azure.com)."
    );
  }
  const parsed = pathOf(base);
  if (!parsed) return { base, modelId };
  const legacy = parsed.path.match(/^\/openai\/deployments\/([^/]+)/i);
  if (legacy) {
    return { base: `${parsed.origin}/openai/v1`, modelId: decodeURIComponent(legacy[1]) };
  }
  if (/\/openai\/v1$/i.test(parsed.path)) return { base, modelId };
  if (parsed.path === "" || /^\/openai$/i.test(parsed.path)) {
    return { base: `${parsed.origin}/openai/v1`, modelId };
  }
  // An unfamiliar path: the operator knows their gateway better than we do.
  return { base, modelId };
}

function googleBase(apiBase: string): string {
  const base = trimSlash(apiBase);
  if (!base) return GOOGLE_OPENAI_COMPAT_BASE;
  if (/\/openai$/i.test(base)) return base;
  const parsed = pathOf(base);
  if (parsed && parsed.path === "") return `${parsed.origin}/v1beta/openai`;
  return `${base}/openai`;
}

function bedrockBase(apiBase: string): string {
  const base = trimSlash(apiBase);
  if (!base) return BEDROCK_DEFAULT_BASE;
  if (/\/v\d+$/i.test(base)) return base;
  if (/\/openai$/i.test(base)) return `${base}/v1`;
  const parsed = pathOf(base);
  if (parsed && parsed.path === "") {
    return /^bedrock-mantle\./i.test(parsed.host)
      ? `${parsed.origin}/v1`
      : `${parsed.origin}/openai/v1`;
  }
  return `${base}/openai/v1`;
}

/**
 * The root and model to use for an OpenAI-compatible call against `provider`.
 *
 * `modelId` passes through untouched except for the legacy Azure deployments
 * URL, where the deployment in the path is the model v1 expects.
 */
export function resolveOpenAiCompatibleTarget(row: {
  provider: string;
  apiBase: string | null | undefined;
  modelId: string | null | undefined;
}): OpenAiCompatibleTarget {
  const pid = row.provider.toLowerCase();
  const apiBase = row.apiBase ?? "";
  switch (pid) {
    case "azure_openai":
      return azureTarget(apiBase, row.modelId);
    case "google":
      return { base: googleBase(apiBase), modelId: row.modelId };
    case "aws_bedrock":
      return { base: bedrockBase(apiBase), modelId: row.modelId };
    case "mistral":
      return { base: normalizeOpenAiBase(apiBase || "https://api.mistral.ai/v1"), modelId: row.modelId };
    case "ollama":
      return { base: normalizeOpenAiBase(apiBase || "http://127.0.0.1:11434/v1"), modelId: row.modelId };
    default:
      // openai, openai_compatible, zai and anything else that speaks the shape.
      return { base: normalizeOpenAiBase(apiBase || "https://api.openai.com/v1"), modelId: row.modelId };
  }
}

/**
 * Auth headers for an OpenAI-compatible request. Azure accepts the key in
 * either `api-key` or `Authorization`, so both are sent; every other vendor
 * documents the bearer form only. No key (a local Ollama) means no header.
 */
export function providerAuthHeaders(provider: string, key: string | null | undefined): Record<string, string> {
  if (!key) return {};
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  if (provider.toLowerCase() === "azure_openai") headers["api-key"] = key;
  return headers;
}
