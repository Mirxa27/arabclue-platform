import { computeCanonicalHash } from "./document-templates/contract-templates";

export interface ProposalReviewState {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly title: string;
  readonly titleAr: string | null;
  readonly type: string;
  readonly version: number;
  readonly contentMd: string | null;
  readonly locale: string;
  readonly financialFormsJson: string | null;
  readonly structuredSnapshot: unknown;
  readonly structuredSnapshotHash: string | null;
  readonly structuredSnapshotRevision: number;
}

function canonicalStoredJson(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    // Invalid legacy JSON must still affect the binding and fail downstream
    // validation. Keeping the exact bytes makes any later repair a new state.
    return { invalidStoredJson: value };
  }
}

/**
 * Bind an approval chain to every persisted field that can change the proposal
 * rendered for review or export. Metadata-only fields and generated artifacts
 * are deliberately excluded.
 */
export function computeProposalReviewSubmissionHash(
  proposal: ProposalReviewState
): string {
  return computeCanonicalHash({
    schema: "arabclue.proposal-review-state.v1",
    proposalId: proposal.id,
    workspaceId: proposal.workspaceId,
    projectId: proposal.projectId,
    title: proposal.title,
    titleAr: proposal.titleAr,
    type: proposal.type,
    version: proposal.version,
    contentMd: proposal.contentMd,
    locale: proposal.locale,
    financialForms: canonicalStoredJson(proposal.financialFormsJson),
    structuredSnapshot: proposal.structuredSnapshot ?? null,
    structuredSnapshotHash: proposal.structuredSnapshotHash,
    structuredSnapshotRevision: proposal.structuredSnapshotRevision,
  });
}

export function proposalReviewBinding(
  proposal: ProposalReviewState
): {
  readonly submissionHash: string;
  readonly submittedProposalVersion: number;
  readonly submittedSnapshotHash: string | null;
  readonly submittedSnapshotRevision: number;
} {
  return {
    submissionHash: computeProposalReviewSubmissionHash(proposal),
    submittedProposalVersion: proposal.version,
    submittedSnapshotHash: proposal.structuredSnapshotHash,
    submittedSnapshotRevision: proposal.structuredSnapshotRevision,
  };
}

export function proposalMatchesReviewBinding(
  proposal: ProposalReviewState,
  binding: {
    readonly submissionHash: string | null;
    readonly submittedProposalVersion: number | null;
    readonly submittedSnapshotHash: string | null;
    readonly submittedSnapshotRevision: number | null;
  }
): boolean {
  return (
    typeof binding.submissionHash === "string" &&
    binding.submissionHash.length > 0 &&
    binding.submittedProposalVersion === proposal.version &&
    binding.submittedSnapshotHash === proposal.structuredSnapshotHash &&
    binding.submittedSnapshotRevision ===
      proposal.structuredSnapshotRevision &&
    binding.submissionHash === computeProposalReviewSubmissionHash(proposal)
  );
}
