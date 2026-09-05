/**
 * Credential-aware provider selection.
 *
 * `getProviderForEngine` used to return the top-priority active row and stop.
 * When that row's key did not resolve — sealed with a superseded
 * `ARABCLUE_ENC_KEY`, env variable unset — every caller reported `missing_key`
 * even though another active row with a working key was sitting one priority
 * step below. This module ranks the candidates (rows serving the engine, then
 * DEFAULT, then any active row) and hands back the first whose credential
 * actually resolves. Pure over its inputs so it can be tested with a fake
 * provider list and a fake resolver.
 */

import type { AIProviderConfig } from "@prisma/client";
import { type AgentEngine, providerServesEngine } from "./model-catalog";

/** `(provider, apiKeyEnvKey) => key or ""` — `resolveProviderApiKey`'s shape. */
export type ProviderKeyResolver = (
  provider: string,
  apiKeyEnvKey?: string | null
) => Promise<string>;

/** Ollama commonly runs without auth; every other transport needs a key. */
export function providerNeedsCredential(row: Pick<AIProviderConfig, "provider">): boolean {
  return row.provider.toLowerCase() !== "ollama";
}

/**
 * Candidates for an engine in the order `getProviderForEngine` always used:
 * rows serving the engine, then rows serving DEFAULT, then any active row.
 * The caller's priority ordering is preserved inside each tier.
 */
export function rankProvidersForEngine<T extends Pick<AIProviderConfig, "engine" | "enginesJson">>(
  actives: readonly T[],
  engine: AgentEngine
): T[] {
  const serving = actives.filter((p) => providerServesEngine(p, engine));
  const defaults =
    engine === "DEFAULT"
      ? []
      : actives.filter(
          (p) => !serving.includes(p) && providerServesEngine(p, "DEFAULT")
        );
  const rest = actives.filter((p) => !serving.includes(p) && !defaults.includes(p));
  return [...serving, ...defaults, ...rest];
}

export type UsableProviderSelection<T> = {
  /** The row to call, or the top-ranked row when none is usable (so the caller can still name it). */
  provider: T | null;
  /** False when `provider` is set but its credential did not resolve. */
  usable: boolean;
  /** Human-readable labels of the rows skipped because their key did not resolve; never a secret. */
  skipped: string[];
};

/** `name (provider · ENV_KEY)` — what the warning names; the key value never appears. */
export function describeProviderRow(
  row: Pick<AIProviderConfig, "name" | "provider" | "apiKeyEnvKey">
): string {
  return `${row.name} (${row.provider} · ${row.apiKeyEnvKey || "default env"})`;
}

/**
 * First ranked row whose credential resolves. When none does, `provider` is
 * the top-ranked row and `usable` is false, so `generateCompletion` can still
 * return the `missing_key` result that names it rather than `no_provider`.
 */
export async function selectUsableProvider<
  T extends Pick<AIProviderConfig, "name" | "provider" | "apiKeyEnvKey" | "engine" | "enginesJson">,
>(
  actives: readonly T[],
  engine: AgentEngine,
  resolveKey: ProviderKeyResolver
): Promise<UsableProviderSelection<T>> {
  const ranked = rankProvidersForEngine(actives, engine);
  const skipped: string[] = [];
  for (const row of ranked) {
    if (!providerNeedsCredential(row)) return { provider: row, usable: true, skipped };
    const key = await resolveKey(row.provider, row.apiKeyEnvKey);
    if (key) return { provider: row, usable: true, skipped };
    skipped.push(describeProviderRow(row));
  }
  return { provider: ranked[0] ?? null, usable: false, skipped };
}
