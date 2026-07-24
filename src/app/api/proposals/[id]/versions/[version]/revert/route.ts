import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireWriter } from "@/lib/auth";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { isProposalEditLocked } from "@/lib/proposal-status";
import { STRUCTURED_SNAPSHOT_INVALIDATION } from "@/lib/proposal-snapshot-persistence";
import { CONTRACT_RENDER_SNAPSHOT_INVALIDATION } from "@/lib/contract-render-snapshot";

export const dynamic = "force-dynamic";

// POST /api/proposals/[id]/versions/[version]/revert
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  const session = await requireWriter();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { workspace } = await getTenantContext(session.user.id);
  const userId = session.user.id;
  const { id, version: versionStr } = await params;
  const versionNum = Number(versionStr);
  if (!versionNum) {
    return NextResponse.json({ error: "invalid version" }, { status: 400 });
  }

  const proposal = await db.generatedProposal.findUnique({ where: { id } });
  if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (isProposalEditLocked(proposal.status)) {
    return NextResponse.json(
      {
        error: "Cannot revert while proposal is locked for editing",
        code: "status_locked",
      },
      { status: 409 }
    );
  }

  const target = await db.proposalVersion.findUnique({
    where: { proposalId_version: { proposalId: id, version: versionNum } },
  });
  if (!target) {
    return NextResponse.json({ error: "version not found" }, { status: 404 });
  }

  const nextVersion = proposal.version + 1;
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
        contentMd: target.contentMd,
        version: nextVersion,
        locale: target.locale,
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
    await tx.proposalVersion.create({
      data: {
        proposalId: id,
        version: nextVersion,
        contentMd: target.contentMd,
        changeLog: `Reverted to v${versionNum}`,
        locale: target.locale,
        createdBy: userId,
      },
    });
    return tx.generatedProposal.findUniqueOrThrow({ where: { id } });
  });
  if (!updated) {
    return NextResponse.json(
      {
        error: "Proposal changed concurrently; reload before reverting",
        code: "proposal_concurrent_update",
      },
      { status: 409 }
    );
  }

  await audit({
    userId,
    action: AUDIT_ACTIONS.PROPOSAL_EDIT,
    resource: "GeneratedProposal",
    resourceId: id,
    details: { revertedFrom: versionNum, newVersion: nextVersion },
  });

  return NextResponse.json({
    proposal: {
      ...updated,
      artifacts: updated.artifactsJson
        ? JSON.parse(updated.artifactsJson)
        : [],
    },
    revertedFrom: versionNum,
  });
}
