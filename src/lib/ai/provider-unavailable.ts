/**
 * `PROVIDER_UNAVAILABLE` — what happens when there is no model to call.
 *
 * Every LLM-backed helper in `src/lib/ai/*` and `src/lib/agents/*` has a
 * deterministic keyword/template path it can take when the provider call
 * degrades, and that path returns an object shaped exactly like a real answer.
 * So whether it may stand in for a model is the difference between a product
 * that does AI work and one that only looks like it does.
 * `AUTONOMY_REAL_AI_ONLY` decides (`src/lib/real-ai-only.ts`), and the helpers
 * ask here via `guardOrThrow` / `guardCaughtOrThrow`. Strict throws; the route
 * catches it and surfaces the honest "connect provider" empty state.
 */
import { isRealAiOnlyStrict } from "../real-ai-only";
import type { LLMFailureKind, LLMResult } from "../llm";

/**
 * Stable identifier the shell surfaces for a provider-unavailable failure.
 * Mirrors `AgentRun.failureKind` in the Slice 1 schema.
 */
export const PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE" as const;

export class ProviderUnavailableError extends Error {
  readonly failureKind: typeof PROVIDER_UNAVAILABLE = PROVIDER_UNAVAILABLE;
  /** LLM-layer classification (e.g. `no_provider`, `missing_key`, `rate_limit`). */
  readonly llmFailureKind: LLMFailureKind | undefined;
  /** Short caller-supplied breadcrumb — never a user-visible message. */
  readonly context: string;
  /** Underlying provider name when known (e.g. `"openai"`, `"anthropic"`). */
  readonly provider: string | undefined;

  /** Guardrail reasons when the kind is `guardrail_rejected`; never user copy. */
  readonly detail: string | undefined;

  constructor(opts: {
    context: string;
    llmFailureKind?: LLMFailureKind;
    provider?: string;
    cause?: unknown;
    detail?: string;
  }) {
    super(
      `Provider unavailable in real-AI-only mode (${opts.context}${
        opts.llmFailureKind ? `, ${opts.llmFailureKind}` : ""
      }${opts.detail ? `: ${opts.detail}` : ""})`,
    );
    this.detail = opts.detail;
    this.name = "ProviderUnavailableError";
    this.context = opts.context;
    this.llmFailureKind = opts.llmFailureKind;
    this.provider = opts.provider;
    if (opts.cause !== undefined) {
      // Preserve the original for logs; not exposed to the UI.
      (this as { cause?: unknown }).cause = opts.cause;
    }
  }
}

/**
 * Guard the boundary between "we called the LLM" and "we're about to return a
 * fabricated result". Every `if (result.fallback) return deterministic;` site
 * in `src/lib/ai/*` calls this first.
 *
 * Throws `ProviderUnavailableError` by default, so the caller never reaches
 * the fabricator. Returns silently only where the deploy opted out, and then
 * the caller proceeds with its existing fallback.
 */
export function guardOrThrow(
  result: Pick<
    LLMResult,
    "fallback" | "failureKind" | "provider" | "guardrailReasons" | "failureDetail"
  >,
  context: string,
): void {
  if (!result.fallback) return;
  if (!isRealAiOnlyStrict()) return;
  throw new ProviderUnavailableError({
    context,
    llmFailureKind: result.failureKind,
    provider: result.provider,
    // The guardrail's or the transport's own words, so the run record answers
    // "why" instead of the operator re-running the step to find out.
    detail: result.guardrailReasons?.length
      ? result.guardrailReasons.join(", ")
      : result.failureDetail || undefined,
  });
}

/**
 * Guard a raw catch block. Some `src/lib/ai/*` helpers wrap `generateCompletion`
 * in try/catch and swallow the error before it can classify as `fallback`.
 * Those sites call this from the catch so the real-AI-only refusal still fires.
 */
export function guardCaughtOrThrow(
  error: unknown,
  context: string,
): void {
  if (!isRealAiOnlyStrict()) return;
  throw new ProviderUnavailableError({
    context,
    llmFailureKind: "network",
    cause: error,
  });
}
