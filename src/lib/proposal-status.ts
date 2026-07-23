export const PROPOSAL_EDIT_LOCKED_STATUSES = [
  "IN_REVIEW",
  "REVIEW",
  "APPROVED",
  "EXPORTED",
] as const;

const LOCKED_STATUS_SET = new Set<string>(PROPOSAL_EDIT_LOCKED_STATUSES);

export function isProposalEditLocked(status: string | null | undefined): boolean {
  return Boolean(status && LOCKED_STATUS_SET.has(status));
}

