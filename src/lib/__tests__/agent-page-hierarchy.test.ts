/**
 * The agent page is where a bidder watches six agents produce their proposal.
 * Three things made it hard to read and one made it lie:
 *
 * 1. Run history — 50 rows in a nested scroller — sat above the live pipeline
 *    and above the result, so the least useful block held the best space.
 * 2. The "Open proposal" payoff was last, below six agent cards.
 * 3. The component kept its own hand-written status map, which had drifted from
 *    the app-wide vocabulary in `i18n.ts` — "في الانتظار" for a queued run where
 *    every other surface says "في قائمة الانتظار".
 * 4. "Open proposal" was disabled by `!proposalId && !completed` inside a block
 *    that only renders when `completed` is true — always false, never disabled.
 *
 * Ordering is asserted on source position: this repo has no DOM in tests, so
 * the render order of sibling blocks is only observable here.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AGENTS } from "../constants";
import {
  currentAgentLabel,
  formatRunDate,
  runProjectTitle,
  runStatusLabel,
  runStatusTone,
} from "../agents/run-presentation";

const SOURCE = readFileSync(
  join(import.meta.dir, "..", "..", "components", "dashboard", "agent-workflow.tsx"),
  "utf8"
);

/**
 * Source offset of a block. Requires the marker to appear exactly once —
 * `{agentStates.map(` matches both the mini pipeline strip and the card grid,
 * and an ordering test that silently picks the wrong one proves nothing.
 */
function at(marker: string): number {
  const hits = SOURCE.split(marker).length - 1;
  expect(hits, `marker must appear exactly once: ${marker}`).toBe(1);
  return SOURCE.indexOf(marker);
}

/** The grid of six agent cards, as opposed to the one-line progress strip. */
const AGENT_CARDS = "{/* Agent cards";

describe("run status vocabulary", () => {
  test("labels come from the app-wide vocabulary, not a local copy", () => {
    expect(runStatusLabel("RUNNING", "en")).toBe("Running");
    expect(runStatusLabel("RUNNING", "ar")).toBe("قيد التشغيل");
    // The component's own map said "في الانتظار" here; every other surface in
    // the app says this.
    expect(runStatusLabel("QUEUED", "ar")).toBe("في قائمة الانتظار");
  });

  test("every status a run can hold has a label in both locales", () => {
    for (const s of ["QUEUED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]) {
      expect(runStatusLabel(s, "en")).not.toBe(s);
      expect(runStatusLabel(s, "ar")).not.toBe(s);
    }
  });

  test("an unknown status shows itself rather than an empty badge", () => {
    expect(runStatusLabel("SOMETHING_NEW", "en")).toBe("SOMETHING_NEW");
  });

  test("cancelled is muted, not a failure", () => {
    // A run someone stopped on purpose must not read as an error.
    expect(runStatusTone("CANCELLED")).toBe("muted");
    expect(runStatusTone("FAILED")).toBe("danger");
    expect(runStatusTone("COMPLETED")).toBe("success");
    expect(runStatusTone("RUNNING")).toBe("live");
    expect(runStatusTone("QUEUED")).toBe("live");
  });
});

describe("run row content", () => {
  const run = {
    projectTitle: "Riyadh Metro ITS",
    projectTitleAr: "أنظمة النقل الذكية",
  };

  test("Arabic falls back to the only title there is", () => {
    expect(runProjectTitle({ ...run, projectTitleAr: null }, "ar")).toBe(
      "Riyadh Metro ITS"
    );
    expect(runProjectTitle(run, "ar")).toBe("أنظمة النقل الذكية");
    expect(runProjectTitle(run, "en")).toBe("Riyadh Metro ITS");
  });

  test("a known agent id is translated, an unknown one is shown as-is", () => {
    expect(currentAgentLabel("INGESTION", "en")).not.toBe("INGESTION");
    expect(currentAgentLabel("RETIRED_AGENT", "en")).toBe("RETIRED_AGENT");
  });

  test("run dates render without throwing in either locale", () => {
    const iso = "2026-03-14T09:05:00.000Z";
    expect(formatRunDate(iso, "en")).toContain("14");
    expect(formatRunDate(iso, "ar").length).toBeGreaterThan(0);
  });
});

describe("page order puts the result above the detail", () => {
  test("the completion banner comes before the six agent cards", () => {
    expect(at('runStatus === "COMPLETED"')).toBeLessThan(at(AGENT_CARDS));
  });

  test("the failure banner comes before the six agent cards too", () => {
    expect(at('runStatus === "FAILED"')).toBeLessThan(at(AGENT_CARDS));
  });

  test("run history comes after the pipeline it is history of", () => {
    expect(at(AGENT_CARDS)).toBeLessThan(at("<AgentRunHistory"));
  });

  test("history is collapsed by default so it costs no space unopened", () => {
    const history = readFileSync(
      join(
        import.meta.dir,
        "..",
        "..",
        "components",
        "dashboard",
        "agent-run-history.tsx"
      ),
      "utf8"
    );
    expect(history).toMatch(/Collapsible/);
    expect(history).not.toMatch(/defaultOpen/);
  });
});

describe("the page's claims match what it can do", () => {
  test("Open proposal is disabled when there is no proposal", () => {
    // The old guard was `!proposalId && !completed` inside a block that only
    // renders when completed — always false, so a run that produced no
    // proposal still offered the button.
    expect(SOURCE).toMatch(/disabled=\{!proposalId\}/);
    expect(SOURCE).not.toMatch(/!proposalId && !completed/);
  });

  test("the agent count is read off the pipeline, not typed into the copy", () => {
    // Anti-vacuous: AGENTS drives the cards, so a literal 6 in the copy is a
    // claim that silently goes wrong when the pipeline changes.
    expect(AGENTS.length).toBe(6);
    expect(SOURCE).toMatch(/AGENTS\.length/);
    expect(SOURCE).not.toMatch(/\{doneCount\}\/6/);
    // There was a `not.toMatch(/6-agent pipeline/)` here, and it passed for as
    // long as it existed while the page rendered exactly that string twice:
    // once as `` `${AGENTS.length}-agent pipeline` `` in this file, invisible to
    // a literal pattern, and once in `views.tsx`, which this test never opens.
    // The real ratchet is in `agent-page-comprehension.test.ts` — it matches the
    // interpolated form and reads both files. Restating it here would just be a
    // second copy to keep in sync.
  });

  test("no branch pretends to distinguish cases it treats identically", () => {
    // `if (!opts?.hydrateOnly) setCompleted(false); else setCompleted(false);`
    expect(SOURCE).not.toMatch(/else setCompleted\(false\)/);
  });

  test("the self-referential vendor match is gone", () => {
    // It was called with one "vendor" whose id was workspace-self and whose
    // name was the project title: a model call that scores a project against
    // itself and reports the result as a match.
    expect(SOURCE).not.toMatch(/VendorMatchAction/);
    expect(SOURCE).not.toMatch(/workspace-self/);
  });

  test("the blocks being ordered still exist", () => {
    // Anti-vacuous: deleting a block would satisfy every ordering test above.
    expect(SOURCE).toMatch(/Open proposal/);
    expect(SOURCE).toMatch(/<RadialGauge/);
    expect(SOURCE).toMatch(/<AgentRunHistory/);
  });
});
