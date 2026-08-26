/**
 * `PROVIDER_UNAVAILABLE` signal for the real-AI-only path.
 *
 * When `AUTONOMY_REAL_AI_ONLY` is on, every LLM-backed helper in `src/lib/ai/*`
 * must refuse to fabricate a deterministic result if the provider call
 * degraded. Instead of returning a shaped-but-fake object with
 * `provider: "deterministic"`, it throws this error. The route handler catches
 * it and surfaces the honest "connect provider" empty state (Slice 6).
 *
 * The behaviour is deliberately gated by a synchronous `process.env` read —
 * an admin console override that re-enables fake AI without a redeploy would
 * defeat the invariant. Deploy is the trust boundary.
 *
 * When the flag is off, `guardOrThrow` is a no-op and existing deterministic
 * fallbacks stay wired. The legacy dashboard (`/app-legacy`) depends on this
 * until Slice 4 replaces it.
 */
import { getAutonomyFlagsFromProcessEnv } from "../autonomy-flags";
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

  constructor(opts: {
    context: string;
    llmFailureKind?: LLMFailureKind;
    provider?: string;
    cause?: unknown;
  }) {
    super(
      `Provider unavailable in real-AI-only mode (${opts.context}${
        opts.llmFailureKind ? `, ${opts.llmFailureKind}` : ""
      })`,
    );
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
 * `true` when the current process was booted with `AUTONOMY_REAL_AI_ONLY`
 * force-set to a truthy value. Deliberately sync — see file header.
 */
export function isRealAiOnlyStrict(): boolean {
  return getAutonomyFlagsFromProcessEnv().realAiOnly;
}

/**
 * Guard the boundary between "we called the LLM" and "we're about to return a
 * fabricated result". Every `if (result.fallback) return deterministic;` site
 * in `src/lib/ai/*` calls this first.
 *
 * When the flag is off (production default until we finish rollout), returns
 * silently and the caller proceeds with its existing fallback. When the flag
 * is on, throws `ProviderUnavailableError` and the caller never reaches the
 * fabricator.
 */
export function guardOrThrow(
  result: Pick<LLMResult, "fallback" | "failureKind" | "provider">,
  context: string,
): void {
  if (!result.fallback) return;
  if (!isRealAiOnlyStrict()) return;
  throw new ProviderUnavailableError({
    context,
    llmFailureKind: result.failureKind,
    provider: result.provider,
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
