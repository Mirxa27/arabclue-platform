import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { validateProposalOutput } from "@/lib/validation-gate";
import {
  evaluateExportPolicy,
  financialForValidationGate,
} from "@/lib/proposal-studio";
import { getContractExportReadiness } from "@/lib/contract-review";

export const dynamic = "force-dynamic";

/** GET /api/proposals/[id]/validate — live validation + export readiness */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspace } = await getTenantContext(session.user.id);
  const { id } = await params;

  const proposal = await db.generatedProposal.findUnique({ where: { id } });
  if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [restrictions, checks, policy] = await Promise.all([
    db.restriction.findMany({
      where: { workspaceId: workspace.id, active: true },
      select: { text: true },
    }),
    db.complianceCheck.findMany({ where: { projectId: proposal.projectId } }),
    db.approvalPolicy.findUnique({
      where: { workspaceId: workspace.id },
      include: { steps: true },
    }),
  ]);

  const forms = proposal.financialFormsJson
    ? (() => {
        try {
          return JSON.parse(proposal.financialFormsJson);
        } catch {
          return null;
        }
      })()
    : null;

  const hasApprovalPolicy = Boolean(policy && policy.steps.length > 0);
  if (proposal.type === "CONTRACT") {
    const contractReadiness = getContractExportReadiness({
      contentMd: proposal.contentMd,
      proposalStatus: proposal.status,
      format: "pdf",
      hasApprovalPolicy,
    });
    return NextResponse.json({
      validation: contractReadiness.validation,
      hasApprovalPolicy,
      exportReady: contractReadiness.exportReady,
      exportBlocker: contractReadiness.exportBlocker,
      status: proposal.status,
      version: proposal.version,
    });
  }

  const validation = validateProposalOutput({
    contentMd: proposal.contentMd,
    financial: financialForValidationGate(forms),
    entities: null,
    complianceRows: checks.map((c) => ({
      frameworkId: c.framework,
      controlId: c.controlId,
      title: c.title,
      status: (c.status === "GAP" ? "PARTIAL" : c.status) as
        | "COMPLIANT"
        | "PARTIAL"
        | "NON_COMPLIANT"
        | "PENDING",
      evidence: c.evidence ?? "",
      remediation: c.remediation,
    })),
    restrictions: restrictions.map((r) => r.text),
  });
  const zipPolicy = evaluateExportPolicy({
    proposalStatus: proposal.status,
    validation,
    format: "zip",
    hasApprovalPolicy,
  });

  return NextResponse.json({
    validation,
    hasApprovalPolicy,
    exportReady: zipPolicy.allowed,
    exportBlocker: zipPolicy.allowed
      ? null
      : { code: zipPolicy.code, error: zipPolicy.error },
    status: proposal.status,
    version: proposal.version,
  });
}
