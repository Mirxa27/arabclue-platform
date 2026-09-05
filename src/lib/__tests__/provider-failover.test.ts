/**
 * Provider failover (WP-B task 2).
 *
 * Locally, the admin-configured DEFAULT row was a DeepSeek connection whose key
 * was sealed with a superseded ARABCLUE_ENC_KEY and whose env variable was
 * unset. `getProviderForEngine` returned that row and stopped, so every caller
 * reported `missing_key` — although another active row with a resolvable key
 * was one priority step below. The selection is now credential-aware.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  describeProviderRow,
  providerNeedsCredential,
  rankProvidersForEngine,
  selectUsableProvider,
} from "../llm/provider-failover";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

type Row = {
  name: string;
  provider: string;
  apiKeyEnvKey: string | null;
  engine: string | null;
  enginesJson: string | null;
};

function row(
  name: string,
  provider: string,
  engines: string[],
  apiKeyEnvKey: string | null = `${provider.toUpperCase()}_API_KEY`
): Row {
  return {
    name,
    provider,
    apiKeyEnvKey,
    engine: engines[0] ?? null,
    enginesJson: JSON.stringify(engines),
  };
}

/** A resolver that knows exactly which env keys hold a value. */
function resolverWith(known: Record<string, string>) {
  const calls: string[] = [];
  const resolve = async (_provider: string, envKey?: string | null) => {
    calls.push(envKey ?? "");
    return known[envKey ?? ""] ?? "";
  };
  return { resolve, calls };
}

// Already in priority order, the way `getProviderForEngine` reads them.
const deepseekDefault = row("DeepSeek (default)", "openai_compatible", ["DEFAULT"], "DEEPSEEK_API_KEY");
const openaiDrafting = row("OpenAI drafting", "openai", ["DRAFTING", "REWRITE"]);
const anthropicAny = row("Claude", "anthropic", ["COMPLIANCE"]);
const ollamaLocal = row("Ollama", "ollama", ["EMBEDDING"], null);

describe("rankProvidersForEngine", () => {
  test("rows serving the engine, then DEFAULT rows, then any active row — priority kept inside each tier", () => {
    const ranked = rankProvidersForEngine(
      [deepseekDefault, anthropicAny, openaiDrafting],
      "DRAFTING"
    ).map((r) => r.name);
    expect(ranked).toEqual(["OpenAI drafting", "DeepSeek (default)", "Claude"]);
  });

  test("for DEFAULT itself there is no separate DEFAULT tier", () => {
    const ranked = rankProvidersForEngine(
      [openaiDrafting, deepseekDefault, anthropicAny],
      "DEFAULT"
    ).map((r) => r.name);
    expect(ranked).toEqual(["DeepSeek (default)", "OpenAI drafting", "Claude"]);
  });
});

describe("selectUsableProvider", () => {
  test("the top-priority row wins when its key resolves; nothing is skipped", async () => {
    const { resolve, calls } = resolverWith({ DEEPSEEK_API_KEY: "sk-x" });
    const pick = await selectUsableProvider([deepseekDefault, openaiDrafting], "DEFAULT", resolve);
    expect(pick.usable).toBe(true);
    expect(pick.provider?.name).toBe("DeepSeek (default)");
    expect(pick.skipped).toEqual([]);
    expect(calls).toEqual(["DEEPSEEK_API_KEY"]);
  });

  test("a DEFAULT row with no resolvable key falls through to the next active row that has one", async () => {
    // The production shape: DEEPSEEK_API_KEY unset, OpenAI's key present.
    const { resolve } = resolverWith({ OPENAI_API_KEY: "sk-ok" });
    const pick = await selectUsableProvider(
      [deepseekDefault, openaiDrafting, anthropicAny],
      "DEFAULT",
      resolve
    );
    expect(pick.usable).toBe(true);
    expect(pick.provider?.name).toBe("OpenAI drafting");
    expect(pick.skipped).toEqual(["DeepSeek (default) (openai_compatible · DEEPSEEK_API_KEY)"]);
  });

  test("an engine row without a key falls to DEFAULT, then to any active row", async () => {
    const { resolve } = resolverWith({ ANTHROPIC_API_KEY: "sk-ant" });
    const pick = await selectUsableProvider(
      [deepseekDefault, openaiDrafting, anthropicAny],
      "DRAFTING",
      resolve
    );
    expect(pick.usable).toBe(true);
    expect(pick.provider?.name).toBe("Claude");
    expect(pick.skipped).toHaveLength(2);
  });

  test("when no key resolves, the top-ranked row is still named so the caller reports missing_key for it", async () => {
    const { resolve } = resolverWith({});
    const pick = await selectUsableProvider([deepseekDefault, openaiDrafting], "DRAFTING", resolve);
    expect(pick.usable).toBe(false);
    expect(pick.provider?.name).toBe("OpenAI drafting");
    expect(pick.skipped).toEqual([
      "OpenAI drafting (openai · OPENAI_API_KEY)",
      "DeepSeek (default) (openai_compatible · DEEPSEEK_API_KEY)",
    ]);
  });

  test("no active rows at all is `provider: null`, distinct from a missing key", async () => {
    const { resolve } = resolverWith({});
    const pick = await selectUsableProvider([], "DEFAULT", resolve);
    expect(pick).toEqual({ provider: null, usable: false, skipped: [] });
  });

  test("Ollama needs no credential and is never skipped for lacking one", async () => {
    const { resolve, calls } = resolverWith({});
    const pick = await selectUsableProvider([ollamaLocal], "EMBEDDING", resolve);
    expect(pick.usable).toBe(true);
    expect(calls).toEqual([]);
    expect(providerNeedsCredential(ollamaLocal)).toBe(false);
    expect(providerNeedsCredential(openaiDrafting)).toBe(true);
  });

  test("the skip label names the row and the env key, never a secret", () => {
    expect(describeProviderRow(deepseekDefault)).toBe(
      "DeepSeek (default) (openai_compatible · DEEPSEEK_API_KEY)"
    );
    expect(describeProviderRow(ollamaLocal)).toBe("Ollama (ollama · default env)");
  });
});

describe("the wiring", () => {
  const llm = read("src/lib/llm/index.ts");

  test("getProviderForEngine selects through the failover and warns once about skipped rows", () => {
    expect(llm).toMatch(/selectUsableProvider\(/);
    expect(llm).toMatch(/console\.warn\([\s\S]{0,200}skipped/);
    // The row's key value must never reach the log line.
    expect(llm).not.toMatch(/console\.warn\([^)]*\bkey\b[^)]*\)/);
  });

  test("the run preflight consults the same selection and mirrors generateCompletion's order", () => {
    expect(llm).toMatch(/export async function preflightProviders/);
    const fn = llm.slice(llm.indexOf("export async function preflightProviders"));
    const deterministicAt = fn.indexOf("ARABCLUE_LLM_DETERMINISTIC");
    const gatewayAt = fn.indexOf("gatewayAvailable()");
    const selectAt = fn.indexOf("selectUsableProvider(");
    expect(deterministicAt).toBeGreaterThan(-1);
    expect(deterministicAt).toBeLessThan(gatewayAt);
    expect(gatewayAt).toBeLessThan(selectAt);
  });

  test("the platform model resolver throws ProviderUnavailableError, not a plain Error", () => {
    const model = read("src/lib/agents/platform/model.ts");
    expect(model).not.toMatch(/throw new Error\(/);
    expect(model.match(/new ProviderUnavailableError\(/g)?.length).toBe(4);
    expect(model).toMatch(/llmFailureKind: "no_provider"/);
    expect(model).toMatch(/llmFailureKind: "missing_key"/);
  });

  test("the chat and extension routes map through the central mapper, so the client gets 503 AI_PROVIDER_UNAVAILABLE", () => {
    for (const path of [
      "src/app/api/platform-agent/chat/route.ts",
      "src/app/api/platform-agent/extension/copilot/route.ts",
    ]) {
      const src = read(path);
      expect(src, path).toMatch(/return toErrorResponse\(err,/);
      expect(src, path).not.toMatch(/jsonApiFailure\("INTERNAL_ERROR"\)/);
    }
  });
});
