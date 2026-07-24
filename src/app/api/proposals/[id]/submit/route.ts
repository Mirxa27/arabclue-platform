import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import { assertWorkspaceMatch } from "@/lib/workspace-context";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { getSubmittedForReviewStatus } from "@/lib/contract-review";
import { isProposalSubmitBlocked } from "@/lib/proposal-status";
import { assessQualificationDossier } from "@/lib/qualification";
import {
  claimedStructuredKnowledgeIds,
  validatePersistedProposalSnapshot,
  validateStructuredProposalOutput,
  validateStructuredSnapshotEvidence,
} from "@/lib/proposal-snapshot-persistence";
import { loadApprovedStructuredEvidenceBindings } from "@/lib/proposal-snapshot-evidence";
import { loadProjectIngestionEntities } from "@/lib/proposal-studio";
import { proposalReviewBinding } from "@/lib/proposal-review-integrity";

export const dynamic = "force-dynamic";

/**
 * POST /api/proposals/[id]/submit
 * Creates ProposalReview rows from ApprovalPolicy and sets status REVIEW.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTenant("writer", async ({ workspace, userId }) => {
    const { id } = await params;
    const proposal = await db.generatedProposal.findUnique({ where: { id } });
    if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
      throw new ApiError("not found", 404);
    }
    if (isProposalSubmitBlocked(proposal.status)) {
      throw new ApiError(`Proposal already ${proposal.status}`, 409);
    }

    let submittedSnapshotHash: string | null = null;
    if (proposal.type !== "CONTRACT") {
      if (proposal.structuredSnapshot === null) {
        throw new ApiError(
          "A validated immutable structured snapshot is required before submitting a proposal for approval.",
          409,
          "STRUCTURED_SNAPSHOT_REQUIRED"
        );
      }
      const snapshotValidation = validatePersistedProposalSnapshot(
        proposal.structuredSnapshot,
        {
          proposalId: proposal.id,
          hash: proposal.structuredSnapshotHash,
          revision: proposal.structuredSnapshotRevision,
          presetKey: proposal.structuredSnapshotPreset,
        }
      );
      if (!snapshotValidation.ok) {
        throw new ApiError(
          "The persisted structured proposal snapshot is invalid.",
          409,
          snapshotValidation.code
        );
      }
      const approvedEvidence =
        await loadApprovedStructuredEvidenceBindings(
          workspace.id,
          claimedStructuredKnowledgeIds(snapshotValidation.value.snapshot)
        );
      const evidenceDiagnostics = validateStructuredSnapshotEvidence(
        snapshotValidation.value.snapshot,
        approvedEvidence
      );
      if (evidenceDiagnostics.length > 0) {
        throw new ApiError(
          "Structured proposal evidence is no longer approved.",
          409,
          "STRUCTURED_EVIDENCE_NOT_APPROVED"
        );
      }
      const [entities, complianceRows, restrictions] = await Promise.all([
        loadProjectIngestionEntities(proposal.projectId),
        db.complianceCheck.findMany({
          where: { projectId: proposal.projectId },
        }),
        db.restriction.findMany({
          where: { workspaceId: workspace.id, active: true },
          select: { text: true },
        }),
      ]);
      const outputValidation = validateStructuredProposalOutput(
        snapshotValidation.value.snapshot,
        {
          entities,
          complianceRows: complianceRows.map((row) => ({
            frameworkId: row.framework,
            controlId: row.controlId,
            title: row.title,
            status: (row.status === "GAP" ? "PARTIAL" : row.status) as
              | "COMPLIANT"
              | "PARTIAL"
              | "NON_COMPLIANT"
              | "PENDING",
            evidence: row.evidence ?? "",
            remediation: row.remediation,
          })),
          restrictions: restrictions.map((restriction) => restriction.text),
          approvedEvidenceIds: approvedEvidence.map((binding) => binding.id),
        }
      );
      if (outputValidation.blocking) {
        const codes = outputValidation.issues
          .filter((issue) => issue.severity === "error")
          .map((issue) => issue.code);
        throw new ApiError(
          `Structured proposal validation blocked submission: ${[
            ...new Set(codes),
          ].join(", ")}`,
          422,
          "STRUCTURED_VALIDATION_BLOCKED"
        );
      }
      submittedSnapshotHash = snapshotValidation.value.hash;
    }

    const policy = await db.approvalPolicy.findUnique({
      where: { workspaceId: workspace.id },
      include: { steps: { orderBy: { stepIndex: "asc" } } },
    });
    if (!policy || policy.steps.length === 0) {
      throw new ApiError("Configure an approval chain in Account Onboarding first", 400);
    }

    // Pre-submit checklist
    const [missingReqs, nonCompliant, ws, certificates] = await Promise.all([
      db.tenderRequirement.count({
        where: { projectId: proposal.projectId, status: "MISSING" },
      }),
      db.complianceCheck.count({
        where: { projectId: proposal.projectId, status: "NON_COMPLIANT" },
      }),
      db.workspace.findUnique({
        where: { id: workspace.id },
        select: { crNumber: true, vatNumber: true },
      }),
      db.certificate.findMany({
        where: { workspaceId: workspace.id },
        select: {
          certType: true,
          expiresAt: true,
          revokedAt: true,
          approved: true,
        },
      }),
    ]);

    const qualification = assessQualificationDossier({
      workspace: {
        crNumber: ws?.crNumber,
        vatNumber: ws?.vatNumber,
      },
      certificates,
    });

    const checklist = {
      missingRequirements: missingReqs,
      nonCompliantControls: nonCompliant,
      hasFinancialStructure: !!proposal.financialFormsJson,
      pricesEntered: (() => {
        if (!proposal.financialFormsJson) return false;
        try {
          const f = JSON.parse(proposal.financialFormsJson);
          return (f.boqItems ?? []).some(
            (b: { unitPrice: number | null }) => b.unitPrice != null
          );
        } catch {
          return false;
        }
      })(),
      /** Advisory Saudi qualification dossier — does not block submit. */
      qualification: {
        strongBidReady: qualification.strongBidReady,
        gaps: qualification.gaps,
        presentKeys: qualification.presentKeys,
      },
    };

    const binding = proposalReviewBinding(proposal);
    if (
      proposal.type !== "CONTRACT" &&
      binding.submittedSnapshotHash !== submittedSnapshotHash
    ) {
      throw new ApiError(
        "Structured proposal changed during submission preflight",
        409,
        "STRUCTURED_SNAPSHOT_CHANGED"
      );
    }
    const submittedAt = new Date();
    const updated = await db.$transaction(async (tx) => {
      const write = await tx.generatedProposal.updateMany({
        where: {
          id,
          workspaceId: workspace.id,
          status: proposal.status,
          version: proposal.version,
          updatedAt: proposal.updatedAt,
          structuredSnapshotHash: proposal.structuredSnapshotHash,
          structuredSnapshotRevision: proposal.structuredSnapshotRevision,
        },
        data: {
          status: getSubmittedForReviewStatus(),
          submittedAt,
          approvedAt: null,
        },
      });
      if (write.count !== 1) return null;
      await tx.proposalReview.deleteMany({ where: { proposalId: id } });
      await tx.proposalReview.createMany({
        data: policy.steps.map((step) => ({
          proposalId: id,
          stepIndex: step.stepIndex,
          reviewerId: step.reviewerId,
          stepRole: step.stepRole,
          status: "PENDING",
          ...binding,
        })),
      });
      return tx.generatedProposal.findUniqueOrThrow({ where: { id } });
    });
    if (!updated) {
      throw new ApiError(
        "Proposal changed during submission; rerun validation and submit again",
        409,
        "PROPOSAL_SUBMIT_CONFLICT"
      );
    }

    await audit({
      userId,
      action: AUDIT_ACTIONS.PROPOSAL_EDIT,
      resource: "GeneratedProposal",
      resourceId: id,
      details: {
        submitted: true,
        checklist,
        structuredSnapshotHash: submittedSnapshotHash,
      },
    });

    const reviews = await db.proposalReview.findMany({
      where: { proposalId: id },
      orderBy: { stepIndex: "asc" },
      include: { reviewer: { select: { id: true, name: true, email: true } } },
    });

    return jsonOk({ proposal: updated, reviews, checklist });
  }, "proposal-submit");
}
