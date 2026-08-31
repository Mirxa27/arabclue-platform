/**
 * Run quality flags must come from the AI call, not from its prose.
 *
 * Each agent leg calls an `enrich*WithAi` helper that returns an explicit
 * `{ data, provider, fallback }`. The orchestrator had that object in scope,
 * pushed an English sentence describing it into the findings list, then threw
 * the booleans away and reconstructed them by substring-searching the sentence
 * it had just written.
 *
 * That round trip is wrong in three separate ways, and the first is the one
 * that matters:
 *
 *   1. Silent false negative. `enrichJson` returns `{ data: null,
 *      fallback: true }` when the provider degrades (enrich.ts:48). The prose
 *      is only pushed inside `if (…Ai.data)`, so on a hard failure no sentence
 *      is written at all — and `findings.some(f => f.includes("unavailable"))`
 *      is then `false`. The persisted run records a clean AI leg for a run
 *      where the AI produced nothing.
 *
 *   2. False positive. `findings` also carries text extracted from the tender
 *      and notes written by the model. Either may contain the word
 *      "unavailable" — "Quick liquidity ratio unavailable" is already normal
 *      output elsewhere in this pipeline — flipping the flag on a healthy run.
 *
 *   3. Provider garbage. `find(f => f.includes("via"))` matches "deviation"
 *      and "obviously"; `.split("via ")` then does not split, and `.pop()`
 *      returns the whole finding as the provider name.
 *
 * These land in `AgentRun.finalArtifact.metrics.quality`, which is persisted
 * audit data for a regulated-procurement product. Nothing renders it today,
 * which is the only reason this is not already a visible wrong number.
 *
 * This is a structural guard rather than a behavioural one on purpose: the
 * expression lives inline in a ~1300-line orchestrator that needs a live
 * database and provider to reach. The regression it prevents is textual, so a
 * textual check catches it.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const orchestrator = readFileSync(
  resolve(process.cwd(), "src/lib/agents/orchestrator.ts"),
  "utf8"
);

/** Each `metrics.completeAgent("X", { … })` argument object, by agent id. */
function completeAgentCalls(): ReadonlyMap<string, string> {
  const calls = new Map<string, string>();
  const marker = "metrics.completeAgent(";
  let at = orchestrator.indexOf(marker);
  while (at !== -1) {
    const open = orchestrator.indexOf("{", at);
    // Balance braces so a nested object cannot truncate the slice.
    let depth = 0;
    let end = open;
    for (; end < orchestrator.length; end += 1) {
      if (orchestrator[end] === "{") depth += 1;
      else if (orchestrator[end] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const id = orchestrator.slice(at + marker.length, open).match(/"([A-Z_]+)"/);
    if (id) calls.set(id[1], orchestrator.slice(open, end + 1));
    at = orchestrator.indexOf(marker, end);
  }
  return calls;
}

describe("agent run quality flags come from the AI call, not its prose", () => {
  const calls = completeAgentCalls();

  test("the parser found every leg it is meant to check", () => {
    // Anti-vacuous: if the brace walk breaks, every assertion below passes on
    // an empty map.
    for (const id of [
      "INGESTION",
      "COMPLIANCE_REGULATORY",
      "TECHNICAL_ARCHITECT",
      "FINANCIAL_QUALIFICATION",
    ]) {
      expect(calls.has(id), `no completeAgent call parsed for ${id}`).toBe(true);
    }
  });

  test("no leg derives a quality flag by searching text", () => {
    const offenders: string[] = [];
    for (const [id, body] of calls) {
      if (/\.includes\(/.test(body) || /\.split\("via/.test(body)) {
        offenders.push(`${id} — ${body.replace(/\s+/g, " ").slice(0, 140)}`);
      }
    }
    expect(
      offenders,
      `quality flags reconstructed from prose:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  test("each enriched leg reports the boolean its AI helper returned", () => {
    const legs: readonly [string, string][] = [
      ["INGESTION", "ingestionAi"],
      ["COMPLIANCE_REGULATORY", "complianceAi"],
      ["TECHNICAL_ARCHITECT", "technicalAi"],
      ["FINANCIAL_QUALIFICATION", "financialAi"],
    ];
    for (const [id, variable] of legs) {
      const body = calls.get(id) ?? "";
      expect(body, `${id} does not read ${variable}.fallback`).toContain(
        `fallback: ${variable}.fallback`
      );
    }
  });

  test("the enrich failure contract the fix relies on still holds", () => {
    // If enrichJson ever stops returning fallback:true alongside data:null,
    // reading .fallback directly would inherit the same blind spot the prose
    // search had.
    const enrich = readFileSync(
      resolve(process.cwd(), "src/lib/agents/enrich.ts"),
      "utf8"
    );
    expect(enrich).toContain(
      "return { data: null, provider: result.provider, tokensUsed: result.tokensUsed, fallback: true };"
    );
    expect(enrich).toContain("fallback: !data,");
  });
});
