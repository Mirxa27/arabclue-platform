/**
 * Tender Clarification Intelligence — shared vocabulary.
 *
 * A *passage* is one chunk of one uploaded tender document with the page and
 * heading the chunker recorded. A *finding* is one defect in the tender text
 * (a contradiction, an ambiguity, a missing item, a placeholder or a risk
 * clause) together with the verbatim quotes that ground it and the formal
 * question the bidder may put to the buyer. Pure types: no runtime imports.
 */

import type { Locale } from "../types";

export const CLARIFICATION_KINDS = [
  "CONTRADICTION",
  "AMBIGUITY",
  "MISSING_INFO",
  "RISK_CLAUSE",
  "PLACEHOLDER",
] as const;
export type ClarificationKind = (typeof CLARIFICATION_KINDS)[number];

export const CLARIFICATION_SEVERITIES = ["CRITICAL", "MAJOR", "MINOR"] as const;
export type ClarificationSeverity = (typeof CLARIFICATION_SEVERITIES)[number];

export const CLARIFICATION_STATUSES = [
  "PROPOSED",
  "KEPT",
  "DROPPED",
  "SUBMITTED",
  "ANSWERED",
] as const;
export type ClarificationStatus = (typeof CLARIFICATION_STATUSES)[number];

export const CLARIFICATION_PROVENANCES = [
  "DETERMINISTIC",
  "AI_GENERATED",
  "USER_AUTHORED",
] as const;
export type ClarificationProvenance = (typeof CLARIFICATION_PROVENANCES)[number];

/** One chunk of tender text as the analysis sees it. */
export type SourcePassage = Readonly<{
  id: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  text: string;
  pageRef: string | null;
  sectionHeading: string | null;
  language: string | null;
}>;

/** Verbatim tender text a finding rests on, with where it came from. */
export type ClarificationQuote = Readonly<{
  text: string;
  documentId: string | null;
  documentName: string | null;
  pageRef: string | null;
  sectionHeading: string | null;
}>;

/** A defect and its question, before persistence. */
export type Finding = Readonly<{
  kind: ClarificationKind;
  severity: ClarificationSeverity;
  titleEn: string;
  titleAr: string;
  rationaleEn: string;
  rationaleAr: string;
  questionEn: string;
  questionAr: string;
  quotes: readonly ClarificationQuote[];
  provenance: Extract<ClarificationProvenance, "DETERMINISTIC" | "AI_GENERATED">;
  /** Stable identity across runs: see `fingerprintFinding`. */
  fingerprint: string;
  /** Which rule produced a deterministic finding; the model's window otherwise. */
  provenanceDetail: Readonly<Record<string, string | number>>;
}>;

export type FindingLocale = Locale;

/** Weight of one open finding against the clarity score. */
export const SEVERITY_WEIGHT: Readonly<Record<ClarificationSeverity, number>> =
  Object.freeze({ CRITICAL: 15, MAJOR: 6, MINOR: 2 });

/** Sort rank: CRITICAL first. */
export const SEVERITY_RANK: Readonly<Record<ClarificationSeverity, number>> =
  Object.freeze({ CRITICAL: 0, MAJOR: 1, MINOR: 2 });
