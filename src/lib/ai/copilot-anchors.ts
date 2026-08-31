/**
 * Anchored edit proposals — the shape, and the rules for applying one safely.
 *
 * Split from `copilot-suggestions.ts` so the editor rail can import it: that
 * module reaches the model provider SDK, which must never enter the browser
 * bundle. Everything here is pure string work and runs on both sides.
 *
 * An anchor is text copied verbatim out of the document. Two rules keep that
 * safe against a document the user keeps typing into: an anchor that no longer
 * appears is stale and cannot be applied, and an anchor that appears more than
 * once is ambiguous and is discarded rather than guessed at.
 */

export type CopilotRisk = "LOW" | "MEDIUM" | "HIGH";
export type CopilotKind = "compliance" | "clarity" | "evidence" | "structure";

/** A model proposal, before it has been checked against the live buffer. */
export type RawCopilotSuggestion = {
  anchor: string;
  replacement: string;
  rationale: string;
  risk: CopilotRisk;
  kind: CopilotKind;
};

/** A proposal that has been proven to point at exactly one place in the doc. */
export type CopilotSuggestion = RawCopilotSuggestion & { id: string };

export type CopilotBulkResult = {
  content: string;
  applied: string[];
  skipped: string[];
};

export function occurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + needle.length;
  }
}

/** The edited document, or null when the anchor no longer exists. */
export function applySuggestion(
  contentMd: string,
  suggestion: CopilotSuggestion
): string | null {
  const at = contentMd.indexOf(suggestion.anchor);
  if (at === -1) return null;
  return (
    contentMd.slice(0, at) +
    suggestion.replacement +
    contentMd.slice(at + suggestion.anchor.length)
  );
}

/**
 * Bulk accept. Applied in order, because an earlier edit can consume the text a
 * later one anchors to — those are reported as skipped rather than forced.
 */
export function applySuggestions(
  contentMd: string,
  suggestions: readonly CopilotSuggestion[]
): CopilotBulkResult {
  let content = contentMd;
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const s of suggestions) {
    const next = applySuggestion(content, s);
    if (next === null) {
      skipped.push(s.id);
      continue;
    }
    content = next;
    applied.push(s.id);
  }
  return { content, applied, skipped };
}
