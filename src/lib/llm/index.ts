import ZAI from "z-ai-web-dev-sdk";
import { db } from "../db";
import type { AIProviderConfig } from "@prisma/client";
import { resolveProviderApiKey } from "../env-settings";
import {
  applyInputPiiFilter,
  applyOutputGuardrails,
  applyPricingInputGuardrails,
  PRICING_REFUSAL_MESSAGE,
  type LLMMessage,
} from "../guardrails";
import {
  type AgentEngine,
  normalizeOpenAiBase,
  providerServesEngine,
  requireConfiguredModelId,
} from "./model-catalog";
import {
  LLMTransportError,
  classifyFailure,
  trimToSafeBoundary,
  withRetries,
  type LLMFailureKind,
} from "./resilience";

export type { LLMFailureKind } from "./resilience";

export type { LLMMessage };
export type { AgentEngine } from "./model-catalog";

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getZai() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

/** Active provider for DEFAULT engine (legacy callers). */
export async function getActiveProvider(): Promise<AIProviderConfig | null> {
  return getProviderForEngine("DEFAULT");
}

/**
 * Resolve active provider for an agent engine.
 * Matches providers that list the engine in enginesJson (or legacy engine field).
 * Falls back to DEFAULT active provider, then any active provider.
 */
export async function getProviderForEngine(
  engine: AgentEngine = "DEFAULT"
): Promise<AIProviderConfig | null> {
  const actives = await db.aIProviderConfig.findMany({
    where: { isActive: true },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  });

  const forEngine = actives.find((p) => providerServesEngine(p, engine));
  if (forEngine) return forEngine;

  if (engine !== "DEFAULT") {
    const fallback = actives.find((p) => providerServesEngine(p, "DEFAULT"));
    if (fallback) return fallback;
  }

  return actives[0] ?? null;
}

export interface LLMResult {
  content: string;
  provider: string;
  model: string;
  tokensUsed: number;
  confidence: number;
  fallback: boolean;
  engine?: string;
  /**
   * Stable classification of why a call degraded (or "none" on success).
   * Lets the pipeline, UI, and audit trail distinguish a misconfigured
   * provider from a transient outage instead of a bare `fallback: true`.
   */
  failureKind?: LLMFailureKind;
  /** True when the provider hit its token ceiling mid-completion. */
  truncated?: boolean;
  /** Transport attempts consumed (>= 1) when a provider was contacted. */
  attempts?: number;
}

export async function generateCompletion(
  messages: LLMMessage[],
  opts?: {
    maxTokens?: number;
    temperature?: number;
    engine?: AgentEngine;
  }
): Promise<LLMResult> {
  const engine = opts?.engine ?? "DEFAULT";

  // Unit/integration tests and offline runs can force deterministic fallbacks
  // without touching Neon provider rows or external LLM APIs.
  if (process.env.ARABCLUE_LLM_DETERMINISTIC === "1") {
    return {
      content: "",
      provider: "none",
      model: "none",
      tokensUsed: 0,
      confidence: 0,
      fallback: true,
      engine,
      failureKind: "deterministic_mode",
    };
  }

  const provider = await getProviderForEngine(engine);
  if (!provider) {
    return {
      content: "",
      provider: "none",
      model: "none",
      tokensUsed: 0,
      confidence: 0,
      fallback: true,
      engine,
      failureKind: "no_provider",
    };
  }

  const pid = provider.provider.toLowerCase();
  if (pid !== "ollama") {
    const key = await resolveProviderApiKey(
      provider.provider,
      provider.apiKeyEnvKey
    );
    if (!key) {
      return {
        content: "",
        provider: provider.provider,
        model: provider.modelId,
        tokensUsed: 0,
        confidence: 0,
        fallback: true,
        engine,
        failureKind: "missing_key",
      };
    }
  }

  const temperature = opts?.temperature ?? provider.temperature;
  const maxTokens = Math.min(
    opts?.maxTokens ?? provider.maxTokens,
    provider.maxTokens,
    Math.max(256, Math.floor(provider.contextWindow * 0.25))
  );

  const filteredMessages = applyInputPiiFilter(messages, provider.piiFilter);

  const pricingGate = applyPricingInputGuardrails(filteredMessages);
  if (!pricingGate.allowed) {
    return {
      content: pricingGate.message,
      provider: provider.provider,
      model: provider.modelId,
      tokensUsed: estimateTokens(pricingGate.message),
      confidence: 1,
      fallback: false,
      engine,
      failureKind: "pricing_refusal",
    };
  }

  const finalize = (
    raw: string,
    baseConfidence: number,
    tokensUsed: number,
    meta: { truncated?: boolean; attempts?: number } = {}
  ): LLMResult => {
    // A completion that hit the ceiling mid-sentence must not ship as-is.
    let content = raw;
    let truncated = meta.truncated ?? false;
    if (truncated && content) {
      const repaired = trimToSafeBoundary(content);
      content = repaired.text;
      truncated = repaired.removedChars > 0;
    }
    const guarded = applyOutputGuardrails(
      content,
      provider,
      filteredMessages,
      baseConfidence
    );
    if (guarded.rejected) {
      const fallback = buildDeterministicFallback(filteredMessages, provider);
      return {
        content: fallback,
        provider: provider.provider,
        model: provider.modelId,
        tokensUsed: estimateTokens(fallback),
        confidence: Math.min(
          provider.confidenceThreshold * 0.95,
          guarded.confidence || provider.confidenceThreshold * 0.5
        ),
        fallback: true,
        engine,
        failureKind: "guardrail_rejected",
        attempts: meta.attempts,
      };
    }
    return {
      content: guarded.content,
      provider: provider.provider,
      model: provider.modelId,
      tokensUsed,
      confidence: guarded.confidence,
      fallback: false,
      engine,
      failureKind: "none",
      truncated,
      attempts: meta.attempts,
    };
  };

  try {
    const runTransport = async (
      operation: () => Promise<{
        text: string;
        tokensUsed: number;
        truncated: boolean;
      }>,
      baseConfidence: number
    ): Promise<LLMResult> => {
      const { result, attempts } = await withRetries({ operation });
      return finalize(
        result.text,
        baseConfidence,
        result.tokensUsed ||
          estimateTokens(result.text + JSON.stringify(filteredMessages)),
        { truncated: result.truncated, attempts }
      );
    };

    if (pid === "zai") {
      // Prefer OpenAI-compatible path when apiBase is configured (live models)
      if (provider.apiBase?.trim()) {
        return await runTransport(
          () => callOpenAiCompatible(provider, filteredMessages, temperature, maxTokens),
          0.92
        );
      }
      const model = requireConfiguredModelId(provider.modelId);
      const zai = await getZai();
      const { result: completion, attempts } = await withRetries({
        operation: () =>
          zai.chat.completions.create({
            model,
            messages: filteredMessages.map((m) => ({
              role: m.role === "system" ? "assistant" : m.role,
              content: m.content,
            })),
            thinking: { type: "disabled" },
          }),
      });
      const content = completion.choices[0]?.message?.content ?? "";
      return finalize(
        content,
        Math.min(0.97, 0.85 + content.length / 4000),
        estimateTokens(content + JSON.stringify(filteredMessages)),
        {
          truncated:
            completion.choices[0]?.finish_reason === "length" ||
            completion.choices[0]?.finish_reason === "stop_sequence",
          attempts,
        }
      );
    }

    if (
      pid === "openai" ||
      pid === "openai_compatible" ||
      pid === "ollama" ||
      pid === "azure_openai"
    ) {
      return await runTransport(
        () => callOpenAiCompatible(provider, filteredMessages, temperature, maxTokens),
        0.92
      );
    }

    if (pid === "anthropic") {
      return await runTransport(
        () => callAnthropic(provider, filteredMessages, temperature, maxTokens),
        0.93
      );
    }

    if (pid === "mistral") {
      return await runTransport(
        () =>
          callOpenAiCompatible(
            {
              ...provider,
              apiBase: provider.apiBase || "https://api.mistral.ai/v1",
            },
            filteredMessages,
            temperature,
            maxTokens
          ),
        0.9
      );
    }

    throw new LLMTransportError(`Unsupported provider: ${provider.provider}`, {
      kind: "invalid_response",
    });
  } catch (err) {
    const failureKind = classifyFailure(err);
    console.error(
      `[llm] completion failed (kind=${failureKind}), using fallback`,
      err
    );
    const fallback = buildDeterministicFallback(filteredMessages, provider);
    return {
      content: fallback,
      provider: provider.provider,
      model: provider.modelId,
      tokensUsed: estimateTokens(fallback),
      confidence: provider.confidenceThreshold * 0.9,
      fallback: true,
      engine,
      failureKind,
    };
  }
}

type TransportCompletion = {
  text: string;
  tokensUsed: number;
  truncated: boolean;
};

async function callOpenAiCompatible(
  provider: AIProviderConfig,
  messages: LLMMessage[],
  temperature: number,
  maxTokens: number
): Promise<TransportCompletion> {
  const key = await resolveProviderApiKey(
    provider.provider,
    provider.apiKeyEnvKey
  );
  const pid = provider.provider.toLowerCase();
  // Ollama often runs without auth
  if (!key && pid !== "ollama") {
    throw new LLMTransportError(
      `API key missing for ${provider.provider} (${provider.apiKeyEnvKey || "default env"})`,
      { kind: "missing_key" }
    );
  }

  const base = normalizeOpenAiBase(
    provider.apiBase ||
      (pid === "mistral"
        ? "https://api.mistral.ai/v1"
        : pid === "ollama"
          ? "http://127.0.0.1:11434/v1"
          : "https://api.openai.com/v1")
  );

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (key) headers.Authorization = `Bearer ${key}`;

  const body: Record<string, unknown> = {
    model: requireConfiguredModelId(provider.modelId),
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  if (provider.supportsJsonMode && /gpt|o\d|mistral|deepseek|qwen|llama/i.test(provider.modelId)) {
    // Only request json_object when caller messages likely want it — avoid breaking freeform drafting
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), provider.timeoutMs || 60000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new LLMTransportError(
        `${provider.provider} HTTP ${res.status}: ${errText.slice(0, 200)}`,
        { status: res.status }
      );
    }
    const data = await res.json();
    const choice = data.choices?.[0];
    return {
      text: choice?.message?.content ?? "",
      tokensUsed: data.usage?.total_tokens ?? 0,
      truncated:
        choice?.finish_reason === "length" ||
        choice?.finish_reason === "stop_sequence",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropic(
  provider: AIProviderConfig,
  messages: LLMMessage[],
  temperature: number,
  maxTokens: number
): Promise<TransportCompletion> {
  const key = await resolveProviderApiKey(
    provider.provider,
    provider.apiKeyEnvKey
  );
  if (!key) {
    throw new LLMTransportError("ANTHROPIC_API_KEY missing", {
      kind: "missing_key",
    });
  }

  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const anthropicMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), provider.timeoutMs || 60000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: requireConfiguredModelId(provider.modelId),
        max_tokens: maxTokens,
        temperature,
        system: system || undefined,
        messages: anthropicMessages,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new LLMTransportError(
        `Anthropic HTTP ${res.status}: ${errText.slice(0, 200)}`,
        { status: res.status }
      );
    }
    const data = await res.json();
    const text =
      data.content?.map((c: { text?: string }) => c.text ?? "").join("") ?? "";
    const tokensUsed =
      (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
    return {
      text,
      tokensUsed,
      truncated: data.stop_reason === "max_tokens",
    };
  } finally {
    clearTimeout(timer);
  }
}

const LOCAL_EMBED_DIM = 256;

/**
 * Deterministic local bag-of-hashed-ngrams embedding.
 * Used when OpenAI embeddings are unavailable so RAG still has dense vectors.
 */
export function localEmbedText(text: string, dim = LOCAL_EMBED_DIM): number[] {
  const vec = new Array<number>(dim).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
  for (const token of tokens) {
    let h = 2166136261;
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % dim;
    vec[idx] += 1;
    if (token.length > 3) {
      let h2 = 2166136261;
      for (let i = 0; i < Math.min(token.length, 6); i++) {
        h2 ^= token.charCodeAt(i);
        h2 = Math.imul(h2, 16777619);
      }
      vec[Math.abs(h2) % dim] += 0.5;
    }
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

/** Embed text via EMBEDDING engine provider; otherwise local dense embedding */
export async function embedText(text: string): Promise<number[]> {
  const trimmed = text.slice(0, 8000);
  try {
    const provider = await getProviderForEngine("EMBEDDING");
    if (provider) {
      const pid = provider.provider.toLowerCase();
      const supportsRemoteEmbed =
        pid === "openai" ||
        pid === "openai_compatible" ||
        pid === "ollama" ||
        pid === "azure_openai" ||
        pid === "mistral";

      if (supportsRemoteEmbed) {
        const key = await resolveProviderApiKey(
          provider.provider,
          provider.apiKeyEnvKey
        );
        if (key || pid === "ollama") {
          const base = normalizeOpenAiBase(
            provider.apiBase ||
              (pid === "mistral"
                ? "https://api.mistral.ai/v1"
                : pid === "ollama"
                  ? "http://127.0.0.1:11434/v1"
                  : "https://api.openai.com/v1")
          );
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (key) headers.Authorization = `Bearer ${key}`;

          const controller = new AbortController();
          const timer = setTimeout(
            () => controller.abort(),
            provider.timeoutMs || 30000
          );
          let res: Response;
          try {
            res = await fetch(`${base}/embeddings`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                model: requireConfiguredModelId(provider.modelId),
                input: trimmed,
              }),
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timer);
          }
          if (res.ok) {
            const data = await res.json();
            const emb = data.data?.[0]?.embedding as number[] | undefined;
            if (emb?.length) return emb;
          }
        }
      }
    }
  } catch {
    /* fall through to local */
  }
  return localEmbedText(trimmed);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function buildDeterministicFallback(
  messages: LLMMessage[],
  provider: AIProviderConfig
): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const prompt = lastUser?.content ?? "";
  return `(${provider.name} · ${provider.modelId} — deterministic mode)

Acknowledged. Based on the provided context, the following structured response is generated in alignment with Saudi Vision 2030 and applicable government procurement regulations:

${prompt.slice(0, 1200)}

[Generated under guardrails: toxicity=${provider.toxicityFilter}, pii=${provider.piiFilter}, hallucination_guard=${provider.hallucinationGuard}, confidence_threshold=${provider.confidenceThreshold}]`;
}
