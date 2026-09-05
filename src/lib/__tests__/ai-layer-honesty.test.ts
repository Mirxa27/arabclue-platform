/**
 * WP-B AI-layer fixes that are pure or source-shaped: non-transient
 * configuration failures (task 3), the shared run launcher (task 4), the
 * rewrite route's pricing refusal (task 5), fallback labels that render
 * whenever the fallback happened (task 6), and the privileged-tool approval
 * gate plus the untrusted-document envelope (task 8).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ProviderUnavailableError } from "../ai/provider-unavailable";
import { apiFailure, resolveFailureStatus } from "../api-failure";
import {
  classifyRunFailure,
  isTransientRunFailure,
  llmFailureKindOf,
} from "../agents/run-failure";
import {
  PRIVILEGED_TOOL_NAMES,
  requiresConfirmationResult,
  toolCallNeedsApproval,
  wrapUntrustedDocument,
} from "../agents/platform/tool-approval";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("task 3 — a run with no usable provider fails at once instead of retrying", () => {
  test("missing_key, no_provider and deterministic_mode are not transient", () => {
    for (const kind of ["missing_key", "no_provider", "deterministic_mode"]) {
      const err = new ProviderUnavailableError({
        context: "drafting",
        llmFailureKind: kind as never,
      });
      const runKind = classifyRunFailure(err);
      expect(runKind).toBe("PROVIDER_UNAVAILABLE");
      expect(isTransientRunFailure(runKind, llmFailureKindOf(err)), kind).toBe(false);
    }
  });

  test("a provider that was merely busy or slow is still retried", () => {
    for (const kind of ["network", "server_error", "guardrail_rejected", undefined]) {
      const err = new ProviderUnavailableError({
        context: "drafting",
        llmFailureKind: kind as never,
      });
      expect(isTransientRunFailure(classifyRunFailure(err), llmFailureKindOf(err)), String(kind)).toBe(true);
    }
    expect(isTransientRunFailure("RATE_LIMIT", "rate_limited")).toBe(true);
    expect(isTransientRunFailure("TIMEOUT", "timeout")).toBe(true);
  });

  test("llmFailureKindOf reads the kind off the thrown error and nothing else", () => {
    expect(llmFailureKindOf(new ProviderUnavailableError({ context: "x", llmFailureKind: "missing_key" }))).toBe("missing_key");
    expect(llmFailureKindOf(new Error("boom"))).toBeNull();
    expect(llmFailureKindOf(null)).toBeNull();
    expect(llmFailureKindOf("missing_key")).toBeNull();
  });

  test("the orchestrator passes the LLM kind into the retry decision", () => {
    expect(read("src/lib/agents/orchestrator.ts")).toMatch(
      /isTransientRunFailure\(kind, llmFailureKindOf\(err\)\)/
    );
  });

  test("the launcher preflights providers after onboarding and quota, before any row is written", () => {
    const src = stripComments(read("src/lib/agents/launch-pipeline.ts"));
    const onboardingAt = src.indexOf("computeOnboardingSteps(");
    const quotaAt = src.indexOf('assertWithinQuota(input.userId, "proposal")');
    const tokensAt = src.indexOf('assertWithinQuota(input.userId, "tokens")');
    const preflightAt = src.indexOf("preflightProviders(");
    const createAt = src.indexOf("agentRun.create(");
    expect(onboardingAt).toBeGreaterThan(-1);
    expect(onboardingAt).toBeLessThan(quotaAt);
    expect(quotaAt).toBeLessThan(tokensAt);
    expect(tokensAt).toBeLessThan(preflightAt);
    expect(preflightAt).toBeLessThan(createAt);
    expect(src).toMatch(/code: "AI_PROVIDER_UNAVAILABLE"/);
    expect(resolveFailureStatus("AI_PROVIDER_UNAVAILABLE")).toBe(503);
  });
});

describe("task 4 — one launcher, four callers", () => {
  test("the REST route, the tools, and both autopilots launch through it and none creates a run itself", () => {
    for (const path of [
      "src/app/api/agents/run/route.ts",
      "src/app/api/platform-agent/missions/[id]/autopilot/route.ts",
      "src/lib/agents/platform/tools.ts",
      "src/lib/agents/platform/autopilot.ts",
    ]) {
      const src = stripComments(read(path));
      expect(src, path).toMatch(/launch-pipeline"/);
      expect(src, path).not.toMatch(/agentRun\.create\(/);
    }
  });

  test("the launcher keeps the REST route's stale-run auto-fail and the transactional re-check", () => {
    const src = stripComments(read("src/lib/agents/launch-pipeline.ts"));
    expect(src).toMatch(/isAgentRunStale\(/);
    expect(src).toMatch(/failureKind: "TIMEOUT"/);
    expect(src).toMatch(/\$transaction\(async \(tx\) =>[\s\S]{0,400}tx\.agentRun\.findFirst/);
  });

  test("autopilot reports a blocked launch as a structured result carrying a registered code", () => {
    const src = read("src/lib/agents/platform/autopilot.ts");
    expect(src).toMatch(/mode: "blocked"/);
    expect(src).toMatch(/code: "ONBOARDING_INCOMPLETE"/);
    // The developer-facing English sentence must not be the clarifying question.
    expect(src).not.toMatch(/question: e\.message/);
  });
});

describe("task 5 — the pricing refusal never becomes a rewrite", () => {
  const route = stripComments(read("src/app/api/proposals/[id]/rewrite/route.ts"));

  test("pricing_refusal returns PRICING_REFUSED before anything is applied or versioned", () => {
    const refuseAt = route.indexOf('result.failureKind === "pricing_refusal"');
    const applyAt = route.indexOf("applySectionRewrite(");
    const versionAt = route.indexOf("proposalVersion.create(");
    expect(refuseAt).toBeGreaterThan(-1);
    expect(route.slice(refuseAt, refuseAt + 200)).toMatch(/jsonApiFailure\("PRICING_REFUSED"\)/);
    expect(refuseAt).toBeLessThan(applyAt);
    expect(refuseAt).toBeLessThan(versionAt);
  });

  test("PRICING_REFUSED is a registered bilingual 422", () => {
    const body = apiFailure("PRICING_REFUSED");
    expect(body.code).toBe("PRICING_REFUSED");
    expect(/[؀-ۿ]/.test(body.message.ar)).toBe(true);
    expect(body.message.en).toContain("bid prices");
    expect(resolveFailureStatus("PRICING_REFUSED")).toBe(422);
  });

  test("the selection reaches the model fenced as data", () => {
    expect(route).toMatch(/<document>\\n\$\{selection\.slice\(0, 14000\)\}\\n<\/document>/);
  });
});

describe("task 6 — the fallback label renders whenever the fallback happened", () => {
  const src = stripComments(read("src/lib/agents/orchestrator.ts"));

  /** Text of the `if (<guard>) { … }` block, by brace matching from the guard. */
  function blockOf(guard: string): string {
    const at = src.indexOf(guard);
    expect(at, guard).toBeGreaterThan(-1);
    const open = src.indexOf("{", at + guard.length - 1);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth += 1;
      if (src[i] === "}") {
        depth -= 1;
        if (depth === 0) return src.slice(open, i + 1);
      }
    }
    throw new Error(`unterminated block for ${guard}`);
  }

  const sites: Array<[string, string]> = [
    ["if (ingestionAi.data)", "Ingestion AI skill unavailable"],
    ["if (complianceAi.data)", "Compliance AI skill unavailable"],
    ["if (technicalAi.data)", "Technical AI skill unavailable"],
    ["if (financialAi.data)", "Financial AI skill unavailable"],
  ];

  test.each(sites)("%s does not own the '%s' label", (guard, label) => {
    // `fallback: true` implies `data === null`, so a label inside the data
    // check could never read "unavailable".
    expect(blockOf(guard)).not.toContain(label);
    expect(src).toContain(label);
  });
});

describe("task 8 — privileged tools wait for a human; document text is data", () => {
  test("the four mutating tools are privileged; reads and navigation are not", () => {
    expect([...PRIVILEGED_TOOL_NAMES].sort()).toEqual(
      ["cancelAgentRun", "decideReview", "orchestrateTenderPackage", "updateProject"].sort()
    );
    expect(toolCallNeedsApproval("decideReview", { reviewId: "r1", status: "APPROVED" })).toBe(true);
    expect(toolCallNeedsApproval("cancelAgentRun", { runId: "run1" })).toBe(true);
    expect(toolCallNeedsApproval("orchestrateTenderPackage", { title: "Tender" })).toBe(true);
    for (const name of ["listProjects", "navigateToView", "searchDocumentChunks", "startAgentPipeline"]) {
      expect(toolCallNeedsApproval(name, {}), name).toBe(false);
    }
  });

  test("updateProject is privileged only when it changes the status", () => {
    expect(toolCallNeedsApproval("updateProject", { projectId: "p", status: "ARCHIVED" })).toBe(true);
    expect(toolCallNeedsApproval("updateProject", { projectId: "p", title: "Renamed" })).toBe(false);
    expect(toolCallNeedsApproval("updateProject", { projectId: "p", status: "" })).toBe(false);
    expect(toolCallNeedsApproval("updateProject", null)).toBe(false);
  });

  test("the voice path's refusal is structured and bilingual", () => {
    const en = requiresConfirmationResult("cancelAgentRun", "en");
    const ar = requiresConfirmationResult("cancelAgentRun", "ar");
    expect(en.ok).toBe(false);
    expect(en.requiresConfirmation).toBe(true);
    expect(en.toolName).toBe("cancelAgentRun");
    expect(en.error).toContain("approval");
    expect(/[؀-ۿ]/.test(ar.error)).toBe(true);
  });

  test("the envelope wraps and the prompt states the rule once", () => {
    expect(wrapUntrustedDocument("hello")).toBe("<untrusted_document>\nhello\n</untrusted_document>");
    const instructions = read("src/lib/agents/platform/instructions.ts");
    expect(instructions).toContain("<untrusted_document>");
    expect(instructions).toContain("never instructions");
    expect(instructions).not.toContain("without asking for confirmations");
    expect(instructions).toContain("Privileged actions require the user's confirmation");
  });

  test("the agent loop, the voice path, and the consoles are wired to the gate", () => {
    const mainAgent = read("src/lib/agents/platform/main-agent.ts");
    expect(mainAgent).toMatch(/toolApproval:[\s\S]{0,200}toolCallNeedsApproval\(/);

    const realtime = stripComments(read("src/lib/agents/platform/realtime.ts"));
    const gateAt = realtime.indexOf("toolCallNeedsApproval(toolName, input)");
    const executeAt = realtime.indexOf("tool.execute(input,");
    expect(gateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(executeAt);

    for (const path of [
      "src/components/dashboard/platform-agent-console.tsx",
      "src/components/dashboard/assistant-dock.tsx",
    ]) {
      const src = read(path);
      expect(src, path).toContain("addToolApprovalResponse");
      expect(src, path).toContain("lastAssistantMessageIsCompleteWithApprovalResponses");
      expect(src, path).toContain('"approval-requested"');
      expect(src, path).toMatch(/approved: true/);
      expect(src, path).toMatch(/approved: false/);
    }
  });

  test("every document-derived tool output is fenced, and status is an enum", () => {
    const tools = stripComments(read("src/lib/agents/platform/tools.ts"));
    expect(tools.match(/wrapUntrustedDocument\(/g)?.length).toBeGreaterThanOrEqual(4);
    expect(tools).toMatch(/excerpt: wrapUntrustedDocument\(text\)/);
    expect(tools).toMatch(/content: wrapUntrustedDocument\(content\.slice\(0, 1500\)\)/);
    expect(tools).toMatch(/content: wrapUntrustedDocument\(h\.content\)/);
    expect(tools).toMatch(/status: z\s*\.enum\(\["DRAFT", "PARSING", "DRAFTING", "REVIEW", "SUBMITTED", "ARCHIVED"\]\)/);
    expect(tools).not.toMatch(/status: z\.string\(\)\.optional\(\)/);
  });
});
