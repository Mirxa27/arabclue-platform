import { getDecryptedEnv } from "./env-settings";

/**
 * Autonomy shell feature flags.
 *
 * The rebuild in `.superpowers/sdd/autonomy-rebuild-plan.md` collapses 32
 * dashboard views into a composer-first shell (`/app`), a tender artifact
 * route (`/t/{id}`), and an inbox. Every user-facing change is gated by
 * `AUTONOMY_SHELL` so we can ship in one PR without displacing the legacy
 * `/app-legacy` surface.
 *
 * Read order (highest priority first):
 *   1. `process.env.<FLAG>` — always wins so a deploy can force-disable.
 *   2. `EnvSetting` row (encrypted, admin-owned) — lets the admin console
 *      flip a stage without a redeploy.
 *   3. Default: OFF until we finish the slices below.
 *
 * Values interpreted as ON: `"1"`, `"true"`, `"on"`, `"yes"` (case-insensitive).
 * Anything else — including empty string or unset — is OFF.
 *
 * When flags are OFF, the app must behave exactly like the pre-rebuild
 * baseline. This is the invariant CI enforces.
 */

const TRUTHY = new Set(["1", "true", "on", "yes"]);

function normalizeFlag(raw: string | undefined | null): boolean {
  if (raw == null) return false;
  return TRUTHY.has(raw.trim().toLowerCase());
}

/**
 * Read a raw flag string from process.env first, then EnvSetting.
 * Never throws — returns `""` when the key is not set anywhere.
 */
async function readRawFlag(key: string): Promise<string> {
  const fromProcess = process.env[key];
  if (fromProcess !== undefined) return fromProcess;
  return getDecryptedEnv(key);
}

/**
 * Reveal the new autonomy shell (`/app` composer, slash router,
 * `/t/{id}` artifact route, `/inbox`, `@agent` mentions). When OFF, the
 * legacy dashboard at `/app-legacy` (and the current `/app`) stay wired.
 */
export async function isAutonomyShellEnabled(): Promise<boolean> {
  return normalizeFlag(await readRawFlag("AUTONOMY_SHELL"));
}

/**
 * Kill deterministic/templated fallbacks in the AI surface. When ON, any
 * module in `src/lib/ai/*`, `src/lib/agents/*`, and `src/lib/llm/index.ts`
 * that today substitutes keyword/regex/template output when a provider is
 * absent must instead throw `PROVIDER_UNAVAILABLE` (or return an explicit
 * "connect provider" empty state at the UI layer). Never delivers a fake
 * artifact.
 *
 * Kept independent from `AUTONOMY_SHELL` on purpose — the operator can turn
 * off fake AI without adopting the new shell, and vice versa during rollout.
 */
export async function isAutonomyRealAiOnly(): Promise<boolean> {
  return normalizeFlag(await readRawFlag("AUTONOMY_REAL_AI_ONLY"));
}

/**
 * Bundled snapshot for a single request: resolve both flags once and pass
 * the object down. Route handlers should call this at the top and thread
 * the result through, instead of re-reading `process.env` at every call
 * site (which is easy to get wrong under EnvSetting override).
 */
export interface AutonomyFlags {
  shell: boolean;
  realAiOnly: boolean;
}

export async function getAutonomyFlags(): Promise<AutonomyFlags> {
  const [shell, realAiOnly] = await Promise.all([
    isAutonomyShellEnabled(),
    isAutonomyRealAiOnly(),
  ]);
  return { shell, realAiOnly };
}

/**
 * Synchronous variant for hot paths that only see `process.env` (e.g.
 * client bundles seeded at build time via `NEXT_PUBLIC_AUTONOMY_SHELL`).
 * Does NOT consult EnvSetting — server code must use the async variant.
 */
export function getAutonomyFlagsFromProcessEnv(): AutonomyFlags {
  return {
    shell: normalizeFlag(process.env.AUTONOMY_SHELL),
    realAiOnly: normalizeFlag(process.env.AUTONOMY_REAL_AI_ONLY),
  };
}

/** Exposed for tests. Not part of the public contract. */
export const __internal = { normalizeFlag, readRawFlag };
