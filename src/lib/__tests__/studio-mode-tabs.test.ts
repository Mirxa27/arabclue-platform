/**
 * The proposal studio's mode row must stay legible.
 *
 * It was eight equal-weight buttons on one line — same height, same type size,
 * same variant — mixing "how am I looking at this document" with "show me a
 * different panel entirely". Two of them shared the Eye icon and two more
 * shared FileText, so at a glance four of the eight were indistinguishable.
 *
 * Asserted against source because this is a React tree and the repo has no DOM
 * test renderer. Every check pairs with an anti-vacuity assertion so a rename
 * or a deletion cannot turn the suite silently green.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const editor = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/proposal-editor.tsx"),
  "utf8"
);
const previewFrame = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/document-preview-frame.tsx"),
  "utf8"
);

/** The two tab arrays, so each group can be asserted on independently. */
function tabGroup(name: "VIEW_TABS" | "PANEL_TABS"): string {
  const match = new RegExp(`const ${name} = \\[[\\s\\S]*?\\n\\] as const;`).exec(
    editor
  );
  expect(match, `${name} not found`).toBeTruthy();
  return match![0];
}

describe("studio mode tabs are grouped, not a flat row of eight", () => {
  test("view modes and panels are separate arrays", () => {
    const view = tabGroup("VIEW_TABS");
    const panels = tabGroup("PANEL_TABS");

    // How you look at the document.
    for (const key of ["edit", "split", "preview"]) {
      expect(view, `${key} missing from VIEW_TABS`).toContain(`"${key}"`);
    }
    // What else you can inspect about it.
    for (const key of ["financial", "versions", "validation", "bilingual"]) {
      expect(panels, `${key} missing from PANEL_TABS`).toContain(`"${key}"`);
    }

    // Anti-vacuous: the groups are actually disjoint, not two copies of one list.
    for (const key of ["financial", "versions", "validation", "bilingual"]) {
      expect(view, `${key} leaked into VIEW_TABS`).not.toContain(`"${key}"`);
    }
    for (const key of ["edit", "split", "preview"]) {
      expect(panels, `${key} leaked into PANEL_TABS`).not.toContain(`"${key}"`);
    }
  });

  test("no two tabs in a group share an icon", () => {
    for (const name of ["VIEW_TABS", "PANEL_TABS"] as const) {
      const icons = [...tabGroup(name).matchAll(/,\s*([A-Z]\w+)\]/g)].map(
        (m) => m[1]
      );
      // Anti-vacuous: the regex found something to compare in the first place.
      expect(icons.length, `no icons parsed out of ${name}`).toBeGreaterThan(2);
      expect(new Set(icons).size, `duplicate icon in ${name}: ${icons}`).toBe(
        icons.length
      );
    }
  });

  test("PDF is a control inside the preview, not a top-level tab", () => {
    // `print` only ever set `defaultMode="pdf"` on DocumentPreviewFrame — the
    // starting value of a toggle that frame already renders. A whole tab for
    // one radio button's default is a control the bidder has to rule out.
    expect(editor).not.toContain('"print"');
    // Anti-vacuous: the PDF view it used to reach still exists, one level down.
    expect(previewFrame).toContain('setMode("pdf")');
    expect(previewFrame).toContain('setMode("html")');
  });

  test("the unsaved-work warning still fires before a stale preview", () => {
    // Dropping `print` must not drop the guard that told the bidder the
    // rendered document is the last save, not what is on screen.
    expect(editor).toContain('key === "preview"');
    expect(editor).toContain("isDirty");
  });
});
