/**
 * Nobody starts the agent pipeline with a floating promise.
 *
 * `void runAgentPipeline(...)` inside a request handler is a bet that the
 * serverless runtime keeps executing after the response is sent. It does not:
 * Vercel freezes the invocation once the handler returns, so the run row is
 * created, the audit entry is written, the UI navigates to the agents view —
 * and the pipeline that was supposed to fill it may never have got past its
 * first await. The user sees a QUEUED run that never moves.
 *
 * `scheduleAgentPipeline` already solves this with `after()`, which hands the
 * work to `waitUntil`. This locks every caller onto it, because the failure is
 * invisible in every local run: `void` works fine on a long-lived Node server.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const SRC = join(REPO_ROOT, "src");

/** The definition and the scheduler itself, which must call it directly. */
const ALLOWED = new Set([
  join(SRC, "lib", "agents", "orchestrator.ts"),
  join(SRC, "lib", "agents", "schedule-pipeline.ts"),
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "__tests-isolated") continue;
      walk(full, out);
    } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

const FILES = walk(SRC);
const rel = (f: string) => f.slice(REPO_ROOT.length + 1);

/**
 * Call sites only. An `import` line names the function too, and a module that
 * imports it in order to pass it somewhere else is not the thing being
 * guarded against.
 */
function startsPipelineDirectly(file: string): boolean {
  const src = readFileSync(file, "utf8");
  return /(?:^|[^.\w])(?:void\s+|await\s+|return\s+)?runAgentPipeline\s*\(/m.test(
    src
  );
}

describe("agent pipeline scheduling", () => {
  test("the scheduler exists and hands the work to after()", () => {
    // Anti-vacuous: if this file ever stopped calling `after`, the rule below
    // would still pass while every caller went back to being fire-and-forget.
    const src = readFileSync(
      join(SRC, "lib", "agents", "schedule-pipeline.ts"),
      "utf8"
    );
    expect(src).toContain('from "next/server"');
    expect(src).toMatch(/\bafter\(/);
    expect(src).toMatch(/runAgentPipeline\s*\(/);
  });

  test("the scan finds the modules that do start it", () => {
    // Anti-vacuous the other way: a regex that matched nothing would make the
    // real assertion trivially true.
    const starters = FILES.filter(startsPipelineDirectly).map(rel);
    expect(starters).toContain("src/lib/agents/schedule-pipeline.ts");
    expect(starters).toContain("src/lib/agents/orchestrator.ts");
  });

  test("no other module starts the pipeline itself", () => {
    const offenders = FILES.filter(
      (f) => !ALLOWED.has(f) && startsPipelineDirectly(f)
    ).map(rel);
    expect(offenders).toEqual([]);
  });
});
