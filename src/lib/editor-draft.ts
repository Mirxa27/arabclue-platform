/**
 * Crash-durable local drafts for the proposal editor.
 *
 * The editor keeps unsaved text in React state and persists only on an explicit
 * save, so anything typed since the last one dies with the tab. Autosaving to
 * the server is not the fix: every content-changing PATCH to
 * `/api/proposals/[id]` bumps `version`, writes a `ProposalVersion` row, resets
 * `status` to DRAFT and deletes every `ProposalReview` row for the proposal, so
 * a debounced save would turn version history into keystroke noise and discard
 * submitted approvals mid-sentence.
 *
 * A local draft has none of those side effects, survives the crash that
 * `beforeunload` cannot catch, and mirrors the persistence trio this repo
 * already uses for the co-pilot's in-flight stream (`copilot-processing.ts`).
 *
 * Everything read back is untrusted: `localStorage` is user-writable and shared
 * with every other tab on the origin. `parseDraft` therefore validates each
 * field and returns `null` rather than letting a half-built object reach React.
 */

/** Namespaced so a draft cannot collide with the theme or locale keys. */
export const EDITOR_DRAFT_STORAGE_PREFIX = "arabclue-editor-draft:";

/**
 * How long an unrecovered draft is kept.
 *
 * Long enough to cover a weekend away from a half-written bid; short enough
 * that abandoned drafts do not accumulate one markdown body per proposal ever
 * opened until the origin hits its storage quota. Expiry is enforced on read,
 * which is the only moment the code is guaranteed to be looking at the entry.
 */
export const EDITOR_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type EditorDraft = Readonly<{
  proposalId: string;
  /**
   * The server `version` this text was typed against.
   *
   * Load-bearing for `recoverDraft`: `saveMutation` sends `expectedVersion`
   * from a fresh fetch, so text typed against an older revision would pass the
   * optimistic-concurrency check and silently overwrite the newer one.
   */
  version: number;
  locale: "ar" | "en";
  contentMd: string;
  savedAt: string;
}>;

/** The slice of `Storage` this module needs, so a test can pass a Map. */
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function draftKey(proposalId: string): string {
  return `${EDITOR_DRAFT_STORAGE_PREFIX}${proposalId}`;
}

function parseDraft(raw: string | null): EditorDraft | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const { proposalId, version, locale, contentMd, savedAt } = candidate;
  if (typeof proposalId !== "string" || proposalId === "") return null;
  if (typeof version !== "number" || !Number.isInteger(version)) return null;
  if (locale !== "ar" && locale !== "en") return null;
  if (typeof contentMd !== "string") return null;
  if (typeof savedAt !== "string") return null;
  return { proposalId, version, locale, contentMd, savedAt };
}

/**
 * Reads the draft for one proposal, or `null` if there is nothing usable.
 *
 * Evicts anything it refuses. A corrupt or expired entry is never read again,
 * so leaving it would keep a markdown body on disk forever for a proposal the
 * user may never open again.
 */
export function readDraft(
  storage: DraftStorage,
  proposalId: string,
  now: Date = new Date()
): EditorDraft | null {
  let raw: string | null;
  try {
    raw = storage.getItem(draftKey(proposalId));
  } catch {
    return null;
  }
  if (raw === null) return null;

  const parsed = parseDraft(raw);
  // A payload naming a different proposal is a leftover from an older key
  // scheme. Rendering it would mix two documents, which is worse than losing it.
  if (!parsed || parsed.proposalId !== proposalId) {
    clearDraft(storage, proposalId);
    return null;
  }

  const savedAt = Date.parse(parsed.savedAt);
  if (!Number.isFinite(savedAt) || now.getTime() - savedAt > EDITOR_DRAFT_MAX_AGE_MS) {
    clearDraft(storage, proposalId);
    return null;
  }
  return parsed;
}

export function writeDraft(storage: DraftStorage, draft: EditorDraft): void {
  try {
    storage.setItem(draftKey(draft.proposalId), JSON.stringify(draft));
  } catch {
    // Quota exceeded, or Safari private mode where `setItem` always throws.
    // The draft is a safety net; losing the net must not break what it catches.
  }
}

export function clearDraft(storage: DraftStorage, proposalId: string): void {
  try {
    storage.removeItem(draftKey(proposalId));
  } catch {
    // Unreachable entry either way, and there is no caller to report it to.
  }
}

export type DraftRecovery =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "resume"; draft: EditorDraft }>
  | Readonly<{ kind: "stale"; draft: EditorDraft; currentVersion: number }>;

/**
 * Decides what a stored draft is allowed to do to the open document.
 *
 * `resume` means the draft was typed against exactly the revision now loaded,
 * so applying it is resuming. `stale` means the document moved on underneath —
 * another tab, another member of the workspace — and the draft must be offered
 * rather than applied, because saving it would clobber every revision since.
 * `none` covers both no draft and a draft that matches what the server already
 * has, since announcing a recovery for text that is already saved trains the
 * user to dismiss the notice that will eventually matter.
 */
export function recoverDraft(
  input: Readonly<{
    draft: EditorDraft | null;
    serverVersion: number;
    serverContentMd: string;
    serverLocale?: "ar" | "en";
  }>
): DraftRecovery {
  const { draft, serverVersion, serverContentMd, serverLocale } = input;
  if (!draft) return { kind: "none" };
  if (draft.version !== serverVersion) {
    return { kind: "stale", draft, currentVersion: serverVersion };
  }
  const diverged =
    draft.contentMd !== serverContentMd ||
    (serverLocale !== undefined && draft.locale !== serverLocale);
  return diverged ? { kind: "resume", draft } : { kind: "none" };
}
