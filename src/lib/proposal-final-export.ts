import {
  proposalMatchesReviewBinding,
  type ProposalReviewState,
} from "./proposal-review-integrity";

export interface FinalProposalReviewBinding {
  readonly status: string;
  readonly stepIndex: number;
  readonly reviewerId: string;
  readonly stepRole: string;
  readonly submissionHash: string | null;
  readonly submittedProposalVersion: number | null;
  readonly submittedSnapshotHash: string | null;
  readonly submittedSnapshotRevision: number | null;
}

export interface ExpectedProposalApprovalStep {
  readonly stepIndex: number;
  readonly reviewerId: string;
  readonly stepRole: string;
}

/**
 * A final proposal artifact is authorized only by a complete, internally
 * consistent, all-approved chain bound to the exact current proposal state.
 */
export function hasCompleteBoundProposalApproval(
  proposal: ProposalReviewState,
  reviews: readonly FinalProposalReviewBinding[],
  expectedSteps: readonly ExpectedProposalApprovalStep[]
): boolean {
  if (
    reviews.length === 0 ||
    expectedSteps.length === 0 ||
    reviews.length !== expectedSteps.length
  ) {
    return false;
  }
  const ordered = [...reviews].sort(
    (first, second) => first.stepIndex - second.stepIndex
  );
  const expected = [...expectedSteps].sort(
    (first, second) => first.stepIndex - second.stepIndex
  );
  const first = ordered[0];
  if (!first || ordered.some((review) => review.status !== "APPROVED")) {
    return false;
  }
  if (
    ordered.some(
      (review, index) =>
        review.stepIndex !== expected[index]?.stepIndex ||
        review.reviewerId !== expected[index]?.reviewerId ||
        review.stepRole !== expected[index]?.stepRole ||
        review.submissionHash !== first.submissionHash ||
        review.submittedProposalVersion !==
          first.submittedProposalVersion ||
        review.submittedSnapshotHash !== first.submittedSnapshotHash ||
        review.submittedSnapshotRevision !==
          first.submittedSnapshotRevision ||
        !proposalMatchesReviewBinding(proposal, review)
    )
  ) {
    return false;
  }
  return new Set(ordered.map((review) => review.stepIndex)).size ===
    ordered.length;
}
