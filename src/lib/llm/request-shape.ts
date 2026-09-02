import type { LLMMessage } from "@/lib/guardrails";
import { glmThinkingParams } from "./glm-thinking";

/**
 * The Chat Completions request body, shaped per vendor.
 *
 * "OpenAI-compatible" stopped meaning one shape. GPT-5-class and o-series
 * models reject `max_tokens` (400 `unsupported_parameter`, use
 * `max_completion_tokens`) and any non-default `temperature` (400
 * `unsupported_value`); the production TECHNICAL row is `openai /
 * gpt-5.6-luna` and the pipeline died on exactly that 400, classified as
 * `invalid_response`. Other vendors speaking the same wire format — DeepSeek,
 * Ollama, Mistral, Z.ai — still take the classic keys, and Z.ai's GLM needs
 * its thinking budget handled (see glm-thinking.ts).
 *
 * Pure, so the rules are testable without a network.
 */
export type OpenAiCompatibleBody = {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  thinking?: { type: "enabled" | "disabled" };
  reasoning_effort?: "low";
};

const OPENAI_FIRST_PARTY = new Set(["openai", "azure_openai"]);
const OPENAI_REASONING_MODEL = /^(gpt-5|o\d)/i;

/**
 * Reasoning tokens are billed against `max_completion_tokens` alongside the
 * visible answer (Azure OpenAI reasoning guide, read 2026-09-02). With the
 * request accepted, the technical step still came back empty: GPT-5.6 spent
 * the whole 2048 thinking and hit the cap. The caller's budget is for the
 * answer; the reasoning gets its own headroom on top, and the effort is
 * pinned low — these are structured steps, not open-ended analysis.
 */
export const REASONING_TOKEN_HEADROOM = 4096;

export function openAiCompatibleRequestBody(opts: {
  provider: string;
  modelId: string;
  messages: LLMMessage[];
  temperature: number;
  maxTokens: number;
}): OpenAiCompatibleBody {
  const pid = opts.provider.toLowerCase();
  const base = { model: opts.modelId, messages: opts.messages };
  if (OPENAI_FIRST_PARTY.has(pid)) {
    // `max_completion_tokens` is accepted by every current OpenAI chat model;
    // temperature only by the non-reasoning ones.
    return OPENAI_REASONING_MODEL.test(opts.modelId)
      ? {
          ...base,
          max_completion_tokens: opts.maxTokens + REASONING_TOKEN_HEADROOM,
          reasoning_effort: "low",
        }
      : { ...base, max_completion_tokens: opts.maxTokens, temperature: opts.temperature };
  }
  return {
    ...base,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
    ...glmThinkingParams(opts.modelId),
  };
}
