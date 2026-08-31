/**
 * MDXEditor reads its `markdown` prop once, at mount. The installed package
 * says so itself:
 *
 *   node_modules/@mdxeditor/editor/dist/index.d.ts
 *   "The markdown to edit. Notice that this is read only when the component is
 *    mounted."
 *
 * So a parent that only lifts `markdown` into React state has a one-way editor:
 * the co-pilot's Accept, the skill Apply, and a version revert all update the
 * preview pane while the buffer the writer is typing into keeps the old text —
 * and the next keystroke emits that old text back, silently discarding the
 * change. External edits have to be pushed in through the editor ref.
 *
 * These are source-structure assertions because the repo's runner has no DOM;
 * each one carries an anti-vacuous control so a rename cannot quietly pass.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

const EDITOR = readFileSync(
  join(REPO_ROOT, "src/components/dashboard/markdown-studio-editor-inner.tsx"),
  "utf8"
);

describe("the mount-only prop this guard exists for", () => {
  test("MDXEditor still documents `markdown` as read-once", () => {
    // If an upgrade makes the prop reactive, this fails and the ref plumbing
    // below can be deleted rather than carried forever.
    const dts = readFileSync(
      join(REPO_ROOT, "node_modules/@mdxeditor/editor/dist/index.d.ts"),
      "utf8"
    );
    expect(dts).toContain("read only when the component is mounted");
  });
});

describe("external edits reach the editor buffer", () => {
  test("the editor is still an MDXEditor driven by a markdown prop", () => {
    // Anti-vacuous control: the assertions below must fail because the sync
    // was removed, not because the component was replaced wholesale.
    expect(EDITOR).toMatch(/<MDXEditor/);
    expect(EDITOR).toMatch(/markdown=\{markdown\}/);
  });

  test("a ref is attached and used to push markdown in", () => {
    expect(EDITOR).toMatch(/ref=\{editorRef\}/);
    expect(EDITOR).toMatch(/editorRef\.current\?\.setMarkdown\(/);
  });

  test("the editor's own emissions are not pushed back at it", () => {
    // Without this guard every keystroke round-trips through setMarkdown and
    // the caret jumps to the end of the document on each character.
    expect(EDITOR).toMatch(/lastEmittedRef/);
    const push = EDITOR.indexOf("editorRef.current?.setMarkdown(");
    const guard = EDITOR.indexOf("=== lastEmittedRef.current");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(push);
  });
});

describe("the surfaces that apply edits programmatically", () => {
  const PROPOSAL_EDITOR = readFileSync(
    join(REPO_ROOT, "src/components/dashboard/proposal-editor.tsx"),
    "utf8"
  );

  test("the co-pilot rail applies through the same lifted state", () => {
    // Both the rail's Accept and the skill Apply go through setMarkdown on the
    // parent, so they are only correct once the editor honours prop changes.
    expect(PROPOSAL_EDITOR).toMatch(/<CopilotRail/);
    expect(PROPOSAL_EDITOR).toMatch(/onApply=\{setMarkdown\}/);
  });
});
