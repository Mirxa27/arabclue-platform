/**
 * The pipeline has to finish inside one serverless invocation.
 *
 * Production, fifth attempt: four agents complete on real AI and the run
 * dies on `drafting:generateProposal, timeout: This operation was aborted`.
 * The transport aborts each attempt at the provider row's 60 s and retries a
 * timeout three times, so a proposal that needs two minutes of generation
 * gets three minutes of failing. And the team is on Vercel's Hobby plan,
 * where 300 s is the function ceiling — no configuration lifts it — while
 * the orchestrator runs its six agents strictly in sequence. The "resume"
 * that the status route performs on a stale run restarts all six from zero,
 * inside a 60 s invocation, once every three minutes, spending provider
 * tokens each time and never finishing.
 *
 * Three changes, each with a check below:
 *   - a caller can give one call a budget of its own (`timeoutMs`) and refuse
 *     retries for it (`maxAttempts: 1`), and the two long steps do;
 *   - agents 5 and 6 share no inputs — the contract is drafted from the
 *     ingestion entities and compliance rows, not from the proposal — so they
 *     run concurrently and the run's tail is the longer of the two, not the sum;
 *   - a stale run is resumed once, inside a full-length invocation, and after
 *     that it fails with a reason instead of looping.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseAgentRunConfig } from "../proposal-studio";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const LLM = "src/lib/llm/index.ts";
const ORCH = "src/lib/agents/orchestrator.ts";
const DRAFTING = "src/lib/agents/drafting.ts";
const LAW = "src/lib/agents/law-contract.ts";
const STATUS = "src/app/api/agents/status/route.ts";

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
  const src = read(ORCH);

  test("the two stages are closures settled together", () => {
    has(ORCH, "the drafting stage", /const runDraftingStage = async \(\) =>/);
    has(ORCH, "the law stage", /const runLawStage = async \(\) =>/);
    has(ORCH, "both settled together", /Promise\.allSettled\(\[\s*runDraftingStage\(\),\s*runLawStage\(\),?\s*\]\)/);
  });

  test("a failure in either stage is raised only after both settle", () => {
    // `Promise.all` would reject on the first failure while the other stage
    // is still writing a proposal row for a run about to be marked FAILED.
    expect(/Promise\.all\(\[\s*runDraftingStage/.test(src)).toBe(false);
    has(ORCH, "the drafting rejection rethrown", /draftingOutcome\.status === "rejected"/);
    has(ORCH, "the law rejection rethrown", /lawOutcome\.status === "rejected"/);
  });

  test("the final artifact is merged after both, not inside the law stage", () => {
    // The law stage used to read the drafting artifact back and augment it;
    // finishing first, it would have read nothing and the drafting stage
    // would then overwrite the contract id away.
    const lawStart = src.indexOf("const runLawStage = async () =>");
    const settle = src.indexOf("Promise.allSettled([");
    const merge = src.indexOf("// Augment final artifact with contract id");
    expect(lawStart).toBeGreaterThan(0);
    expect(settle).toBeGreaterThan(lawStart);
    expect(merge).toBeGreaterThan(settle);
  });
});

describe("a stale run is resumed once, with a full window", () => {
  test("the status route has the same ceiling as the run route", () => {
    has(STATUS, "a full-length invocation", /export const maxDuration = 300;/);
  });

  test("the run config carries a resume count", () => {
    const cfg = parseAgentRunConfig(
      JSON.stringify({ workspaceId: "w", userId: "u", projectId: "p", resumeCount: 1 }),
    );
    expect(cfg?.resumeCount).toBe(1);
    const fresh = parseAgentRunConfig(
      JSON.stringify({ workspaceId: "w", userId: "u", projectId: "p" }),
    );
    expect(fresh?.resumeCount).toBe(0);
    const junk = parseAgentRunConfig(
      JSON.stringify({ workspaceId: "w", userId: "u", projectId: "p", resumeCount: "many" }),
    );
    expect(junk?.resumeCount).toBe(0);
  });

  test("the second stale detection fails the run instead of resuming again", () => {
    has(STATUS, "the resume budget check", /resumeCount\s*>=\s*MAX_STALE_RESUMES/);
    has(STATUS, "the resume count written back", /resumeCount:\s*cfg\.resumeCount \+ 1/);
    has(STATUS, "a FAILED write on exhaustion", /status:\s*"FAILED"/);
  });
});
