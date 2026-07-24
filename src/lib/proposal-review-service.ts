import { Prisma } from "@prisma/client";
import { db } from "./db";
import { getReviewDecisionProposalStatus } from "./contract-review";
import { proposalMatchesReviewBinding } from "./proposal-review-integrity";
import {
  claimedStructuredKnowledgeIds,
  validatePersistedProposalSnapshot,
  validateStructuredSnapshotEvidence,
} from "./proposal-snapshot-persistence";
import { loadApprovedStructuredEvidenceBindings } from "./proposal-snapshot-evidence";
import {
  loadProposalSnapshotServerIdentity,
  validateProposalSnapshotServerIdentity,
} from "./proposal-snapshot-identity";
import { validatePersistedContractRenderSnapshot } from "./contract-render-snapshot";

export type ProposalReviewDecision = "APPROVED" | "REJECTED";

export class ProposalReviewDecisionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ProposalReviewDecisionError";
    this.status = status;
    this.code = code;
  }
}

export interface DecideProposalReviewInput {
  readonly reviewId: string;
  readonly reviewerId: string;
  readonly workspaceId: string;
  readonly decision: ProposalReviewDecision;
  readonly comment?: string | null;
  readonly now?: Date;
}

/**
 * Decide one review step and advance the proposal in one serializable
 * transaction. Every step must match the immutable state captured on submit.
 */
export async function decideProposalReview(
  input: DecideProposalReviewInput
) {
  try {
    return await db.$transaction(
      async (tx) => {
        const review = await tx.proposalReview.findUnique({
          where: { id: input.reviewId },
          include: { proposal: true },
        });
        if (!review || review.proposal.workspaceId !== input.workspaceId) {
          throw new ProposalReviewDecisionError(
            "not found",
            404,
            "REVIEW_NOT_FOUND"
          );
        }
        if (review.reviewerId !== input.reviewerId) {
          throw new ProposalReviewDecisionError(
            "Only the assigned reviewer may decide this step",
            403,
            "REVIEW_REVIEWER_MISMATCH"
          );
        }
        if (review.status !== "PENDING") {
          throw new ProposalReviewDecisionError(
            "Review already decided",
            409,
            "REVIEW_ALREADY_DECIDED"
          );
        }
        if (!["REVIEW", "IN_REVIEW"].includes(review.proposal.status)) {
          throw new ProposalReviewDecisionError(
            "Proposal is not in an active review state",
            409,
            "REVIEW_CHAIN_INACTIVE"
          );
        }
        if (!proposalMatchesReviewBinding(review.proposal, review)) {
          throw new ProposalReviewDecisionError(
            "Proposal content changed after submission; cancel and resubmit the review chain",
            409,
            "REVIEW_STATE_CHANGED"
          );
        }
        if (review.proposal.type === "CONTRACT") {
          const contractSnapshot =
            validatePersistedContractRenderSnapshot(
              review.proposal.contractRenderSnapshot,
              {
                proposalId: review.proposal.id,
                hash: review.proposal.contractRenderSnapshotHash,
                revision:
                  review.proposal.contractRenderSnapshotRevision,
              }
            );
          if (!contractSnapshot.ok) {
            throw new ProposalReviewDecisionError(
              "The reviewed contract render snapshot is missing or invalid",
              409,
              contractSnapshot.code
            );
          }
        } else {
          const snapshot = validatePersistedProposalSnapshot(
            review.proposal.structuredSnapshot,
            {
              proposalId: review.proposal.id,
              hash: review.proposal.structuredSnapshotHash,
              revision: review.proposal.structuredSnapshotRevision,
              presetKey: review.proposal.structuredSnapshotPreset,
            }
          );
          if (!snapshot.ok) {
            throw new ProposalReviewDecisionError(
              "The reviewed structured snapshot is no longer valid",
              409,
              snapshot.code
            );
          }
          const serverIdentity =
            await loadProposalSnapshotServerIdentity(
              input.workspaceId,
              review.proposal.projectId,
              tx
            );
          if (
            !serverIdentity ||
            validateProposalSnapshotServerIdentity(
              snapshot.value.snapshot,
              serverIdentity
            ).length > 0
          ) {
            throw new ProposalReviewDecisionError(
              "Proposal project, bidder, tender, or brand identity changed after submission",
              409,
              "REVIEW_IDENTITY_CHANGED"
            );
          }
          const approvedEvidence =
            await loadApprovedStructuredEvidenceBindings(
              input.workspaceId,
              claimedStructuredKnowledgeIds(snapshot.value.snapshot),
              input.now ?? new Date(),
              tx
            );
          if (
            validateStructuredSnapshotEvidence(
              snapshot.value.snapshot,
              approvedEvidence
            ).length > 0
          ) {
            throw new ProposalReviewDecisionError(
              "Structured proposal evidence changed or was revoked after submission",
              409,
              "REVIEW_EVIDENCE_CHANGED"
            );
          }
        }

        const chain = await tx.proposalReview.findMany({
          where: { proposalId: review.proposalId },
          orderBy: { stepIndex: "asc" },
        });
        if (
          chain.length === 0 ||
          chain.some(
            (step) =>
              step.submissionHash !== review.submissionHash ||
              step.submittedProposalVersion !==
                review.submittedProposalVersion ||
              step.submittedSnapshotHash !== review.submittedSnapshotHash ||
              step.submittedSnapshotRevision !==
                review.submittedSnapshotRevision
          )
        ) {
          throw new ProposalReviewDecisionError(
            "Review chain has inconsistent submission bindings",
            409,
            "REVIEW_CHAIN_MISMATCH"
          );
        }
        if (
          chain.some(
            (step) =>
              step.stepIndex < review.stepIndex &&
              step.status !== "APPROVED"
          )
        ) {
          throw new ProposalReviewDecisionError(
            "Previous approval steps are not complete",
            409,
            "REVIEW_SEQUENCE_INCOMPLETE"
          );
        }

        const decidedAt = input.now ?? new Date();
        const reviewWrite = await tx.proposalReview.updateMany({
          where: {
            id: review.id,
            status: "PENDING",
            submissionHash: review.submissionHash,
          },
          data: {
            status: input.decision,
            comment: input.comment ?? null,
            decidedAt,
          },
        });
        if (reviewWrite.count !== 1) {
          throw new ProposalReviewDecisionError(
            "Review changed concurrently",
            409,
            "REVIEW_CONCURRENT_UPDATE"
          );
        }

        const pendingReviewsAfterDecision =
          input.decision === "APPROVED"
            ? await tx.proposalReview.count({
                where: {
                  proposalId: review.proposalId,
                  submissionHash: review.submissionHash,
                  status: "PENDING",
                },
              })
            : 0;
        const nextStatus = getReviewDecisionProposalStatus({
          decision: input.decision,
          pendingReviewsAfterDecision,
        });
        const proposalWrite = await tx.generatedProposal.updateMany({
          where: {
            id: review.proposalId,
            workspaceId: input.workspaceId,
            status: review.proposal.status,
            updatedAt: review.proposal.updatedAt,
            version: review.submittedProposalVersion ?? -1,
            ...(review.proposal.type === "CONTRACT"
              ? {
                  contractRenderSnapshotHash:
                    review.submittedSnapshotHash,
                  contractRenderSnapshotRevision:
                    review.submittedSnapshotRevision ?? -1,
                }
              : {
                  structuredSnapshotHash:
                    review.submittedSnapshotHash,
                  structuredSnapshotRevision:
                    review.submittedSnapshotRevision ?? -1,
                }),
          },
          data: {
            status: nextStatus,
            approvedAt: nextStatus === "APPROVED" ? decidedAt : null,
          },
        });
        if (proposalWrite.count !== 1) {
          throw new ProposalReviewDecisionError(
            "Proposal changed concurrently; no decision was recorded",
            409,
            "REVIEW_PROPOSAL_CONCURRENT_UPDATE"
          );
        }

        const updated = await tx.proposalReview.findUniqueOrThrow({
          where: { id: review.id },
        });
        return { review: updated, proposalStatus: nextStatus };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      throw new ProposalReviewDecisionError(
        "Review changed concurrently; retry the decision",
        409,
        "REVIEW_SERIALIZATION_CONFLICT"
      );
    }
    throw error;
  }
}
