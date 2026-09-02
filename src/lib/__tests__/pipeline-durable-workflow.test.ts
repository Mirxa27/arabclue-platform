/**
 * The pipeline runs as a durable workflow, not as one serverless invocation.
 *
 * Vercel Hobby caps a function at 300 s and no configuration lifts it
 * (functions/limitations, last updated 2026-08-24). Yesterday's fix squeezed
 * six agents into that window: drafting and the contract concurrent, one
 * 200 s attempt each, the draft cut off at 8 192 tokens, and a "resume" that
 * restarted all six agents from zero when the heartbeat went quiet. Vercel
 * Workflows (workflow@4.8.5, docs bundled in node_modules/workflow/docs) run
 * each step in its own function at the plan's maximum and the run itself
 * without limit, retry a step that dies, and peg a run to the deployment that
 * started it.
 *
 * The cut: one step for agents 1–4 (they share the extracted corpus), one
 * step each for drafting and the contract (they share no inputs, so they run
 * in parallel with a full window apiece), one step to finalise. Stages hand
 * each other plain data; each stage persists its own agents' progress by
 * merging into the run row, so two parallel steps never overwrite each other.
 * A provider rate limit or timeout inside a stage retries the stage after a
 * delay instead of failing the run; anything else fails it with the same
 * classified reason as before.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isTransientRunFailure,
  transientRetryDelayMs,
} from "../agents/run-failure";
import { createMetricsTracker, mergeMetricsSnapshots } from "../agents/agent-metrics";
import { createDecisionLogger } from "../agents/decision-logger";
import { mergeOwnedAgentStates } from "../agents/run-recorder";
import { parseAgentRunConfig } from "../proposal-studio";
import type { AgentState } from "../types";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const WORKFLOW = "src/lib/agents/pipeline-workflow.ts";
const SCHEDULE = "src/lib/agents/schedule-pipeline.ts";
const ORCH = "src/lib/agents/orchestrator.ts";
const STATUS = "src/app/api/agents/status/route.ts";

function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}
function has(path: string, what: string, pattern: RegExp): void {
  expect(pattern.test(read(path)), `${path} — missing ${what}: ${pattern}`).toBe(true);
}
function lacks(path: string, what: string, pattern: RegExp): void {
  expect(pattern.test(read(path)), `${path} — still has ${what}: ${pattern}`).toBe(false);
}

describe("the build knows about workflows", () => {
  test("next.config is wrapped and still exports the plain config for the header tests", () => {
    has("next.config.ts", "the workflow wrapper", /from "workflow\/next"/);
    has("next.config.ts", "the wrapped default export", /export default withWorkflow\(nextConfig\)/);
    has("next.config.ts", "the named plain config", /export const nextConfig: NextConfig = \{/);
  });

  test("the proxy leaves the workflow's internal routes alone", () => {
    // getting-started/next.mdx: a proxy matcher that intercepts
    // /.well-known/workflow/v1/flow breaks step execution and resumption.
    has("src/proxy.ts", "the exclusion", /\.well-known\/workflow\//);
  });

  test("the sdk is a declared dependency", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies.workflow).toBeDefined();
  });

  test("the undici override stays on the major the workflow worlds are written for", () => {
    // Bun honours only top-level overrides, so the advisory pin on undici
    // reaches @workflow/world-vercel too. Its events dispatcher composes with
    // undici 7 semantics; under the 6.28.0 pin every start() in production
    // failed with "fetch failed — Cannot read private member #dispatch".
    // @vercel/blob, the pin's original target, imports only `fetch`, which is
    // the same API on both majors, so the pin moves up rather than away.
    const pkg = JSON.parse(read("package.json")) as { overrides?: Record<string, string> };
    const pin = pkg.overrides?.undici;
    expect(pin).toBeDefined();
    expect(/^(?:\^|~)?7\./.test(pin ?? "")).toBe(true);
  });
});

describe("the workflow module", () => {
  test("one workflow, five steps, drafting and the contract in parallel", () => {
    // prepare, drafting, law, finalise — and one that fails the run when a
    // step's function died without its stage getting to write anything.
    has(WORKFLOW, "the workflow directive", /export async function agentPipelineWorkflow[\s\S]{0,200}"use workflow"/);
    const steps = read(WORKFLOW).match(/"use step"/g) ?? [];
    expect(steps.length).toBe(5);
    has(WORKFLOW, "parallel drafting and law", /Promise\.allSettled\(\[\s*draftingStep\(/);
  });

  test("steps bound their own retries and read the attempt for the stage", () => {
    has(WORKFLOW, "retry bounds", /\.maxRetries = (?:\d+|STAGE_RETRIES);/);
    has(WORKFLOW, "the attempt handed to the stage", /getStepMetadata\(\)/);
  });
});

describe("scheduling starts the workflow", () => {
  test("the scheduler calls start() and no longer bets on after()", () => {
    has(SCHEDULE, "start from workflow/api", /import \{ start \} from "workflow\/api"/);
    has(SCHEDULE, "the workflow started", /start\(agentPipelineWorkflow,/);
    lacks(SCHEDULE, "the old after() hand-off", /\bafter\(/);
    lacks(SCHEDULE, "the in-process pipeline", /runAgentPipeline/);
  });

  test("a start that fails is written to the run, not swallowed", () => {
    has(SCHEDULE, "the FAILED write", /status:\s*"FAILED"/);
    has(SCHEDULE, "the classified kind", /failureKind:\s*"INTERNAL"/);
  });

  test("the workflow run id is kept on the run config for observability", () => {
    has(SCHEDULE, "the id recorded", /workflowRunId/);
    const cfg = parseAgentRunConfig(
      JSON.stringify({ workspaceId: "w", userId: "u", projectId: "p", workflowRunId: "wrun_1" }),
    );
    expect(cfg?.workflowRunId).toBe("wrun_1");
    const none = parseAgentRunConfig(JSON.stringify({ workspaceId: "w", userId: "u", projectId: "p" }));
    expect(none?.workflowRunId).toBeNull();
  });
});

describe("the status route no longer restarts a quiet run", () => {
  test("stale means failed with a reason, never a second execution", () => {
    lacks(STATUS, "the resume hand-off", /scheduleAgentPipeline/);
    lacks(STATUS, "the resume budget", /MAX_STALE_RESUMES|resumeCount/);
    has(STATUS, "the timeout write", /failureKind:\s*"TIMEOUT"/);
  });
});

describe("the orchestrator is four stages that hand each other plain data", () => {
  test("stages are exported and the monolith is gone", () => {
    has(ORCH, "the preparation stage", /export async function runPreparationStage\(/);
    has(ORCH, "the drafting stage", /export async function runDraftingStage\(/);
    has(ORCH, "the law stage", /export async function runLawStage\(/);
    has(ORCH, "the finalise stage", /export async function runFinalizeStage\(/);
    lacks(ORCH, "the single-invocation pipeline", /export async function runAgentPipeline\(/);
    lacks(ORCH, "the polling starter", /ensurePipelineStarted/);
  });

  test("a stage that is quiet for a long call keeps the heartbeat alive", () => {
    // isAgentRunStale fails a RUNNING row after 180 s without a write; a
    // 270 s drafting call would trip it from inside a healthy step.
    has(ORCH, "the heartbeat wrapper", /withHeartbeat\(/);
  });

  test("the two long calls get the whole step window", () => {
    has("src/lib/agents/drafting.ts", "a step-sized budget", /timeoutMs:\s*27\d_000/);
    has("src/lib/agents/law-contract.ts", "a step-sized budget", /timeoutMs:\s*27\d_000/);
  });
});

describe("transient failures retry, the rest fail the run", () => {
  test("classification", () => {
    expect(isTransientRunFailure("RATE_LIMIT")).toBe(true);
    expect(isTransientRunFailure("TIMEOUT")).toBe(true);
    expect(isTransientRunFailure("PROVIDER_UNAVAILABLE")).toBe(true);
    expect(isTransientRunFailure("INVALID_INPUT")).toBe(false);
    expect(isTransientRunFailure("INTERNAL")).toBe(false);
    expect(isTransientRunFailure("USER_CANCELLED")).toBe(false);
  });

  test("a rate limit waits longest, a timeout barely waits", () => {
    expect(transientRetryDelayMs("RATE_LIMIT")).toBeGreaterThan(transientRetryDelayMs("PROVIDER_UNAVAILABLE"));
    expect(transientRetryDelayMs("PROVIDER_UNAVAILABLE")).toBeGreaterThan(transientRetryDelayMs("TIMEOUT"));
    expect(transientRetryDelayMs("TIMEOUT")).toBeGreaterThan(0);
  });
});

describe("state that crosses a step boundary", () => {
  const state = (id: AgentState["id"], patch: Partial<AgentState>): AgentState => ({
    id,
    name: id,
    nameAr: id,
    status: "pending",
    progress: 0,
    ...patch,
  });

  test("a stage writes only the agents it owns, keeping the other stage's progress", () => {
    const inDb = [
      state("INGESTION", { status: "completed", progress: 100 }),
      state("PROPOSAL_DRAFTING", { status: "running", progress: 40 }),
      state("LAW_CONTRACT", { status: "running", progress: 70 }),
    ];
    const mine = [
      state("INGESTION", { status: "completed", progress: 100 }),
      state("PROPOSAL_DRAFTING", { status: "completed", progress: 100 }),
      state("LAW_CONTRACT", { status: "pending", progress: 0 }), // stale copy from the hand-off
    ];
    const merged = mergeOwnedAgentStates(inDb, mine, new Set(["PROPOSAL_DRAFTING"]));
    expect(merged.find((s) => s.id === "PROPOSAL_DRAFTING")?.progress).toBe(100);
    expect(merged.find((s) => s.id === "LAW_CONTRACT")?.progress).toBe(70);
    expect(merged.find((s) => s.id === "INGESTION")?.progress).toBe(100);
  });

  test("with nothing in the row yet, the stage's own states are written whole", () => {
    const mine = [state("INGESTION", { status: "running", progress: 10 })];
    expect(mergeOwnedAgentStates(null, mine, new Set(["INGESTION"]))).toEqual(mine);
  });

  test("the metrics tracker round-trips through a snapshot and merges two parallel stages", () => {
    const first = createMetricsTracker("r", "p");
    first.startAgent("INGESTION");
    first.completeAgent("INGESTION", { evidenceCount: 3 });
    const seed = first.snapshot();

    const drafting = createMetricsTracker("r", "p", seed);
    drafting.startAgent("PROPOSAL_DRAFTING");
    drafting.completeAgent("PROPOSAL_DRAFTING", { tokensUsed: 10 });
    drafting.blockExport();

    const law = createMetricsTracker("r", "p", seed);
    law.startAgent("LAW_CONTRACT");
    law.completeAgent("LAW_CONTRACT", { tokensUsed: 5 });

    const merged = mergeMetricsSnapshots(seed, drafting.snapshot(), law.snapshot());
    const final = createMetricsTracker("r", "p", merged).build("COMPLETED", 100);
    expect(Object.keys(final.timing).sort()).toEqual(["INGESTION", "LAW_CONTRACT", "PROPOSAL_DRAFTING"]);
    expect(final.quality.INGESTION.evidenceCount).toBe(3);
    expect(final.quality.PROPOSAL_DRAFTING.tokensUsed).toBe(10);
    expect(final.quality.LAW_CONTRACT.tokensUsed).toBe(5);
    expect(final.reliability.blockedExports).toBe(1);
    // The run's clock is the first stage's, not the finaliser's.
    expect(final.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  test("the decision logger can be seeded with an earlier stage's entries", () => {
    const first = createDecisionLogger();
    first.log({ agentId: "INGESTION", ruleId: "a", sourceCategory: "DETERMINISTIC_CALC", level: "INFO", message: "one" });
    const second = createDecisionLogger(first.getEntries());
    second.log({ agentId: "PROPOSAL_DRAFTING", ruleId: "b", sourceCategory: "DETERMINISTIC_CALC", level: "INFO", message: "two" });
    expect(second.getEntries().map((e) => e.message)).toEqual(["one", "two"]);
    expect(first.getEntries()).toHaveLength(1);
  });
});
