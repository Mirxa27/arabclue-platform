/**
 * Failure codes whose remedy is the billing screen, not a retry. Every 402
 * the quota gates answer with, plus the export feature gate.
 */
export const PLAN_LIMIT_CODES: ReadonlySet<string> = new Set([
  "QUOTA_DOCUMENTS_EXCEEDED",
  "QUOTA_PROPOSALS_EXCEEDED",
  "QUOTA_STORAGE_EXCEEDED",
  "QUOTA_TOKENS_EXCEEDED",
  "SUBSCRIPTION_INACTIVE",
  "TRIAL_ENDED",
  "EXPORT_FORMAT_NOT_IN_PLAN",
]);

export function isPlanLimitCode(code: unknown): boolean {
  return typeof code === "string" && PLAN_LIMIT_CODES.has(code);
}
