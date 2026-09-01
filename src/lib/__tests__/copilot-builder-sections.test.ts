/**
 * The third document surface had no co-pilot.
 *
 * `proposal-editor` and `contract-studio` both mount `CopilotRail` beside their
 * buffer. The section builder — the other door into writing a bid — gave the
 * writer a bare `<textarea>` per section and nothing else. So whether the
 * platform reviews your prose as you write depended on which of two proposal
 * screens you happened to open, which is not a distinction a user can see from
 * the sidebar.
 *
 * Mounting it here is not just an import. The rail needs one string, and this
 * screen holds a section list where each section carries an Arabic buffer and
 * an English one. Three things follow, and each has its own test below:
 *
 *   - The language toggle used to be `SectionEditor`'s private state, so the
 *     parent could not tell the rail which of the two buffers was on screen.
 *     It has to move up.
 *   - The rail keeps per-pass state (the cards, and the buffer it last read).
 *     Left mounted across a section switch it would show section A's cards
 *     against section B's text — mostly greyed out as unresolvable anchors,
 *     which reads as a broken co-pilot rather than a stale one. Keying it to
 *     the section and language forces a clean remount.
 *   - Accept has to land through the same update path the textarea uses, or
 *     the edit is invisible to the dirty flag and the save.
 *
 * Gating matters too: `/api/proposals/[id]/copilot` looks the record up by id,
 * so on an unsaved draft every pass would 404. The rail is offered only once
 * there is a record to review against and a section to review.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const BUILDER_PATH = "src/components/dashboard/proposal-builder.tsx";
const BUILDER = readFileSync(join(REPO_ROOT, BUILDER_PATH), "utf8");

/**
 * `expect(BUILDER).toMatch(...)` prints the whole 20KB component on failure,
 * which buries the one line that says what is missing. The pattern is the
 * interesting half of the message here, not the haystack.
 */
function has(what: string, pattern: RegExp): void {
  expect(
    pattern.test(BUILDER),
    `${BUILDER_PATH} — missing ${what}: ${pattern}`,
  ).toBe(true);
}

describe("the section builder has the co-pilot", () => {
  test("the rail is imported and mounted", () => {
    has("the CopilotRail import", /import \{ CopilotRail \}/);
    has("the CopilotRail element", /<CopilotRail/);
  });

  test("the rail reads the buffer the section editor writes", () => {
    // One string, chosen by the same two values the textarea is chosen by.
    has(
      "the buffer wiring",
      /markdown=\{selectedSection\.content\[activeLocale\]\}/,
    );
  });

  test("one piece of state decides which language is live", () => {
    has(
      "the lifted language state",
      /const \[activeLocale, setActiveLocale\] = useState/,
    );
    has("the language handed to the editor", /activeLocale=\{activeLocale\}/);
    // Exactly one declaration in the file: a second one inside `SectionEditor`
    // would shadow the parent's and the rail would review the other language.
    expect(BUILDER.match(/useState<"ar" \| "en">/g) ?? []).toHaveLength(1);
  });

  test("the suggestions come back in the language of the text being edited", () => {
    // Not the UI locale. An Arabic replacement proposed for an English
    // paragraph is not an edit anyone can accept.
    has("locale on the rail", /<CopilotRail[\s\S]*?locale=\{activeLocale\}/);
  });

  test("switching section or language remounts the rail", () => {
    has(
      "the remount key",
      /key=\{`\$\{selectedSection\.sectionKey\}:\$\{activeLocale\}`\}/,
    );
  });

  test("Accept writes back through the section update path", () => {
    has(
      "onApply routed through handleUpdateSection",
      /onApply=\{\(next\) =>[\s\S]*?handleUpdateSection\(selectedSection\.sectionKey/,
    );
  });

  test("the rail is not offered where its edits cannot land", () => {
    // Two preconditions, and the component states them at two levels: the
    // whole right column needs a saved record for the copilot route to find,
    // and the rail itself needs a section whose buffer it can read.
    has(
      "the saved-proposal gate on the right column",
      /metadata\.proposalId && mode !== "preview"/,
    );
    has(
      "the selected-section gate on the rail",
      /selectedSection \? \(\s*<CopilotRail/,
    );
  });

  test("the textarea still drives the same state", () => {
    // Anti-vacuous. Every assertion above is satisfied by a rail wired to a
    // buffer nobody types into, so the editor's own write path is pinned here.
    has(
      "the textarea write path",
      /onUpdate\(\{ content: \{ \.\.\.section\.content, \[activeLocale\]/,
    );
    has("the dirty flag", /setIsDirty\(true\)/);
  });
});
