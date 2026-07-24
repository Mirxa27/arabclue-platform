import { NextRequest, NextResponse } from "next/server";
import { jsonOk, jsonError } from "@/lib/api-controller";
import { reviewDecisionSchema, parseJsonBody } from "@/lib/validation";
import { getTenantContext } from "@/lib/workspace-context";
import { requireReviewerAction } from "@/lib/auth";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import {
  decideProposalReview,
  ProposalReviewDecisionError,
} from "@/lib/proposal-review-service";

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

    const result = await decideProposalReview({
      reviewId: id,
      reviewerId: session.user.id,
      workspaceId: workspace.id,
      decision: parsed.data.status,
      comment: parsed.data.comment,
    });

    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.PROPOSAL_EDIT,
      resource: "ProposalReview",
      resourceId: id,
      details: { decision: parsed.data.status },
    });

    return jsonOk({
      review: result.review,
      proposalStatus: result.proposalStatus,
    });
  } catch (err) {
    if (err instanceof ProposalReviewDecisionError) {
      return jsonError(err.message, err.status, err.code);
    }
    console.error("[reviews]", err);
    return jsonError(err instanceof Error ? err.message : "unknown", 500);
  }
}
