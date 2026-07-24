import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import { financialFormsSchema, parseJsonBody } from "@/lib/validation";
import { assertWorkspaceMatch } from "@/lib/workspace-context";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { STRUCTURED_SNAPSHOT_INVALIDATION } from "@/lib/proposal-snapshot-persistence";
import { CONTRACT_RENDER_SNAPSHOT_INVALIDATION } from "@/lib/contract-render-snapshot";
import { isProposalEditLocked } from "@/lib/proposal-status";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTenant("session", async ({ workspace }) => {
    const { id } = await params;
    const proposal = await db.generatedProposal.findUnique({ where: { id } });
    if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
      throw new ApiError("not found", 404);
    }
    let forms = null;
    if (proposal.financialFormsJson) {
      try {
        forms = JSON.parse(proposal.financialFormsJson);
      } catch {
        forms = null;
      }
    }
    return jsonOk({
      forms,
      notice:
        "Prices are client-entered only. ArabClue never suggests or calculates bid prices.",
    });
  }, "proposal-financial");
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTenant("writer", async ({ workspace, userId }) => {
    const { id } = await params;
    const proposal = await db.generatedProposal.findUnique({ where: { id } });
    if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
      throw new ApiError("not found", 404);
    }
    if (isProposalEditLocked(proposal.status)) {
      throw new ApiError(
        "Proposal is locked for editing in current status",
        409,
        "status_locked"
      );
    }
    const parsed = await parseJsonBody(req, financialFormsSchema);
    if (!parsed.ok) return parsed.response;

    // Always recompute total = unitPrice * qty server-side — never trust client total
    // Also enforce max bounds to avoid overflow / DOS
    const MAX_AMOUNT = 1e12; // 1 trillion SAR cap per line
    const boqItems = parsed.data.boqItems.map((row) => {
      if (row.unitPrice != null && (row.unitPrice < 0 || row.unitPrice > MAX_AMOUNT)) {
        throw new ApiError(`unitPrice out of bounds [0, ${MAX_AMOUNT}]`, 400);
      }
      if (row.qty < 0 || row.qty > 1_000_000) {
        throw new ApiError("qty out of bounds", 400);
      }
      const total = row.unitPrice != null ? Math.round(row.unitPrice * row.qty * 100) / 100 : null;
      if (total != null && total > MAX_AMOUNT * 10) throw new ApiError("total out of bounds", 400);
      return { ...row, total };
    });

    const payload = {
      boqItems,
      currency: parsed.data.currency ?? "SAR",
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
      source: "human",
    };

    const updated = await db.$transaction(async (tx) => {
      const write = await tx.generatedProposal.updateMany({
        where: {
          id,
          workspaceId: workspace.id,
          status: proposal.status,
          version: proposal.version,
          updatedAt: proposal.updatedAt,
        },
        data: {
          financialFormsJson: JSON.stringify(payload),
          status: "DRAFT",
          submittedAt: null,
          approvedAt: null,
          artifactsJson: null,
          ...STRUCTURED_SNAPSHOT_INVALIDATION,
          ...CONTRACT_RENDER_SNAPSHOT_INVALIDATION,
        },
      });
      if (write.count !== 1) return null;
      await tx.proposalReview.deleteMany({ where: { proposalId: id } });
      return tx.generatedProposal.findUniqueOrThrow({ where: { id } });
    });
    if (!updated) {
      throw new ApiError(
        "Proposal changed concurrently; reload before editing",
        409,
        "proposal_concurrent_update"
      );
    }

    await audit({
      userId,
      action: AUDIT_ACTIONS.PROPOSAL_EDIT,
      resource: "GeneratedProposal",
      resourceId: id,
      details: { financialForms: true, lines: boqItems.length },
    });

    return jsonOk({ forms: payload, proposalId: updated.id });
  }, "proposal-financial");
}
