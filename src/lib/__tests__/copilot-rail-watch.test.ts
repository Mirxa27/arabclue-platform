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
