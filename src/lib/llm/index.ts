import ZAI from "z-ai-web-dev-sdk";
import { glmThinkingParams } from "./glm-thinking";
import { openAiCompatibleRequestBody } from "./request-shape";
import { readOpenAiCompatibleStream } from "./sse-stream";
import { redactSensitiveText } from "@/lib/api-failure";
import { db } from "../db";
import type { AIProviderConfig } from "@prisma/client";
import { resolveProviderApiKey } from "../env-settings";
import {
  applyInputPiiFilter,
  applyOutputGuardrails,
  applyPricingInputGuardrails,
  type PromptOrigin,
  PRICING_REFUSAL_MESSAGE,
  type LLMMessage,
} from "../guardrails";
import {
  type AgentEngine,
  providerServesEngine,
  requireConfiguredModelId,
} from "./model-catalog";
import {
  isOpenAiCompatibleChatProvider,
  providerAuthHeaders,
  resolveOpenAiCompatibleTarget,
} from "./provider-wire";
import {
  LLMTransportError,
  classifyFailure,
  trimToSafeBoundary,
  withRetries,
  type LLMFailureKind,
} from "./resilience";
import {
  GATEWAY_MODEL_ID,
  callGateway,
  embedViaGateway,
  gatewayAvailable,
} from "./gateway";

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
  /**
   * What the output guardrail observed (`confidence_0.52_below_0.85`,
   * `refs_omitted_1`, `hallucination_cues`). Populated on rejection so the
   * run record can say why, and on success as an advisory for the audit row.
   */
  guardrailReasons?: string[];
  /**
   * The transport's own words when the call failed (`openai HTTP 400: …`),
   * redacted and bounded. Never user copy; it is what the operator needs.
   */
  failureDetail?: string;
}

export async function generateCompletion(
  messages: LLMMessage[],
  opts?: {
    maxTokens?: number;
    temperature?: number;
    engine?: AgentEngine;
    /**
     * Budget for this one call, over the provider row's default. A proposal
     * draft is minutes of generation; the row's 60 s is sized for a JSON
     * enrichment.
     */
    timeoutMs?: number;
    /**
     * Transport attempts. A long call that timed out will time out again;
     * retrying it only multiplies the wall time inside a fixed function window.
     */
    maxAttempts?: number;
    /**
     * Receives the model's text as it is generated. Only the OpenAI-compatible
     * transport streams; the others call this once with nothing and return the
     * whole text as before. The final result is identical either way — the
     * guardrails run on the assembled text.
     */
    onDelta?: (text: string) => void;
    /**
     * "system" when the app composed the prompt around tender data (the agent
     * pipeline); the pricing *input* refusal then steps aside, since the text
     * is describing a tender, not asking for a price. Default: a person's
     * request, guarded. The output guard applies either way.
     */
    promptOrigin?: PromptOrigin;
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

  const providerRow = await getProviderForEngine(engine);
  if (!providerRow) {
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
  // The transports read the row's timeout; a per-call budget overrides it here
  // so none of them has to learn a new parameter.
  const provider = opts?.timeoutMs
    ? { ...providerRow, timeoutMs: opts.timeoutMs }
    : providerRow;

  const pid = provider.provider.toLowerCase();
  // The tenant row still supplies policy (temperature, ceilings, guardrails)
  // even when it cannot supply transport: an unusable key falls through to the
  // gateway rather than giving up, which is what `resolvePlatformAgentModel`
  // already does for the voice agent (`agents/platform/model.ts`).
  let useGateway = false;
  if (pid !== "ollama") {
    const key = await resolveProviderApiKey(
      provider.provider,
      provider.apiKeyEnvKey
    );
    if (!key) {
      if (!gatewayAvailable()) {
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
      useGateway = true;
    }
  }

  // What actually answered, for the audit trail and the provider label the UI
  // shows — naming the tenant row here would misreport a gateway completion.
  const effectiveProvider = useGateway ? "ai-gateway" : provider.provider;
  const effectiveModel = useGateway ? GATEWAY_MODEL_ID : provider.modelId;

  const temperature = opts?.temperature ?? provider.temperature;
  const maxTokens = Math.min(
    opts?.maxTokens ?? provider.maxTokens,
    provider.maxTokens,
    Math.max(256, Math.floor(provider.contextWindow * 0.25))
  );

  const filteredMessages = applyInputPiiFilter(messages, provider.piiFilter);

  const pricingGate = applyPricingInputGuardrails(filteredMessages, opts?.promptOrigin);
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
        provider: effectiveProvider,
        model: effectiveModel,
        tokensUsed: estimateTokens(fallback),
        confidence: Math.min(
          provider.confidenceThreshold * 0.95,
          guarded.confidence || provider.confidenceThreshold * 0.5
        ),
        fallback: true,
        engine,
        failureKind: "guardrail_rejected",
        attempts: meta.attempts,
        // An empty answer that hit the token cap is a budget problem, not a
        // model problem; the reason list has to say which.
        guardrailReasons: truncated
          ? [...guarded.reasons, "truncated_by_max_tokens"]
          : guarded.reasons,
      };
    }
    return {
      content: guarded.content,
      provider: effectiveProvider,
      model: effectiveModel,
      tokensUsed,
      confidence: guarded.confidence,
      fallback: false,
      engine,
      failureKind: "none",
      truncated,
      attempts: meta.attempts,
      guardrailReasons: guarded.reasons.length ? guarded.reasons : undefined,
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
      const { result, attempts } = await withRetries({
        operation,
        maxAttempts: opts?.maxAttempts,
      });
      return finalize(
        result.text,
        baseConfidence,
        result.tokensUsed ||
          estimateTokens(result.text + JSON.stringify(filteredMessages)),
        { truncated: result.truncated, attempts }
      );
    };

    if (useGateway) {
      return await runTransport(
        () => callGateway(filteredMessages, temperature, maxTokens),
        0.93
      );
    }

    if (pid === "zai") {
      // Prefer OpenAI-compatible path when apiBase is configured (live models)
      if (provider.apiBase?.trim()) {
        return await runTransport(
          () => callOpenAiCompatible(provider, filteredMessages, temperature, maxTokens, opts?.onDelta),
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
            ...glmThinkingParams(model),
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

    // OpenAI, Azure OpenAI (v1), Google Gemini, Amazon Bedrock, Mistral, Ollama
    // and every OpenAI-compatible gateway: same wire shape, different root and
    // auth header (see provider-wire.ts).
    if (isOpenAiCompatibleChatProvider(pid)) {
      return await runTransport(
        () => callOpenAiCompatible(provider, filteredMessages, temperature, maxTokens, opts?.onDelta),
        pid === "mistral" ? 0.9 : 0.92
      );
    }

    if (pid === "anthropic") {
      return await runTransport(
        () => callAnthropic(provider, filteredMessages, temperature, maxTokens),
        0.93
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
      provider: effectiveProvider,
      model: effectiveModel,
      tokensUsed: estimateTokens(fallback),
      confidence: provider.confidenceThreshold * 0.9,
      fallback: true,
      engine,
      failureKind,
      failureDetail: redactSensitiveText(
        err instanceof Error ? err.message : String(err)
      ).slice(0, 300),
    };
  }
}

type TransportCompletion = {
  text: string;
  tokensUsed: number;
  truncated: boolean;
};

/**
 * Vendors whose streaming accepts `stream_options.include_usage` (OpenAI and
 * Azure by definition; DeepSeek, the `openai_compatible` row in production, per
 * api-docs.deepseek.com). Others stream without it and the token count is
 * estimated, as it already is when a vendor omits `usage`.
 */
const STREAM_USAGE_PROVIDERS = new Set(["openai", "azure_openai", "openai_compatible"]);

async function callOpenAiCompatible(
  provider: AIProviderConfig,
  messages: LLMMessage[],
  temperature: number,
  maxTokens: number,
  onDelta?: (text: string) => void
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

  const target = resolveOpenAiCompatibleTarget(provider);
  const base = target.base;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...providerAuthHeaders(pid, key),
  };

  // Per-vendor shape: GPT-5-class models reject `max_tokens` and a custom
  // temperature; GLM needs its thinking budget handled. See request-shape.ts.
  const body = openAiCompatibleRequestBody({
    provider: provider.provider,
    modelId: requireConfiguredModelId(target.modelId),
    messages,
    temperature,
    maxTokens,
  });

  const streaming = typeof onDelta === "function";
  const requestBody = streaming
    ? {
        ...body,
        stream: true,
        ...(STREAM_USAGE_PROVIDERS.has(pid) ? { stream_options: { include_usage: true } } : {}),
      }
    : body;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), provider.timeoutMs || 60000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new LLMTransportError(
        `${provider.provider} HTTP ${res.status}: ${errText.slice(0, 200)}`,
        { status: res.status }
      );
    }
    if (streaming) {
      if (!res.body) {
        throw new LLMTransportError(`${provider.provider} returned no stream body`, {
          status: res.status,
        });
      }
      return await readOpenAiCompatibleStream(res.body, onDelta);
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

/**
 * Embed text via the EMBEDDING engine provider, then via the AI Gateway.
 *
 * Returns `null` when neither answered. Callers must not substitute a stand-in
 * vector: once written to `embeddingJson` it is indistinguishable on read from
 * a model-produced one, and `retrieveRelevant` already degrades honestly to
 * lexical TF cosine when the query embedding is null.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const trimmed = text.slice(0, 8000);
  try {
    const provider = await getProviderForEngine("EMBEDDING");
    if (provider) {
      const pid = provider.provider.toLowerCase();
      // Vendors documenting an OpenAI-shaped `/embeddings`: OpenAI, Azure v1
      // (in its spec), Gemini's compat layer, Mistral, Ollama and the gateways.
      // Bedrock's OpenAI-compatible surface documents chat completions only.
      const supportsRemoteEmbed =
        pid === "openai" ||
        pid === "openai_compatible" ||
        pid === "ollama" ||
        pid === "azure_openai" ||
        pid === "google" ||
        pid === "mistral";

      if (supportsRemoteEmbed) {
        const key = await resolveProviderApiKey(
          provider.provider,
          provider.apiKeyEnvKey
        );
        if (key || pid === "ollama") {
          const target = resolveOpenAiCompatibleTarget(provider);
          const base = target.base;
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...providerAuthHeaders(pid, key),
          };

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
                model: requireConfiguredModelId(target.modelId),
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
    /* fall through to the gateway */
  }

  if (gatewayAvailable()) {
    try {
      const emb = await embedViaGateway(trimmed);
      if (emb.length) return emb;
    } catch {
      /* nothing left to try */
    }
  }
  return null;
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
