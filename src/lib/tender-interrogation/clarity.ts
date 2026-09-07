/**
 * Tender clarity: 100 minus the weight of the findings still open. A derived
 * number about the tender text — not a prediction, not a score of the bid.
 */

import { SEVERITY_WEIGHT, type ClarificationSeverity, type ClarificationStatus } from "./types";

export type ClarityInput = Readonly<{ severity: ClarificationSeverity; status: ClarificationStatus }>;

/** Statuses that no longer weigh on the tender's clarity. */
export const RESOLVED_STATUSES: ReadonlySet<ClarificationStatus> = new Set(["DROPPED", "ANSWERED"]);

export function clarityScore(items: readonly ClarityInput[]): number {
  const open = items.filter((i) => !RESOLVED_STATUSES.has(i.status));
  const weight = open.reduce((sum, i) => sum + SEVERITY_WEIGHT[i.severity], 0);
  return Math.max(0, 100 - weight);
}

export type ClaritySummary = Readonly<{
  score: number;
  total: number;
  open: number;
  byStatus: Readonly<Record<ClarificationStatus, number>>;
  bySeverity: Readonly<Record<ClarificationSeverity, number>>;
}>;

export function summarizeClarity(items: readonly ClarityInput[]): ClaritySummary {
  const byStatus: Record<ClarificationStatus, number> = { PROPOSED: 0, KEPT: 0, DROPPED: 0, SUBMITTED: 0, ANSWERED: 0 };
  const bySeverity: Record<ClarificationSeverity, number> = { CRITICAL: 0, MAJOR: 0, MINOR: 0 };
  for (const i of items) {
    byStatus[i.status] += 1;
    if (!RESOLVED_STATUSES.has(i.status)) bySeverity[i.severity] += 1;
  }
  const open = items.filter((i) => !RESOLVED_STATUSES.has(i.status)).length;
  return { score: clarityScore(items), total: items.length, open, byStatus, bySeverity };
}
