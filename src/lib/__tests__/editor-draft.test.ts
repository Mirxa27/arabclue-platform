/**
 * The proposal editor loses everything typed since the last manual save.
 *
 * `proposal-editor.tsx` holds edits in `draftMd` — React state, nothing more —
 * and only `saveMutation` ever persists them. A reload, a crashed tab, a killed
 * browser, or a phone that reaps the process takes the lot. The editor already
 * knows this: it registers `useUnsavedChangesWarning`, which is a dialog asking
 * the user not to do the thing that destroys their work. A prompt is not
 * durability, and `beforeunload` never fires on a crash or an OOM kill.
 *
 * Autosaving to the server was the obvious fix and is the wrong one. Every
 * content-changing PATCH to `/api/proposals/[id]` bumps `version`, writes a
 * `ProposalVersion` row, resets `status` to DRAFT, nulls `submittedAt`,
 * `approvedAt` and `artifactsJson`, invalidates both snapshot sets, and
 * **deletes every `ProposalReview` row for the proposal** (route.ts:71-190).
 * A debounced save would shred version history into keystroke noise and throw
 * away submitted approvals while the user typed a comma.
 *
 * So the draft is local. `localStorage` survives reload and crash, costs no
 * server write, and cannot invalidate a review. The same file already does this
 * for the co-pilot's in-flight stream (`copilot-processing.ts:225-254`), so the
 * shape below deliberately mirrors that trio: key, serialize, parse-or-null.
 *
 * The one hazard a local draft introduces is clobbering. `saveMutation` sends
 * `expectedVersion` read from a *fresh* fetch, so restoring text that was typed
 * against an older revision and saving it would pass the optimistic-concurrency
 * check and silently overwrite whatever changed in between. That is what
 * `recoverDraft` exists to prevent, and the `stale` case below is the assertion
 * that matters most in this file: a diverged draft is never resumed silently.
 */

import { describe, expect, test } from "bun:test";
import {
  EDITOR_DRAFT_MAX_AGE_MS,
  clearDraft,
  draftKey,
  readDraft,
  recoverDraft,
  writeDraft,
  type EditorDraft,
  type DraftStorage,
} from "../editor-draft";

const PROPOSAL = "cmp-proposal-1";
const NOW = new Date("2026-09-01T12:00:00.000Z");

/**
 * In-memory `Storage` slice. `failOnSet` reproduces the one failure mode a real
 * browser has here: Safari in private mode and any origin at quota throw
 * `QuotaExceededError` from `setItem`, and an editor that dies on a keystroke
 * because the disk is full is worse than one that never had a draft.
 */
function fakeStorage(
  options: Readonly<{ failOnSet?: boolean }> = {}
): DraftStorage & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      if (options.failOnSet) throw new Error("QuotaExceededError");
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function draft(overrides: Partial<EditorDraft> = {}): EditorDraft {
  return {
    proposalId: PROPOSAL,
    version: 3,
    locale: "ar",
    contentMd: "# عرض فني\n\nنص محرر.",
    savedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe("editor drafts survive a reload without touching the server", () => {
  test("a written draft reads back identically", () => {
    const storage = fakeStorage();
    const original = draft();

    writeDraft(storage, original);

    expect(readDraft(storage, PROPOSAL, NOW)).toEqual(original);
    // Anti-vacuous: a read that returned its argument would also pass above.
    expect(storage.map.get(draftKey(PROPOSAL))).toContain("عرض فني");
  });

  test("nothing stored reads as nothing, and clearing removes it", () => {
    const storage = fakeStorage();
    expect(readDraft(storage, PROPOSAL, NOW)).toBeNull();

    writeDraft(storage, draft());
    expect(readDraft(storage, PROPOSAL, NOW)).not.toBeNull();

    clearDraft(storage, PROPOSAL);
    expect(readDraft(storage, PROPOSAL, NOW)).toBeNull();
    expect(storage.map.size).toBe(0);
  });

  test("drafts are keyed per proposal", () => {
    // One shared key would restore proposal A's text into proposal B, which is
    // worse than losing the draft: it silently mixes two customers' documents.
    const storage = fakeStorage();
    writeDraft(storage, draft({ proposalId: "other", contentMd: "wrong doc" }));

    expect(readDraft(storage, PROPOSAL, NOW)).toBeNull();
    expect(readDraft(storage, "other", NOW)?.contentMd).toBe("wrong doc");
  });

  test("a payload written under the wrong key is refused", () => {
    // Defence against a key scheme change leaving old entries behind: the
    // payload names its own proposal, so a mismatch is discarded rather than
    // rendered into whatever document happens to be open.
    const storage = fakeStorage();
    storage.map.set(
      draftKey(PROPOSAL),
      JSON.stringify(draft({ proposalId: "someone-else" }))
    );

    expect(readDraft(storage, PROPOSAL, NOW)).toBeNull();
  });

  test.each([
    ["not json at all", "}{"],
    ["json but not an object", '"just a string"'],
    ["missing contentMd", '{"proposalId":"cmp-proposal-1","version":3}'],
    [
      "contentMd of the wrong type",
      '{"proposalId":"cmp-proposal-1","version":3,"contentMd":42,"locale":"ar","savedAt":"2026-09-01T12:00:00.000Z"}',
    ],
    [
      "a locale outside the union",
      '{"proposalId":"cmp-proposal-1","version":3,"contentMd":"x","locale":"fr","savedAt":"2026-09-01T12:00:00.000Z"}',
    ],
    [
      "a non-numeric version",
      '{"proposalId":"cmp-proposal-1","version":"3","contentMd":"x","locale":"ar","savedAt":"2026-09-01T12:00:00.000Z"}',
    ],
  ])("corrupt storage reads as nothing: %s", (_label, raw) => {
    // localStorage is user-writable and shared with every other tab on the
    // origin. Anything read out of it is untrusted input, so a bad entry has to
    // return null rather than reach React as a half-built object.
    const storage = fakeStorage();
    storage.map.set(draftKey(PROPOSAL), raw);

    expect(readDraft(storage, PROPOSAL, NOW)).toBeNull();
  });

  test("a draft older than the retention window is dropped and evicted", () => {
    const storage = fakeStorage();
    const stale = new Date(NOW.getTime() - EDITOR_DRAFT_MAX_AGE_MS - 1);
    writeDraft(storage, draft({ savedAt: stale.toISOString() }));

    expect(readDraft(storage, PROPOSAL, NOW)).toBeNull();
    // Eviction matters: without it every proposal ever opened keeps a copy of
    // its markdown forever and the origin eventually hits its storage quota.
    expect(storage.map.size).toBe(0);
  });

  test("a draft inside the retention window survives", () => {
    // Anti-vacuous guard on the expiry test: an implementation that expired
    // everything would satisfy it and make the whole feature dead code.
    const storage = fakeStorage();
    const recent = new Date(NOW.getTime() - EDITOR_DRAFT_MAX_AGE_MS + 60_000);
    writeDraft(storage, draft({ savedAt: recent.toISOString() }));

    expect(readDraft(storage, PROPOSAL, NOW)).not.toBeNull();
  });

  test("a full disk does not take the editor down with it", () => {
    const storage = fakeStorage({ failOnSet: true });

    expect(() => writeDraft(storage, draft())).not.toThrow();
    expect(readDraft(storage, PROPOSAL, NOW)).toBeNull();
  });
});

describe("recovery never silently overwrites a newer revision", () => {
  test("same version, diverged text — resume it", () => {
    const recovery = recoverDraft({
      draft: draft({ version: 3, contentMd: "typed but never saved" }),
      serverVersion: 3,
      serverContentMd: "what the server has",
    });

    expect(recovery.kind).toBe("resume");
    expect(recovery.kind === "resume" && recovery.draft.contentMd).toBe(
      "typed but never saved"
    );
  });

  test("different version — offer it, never apply it", () => {
    // The clobber guard, and the reason this function exists rather than a
    // bare `readDraft` at mount. `saveMutation` sends `expectedVersion` from a
    // fresh fetch, so restoring v3 text over a v5 document and saving would
    // pass the precondition and destroy whoever wrote v4 and v5.
    const recovery = recoverDraft({
      draft: draft({ version: 3, contentMd: "typed against v3" }),
      serverVersion: 5,
      serverContentMd: "v5 body",
    });

    expect(recovery.kind).toBe("stale");
    expect(recovery.kind === "stale" && recovery.currentVersion).toBe(5);
    // Still handed back rather than deleted: it is the user's typing, and
    // discarding it to keep the code simple is the data loss this file is about.
    expect(recovery.kind === "stale" && recovery.draft.contentMd).toBe(
      "typed against v3"
    );
  });

  test("a draft identical to the server is not worth mentioning", () => {
    // A saved-then-reloaded editor still has a draft on disk. Announcing
    // "unsaved changes recovered" for text that matches the server trains the
    // user to dismiss the one notice that will eventually matter.
    const recovery = recoverDraft({
      draft: draft({ version: 4, contentMd: "identical" }),
      serverVersion: 4,
      serverContentMd: "identical",
    });

    expect(recovery.kind).toBe("none");
  });

  test("a locale-only change still counts as unsaved", () => {
    // `saveMutation` sends `locale` alongside `contentMd` and `isDirty` already
    // treats a locale switch as dirty, so a draft that only flipped the
    // language is real unsaved work.
    const recovery = recoverDraft({
      draft: draft({ version: 4, contentMd: "same", locale: "en" }),
      serverVersion: 4,
      serverContentMd: "same",
      serverLocale: "ar",
    });

    expect(recovery.kind).toBe("resume");
  });

  test("no draft is no recovery", () => {
    expect(
      recoverDraft({
        draft: null,
        serverVersion: 1,
        serverContentMd: "anything",
      }).kind
    ).toBe("none");
  });
});
