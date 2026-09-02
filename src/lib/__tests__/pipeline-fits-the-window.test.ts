/**
 * The long calls get a budget of their own, and the two tails run side by side.
 *
 * Production, fifth attempt: four agents complete on real AI and the run
 * dies on `drafting:generateProposal, timeout: This operation was aborted`.
 * The transport aborts each attempt at the provider row's 60 s and retries a
 * timeout three times, so a proposal that needs two minutes of generation
 * gets three minutes of failing. Two changes, each with a check below:
 *   - a caller can give one call a budget of its own (`timeoutMs`) and refuse
 *     the transport's retries for it (`maxAttempts: 1`), and the two long
 *     steps do — the durable workflow retries the whole stage instead
 *     (see pipeline-durable-workflow.test.ts);
 *   - agents 5 and 6 share no inputs — the contract is drafted from the
 *     ingestion entities and compliance rows, not from the proposal — so they
 *     run concurrently and the run's tail is the longer of the two, not the sum.
 *
 * The third change this file used to pin — a bounded "resume" that restarted
 * all six agents from zero when the heartbeat went quiet — is gone: the
 * workflow engine owns retries now, and a quiet run is failed with a reason.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const LLM = "src/lib/llm/index.ts";
const ORCH = "src/lib/agents/orchestrator.ts";
const DRAFTING = "src/lib/agents/drafting.ts";
const LAW = "src/lib/agents/law-contract.ts";

function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}
function has(path: string, what: string, pattern: RegExp): void {
  expect(pattern.test(read(path)), `${path} — missing ${what}: ${pattern}`).toBe(true);
}

describe("a long call gets its own budget, and no retries", () => {
  test("generateCompletion accepts timeoutMs and maxAttempts", () => {
    has(LLM, "the timeoutMs option", /timeoutMs\?:\s*number/);
    has(LLM, "the maxAttempts option", /maxAttempts\?:\s*number/);
    // The per-call budget has to reach the transports, which read the
    // provider row's timeout; and the attempt count has to reach withRetries.
    has(LLM, "the budget applied to the provider row", /timeoutMs:\s*opts\.timeoutMs/);
    has(LLM, "the attempt count reaching withRetries", /maxAttempts:\s*opts\?\.maxAttempts/);
  });

  test("drafting and the contract ask for a single long attempt", () => {
    has(DRAFTING, "a long budget", /timeoutMs:\s*\d{3}_\d{3}/);
    has(DRAFTING, "one attempt", /maxAttempts:\s*1/);
    has(LAW, "a long budget", /timeoutMs:\s*\d{3}_\d{3}/);
    has(LAW, "one attempt", /maxAttempts:\s*1/);
  });
});

describe("agents 5 and 6 run concurrently", () => {
  test("the two stages are separate steps settled together by the workflow", () => {
    has(ORCH, "the drafting stage", /export async function runDraftingStage\(/);
    has(ORCH, "the law stage", /export async function runLawStage\(/);
    has(
      "src/lib/agents/pipeline-workflow.ts",
      "both settled together",
      /Promise\.allSettled\(\[\s*draftingStep\([^)]*\),\s*lawStep\([^)]*\),?\s*\]\)/,
    );
  });

  test("the final artifact is merged after both, in the finalise stage", () => {
    // The law stage used to read the drafting artifact back and augment it;
    // finishing first, it would have read nothing and the drafting stage
    // would then overwrite the contract id away.
    const src = read(ORCH);
    const finalize = src.indexOf("export async function runFinalizeStage(");
    const merge = src.indexOf("// Augment final artifact with contract id");
    expect(finalize).toBeGreaterThan(0);
    expect(merge).toBeGreaterThan(finalize);
  });
});
