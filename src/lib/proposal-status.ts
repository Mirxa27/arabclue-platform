export const PROPOSAL_EDIT_LOCKED_STATUSES = [
  "IN_REVIEW",
  "REVIEW",
  "APPROVED",
  "EXPORTED",
] as const;

/** Statuses that must not accept another "submit for review" while already in/after review. */
export const PROPOSAL_SUBMIT_BLOCKED_STATUSES = [
  "IN_REVIEW",
  "REVIEW",
  "REVIEWED",
  "APPROVED",
  "EXPORTED",
] as const;

const LOCKED_STATUS_SET = new Set<string>(PROPOSAL_EDIT_LOCKED_STATUSES);
const SUBMIT_BLOCKED_SET = new Set<string>(PROPOSAL_SUBMIT_BLOCKED_STATUSES);

export function isProposalEditLocked(status: string | null | undefined): boolean {
  return Boolean(status && LOCKED_STATUS_SET.has(status));
}

export function isProposalSubmitBlocked(
  status: string | null | undefined
): boolean {
  return Boolean(status && SUBMIT_BLOCKED_SET.has(status));
}

