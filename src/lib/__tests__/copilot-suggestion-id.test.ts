/**
 * Suggestion ids are content-addressed so a dismissed card stays dismissed
 * across review passes. That only holds if the id cannot collide across the
 * anchor/replacement boundary: without a separator, ("pq", "r") and ("p", "qr")
 * hash the same string, and dismissing one card would silently hide the other.
 *
 * The separator was written as a literal NUL byte in the source, which made git
 * treat the whole module as binary — no diffs, no review. It is now the `\0`
 * escape. The recorded digests below are from before that change: they pin the
 * ids to the same bytes, so no card a user already dismissed comes back.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reconcileSuggestions } from "../ai/copilot-suggestions";
import type { RawCopilotSuggestion } from "../ai/copilot-anchors";

function raw(anchor: string, replacement: string): RawCopilotSuggestion {
  return { anchor, replacement, rationale: "r", risk: "LOW", kind: "clarity" };
}

function idOf(doc: string, anchor: string, replacement: string): string {
  const out = reconcileSuggestions(doc, [raw(anchor, replacement)]);
  expect(out).toHaveLength(1);
  return out[0].id;
}

describe("suggestion ids", () => {
  test("the anchor/replacement boundary cannot collide", () => {
    expect(idOf("pq only", "pq", "r")).not.toBe(idOf("p only", "p", "qr"));
  });

  test("ids are unchanged by the separator's re-encoding", () => {
    // Captured from the version that used a literal NUL byte.
    expect(idOf("pq only", "pq", "r")).toBe("b3b7da4e6a0b");
    expect(idOf("p only", "p", "qr")).toBe("bfd035ad51d5");
    expect(idOf("ab c here", "ab", "c")).toBe("6c032e631d39");
  });

  test("the same edit proposed twice keeps the same id", () => {
    expect(idOf("Scope of work.", "Scope", "Scope of supply")).toBe(
      idOf("Scope of work.", "Scope", "Scope of supply")
    );
  });
});

describe("the source stays reviewable", () => {
  const SOURCE = readFileSync(
    join(import.meta.dir, "..", "ai", "copilot-suggestions.ts"),
    "utf8"
  );

  test("no literal control byte is embedded in the module", () => {
    // git calls a file binary the moment it finds one, and stops showing diffs.
    expect(SOURCE).not.toContain(String.fromCharCode(0));
  });

  test("the separator is still there, as an escape", () => {
    // Anti-vacuous: dropping the separator entirely would also pass the check
    // above, and would reintroduce the collision.
    expect(SOURCE).toMatch(/\$\{anchor\}\\0\$\{replacement\}/);
  });
});
