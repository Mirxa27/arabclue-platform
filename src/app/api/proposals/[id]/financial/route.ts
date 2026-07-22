import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import { financialFormsSchema, parseJsonBody } from "@/lib/validation";
import { assertWorkspaceMatch } from "@/lib/workspace-context";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

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
    const parsed = await parseJsonBody(req, financialFormsSchema);
    if (!parsed.ok) return parsed.response;

    // Normalize totals from unitPrice * qty when both present
    const boqItems = parsed.data.boqItems.map((row) => {
      const total =
        row.total != null
          ? row.total
          : row.unitPrice != null
            ? Math.round(row.unitPrice * row.qty * 100) / 100
            : null;
      return { ...row, total };
    });

    const payload = {
      boqItems,
      currency: parsed.data.currency ?? "SAR",
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
      source: "human",
    };

    const updated = await db.generatedProposal.update({
      where: { id },
      data: { financialFormsJson: JSON.stringify(payload) },
    });

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
