/**
 * Which passages the model reads, and in what order.
 *
 * A long tender does not fit one prompt, and reading it front to back spends
 * the budget on boilerplate. Passages are scored for interrogation relevance
 * (deadline, evaluation, penalty, scope, liability, annex, payment and
 * obligation vocabulary, per character), the best are kept within the total
 * budget, and the kept passages are re-sorted into reading order and packed
 * into windows so each prompt reads as a coherent slice of the document.
 */

import { asciiDigits } from "./text";
import { INTERROGATION_VOCAB } from "./detectors";
import type { SourcePassage } from "./types";

export type InterrogationWindow = Readonly<{
  index: number;
  passages: readonly SourcePassage[];
  chars: number;
}>;

export type WindowOptions = Readonly<{
  /** Upper bound on windows (model calls). */
  maxWindows?: number;
  /** Characters of passage text per window. */
  windowChars?: number;
}>;

export const DEFAULT_MAX_WINDOWS = 6;
export const DEFAULT_WINDOW_CHARS = 9_000;
/** A passage shorter than this is a heading or a fragment; it never earns a window on its own. */
const MIN_PASSAGE_CHARS = 40;

/** Relevance per character, so a long boilerplate chunk does not outrank a short dense clause. */
export function interrogationRelevance(text: string): number {
  const t = asciiDigits(text);
  let hits = 0;
  for (const re of INTERROGATION_VOCAB) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    hits += (t.match(g) ?? []).length;
  }
  // Percentages, dates and numbers are where contradictions live.
  hits += (t.match(/\d+\s?%|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/g) ?? []).length * 2;
  return hits / Math.max(200, t.length) * 1000;
}

export function selectInterrogationWindows(
  passages: readonly SourcePassage[],
  opts: WindowOptions = {}
): InterrogationWindow[] {
  const maxWindows = Math.max(1, opts.maxWindows ?? DEFAULT_MAX_WINDOWS);
  const windowChars = Math.max(1_000, opts.windowChars ?? DEFAULT_WINDOW_CHARS);
  const budget = maxWindows * windowChars;

  const scored = passages
    .filter((p) => p.text.trim().length >= MIN_PASSAGE_CHARS)
    .map((p) => ({ p, score: interrogationRelevance(p.text) }))
    .sort((a, b) => b.score - a.score);

  const kept: SourcePassage[] = [];
  let used = 0;
  for (const { p } of scored) {
    const len = Math.min(p.text.length, windowChars);
    if (used + len > budget) continue;
    kept.push(p);
    used += len;
  }

  kept.sort((a, b) =>
    a.documentId === b.documentId ? a.chunkIndex - b.chunkIndex : a.documentId.localeCompare(b.documentId)
  );

  const windows: InterrogationWindow[] = [];
  let current: SourcePassage[] = [];
  let chars = 0;
  const flush = () => {
    if (current.length === 0) return;
    windows.push({ index: windows.length, passages: current, chars });
    current = [];
    chars = 0;
  };
  for (const p of kept) {
    const len = Math.min(p.text.length, windowChars);
    if (chars + len > windowChars) flush();
    current.push(len < p.text.length ? { ...p, text: p.text.slice(0, windowChars) } : p);
    chars += len;
  }
  flush();
  return windows.slice(0, maxWindows);
}
