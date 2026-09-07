/**
 * The anti-fabrication gate for model output: a quote is accepted only when
 * it is a verbatim (normalization-tolerant) substring of the passages the
 * model was shown. A finding whose quotes all fail is dropped, never
 * repaired — a clarification letter that misquotes the tender is worse than
 * one question short.
 */

import { normalizeForMatch } from "./text";
import type { SourcePassage } from "./types";

/** Shortest normalized quote worth checking; anything shorter is a phrase, not a citation. */
export const MIN_GROUNDED_QUOTE_CHARS = 12;

export type GroundingIndex = Readonly<{
  /** Normalized text per passage id. */
  byId: ReadonlyMap<string, string>;
  /** Normalized text of each passage joined with its successor in the same document (chunk boundaries). */
  pairs: readonly string[];
}>;

export function buildGroundingIndex(passages: readonly SourcePassage[]): GroundingIndex {
  const byId = new Map<string, string>();
  for (const p of passages) byId.set(p.id, normalizeForMatch(p.text));
  const pairs: string[] = [];
  const sorted = [...passages].sort((a, b) =>
    a.documentId === b.documentId ? a.chunkIndex - b.chunkIndex : a.documentId.localeCompare(b.documentId)
  );
  for (let i = 0; i + 1 < sorted.length; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a.documentId === b.documentId && b.chunkIndex - a.chunkIndex <= 1) {
      pairs.push(`${byId.get(a.id) ?? ""} ${byId.get(b.id) ?? ""}`);
    }
  }
  return { byId, pairs };
}

/**
 * The passage that contains the quote (preferring the one the model named),
 * or `null` when nothing does.
 */
export function groundQuote(
  quote: string,
  index: GroundingIndex,
  preferredPassageId?: string | null
): { passageId: string | null; grounded: boolean } {
  const needle = normalizeForMatch(quote).replace(/^…|…$/g, "").trim();
  if (needle.length < MIN_GROUNDED_QUOTE_CHARS) return { passageId: null, grounded: false };
  if (preferredPassageId) {
    const hay = index.byId.get(preferredPassageId);
    if (hay && hay.includes(needle)) return { passageId: preferredPassageId, grounded: true };
  }
  for (const [id, hay] of index.byId) {
    if (hay.includes(needle)) return { passageId: id, grounded: true };
  }
  // A quote may straddle a chunk boundary; the pair index covers that.
  for (const pair of index.pairs) {
    if (pair.includes(needle)) return { passageId: preferredPassageId ?? null, grounded: true };
  }
  return { passageId: null, grounded: false };
}
