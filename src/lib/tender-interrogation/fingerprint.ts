/**
 * Stable identity of a finding across runs, so re-running the interrogation
 * upserts rather than duplicates and never disturbs the team's triage.
 *
 * Identity is the kind plus the normalized primary quote (or, for a finding
 * about an *absence*, the rule and its key). SHA-256 via the Web Crypto-free
 * Node `crypto` module — the same digest the artifact manifests use.
 */

import { createHash } from "node:crypto";
import { normalizeForMatch } from "./text";
import type { ClarificationKind } from "./types";

const QUOTE_KEY_CHARS = 200;

export function fingerprintFinding(
  kind: ClarificationKind,
  primary: { quoteText: string } | { detectorId: string; key: string }
): string {
  const body =
    "quoteText" in primary
      ? `q:${normalizeForMatch(primary.quoteText).slice(0, QUOTE_KEY_CHARS)}`
      : `d:${primary.detectorId}:${primary.key}`;
  return createHash("sha256").update(`${kind}|${body}`).digest("hex");
}

/** A person's own question: identity is its normalized text. */
export function fingerprintUserQuestion(questionEn: string, questionAr: string): string {
  return createHash("sha256")
    .update(`USER|${normalizeForMatch(questionEn)}|${normalizeForMatch(questionAr)}`)
    .digest("hex");
}
