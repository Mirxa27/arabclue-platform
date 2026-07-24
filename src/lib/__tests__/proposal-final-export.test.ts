import { describe, expect, test } from "bun:test";
import {
  proposalReviewBinding,
  type ProposalReviewState,
} from "../proposal-review-integrity";
import { hasCompleteBoundProposalApproval } from "../proposal-final-export";

function proposal(): ProposalReviewState {
  return {
    id: "proposal-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    title: "Proposal",
    titleAr: "العرض",
    type: "COMBINED",
    version: 2,
    contentMd: "# Exact content",
    locale: "en",
    financialFormsJson: null,
    structuredSnapshot: { snapshotId: "proposal-1", version: 3 },
    structuredSnapshotHash: `sha256:${"a".repeat(64)}`,
    structuredSnapshotRevision: 3,
  };
}

describe("final proposal export approval binding", () => {
  test("requires a non-empty all-approved chain bound to current state", () => {
    const current = proposal();
    const binding = proposalReviewBinding(current);
    const approved = [
      {
        ...binding,
        status: "APPROVED",
        stepIndex: 1,
        reviewerId: "reviewer-1",
        stepRole: "TECHNICAL",
      },
      {
        ...binding,
        status: "APPROVED",
        stepIndex: 2,
        reviewerId: "reviewer-2",
        stepRole: "LEGAL",
      },
    ];
    const expected = approved.map(
      ({ stepIndex, reviewerId, stepRole }) => ({
        stepIndex,
        reviewerId,
        stepRole,
      })
    );

    expect(
      hasCompleteBoundProposalApproval(current, approved, expected)
    ).toBe(true);
    expect(
      hasCompleteBoundProposalApproval(current, [], expected)
    ).toBe(false);
    expect(
      hasCompleteBoundProposalApproval(current, [
        approved[0],
        { ...approved[1], status: "PENDING" },
      ], expected)
    ).toBe(false);
  });

  test("rejects stale or internally inconsistent review bindings", () => {
    const current = proposal();
    const binding = proposalReviewBinding(current);
    const approved = [
      {
        ...binding,
        status: "APPROVED",
        stepIndex: 1,
        reviewerId: "reviewer-1",
        stepRole: "TECHNICAL",
      },
      {
        ...binding,
        status: "APPROVED",
        stepIndex: 2,
        reviewerId: "reviewer-2",
        stepRole: "LEGAL",
      },
    ];
    const expected = approved.map(
      ({ stepIndex, reviewerId, stepRole }) => ({
        stepIndex,
        reviewerId,
        stepRole,
      })
    );

    expect(
      hasCompleteBoundProposalApproval(
        { ...current, contentMd: "# Changed after review" },
        approved,
        expected
      )
    ).toBe(false);
    expect(
      hasCompleteBoundProposalApproval(current, [
        approved[0],
        {
          ...approved[1],
          submittedSnapshotRevision:
            (approved[1]?.submittedSnapshotRevision ?? 0) + 1,
        },
      ], expected)
    ).toBe(false);
    expect(
      hasCompleteBoundProposalApproval(
        current,
        [{ ...approved[0], stepIndex: 999 }, approved[1]],
        expected
      )
    ).toBe(false);
    expect(
      hasCompleteBoundProposalApproval(
        current,
        [{ ...approved[0], reviewerId: "other" }, approved[1]],
        expected
      )
    ).toBe(false);
  });

  test("uses the immutable contract render snapshot as the contract approval binding", () => {
    const current = {
      ...proposal(),
      type: "CONTRACT",
      structuredSnapshot: null,
      structuredSnapshotHash: null,
      structuredSnapshotRevision: 0,
      contractRenderSnapshot: {
        schemaVersion: 1,
        snapshotRevision: 2,
      },
      contractRenderSnapshotHash: `sha256:${"c".repeat(64)}`,
      contractRenderSnapshotRevision: 2,
    };
    const binding = proposalReviewBinding(current);
    const review = {
      ...binding,
      status: "APPROVED",
      stepIndex: 1,
      reviewerId: "legal-reviewer",
      stepRole: "LEGAL",
    };
    const expected = [
      {
        stepIndex: 1,
        reviewerId: "legal-reviewer",
        stepRole: "LEGAL",
      },
    ];

    expect(
      hasCompleteBoundProposalApproval(current, [review], expected)
    ).toBe(true);
    expect(
      hasCompleteBoundProposalApproval(
        {
          ...current,
          contractRenderSnapshotHash: `sha256:${"d".repeat(64)}`,
        },
        [review],
        expected
      )
    ).toBe(false);
  });
});
