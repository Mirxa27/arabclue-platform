/**
 * `AUTONOMY_REAL_AI_ONLY` — may a deterministic fallback stand in for a model?
 *
 * Every LLM-backed helper in `src/lib/ai/*` and `src/lib/agents/*` has a
 * keyword/template path it can take when the provider call degrades, and that
 * path returns an object shaped exactly like a real answer. So this flag is the
 * difference between a product that does AI work and one that only looks like
 * it does. Strict means those helpers throw `PROVIDER_UNAVAILABLE` instead
 * (`src/lib/ai/provider-unavailable.ts`), and the UI says so.
 *
 * **Unset means strict**, which is the opposite of how flags are usually read.
 * Misreading a missing or mistyped value as "fake AI is fine" ships templated
 * text as if a model wrote it, with nothing downstream saying which one the
 * user got. Misreading it as "refuse" produces a provider error the operator
 * sees on the first request. Only the second failure is recoverable, so it is
 * the one an absent or unrecognised value gets.
 *
 * `process.env` only, never the admin-owned `EnvSetting` table: a console
 * toggle that re-enabled fake AI without a redeploy would defeat the
 * invariant. Deploy is the trust boundary.
 *
 * Deliberately dependency-free so a health probe, middleware, or any other
 * caller outside the AI surface can read the policy without importing it.
 */

/** The only values that turn strict mode off. */
const OPT_OUT = new Set(["0", "false", "no", "off"]);

/** `true` when this process must refuse rather than fabricate. */
export function isRealAiOnlyStrict(): boolean {
  const raw = process.env.AUTONOMY_REAL_AI_ONLY;
  if (raw == null) return true;
  return !OPT_OUT.has(raw.trim().toLowerCase());
}
