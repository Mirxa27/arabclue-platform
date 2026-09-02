/**
 * Request parameters that keep a GLM completion's token budget for the answer.
 *
 * GLM-5.x reasons by default and writes `reasoning_content` before `content`,
 * both drawn from the same `max_tokens`. At the budgets this app uses for
 * structured steps (2048 for enrichment) the reasoning alone exhausted it,
 * and the answer arrived as `""` with `finish_reason: "length"` — which the
 * output guardrail correctly called `empty_output` and, under strict real-AI
 * mode, failed the whole pipeline run.
 *
 * Per docs.z.ai (thinking-mode guide and chat-completion reference, read
 * 2026-09-02): GLM-4.5 through GLM-5.2 accept `thinking.type = "disabled"`.
 * GLM-5.3 and GLM-5.3-Flash always think, answer error 1210 to "disabled",
 * and take `reasoning_effort` instead; "low" is the documented migration.
 *
 * Pure so the OpenAI-compatible HTTP path and the SDK path share one rule.
 */
export type GlmThinkingParams =
  | { thinking: { type: "disabled" } }
  | { thinking: { type: "enabled" }; reasoning_effort: "low" }
  | Record<string, never>;

export function glmThinkingParams(modelId: string | null | undefined): GlmThinkingParams {
  const id = (modelId ?? "").trim().toLowerCase();
  if (!id.startsWith("glm-")) return {};
  if (id.startsWith("glm-5.3")) {
    return { thinking: { type: "enabled" }, reasoning_effort: "low" };
  }
  return { thinking: { type: "disabled" } };
}
