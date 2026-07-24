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
  readonly contractRenderSnapshot?: unknown;
  readonly contractRenderSnapshotHash?: string | null;
  readonly contractRenderSnapshotRevision?: number;
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
    contractRenderSnapshot: proposal.contractRenderSnapshot ?? null,
    contractRenderSnapshotHash:
      proposal.contractRenderSnapshotHash ?? null,
    contractRenderSnapshotRevision:
      proposal.contractRenderSnapshotRevision ?? 0,
  });
}

export function proposalAuthoritativeSnapshotBinding(
  proposal: ProposalReviewState
): {
  readonly hash: string | null;
  readonly revision: number;
} {
  return proposal.type === "CONTRACT"
    ? {
        hash: proposal.contractRenderSnapshotHash ?? null,
        revision: proposal.contractRenderSnapshotRevision ?? 0,
      }
    : {
        hash: proposal.structuredSnapshotHash,
        revision: proposal.structuredSnapshotRevision,
      };
}

export function proposalReviewBinding(
  proposal: ProposalReviewState
): {
  readonly submissionHash: string;
  readonly submittedProposalVersion: number;
  readonly submittedSnapshotHash: string | null;
  readonly submittedSnapshotRevision: number;
} {
  const authoritativeSnapshot =
    proposalAuthoritativeSnapshotBinding(proposal);
  return {
    submissionHash: computeProposalReviewSubmissionHash(proposal),
    submittedProposalVersion: proposal.version,
    submittedSnapshotHash: authoritativeSnapshot.hash,
    submittedSnapshotRevision: authoritativeSnapshot.revision,
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
  const authoritativeSnapshot =
    proposalAuthoritativeSnapshotBinding(proposal);
  return (
    typeof binding.submissionHash === "string" &&
    binding.submissionHash.length > 0 &&
    binding.submittedProposalVersion === proposal.version &&
    binding.submittedSnapshotHash === authoritativeSnapshot.hash &&
    binding.submittedSnapshotRevision ===
      authoritativeSnapshot.revision &&
    binding.submissionHash === computeProposalReviewSubmissionHash(proposal)
  );
}
