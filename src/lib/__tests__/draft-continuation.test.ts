/**
 * A draft that hits the token cap is continued, not shipped cut off.
 *
 * Runs 7 and 10 (2026-09-02) ended `truncated: true` at 12 288 tokens: the
 * bilingual template runs 8–14k completion tokens for the same tender, and
 * one step's 300 s window cannot hold more than ~16k at the drafting row's
 * pace. So a truncated draft gets one more step: the model is shown the whole
 * prompt and the draft so far, asked to continue exactly where it stopped,
 * and the continuation is appended, re-validated and streamed into the same
 * live draft. Bounded to one continuation; still truncated after that stays
 * flagged. Best effort: a failed continuation leaves the truncated proposal
 * as it was and never fails the run.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DRAFT_CONTINUATION_MAX_TOKENS,
  DRAFTING_MAX_TOKENS,
  appendContinuation,
  continuationMessages,
} from "../agents/drafting";
import { reduceDraftChunk, initialDraftView } from "../agents/draft-stream";
import { resolveTranslation } from "../i18n";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}
function has(path: string, what: string, pattern: RegExp): void {
  expect(pattern.test(read(path)), `${path} — missing ${what}: ${pattern}`).toBe(true);
}

describe("continuationMessages", () => {
  test("shows the model its own draft and asks it to carry on, in the draft's language", () => {
    const msgs = continuationMessages({ system: "SYS", user: "USER", draftSoFar: "# Title\n\nHalf a sent", locale: "en" });
    expect(msgs.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(msgs[0].content).toBe("SYS");
    expect(msgs[1].content).toBe("USER");
    expect(msgs[2].content).toBe("# Title\n\nHalf a sent");
    expect(msgs[3].content).toMatch(/continue/i);
    expect(msgs[3].content).toMatch(/do not repeat/i);
    const ar = continuationMessages({ system: "S", user: "U", draftSoFar: "…", locale: "ar" });
    expect(ar[3].content).toMatch(/[؀-ۿ]/);
  });

  test("the continuation budget fits a step beside the drafting budget", () => {
    expect(DRAFT_CONTINUATION_MAX_TOKENS).toBeGreaterThan(2000);
    expect(DRAFT_CONTINUATION_MAX_TOKENS).toBeLessThanOrEqual(DRAFTING_MAX_TOKENS);
  });
});

describe("appendContinuation", () => {
  test("joins on a line break and drops a repeated last line", () => {
    const draft = "## Section A\n\nText that was cut mid";
    expect(appendContinuation(draft, "sentence and goes on.\n\n## Section B\nMore")).toBe(
      "## Section A\n\nText that was cut midsentence and goes on.\n\n## Section B\nMore",
    );
    // Models often restart from the last complete line: keep it once.
    expect(appendContinuation("## A\n\nLast full line.", "Last full line.\n\nNext paragraph.")).toBe(
      "## A\n\nLast full line.\n\nNext paragraph.",
    );
    expect(appendContinuation("Draft", "")).toBe("Draft");
    expect(appendContinuation("Draft", "   ")).toBe("Draft");
  });
});

describe("the live draft follows a continuation", () => {
  test("a truncated done keeps the page listening; the final done ends it", () => {
    let view = initialDraftView();
    view = reduceDraftChunk(view, { kind: "reset", attempt: 1 });
    view = reduceDraftChunk(view, { kind: "delta", text: "Hello " });
    view = reduceDraftChunk(view, { kind: "done", truncated: true, continues: true });
    expect(view.phase).toBe("continuing");
    expect(view.listening).toBe(true);
    view = reduceDraftChunk(view, { kind: "delta", text: "world." });
    expect(view.phase).toBe("writing");
    expect(view.text).toBe("Hello world.");
    view = reduceDraftChunk(view, { kind: "done", truncated: false });
    expect(view.phase).toBe("done");
    expect(view.truncated).toBe(false);
    expect(view.listening).toBe(false);
  });

  test("a final done that was itself cut off ends the page and says so", () => {
    let view = reduceDraftChunk(initialDraftView(), { kind: "delta", text: "abc" });
    view = reduceDraftChunk(view, { kind: "done", truncated: true });
    expect(view.phase).toBe("done");
    expect(view.truncated).toBe(true);
    expect(view.listening).toBe(false);
  });

  test("a retried attempt resets the page", () => {
    let view = reduceDraftChunk(initialDraftView(), { kind: "delta", text: "abc" });
    view = reduceDraftChunk(view, { kind: "reset", attempt: 2 });
    expect(view.text).toBe("");
    expect(view.phase).toBe("retrying");
  });

  test("copy for the continuing state exists in both languages", () => {
    for (const locale of ["ar", "en"] as const) {
      const r = resolveTranslation("live_draft_continuing", locale);
      expect(r.missing).toBe(false);
      expect(r.resolvedLocale).toBe(locale);
    }
  });
});

describe("the wiring", () => {
  test("the workflow continues a truncated draft once, best effort", () => {
    const wf = read("src/lib/agents/pipeline-workflow.ts");
    expect(/async function continueDraftStep\(/.test(wf)).toBe(true);
    expect(/continueDraftStep\.maxRetries = 0;/.test(wf)).toBe(true);
    // Best effort: a rejected continuation is caught and the truncated draft stands.
    expect(/try\s*\{\s*draftingOutcome = await continueDraftStep\([\s\S]{0,300}\}\s*catch/.test(wf)).toBe(true);
    expect((wf.match(/"use step"/g) ?? []).length).toBe(6);
  });

  test("the drafting stage hands a truncated draft's stream on instead of closing it", () => {
    has("src/lib/agents/orchestrator.ts", "the continuation stage", /export async function runDraftContinuationStage\(/);
    has("src/lib/agents/orchestrator.ts", "the outcome carries truncation", /truncated:\s*draft\.truncated/);
    // Closed only when the draft is finished; a truncated one is released for
    // the continuation step, which is then the one to close it.
    has("src/lib/agents/orchestrator.ts", "release when truncated", /draftStreamed && !draftTruncated\s*\?\s*sink\.close\(\)\s*:\s*sink\.release\(\)/);
  });

  test("the panel reduces chunks with the shared reducer", () => {
    has("src/components/dashboard/live-draft-panel.tsx", "the reducer", /reduceDraftChunk\(/);
  });
});
