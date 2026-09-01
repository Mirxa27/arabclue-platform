/**
 * Which co-pilot suggestions this writer has already turned down.
 *
 * `suggestionId` is content-addressed so that "re-running the review on an
 * unchanged paragraph must not resurrect a card the user already rejected"
 * (`copilot-suggestions.ts:33-36`). That holds within a session and nowhere
 * else: the rail keeps rejections in React state, and the pass fires again on
 * idle after a reload, so the rejected cards come straight back.
 *
 * Only the ids are kept. Storing the suggestions themselves would re-hydrate
 * cards anchored to text the writer has since moved, which is the ambiguity
 * `anchorResolves` exists to refuse — and the model re-derives them for free.
 *
 * Local, like `editor-draft.ts`, and for the same reason: a rejection is a
 * private editing gesture, not a fact about the proposal, and routing it
 * through `/api/proposals/[id]` would bump `version` and delete every review.
 *
 * Everything read back is untrusted. `localStorage` is user-writable and shared
 * with every other tab on the origin, so the read path validates and evicts.
 */

/** Namespaced so a record cannot collide with the draft or theme keys. */
export const COPILOT_DISMISSAL_STORAGE_PREFIX = "arabclue-copilot-dismissed:";

/**
 * How long rejections are remembered after the last one.
 *
 * A bid is written over weeks, so this outlasts the work; an abandoned proposal
 * still stops costing storage rather than sitting on the origin's quota until
 * the user clears their browser. Enforced on read, the only moment the code is
 * guaranteed to be looking at the entry.
 */
export const COPILOT_DISMISSAL_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * How many rejections one proposal keeps.
 *
 * An id dies the moment the anchored text changes, so a long-lived document
 * accumulates dead ids indefinitely. Oldest go first — those are the ones whose
 * text has most likely moved on — and 200 is far more cards than a pass yields.
 */
export const COPILOT_DISMISSAL_MAX_IDS = 200;

/** The slice of `Storage` this module needs, so a test can pass a Map. */
export type DismissalStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

type DismissalRecord = Readonly<{
  proposalId: string;
  ids: readonly string[];
  savedAt: string;
}>;

export function dismissalKey(proposalId: string): string {
  return `${COPILOT_DISMISSAL_STORAGE_PREFIX}${proposalId}`;
}

/** The shape `suggestionId` produces: the first 12 hex digits of a sha256. */
const SUGGESTION_ID = /^[0-9a-f]{12}$/;

/** Valid ids only, deduplicated, oldest first, capped at the most recent. */
function sanitize(ids: readonly unknown[]): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || !SUGGESTION_ID.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    kept.push(id);
  }
  return kept.slice(-COPILOT_DISMISSAL_MAX_IDS);
}

/**
 * Reads the rejections for one proposal, or `[]` if there is nothing usable.
 *
 * Evicts anything it refuses, so a record that will never be read again does
 * not keep occupying the origin's quota.
 */
export function readDismissals(
  storage: DismissalStorage,
  proposalId: string,
  now: Date = new Date()
): string[] {
  let raw: string | null;
  try {
    raw = storage.getItem(dismissalKey(proposalId));
  } catch {
    return [];
  }
  if (raw === null) return [];

  const record = parseRecord(raw);
  // A record naming a different proposal is a leftover from an older key
  // scheme. Hiding one document's cards based on another's is worse than
  // showing them all again.
  if (!record || record.proposalId !== proposalId) {
    clearDismissals(storage, proposalId);
    return [];
  }

  const savedAt = Date.parse(record.savedAt);
  if (
    !Number.isFinite(savedAt) ||
    now.getTime() - savedAt > COPILOT_DISMISSAL_MAX_AGE_MS
  ) {
    clearDismissals(storage, proposalId);
    return [];
  }

  const ids = sanitize(record.ids);
  if (ids.length === 0) {
    clearDismissals(storage, proposalId);
    return [];
  }
  return ids;
}

function parseRecord(raw: string): DismissalRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const { proposalId, ids, savedAt } = value as Record<string, unknown>;
  if (typeof proposalId !== "string" || proposalId === "") return null;
  if (!Array.isArray(ids)) return null;
  if (typeof savedAt !== "string") return null;
  return { proposalId, ids, savedAt };
}

/** Replaces the record. An empty list removes it rather than storing nothing. */
export function writeDismissals(
  storage: DismissalStorage,
  proposalId: string,
  ids: readonly string[],
  now: Date = new Date()
): void {
  const kept = sanitize(ids);
  if (kept.length === 0) {
    clearDismissals(storage, proposalId);
    return;
  }
  const record: DismissalRecord = {
    proposalId,
    ids: kept,
    savedAt: now.toISOString(),
  };
  try {
    storage.setItem(dismissalKey(proposalId), JSON.stringify(record));
  } catch {
    // Quota exceeded, or Safari private mode where `setItem` always throws.
    // Forgetting a rejection is a nuisance; throwing here would take the
    // editor down mid-edit.
  }
}

export function clearDismissals(
  storage: DismissalStorage,
  proposalId: string
): void {
  try {
    storage.removeItem(dismissalKey(proposalId));
  } catch {
    // Unreachable entry either way, and there is no caller to report it to.
  }
}
