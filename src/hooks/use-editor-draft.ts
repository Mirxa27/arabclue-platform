"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserStorage } from "@/lib/browser-storage";
import {
  clearDraft,
  readDraft,
  recoverDraft,
  writeDraft,
  type DraftStorage,
  type EditorDraft,
} from "@/lib/editor-draft";

/**
 * Keystrokes are cheap; `JSON.stringify` of a whole proposal body is not, and
 * `localStorage` writes are synchronous on the main thread. Long enough to
 * coalesce a burst of typing, short enough that a crash costs less than a
 * sentence.
 */
const DRAFT_WRITE_DEBOUNCE_MS = 800;

export type UseEditorDraftArgs = Readonly<{
  proposalId: string | null;
  /** `null` until the proposal query resolves; nothing is read or written before then. */
  serverVersion: number | null;
  serverContentMd: string;
  serverLocale: "ar" | "en" | null;
  draftMd: string | null;
  draftLocale: "ar" | "en" | null;
  isDirty: boolean;
  /** Applies recovered text to the editor. */
  onRestore: (contentMd: string, locale: "ar" | "en") => void;
  /** Injected only by tests; production reads `window.localStorage`. */
  storage?: DraftStorage | null;
}>;

export type UseEditorDraftResult = Readonly<{
  /**
   * A draft typed against a revision the server has since moved past. Offered,
   * never applied: `saveMutation` sends `expectedVersion` from a fresh fetch, so
   * silently restoring this and saving would sail through the concurrency check
   * and overwrite every revision written in between.
   */
  staleDraft: EditorDraft | null;
  applyStaleDraft: () => void;
  discardStaleDraft: () => void;
  /**
   * Drops the stored draft. **Must** be called after a successful save: the
   * draft on disk still names the pre-save version, so leaving it there makes
   * every reopen report a spurious diverged draft.
   */
  clearStoredDraft: () => void;
}>;

/**
 * Keeps unsaved editor text on disk so a crash does not destroy it.
 *
 * All the decisions live in `@/lib/editor-draft`, which is pure and tested; this
 * hook is the browser boundary — a debounced write, a one-shot read when the
 * proposal loads, and the two buttons a diverged draft needs.
 */
export function useEditorDraft(args: UseEditorDraftArgs): UseEditorDraftResult {
  const {
    proposalId,
    serverVersion,
    serverContentMd,
    serverLocale,
    draftMd,
    draftLocale,
    isDirty,
  } = args;
  const [storage] = useState<DraftStorage | null>(
    () => args.storage ?? browserStorage()
  );
  const [staleDraft, setStaleDraft] = useState<EditorDraft | null>(null);

  // Kept in a ref so a new closure each render does not re-run recovery.
  const onRestoreRef = useRef(args.onRestore);
  useEffect(() => {
    onRestoreRef.current = args.onRestore;
  }, [args.onRestore]);

  // Persist while dirty. Nothing is written for a clean editor, so simply
  // opening a proposal never leaves a draft behind.
  useEffect(() => {
    if (!storage || !proposalId || serverVersion === null || !isDirty) return;
    // ponytail: a pending write is dropped if the editor closes inside the
    // debounce window. Flush-on-unmount if that window ever proves too wide —
    // it needs a value ref, since teardown here runs on every keystroke.
    const timer = window.setTimeout(() => {
      writeDraft(storage, {
        proposalId,
        version: serverVersion,
        locale: draftLocale ?? serverLocale ?? "ar",
        contentMd: draftMd ?? serverContentMd,
        savedAt: new Date().toISOString(),
      });
    }, DRAFT_WRITE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [
    storage,
    proposalId,
    serverVersion,
    isDirty,
    draftMd,
    draftLocale,
    serverContentMd,
    serverLocale,
  ]);

  // Recover once per proposal, the first time its version is known. Re-running
  // on every content change would fight the user's own typing.
  const recoveredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!storage || !proposalId || serverVersion === null) {
      // Closing the editor arms recovery again, so reopening the same proposal
      // in the same page session still offers the draft the close discarded.
      if (!proposalId) recoveredFor.current = null;
      return;
    }
    if (recoveredFor.current === proposalId) return;
    recoveredFor.current = proposalId;
    setStaleDraft(null);

    const recovery = recoverDraft({
      draft: readDraft(storage, proposalId),
      serverVersion,
      serverContentMd,
      serverLocale: serverLocale ?? undefined,
    });
    if (recovery.kind === "resume") {
      onRestoreRef.current(recovery.draft.contentMd, recovery.draft.locale);
    } else if (recovery.kind === "stale") {
      setStaleDraft(recovery.draft);
    }
  }, [storage, proposalId, serverVersion, serverContentMd, serverLocale]);

  const applyStaleDraft = useCallback(() => {
    if (!staleDraft) return;
    onRestoreRef.current(staleDraft.contentMd, staleDraft.locale);
    setStaleDraft(null);
  }, [staleDraft]);

  const discardStaleDraft = useCallback(() => {
    if (storage && proposalId) clearDraft(storage, proposalId);
    setStaleDraft(null);
  }, [storage, proposalId]);

  const clearStoredDraft = useCallback(() => {
    if (storage && proposalId) clearDraft(storage, proposalId);
    setStaleDraft(null);
  }, [storage, proposalId]);

  return { staleDraft, applyStaleDraft, discardStaleDraft, clearStoredDraft };
}
