/**
 * The pricing refusal is for a person asking, not for a tender describing.
 *
 * Fifth durable run in production (2026-09-02, run cmtjnk34b0007l404z3wlpvl7):
 * the live draft stream showed the whole "proposal" was one sentence — the
 * pricing refusal message — saved as a GENERATED, export-ready proposal with
 * `fallback: false`. `applyPricingInputGuardrails` had matched the drafting
 * prompt: the pipeline embeds the financial extract and tender excerpts in
 * its "user" message, and that run's AI-enriched financial notes contained
 * "calculate … margin". The same inputs had passed three times; the phrase
 * varies per run. An RFP telling bidders to "calculate the unit price" would
 * trip it every time.
 *
 * Two changes: a caller declares that its prompt was composed by the system
 * around tender data, and the input gate steps aside for those (the output
 * guard — no recommended prices in what the model returns — still applies to
 * every call); and a draft that is the refusal is a failed draft, never a
 * proposal.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyPricingInputGuardrails } from "../guardrails";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}
function has(path: string, what: string, pattern: RegExp): void {
  expect(pattern.test(read(path)), `${path} — missing ${what}: ${pattern}`).toBe(true);
}

const composed = [
  { role: "system" as const, content: "You draft proposals." },
  {
    role: "user" as const,
    content:
      'Financial extract: {"notes":["Calculate the margin on each BoQ line before submission"]} — draft the technical proposal.',
  },
];

describe("applyPricingInputGuardrails by prompt origin", () => {
  test("a person's request is still refused", () => {
    expect(applyPricingInputGuardrails(composed).allowed).toBe(false);
    expect(applyPricingInputGuardrails(composed, "user").allowed).toBe(false);
  });

  test("a system-composed prompt carrying tender data is allowed through", () => {
    expect(applyPricingInputGuardrails(composed, "system").allowed).toBe(true);
  });
});

describe("the pipeline declares its prompts and never ships the refusal as a draft", () => {
  test("generateCompletion takes the origin and hands it to the gate", () => {
    has("src/lib/llm/index.ts", "the option", /promptOrigin\?:\s*PromptOrigin/);
    has("src/lib/llm/index.ts", "the gate reads it", /applyPricingInputGuardrails\(filteredMessages,\s*opts\?\.promptOrigin/);
  });

  test("every pipeline call is system-composed", () => {
    for (const path of [
      "src/lib/agents/drafting.ts",
      "src/lib/agents/law-contract.ts",
      "src/lib/agents/enrich.ts",
      "src/lib/agents/platform/classify-attachment.ts",
    ]) {
      has(path, "promptOrigin: system", /promptOrigin:\s*"system"/);
    }
  });

  test("the rewrite route and the ai helpers keep the default, guarded, origin", () => {
    for (const path of [
      "src/app/api/proposals/[id]/rewrite/route.ts",
      "src/lib/ai/proposal-optimizer.ts",
      "src/lib/ai/contract-drafting-assistant.ts",
    ]) {
      expect(/promptOrigin:\s*"system"/.test(read(path)), path).toBe(false);
    }
  });

  test("a refusal result is a failed draft, not a proposal", () => {
    has("src/lib/agents/drafting.ts", "the refusal rejected", /failureKind === "pricing_refusal"[\s\S]{0,200}throw/);
  });
});
