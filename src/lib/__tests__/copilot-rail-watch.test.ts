/**
 * What makes the rail decide the document is worth another look.
 *
 * The gate used to compare lengths: `|markdown.length - reviewed.length| < 40`.
 * That is blind to the edits that most need review — rewriting a paragraph,
 * swapping a number, replacing a placeholder with a real value — because those
 * barely move the character count. The rail went quiet exactly when the writer
 * changed something substantive.
 *
 * The gate now measures the size of the region that actually differs.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { changedChars } from "../ai/copilot-anchors";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

const RAIL = readFileSync(
  join(REPO_ROOT, "src/components/dashboard/copilot-rail.tsx"),
  "utf8"
);

describe("changedChars", () => {
  test("an untouched document has changed nothing", () => {
    expect(changedChars("same text", "same text")).toBe(0);
    expect(changedChars("", "")).toBe(0);
  });

  test("a same-length rewrite is not invisible", () => {
    // The defect this exists for: both sides are 26 characters.
    const before = "The vendor shall deliver..";
    const after = "We commit to delivering...";
    expect(before.length).toBe(after.length);
    expect(changedChars(before, after)).toBeGreaterThan(20);
  });

  test("a swapped figure counts as a small edit, not a whole rewrite", () => {
    const before = "Delay penalty is 2% per week, capped at 10%.";
    const after = "Delay penalty is 5% per week, capped at 10%.";
    expect(changedChars(before, after)).toBe(1);
  });

  test("appended prose counts what was appended", () => {
    const before = "Scope of work.";
    const added = " We will staff three engineers on site.";
    expect(changedChars(before, before + added)).toBe(added.length);
  });

  test("deleted prose counts what was removed", () => {
    const kept = "Scope of work.";
    const removed = " We will staff three engineers on site.";
    expect(changedChars(kept + removed, kept)).toBe(removed.length);
  });

  test("an insert in the middle is measured, not the tail that shifted", () => {
    const before = "Section A\nSection C";
    const after = "Section A\nSection B\nSection C";
    expect(changedChars(before, after)).toBe("Section B\n".length);
  });

  test("a whole-document replacement counts the longer side", () => {
    expect(changedChars("abc", "xyzw")).toBe(4);
  });
});

describe("the rail watches content, not length", () => {
  test("the gate this replaced is gone", () => {
    expect(RAIL).not.toMatch(/markdown\.length - reviewedRef\.current\.length/);
  });

  test("the idle pass is gated on the changed region", () => {
    // Anti-vacuous: the throttle must still exist, just measured differently.
    expect(RAIL).toMatch(/MIN_DELTA_CHARS/);
    expect(RAIL).toMatch(
      /changedChars\(markdown, reviewedRef\.current\) < MIN_DELTA_CHARS/
    );
  });

  test("accepting the co-pilot's own text does not queue a pass on it", () => {
    // Otherwise every Accept spends a model call re-reading text the model
    // just wrote, and can propose reverting it.
    const accept = RAIL.indexOf("const accept = (");
    const acceptAll = RAIL.indexOf("const acceptAll = (");
    expect(accept).toBeGreaterThan(-1);
    expect(acceptAll).toBeGreaterThan(-1);
    expect(RAIL.slice(accept, acceptAll)).toMatch(
      /reviewedRef\.current = next/
    );
    expect(RAIL.slice(acceptAll)).toMatch(
      /reviewedRef\.current = result\.content/
    );
  });

  test("a card is only offered while its anchor resolves to one place", () => {
    // The filter used to be `markdown.includes(s.anchor)` — existence only. A
    // card whose anchored sentence the writer had since repeated elsewhere
    // stayed on screen with a live Accept button, and `applySuggestion` now
    // refuses those, so the button would have done nothing at all. Filtering on
    // the same rule the edit enforces keeps the two in step.
    expect(RAIL).toContain("anchorResolves(markdown, s.anchor)");
    expect(RAIL).not.toContain("markdown.includes(s.anchor)");
  });
});

describe("the rail consumes the pass as a stream", () => {
  test("the body is read frame by frame, not awaited whole", () => {
    // Reverting to `res.json()` on the success path would compile, pass every
    // codec test in copilot-stream.test.ts, and put the blank rail back.
    expect(RAIL).toMatch(/res\.body\.getReader\(\)/);
    expect(RAIL).toMatch(/decodeFrames\(rest \+ decoder\.decode\(/);
  });

  test("a pre-stream failure is still read as a JSON body", () => {
    // Anti-vacuous: auth, rate limit and no-provider stay status codes with a
    // bilingual body, so the error path must keep parsing one.
    expect(RAIL).toMatch(/if \(!res\.ok \|\| !res\.body\)/);
    expect(RAIL).toMatch(/apiErrorText\(json, locale\)/);
  });

  test("leaving the editor cancels the pass", () => {
    // Otherwise the reader holds the connection open and keeps decoding into
    // state nothing renders.
    expect(RAIL).toMatch(/abortRef\.current\?\.abort\(\)/);
    expect(RAIL).toMatch(/signal: abort\.signal/);
  });
});

describe("the rail remembers what was turned down", () => {
  /** The body of one handler, so a match cannot come from a neighbour. */
  function handler(from: string, to: string): string {
    const start = RAIL.indexOf(from);
    // Searched from `start`, not from zero: `return (` opens the JSX at the end
    // of the file but also appears well before any of these handlers.
    const end = RAIL.indexOf(to, start);
    // Anti-vacuous: a renamed handler must fail loudly, not scan an empty slice.
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return RAIL.slice(start, end);
  }

  test("the stored rejections are loaded for the open proposal", () => {
    expect(RAIL).toContain("readDismissals(storage, proposalId)");
  });

  test("exactly two places set the dismissed state", () => {
    // The loader, and the one function that also writes to storage. A third
    // would be a rejection the rail honours now and forgets on reload — and
    // that is the whole defect this exists to close, reintroduced silently.
    expect(RAIL.match(/setDismissed\(/g)).toHaveLength(2);
    expect(RAIL).toContain("writeDismissals(storage, proposalId");
  });

  test("every gesture that hides a card goes through it", () => {
    expect(handler("const accept = (", "const acceptAll = (")).toContain(
      "remember("
    );
    expect(handler("const acceptAll = (", "const dismissAll = (")).toContain(
      "remember("
    );
    expect(handler("const dismissAll = (", "const submitAsk = (")).toContain(
      "remember("
    );
    // The per-card Dismiss button, which is how a writer rejects one card and
    // therefore the gesture most worth remembering. It lives in the JSX rather
    // than in a named handler, which is how it got missed the first time.
    const dismissButton = RAIL.lastIndexOf('t(locale, "تجاهل", "Dismiss")');
    expect(dismissButton).toBeGreaterThan(-1);
    expect(RAIL.slice(dismissButton - 400, dismissButton)).toContain(
      "remember(new Set(dismissed)"
    );
  });

  test("asking a fresh question clears the stored set too", () => {
    // `submitAsk` resets the rail so an answer is not hidden by an older
    // rejection. Resetting only the state would put it back on the next load.
    expect(handler("const submitAsk = (", "return (")).toContain(
      "remember(new Set())"
    );
  });
});

describe("the rail's footer speaks to a bid writer", () => {
  test("raw provider and model ids are not rendered", () => {
    expect(RAIL).not.toMatch(/\{state\.provider\} · \{state\.model\}/);
  });

  test("the state still carries them for the title attribute", () => {
    // Anti-vacuous: they are demoted to a hover, not deleted from the state.
    expect(RAIL).toMatch(/kind: "ready"; provider: string; model: string/);
    expect(RAIL).toMatch(/title=\{`\$\{state\.provider\}/);
  });
});
