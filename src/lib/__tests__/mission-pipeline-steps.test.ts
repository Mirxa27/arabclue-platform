/**
 * Which pipeline step, if any, is actually running.
 *
 * Observed on production `/app` on 2026-09-01: the strip showed a green check
 * on "Analyzing" and a spinning `Loader2` on "Planning", while the session
 * badge below it read **Disconnected** and the activity ticker read **READY**.
 * Nothing was running. The spinner had nothing to do with the agent.
 *
 * The cause was the fallback in `inferActiveStep`:
 *
 *     const running = tools.filter(t => isToolRunning(t.state) || t.preliminary);
 *     const last = running.length
 *       ? running[running.length - 1]
 *       : [...tools].reverse().find(t => isToolRunning(t.state) || t.preliminary)
 *         || [...tools].reverse()[0];
 *
 * When nothing is running the `.find` re-applies the predicate that just
 * returned an empty list, so it always yields `undefined` and the expression
 * falls through to "the most recent tool, whatever its state". That index then
 * rendered as the active step — a perpetual spinner on whatever the last
 * finished mission happened to do last, plus a pulsing connector dot and a
 * mobile caption naming that step as if it were in progress.
 *
 * The bar is fed persisted mission actions, so this was the *resting* state of
 * the page for any workspace with history, not a transient.
 */

import { describe, expect, test } from "bun:test";
import type { TheaterToolEvent } from "../agents/platform/mission-tool-parts";
import {
  PIPELINE_STEPS,
  computeCompleted,
  inferActiveStep,
} from "../agents/platform/mission-pipeline-steps";

const tool = (
  name: string,
  state: TheaterToolEvent["state"],
  extra: Partial<TheaterToolEvent> = {}
): TheaterToolEvent =>
  ({ name, state, ...extra }) as TheaterToolEvent;

describe("inferActiveStep", () => {
  test("no tools means no active step", () => {
    expect(inferActiveStep([])).toBe(-1);
  });

  test("a finished run has no active step", () => {
    // The defect. Every tool is done, so nothing is in progress, so nothing
    // may render as in progress.
    const finished = [
      tool("listProjects", "output-available"),
      tool("delegateToAgent", "output-available"),
    ];
    expect(inferActiveStep(finished)).toBe(-1);
  });

  test("a running tool selects its step", () => {
    const steps = [
      tool("listProjects", "output-available"),
      tool("delegateToAgent", "input-available"),
    ];
    const active = inferActiveStep(steps);
    expect(active).toBeGreaterThanOrEqual(0);
    expect(PIPELINE_STEPS[active].key).toBe("delegate");
  });

  test("the most recent running tool wins when several are in flight", () => {
    const active = inferActiveStep([
      tool("delegateToAgent", "input-available"),
      tool("searchDocumentChunks", "input-available"),
    ]);
    expect(PIPELINE_STEPS[active].key).toBe("analyze");
  });

  test("a preliminary tool counts as running", () => {
    // Anti-vacuous: `preliminary` is the streamed-but-not-yet-executed state,
    // and it is the one that should show motion earliest.
    const active = inferActiveStep([
      tool("listProjects", "output-available"),
      tool("delegateToAgent", "input-streaming", { preliminary: true }),
    ]);
    expect(PIPELINE_STEPS[active].key).toBe("delegate");
  });

  test("a run that ended in error is not still running", () => {
    expect(
      inferActiveStep([tool("delegateToAgent", "output-error")])
    ).toBe(-1);
  });
});

describe("computeCompleted", () => {
  test("history still shows what finished", () => {
    // The fix must not blank the strip: a finished step keeps its checkmark,
    // it just stops claiming to be in progress.
    const done = computeCompleted([tool("listProjects", "output-available")]);
    expect(done.size).toBeGreaterThan(0);
    const analyze = PIPELINE_STEPS.findIndex((s) => s.key === "analyze");
    expect(done.has(analyze)).toBe(true);
  });

  test("a tool still running is not counted as complete", () => {
    expect(computeCompleted([tool("listProjects", "input-available")]).size).toBe(
      0
    );
  });

  test("an errored tool is not counted as complete", () => {
    expect(computeCompleted([tool("listProjects", "output-error")]).size).toBe(0);
  });

  test("a tool ticks exactly the step it would have been active in", () => {
    // `searchTenders` is a Research tool name and also a search-ish kind, which
    // the old per-step `.some()` let tick Analyzing as well — a step that tool
    // could never have made active.
    const done = computeCompleted([tool("searchTenders", "output-available")]);
    expect(done.size).toBe(1);
    const active = inferActiveStep([tool("searchTenders", "input-available")]);
    expect([...done]).toEqual([active]);
  });
});

describe("the step table", () => {
  test("covers the five labels the strip renders", () => {
    expect(PIPELINE_STEPS.map((s) => s.key)).toEqual([
      "analyze",
      "delegate",
      "research",
      "draft",
      "review",
    ]);
  });

  test("every step can be reached by some tool name", () => {
    // Otherwise a step is decoration: it can never light up.
    for (const step of PIPELINE_STEPS) {
      expect(step.toolNames.length + step.kinds.length).toBeGreaterThan(0);
    }
  });
});
