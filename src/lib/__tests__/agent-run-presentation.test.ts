/**
 * The agent cards render `AgentState.output` verbatim, in both locales. That
 * string was written for a developer reading a log: it carried raw cuids
 * ("Proposal cmr… generated via zai"), internal provider tokens, and formula
 * shorthand ("QLR=1.4; BoQ lines=37"), and it was English even when the
 * workspace was Arabic.
 *
 * Output is now bilingual and id-free at the point it is produced, with the
 * plain-string form still accepted so runs already persisted keep rendering.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  agentOutputText,
  runHeadlineBadge,
  statusPollDisposition,
} from "../agents/run-presentation";
import { buildIngestionSummary, parseTenderText } from "../agents/ingestion";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

describe("agentOutputText", () => {
  test("resolves a bilingual output to the active locale", () => {
    const output = { ar: "تمت صياغة العطاء", en: "Proposal drafted" };
    expect(agentOutputText(output, "ar")).toBe("تمت صياغة العطاء");
    expect(agentOutputText(output, "en")).toBe("Proposal drafted");
  });

  test("passes a legacy plain string through unchanged", () => {
    // Runs persisted before this change store a bare string in agentStates JSON.
    expect(agentOutputText("Compliance score 82%", "ar")).toBe(
      "Compliance score 82%"
    );
  });

  test("reports absence rather than an empty box", () => {
    expect(agentOutputText(undefined, "en")).toBeNull();
    expect(agentOutputText({ ar: "", en: "" }, "en")).toBeNull();
  });
});

describe("runHeadlineBadge", () => {
  test("a cancelled run is not reported as ready", () => {
    const idle = runHeadlineBadge(
      { running: false, completed: false, status: null },
      "en"
    );
    const cancelled = runHeadlineBadge(
      { running: false, completed: true, status: "CANCELLED" },
      "en"
    );
    expect(cancelled.label).not.toBe(idle.label);
    expect(cancelled.tone).toBe("muted");
    expect(runHeadlineBadge(
      { running: false, completed: true, status: "CANCELLED" },
      "ar"
    ).label).toBe("ملغي");
  });

  test("running, completed and failed each get their own tone", () => {
    expect(
      runHeadlineBadge({ running: true, completed: false, status: "RUNNING" }, "en")
        .tone
    ).toBe("live");
    expect(
      runHeadlineBadge({ running: false, completed: true, status: "COMPLETED" }, "en")
        .tone
    ).toBe("success");
    expect(
      runHeadlineBadge({ running: false, completed: true, status: "FAILED" }, "en")
        .tone
    ).toBe("danger");
  });

  test("every label is translated", () => {
    for (const status of [null, "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]) {
      const running = status === "RUNNING";
      const ar = runHeadlineBadge(
        { running, completed: !running && status !== null, status },
        "ar"
      ).label;
      const en = runHeadlineBadge(
        { running, completed: !running && status !== null, status },
        "en"
      ).label;
      expect(ar).not.toBe(en);
      expect(ar).toMatch(/[؀-ۿ]/);
    }
  });
});

describe("buildIngestionSummary", () => {
  test("summarises in both locales", () => {
    const entities = parseTenderText(
      `Scope of Work: Supply and install a hospital information system.
       Technical evaluation 70% Financial 30%.
       Delay penalty 2% per week maximum 10%.
       Milestone: Kickoff — 3 weeks`,
      "IT"
    );
    const summary = buildIngestionSummary(entities, ["RFP.pdf"]);
    expect(summary.en).toContain("RFP.pdf");
    expect(summary.en).toContain("70% technical");
    expect(summary.ar).toContain("RFP.pdf");
    expect(summary.ar).toMatch(/[؀-ۿ]/);
  });
});

describe("no developer shorthand reaches the agent cards", () => {
  const source = readFileSync(
    join(REPO_ROOT, "src/lib/agents/orchestrator.ts"),
    "utf8"
  );

  test("the scan target still exists", () => {
    // Anti-vacuous: these assertions must fail because the strings changed,
    // not because the agents were renamed out from under the scan.
    expect(source).toMatch(/mark\("PROPOSAL_DRAFTING"/);
    expect(source).toMatch(/mark\("LAW_CONTRACT"/);
    expect(source).toMatch(/proposal\.id/);
  });

  test("no raw entity id is interpolated into an output", () => {
    expect(source).not.toMatch(
      /output:\s*`[^`]*\$\{(proposal|contract)\.id\}/
    );
  });

  test("formula and provider shorthand is gone", () => {
    expect(source).not.toMatch(/QLR=/);
    expect(source).not.toMatch(/BoQ lines=/);
    expect(source).not.toMatch(/generated via/);
    expect(source).not.toMatch(/registry fallback/);
  });
});

/**
 * The run poller reschedules itself from its own `catch`, so any thrown
 * failure is retried every 2.5s for as long as the panel is mounted
 * (agent-workflow.tsx:542). That is right for a dropped connection and wrong
 * for a 404: a deleted run, a run owned by another workspace, or an expired
 * session can never start succeeding, so the loop repainted a destructive
 * "Retrying automatically…" toast forever against a request with no future.
 *
 * Splitting the decision out of the component is the only way it gets covered
 * — this repo's runner has no DOM, per the note at the top of
 * `run-presentation.ts`.
 */
describe("statusPollDisposition", () => {
  test("a readable response is read", () => {
    expect(statusPollDisposition(200)).toBe("read");
    expect(statusPollDisposition(204)).toBe("read");
  });

  test("a server failure keeps polling", () => {
    // The run may well still be alive behind a bad gateway. Giving up here
    // would strand a genuinely running pipeline at whatever progress it had.
    expect(statusPollDisposition(500)).toBe("retry");
    expect(statusPollDisposition(502)).toBe("retry");
    expect(statusPollDisposition(504)).toBe("retry");
  });

  test("a rate limit keeps polling", () => {
    // 429 is the one 4xx that clears on its own.
    expect(statusPollDisposition(429)).toBe("retry");
  });

  test("a client failure stops the loop", () => {
    // AGENT_RUN_NOT_FOUND (404) and UNAUTHORIZED (401) are the two this route
    // actually emits; neither becomes true by asking again.
    expect(statusPollDisposition(401)).toBe("stop");
    expect(statusPollDisposition(403)).toBe("stop");
    expect(statusPollDisposition(404)).toBe("stop");
    expect(statusPollDisposition(400)).toBe("stop");
  });

  test("the component defers to it rather than re-deriving the rule", () => {
    // A second copy of `status < 500 && status !== 429` in the component would
    // drift away from these cases without failing anything above.
    const component = readFileSync(
      join(REPO_ROOT, "src/components/dashboard/agent-workflow.tsx"),
      "utf8"
    );
    expect(component).toContain("statusPollDisposition(res.status)");
    expect(component).not.toMatch(/res\.status\s*<\s*500/);
  });
});
