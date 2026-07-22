import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import { assertWorkspaceMatch } from "@/lib/workspace-context";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

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
    if (["REVIEW", "APPROVED"].includes(proposal.status)) {
      throw new ApiError(`Proposal already ${proposal.status}`, 409);
    }

    const policy = await db.approvalPolicy.findUnique({
      where: { workspaceId: workspace.id },
      include: { steps: { orderBy: { stepIndex: "asc" } } },
    });
    if (!policy || policy.steps.length === 0) {
      throw new ApiError("Configure an approval chain in Account Onboarding first", 400);
    }

    // Pre-submit checklist
    const [missingReqs, nonCompliant] = await Promise.all([
      db.tenderRequirement.count({
        where: { projectId: proposal.projectId, status: "MISSING" },
      }),
      db.complianceCheck.count({
        where: { projectId: proposal.projectId, status: "NON_COMPLIANT" },
      }),
    ]);

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
    };

    await db.proposalReview.deleteMany({ where: { proposalId: id } });
    await db.proposalReview.createMany({
      data: policy.steps.map((s) => ({
        proposalId: id,
        stepIndex: s.stepIndex,
        reviewerId: s.reviewerId,
        stepRole: s.stepRole,
        status: "PENDING",
      })),
    });

    const updated = await db.generatedProposal.update({
      where: { id },
      data: { status: "REVIEW", submittedAt: new Date() },
    });

    await audit({
      userId,
      action: AUDIT_ACTIONS.PROPOSAL_EDIT,
      resource: "GeneratedProposal",
      resourceId: id,
      details: { submitted: true, checklist },
    });

    const reviews = await db.proposalReview.findMany({
      where: { proposalId: id },
      orderBy: { stepIndex: "asc" },
      include: { reviewer: { select: { id: true, name: true, email: true } } },
    });

    return jsonOk({ proposal: updated, reviews, checklist });
  }, "proposal-submit");
}
