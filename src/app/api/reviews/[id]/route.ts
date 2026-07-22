import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonOk, jsonError, ApiError } from "@/lib/api-controller";
import { reviewDecisionSchema, parseJsonBody } from "@/lib/validation";
import { assertWorkspaceMatch, getTenantContext } from "@/lib/workspace-context";
import { requireReviewerAction } from "@/lib/auth";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/reviews/[id] — approve or reject (reviewer action allowed for REVIEWER role).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireReviewerAction();
    if (!session) {
      return jsonError("Unauthorized", 401);
    }
    const { workspace } = await getTenantContext(session.user.id);
    const { id } = await params;
    const parsed = await parseJsonBody(req, reviewDecisionSchema);
    if (!parsed.ok) return parsed.response;

    const review = await db.proposalReview.findUnique({
      where: { id },
      include: { proposal: true },
    });
    if (
      !review ||
      !assertWorkspaceMatch(review.proposal.workspaceId, workspace.id)
    ) {
      throw new ApiError("not found", 404);
    }
    if (review.reviewerId !== session.user.id) {
      throw new ApiError("Only the assigned reviewer may decide this step", 403);
    }
    if (review.status !== "PENDING") {
      throw new ApiError("Review already decided", 409);
    }

    // Enforce sequential approval: prior steps must be APPROVED
    const prior = await db.proposalReview.findMany({
      where: {
        proposalId: review.proposalId,
        stepIndex: { lt: review.stepIndex },
      },
    });
    if (prior.some((p) => p.status !== "APPROVED")) {
      throw new ApiError("Previous approval steps are not complete", 409);
    }

    const updated = await db.proposalReview.update({
      where: { id },
      data: {
        status: parsed.data.status,
        comment: parsed.data.comment ?? null,
        decidedAt: new Date(),
      },
    });

    if (parsed.data.status === "REJECTED") {
      await db.generatedProposal.update({
        where: { id: review.proposalId },
        data: { status: "REJECTED" },
      });
    } else {
      const remaining = await db.proposalReview.count({
        where: {
          proposalId: review.proposalId,
          status: "PENDING",
        },
      });
      if (remaining === 0) {
        await db.generatedProposal.update({
          where: { id: review.proposalId },
          data: { status: "APPROVED", approvedAt: new Date() },
        });
      } else {
        await db.generatedProposal.update({
          where: { id: review.proposalId },
          data: { status: "REVIEWED" },
        });
      }
    }

    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.PROPOSAL_EDIT,
      resource: "ProposalReview",
      resourceId: id,
      details: { decision: parsed.data.status },
    });

    return jsonOk({ review: updated });
  } catch (err) {
    if (err instanceof ApiError) {
      return jsonError(err.message, err.status, err.code);
    }
    console.error("[reviews]", err);
    return jsonError(err instanceof Error ? err.message : "unknown", 500);
  }
}
