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
  requireConfiguredModelId,
} from "./model-catalog";
import { isRealAiOnlyStrict } from "../real-ai-only";
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
  embedManyViaGateway,
  gatewayAvailable,
} from "./gateway";
import { selectUsableProvider } from "./provider-failover";

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

async function listActiveProviders(): Promise<AIProviderConfig[]> {
  return db.aIProviderConfig.findMany({
    where: { isActive: true },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  });
}

/**
 * Active provider for an agent engine whose credential resolves.
 * Candidates are ranked: rows listing the engine in enginesJson (or the legacy
 * engine field), then DEFAULT rows, then any active row. A row whose key does
 * not resolve is skipped (once, with a warning naming it) in favour of the next
 * candidate that can actually be called; only when none can is the top-ranked
 * row returned, so the caller still reports `missing_key` for the right row.
 */
export async function getProviderForEngine(
  engine: AgentEngine = "DEFAULT"
): Promise<AIProviderConfig | null> {
  const selection = await selectUsableProvider(
    await listActiveProviders(),
    engine,
    resolveProviderApiKey
  );
  if (selection.usable && selection.skipped.length > 0) {
    console.warn(
      `[llm] ${engine}: skipped ${selection.skipped.join(", ")} — API key did not resolve; using ${selection.provider!.name} (${selection.provider!.provider})`
    );
  }
  return selection.provider;
}

export type ProviderPreflight =
  | { ok: true }
  | { ok: false; failureKind: LLMFailureKind; provider: string | null };

/**
 * Whether a completion for each of these engines could reach a model right now.
 * Runs before an agent run is queued so a workspace with no usable provider is
 * told so immediately (503) instead of after the pipeline has retried a
 * missing key for a minute. Mirrors `generateCompletion`'s own decision order:
 * deterministic mode, then the gateway, then a tenant row with a resolvable key.
 */
export async function preflightProviders(
  engines: readonly AgentEngine[]
): Promise<ProviderPreflight> {
  if (process.env.ARABCLUE_LLM_DETERMINISTIC === "1") {
    // Deterministic output is a stand-in, not a model; a strict deploy refuses
    // to queue work that can only ever produce it.
    return isRealAiOnlyStrict()
      ? { ok: false, failureKind: "deterministic_mode", provider: null }
      : { ok: true };
  }
  if (gatewayAvailable()) return { ok: true };
  const actives = await listActiveProviders();
  for (const engine of engines) {
    const selection = await selectUsableProvider(actives, engine, resolveProviderApiKey);
    if (selection.usable) continue;
    return {
      ok: false,
      failureKind: selection.provider ? "missing_key" : "no_provider",
      provider: selection.provider?.provider ?? null,
    };
  }
  return { ok: true };
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
        () =>
          callGateway(filteredMessages, temperature, maxTokens, {
            timeoutMs: provider.timeoutMs || 60000,
          }),
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

/** Vendors documenting an OpenAI-shaped `/embeddings` that accepts `input: string[]`. */
const REMOTE_EMBED_PROVIDERS = new Set([
  "openai",
  "openai_compatible",
  "ollama",
  "azure_openai",
  "google",
  "mistral",
]);

/** Inputs per `/embeddings` request; well under every vendor's ceiling. */
const EMBED_BATCH_SIZE = 64;

/**
 * Embed text via the EMBEDDING engine provider, then via the AI Gateway.
 *
 * Returns `null` when neither answered. Callers must not substitute a stand-in
 * vector: once written to `embeddingJson` it is indistinguishable on read from
 * a model-produced one, and `retrieveRelevant` already degrades honestly to
 * lexical TF cosine when the query embedding is null.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const [embedding] = await embedTexts([text]);
  return embedding ?? null;
}

/**
 * Embed many texts with one provider lookup and one request per batch of
 * `EMBED_BATCH_SIZE` — indexing a 40-chunk document used to look the provider
 * up and call `/embeddings` forty times. The result is aligned with `texts`;
 * an entry is `null` when nothing answered for it.
 */
export async function embedTexts(texts: string[]): Promise<Array<number[] | null>> {
  const trimmed = texts.map((t) => t.slice(0, 8000));
  if (trimmed.length === 0) return [];
  const out: Array<number[] | null> = trimmed.map(() => null);

  // Bedrock's OpenAI-compatible surface documents chat completions only.
  let remote: { base: string; headers: Record<string, string>; model: string; timeoutMs: number } | null = null;
  try {
    // "No embedding available" is an answer, never an exception: an
    // unreachable provider table or an unconfigured model degrade to lexical
    // retrieval exactly like a missing key does.
    const provider = await getProviderForEngine("EMBEDDING");
    const pid = provider?.provider.toLowerCase() ?? "";
    if (provider && REMOTE_EMBED_PROVIDERS.has(pid)) {
      const key = await resolveProviderApiKey(provider.provider, provider.apiKeyEnvKey);
      if (key || pid === "ollama") {
        const target = resolveOpenAiCompatibleTarget(provider);
        remote = {
          base: target.base,
          headers: { "Content-Type": "application/json", ...providerAuthHeaders(pid, key) },
          model: requireConfiguredModelId(target.modelId),
          timeoutMs: provider.timeoutMs || 30000,
        };
      }
    }
  } catch {
    remote = null;
  }

  for (let offset = 0; offset < trimmed.length; offset += EMBED_BATCH_SIZE) {
    const batch = trimmed.slice(offset, offset + EMBED_BATCH_SIZE);
    let vectors: Array<number[] | null> | null = null;

    if (remote) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), remote.timeoutMs);
        let res: Response;
        try {
          res = await fetch(`${remote.base}/embeddings`, {
            method: "POST",
            headers: remote.headers,
            body: JSON.stringify({ model: remote.model, input: batch }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }
        if (res.ok) {
          const data = (await res.json()) as {
            data?: Array<{ index?: number; embedding?: number[] }>;
          };
          const byIndex: Array<number[] | null> = batch.map(() => null);
          (data.data ?? []).forEach((row, i) => {
            const at = typeof row.index === "number" ? row.index : i;
            if (row.embedding?.length && at >= 0 && at < byIndex.length) {
              byIndex[at] = row.embedding;
            }
          });
          if (byIndex.some((v) => v)) vectors = byIndex;
        }
      } catch {
        /* fall through to the gateway */
      }
    }

    if (!vectors && gatewayAvailable()) {
      try {
        const embs = await embedManyViaGateway(batch);
        vectors = batch.map((_, i) => (embs[i]?.length ? embs[i] : null));
      } catch {
        /* nothing left to try */
      }
    }

    if (vectors) {
      vectors.forEach((v, i) => {
        out[offset + i] = v;
      });
    }
  }
  return out;
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
