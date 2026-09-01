/**
 * The agent page told a bidder about itself five times and about their bid once.
 *
 * Read top to bottom before this change, the screen was:
 *
 *   1. `PageHeader` — "Agents" / "6-agent pipeline — watch live progress…"
 *   2. the card header — "Agents" again / "6-agent pipeline — ingest →
 *      compliance → technical → finance → draft → contract" again
 *   3. the context strip — `{Math.round(overall)}%`
 *   4. the progress block — `<Progress value={overall}>` plus `3/6 agents`
 *   5. the mini pipeline strip — six 1.5px bars, one per agent
 *   6. six cards, each with a radial gauge and its own percent
 *
 * Two titles, two subtitles, and five renderings of one number. None of it says
 * what the bidder walks away with, and `ingest → compliance → technical →
 * finance → draft → contract` is the vocabulary of the people who built the
 * pipeline, not of someone bidding on a tender.
 *
 * Worse, the six cards render unconditionally. Open the page having never run
 * anything and the dominant content is six gauges reading 0% with six dashed
 * circles — a machine diagram at rest, which is exactly the "too complex to
 * understand" complaint. So the cards are now gated on a run existing, and the
 * idle screen says what a run will do instead.
 *
 * Two smaller defects, both of which made the page state something untrue:
 *
 *   - The failure banner was the error sentence in a red box and nothing else.
 *     The completion banner beside it offers two buttons. A bidder whose run
 *     failed had to go find the Run button again themselves.
 *   - "Select an active project to run agents" names an impossible action.
 *     `app-shell.tsx:18` mounts `useEnsureActiveProject`, which auto-selects
 *     `projects[0]` whenever the workspace has any project at all
 *     (`use-ensure-active-project.ts:45-47`), so that branch is only reachable
 *     with zero projects — nothing to select from. `file-ingestion.tsx:290`
 *     already gets this right: "Create a project before uploading files."
 *
 * On the jargon: `agent-page-hierarchy.test.ts:150` already asserts
 * `not.toMatch(/6-agent pipeline/)` — and passed the whole time, because the
 * component wrote it as `` `${AGENTS.length}-agent pipeline` `` and the second
 * copy lived in `views.tsx`, a file that test never opens. A ratchet reading one
 * file measures that file, not the screen. Both files are read here, and the
 * pattern no longer assumes the count was typed out.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AGENTS } from "../constants";

const DASHBOARD = join(import.meta.dir, "..", "..", "components", "dashboard");
const WORKFLOW_PATH = "src/components/dashboard/agent-workflow.tsx";
const VIEWS_PATH = "src/components/dashboard/views.tsx";
const WORKFLOW = readFileSync(join(DASHBOARD, "agent-workflow.tsx"), "utf8");
const VIEWS = readFileSync(join(DASHBOARD, "views.tsx"), "utf8");

/**
 * `expect(SOURCE).toMatch(...)` prints the whole component on failure — 1100
 * lines here — which buries the one line saying what is missing.
 */
function has(path: string, src: string, what: string, pattern: RegExp): void {
  expect(pattern.test(src), `${path} — missing ${what}: ${pattern}`).toBe(true);
}

function lacks(path: string, src: string, what: string, pattern: RegExp): void {
  expect(pattern.test(src), `${path} — still renders ${what}: ${pattern}`).toBe(
    false,
  );
}

describe("the agent page says each thing once", () => {
  test("one page title, owned by the page header", () => {
    has(VIEWS_PATH, VIEWS, "the page title", /title=\{tr\("nav_agents", locale\)\}/);
    lacks(WORKFLOW_PATH, WORKFLOW, "a second copy of the title", /tr\("section_agents"/);
  });

  test("the pipeline diagram is not the page's description, in either file", () => {
    for (const [path, src] of [
      [WORKFLOW_PATH, WORKFLOW],
      [VIEWS_PATH, VIEWS],
    ] as const) {
      // Matches the interpolated form too — `${AGENTS.length}-agent pipeline`
      // renders as "6-agent pipeline" and was invisible to the old pattern.
      lacks(path, src, "the pipeline count copy", /-agent pipeline/);
      lacks(path, src, "the Arabic pipeline copy", /خط أنابيب/);
    }
  });

  test("the description says what the bidder ends up with", () => {
    has(VIEWS_PATH, VIEWS, "the English outcome", /contract draft/);
    has(VIEWS_PATH, VIEWS, "the Arabic outcome", /مسودة عقد/);
  });

  test("one overall-progress readout, not five", () => {
    has(WORKFLOW_PATH, WORKFLOW, "the labelled progress bar", /<Progress value=\{overall\}/);
    lacks(WORKFLOW_PATH, WORKFLOW, "the bare percent in the context strip", /\{Math\.round\(overall\)\}%/);
    lacks(WORKFLOW_PATH, WORKFLOW, "the mini pipeline strip", /h-1\.5 flex-1 rounded-full/);
    // The strip and the card grid were the two places the six agents got laid
    // out. `{` anchors this to the JSX render sites — `data.agentStates.map(`
    // twice in the poll handler is a payload transform, not a layout.
    expect(
      WORKFLOW.match(/\{agentStates\.map\(/g) ?? [],
      `${WORKFLOW_PATH} — the six agents should be laid out once`,
    ).toHaveLength(1);
  });
});

describe("the idle page is not a machine diagram at zero", () => {
  test("the gauges only exist once there is a run to gauge", () => {
    has(WORKFLOW_PATH, WORKFLOW, "the run-exists flag", /const hasRun = /);
    has(
      WORKFLOW_PATH,
      WORKFLOW,
      "the gauges gated behind it",
      /hasRun \? \([\s\S]*?<RadialGauge/,
    );
  });

  test("idle says what a run will do", () => {
    has(WORKFLOW_PATH, WORKFLOW, "the English idle heading", /What happens when you run/);
    has(WORKFLOW_PATH, WORKFLOW, "the Arabic idle heading", /ما يحدث عند التشغيل/);
  });
});

describe("the page offers an action in every state it can reach", () => {
  test("a failed run can be retried from the failure banner", () => {
    const failedAt = WORKFLOW.indexOf('runStatus === "FAILED"');
    const cardsAt = WORKFLOW.indexOf("{/* Agent cards");
    const retryAt = WORKFLOW.indexOf("Try again");
    expect(failedAt, `${WORKFLOW_PATH} — no failure banner`).toBeGreaterThan(-1);
    expect(cardsAt, `${WORKFLOW_PATH} — no agent card block`).toBeGreaterThan(-1);
    // Bounded on both sides: an `onClick={handleRunClick}` anywhere in the file
    // would otherwise satisfy this, and there are two others.
    expect(
      retryAt > failedAt && retryAt < cardsAt,
      `${WORKFLOW_PATH} — the retry action must sit inside the failure banner`,
    ).toBe(true);
  });

  test("an empty workspace is told to create a project, not to pick one", () => {
    lacks(WORKFLOW_PATH, WORKFLOW, "the impossible instruction", /Select an active project/);
    has(WORKFLOW_PATH, WORKFLOW, "the honest instruction", /Create a project/);
    // Which state it is can only be told apart by asking whether the workspace
    // has any projects at all.
    has(WORKFLOW_PATH, WORKFLOW, "the projects list", /useEnsureActiveProject/);
  });
});

describe("the page still does what it did", () => {
  test("run, stop and history are untouched", () => {
    // Anti-vacuous. Every deletion above is satisfied by a blank component.
    has(WORKFLOW_PATH, WORKFLOW, "the run handler", /onClick=\{handleRunClick\}/);
    has(WORKFLOW_PATH, WORKFLOW, "the stop handler", /cancelMutation\.mutate\(\)/);
    has(WORKFLOW_PATH, WORKFLOW, "the run history", /<AgentRunHistory/);
    has(WORKFLOW_PATH, WORKFLOW, "the completion payoff", /Open proposal/);
  });

  test("the step count is still read off the pipeline", () => {
    expect(AGENTS.length).toBe(6);
    has(WORKFLOW_PATH, WORKFLOW, "the pipeline length", /AGENTS\.length/);
  });
});
