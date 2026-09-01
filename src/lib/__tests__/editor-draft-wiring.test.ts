/**
 * Two wiring mistakes would quietly ruin local drafts, and neither is visible
 * from `editor-draft.ts` — its unit tests would stay green through both.
 *
 * 1. **Not clearing the draft after a save.** The stored draft names the
 *    version the save just superseded, so `recoverDraft` would classify it as
 *    diverged and the editor would report a phantom "unsaved changes from an
 *    older revision" strip after every single save. The notice that exists to
 *    protect real work becomes the notice users learn to click past.
 *
 * 2. **Reaching for a debounced server PATCH after all.** That is the design
 *    this whole approach exists to avoid: `/api/proposals/[id]` bumps `version`,
 *    writes a `ProposalVersion` row, resets `status` to DRAFT, nulls
 *    `submittedAt`/`approvedAt`/`artifactsJson` and deletes every
 *    `ProposalReview` row on each content change. On a timer that turns version
 *    history into keystroke noise and silently discards submitted approvals.
 *
 * Source-scanned rather than rendered because this repo runs no DOM in tests.
 * The first test is the anti-vacuity guard: it fails if the scan stops reaching
 * the files, which would make every assertion below pass against empty strings.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const EDITOR = readFileSync(
  join(ROOT, "src/components/dashboard/proposal-editor.tsx"),
  "utf8"
);
const HOOK = readFileSync(
  join(ROOT, "src/hooks/use-editor-draft.ts"),
  "utf8"
);

describe("the proposal editor keeps drafts local", () => {
  test("the scan reaches both files", () => {
    expect(EDITOR.length).toBeGreaterThan(10_000);
    expect(HOOK).toContain("useEditorDraft");
    expect(EDITOR).toContain("useEditorDraft(");
  });

  test("a successful save clears the stored draft", () => {
    // Scoped to the save mutation's success handler: finding the call anywhere
    // in a 1400-line file would also match the stale-strip's Discard button.
    const onSuccess = EDITOR.slice(
      EDITOR.indexOf("mutationFn: async () => {\n      const expectedVersion")
    );
    const handler = onSuccess.slice(
      onSuccess.indexOf("onSuccess: () => {"),
      onSuccess.indexOf("onError:")
    );
    expect(handler).toContain("clearStoredDraft()");
    // Anti-vacuous: a slice that missed the handler would contain neither.
    expect(handler).toContain("setDraftMd(null)");
  });

  test("no timer ever fires a proposal PATCH", () => {
    // The destructive design. A `setTimeout`/`setInterval` whose body reaches a
    // PATCH is the shape to catch; the editor's own timers are allowed as long
    // as they do not write to the proposal.
    const patchOnTimer =
      /set(?:Timeout|Interval)\([\s\S]{0,600}?method:\s*"PATCH"/.test(EDITOR);
    expect(patchOnTimer).toBe(false);

    // Anti-vacuous both ways: the editor really does PATCH (manual save), and
    // the regex really does match when a timer wraps one.
    expect(EDITOR).toContain('method: "PATCH"');
    expect(
      /set(?:Timeout|Interval)\([\s\S]{0,600}?method:\s*"PATCH"/.test(
        'setTimeout(() => fetch(url, { method: "PATCH" }), 800)'
      )
    ).toBe(true);
  });

  test("the draft hook writes to storage, not to the network", () => {
    expect(HOOK).toContain("writeDraft");
    expect(HOOK).not.toContain("fetch(");
  });

  test("a diverged draft is offered rather than applied", () => {
    // `recoverDraft`'s `stale` branch must reach a state setter, never the
    // restore callback — applying it silently is the clobber this guards.
    const staleBranch = HOOK.slice(
      HOOK.indexOf('recovery.kind === "stale"'),
      HOOK.indexOf("}, [storage, proposalId, serverVersion")
    );
    expect(staleBranch).toContain("setStaleDraft(recovery.draft)");
    expect(staleBranch).not.toContain("onRestoreRef.current");

    // And the editor has to actually render the offer, or the draft is simply
    // dropped on the floor with no way for the user to reach it.
    expect(EDITOR).toContain("staleDraft ?");
    expect(EDITOR).toContain("applyStaleDraft");
    expect(EDITOR).toContain("discardStaleDraft");
  });
});
