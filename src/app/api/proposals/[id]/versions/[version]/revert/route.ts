import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireWriter } from "@/lib/auth";
import { jsonApiFailure } from "@/lib/api-controller";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { isProposalEditLocked } from "@/lib/proposal-status";
import { STRUCTURED_SNAPSHOT_INVALIDATION } from "@/lib/proposal-snapshot-persistence";
import { CONTRACT_RENDER_SNAPSHOT_INVALIDATION } from "@/lib/contract-render-snapshot";
import {
  analyticsRequestOrigin,
  recordProposalAnalyticsEvent,
} from "@/lib/analytics-collector";

export const dynamic = "force-dynamic";

// POST /api/proposals/[id]/versions/[version]/revert
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  const session = await requireWriter();
  if (!session) {
    return jsonApiFailure("FORBIDDEN");
  }
  const { workspace } = await getTenantContext(session.user.id);
  const userId = session.user.id;
  const { id, version: versionStr } = await params;
  const versionNum = Number(versionStr);
  if (!versionNum) {
    return jsonApiFailure("INVALID_VERSION");
  }

  const proposal = await db.generatedProposal.findUnique({ where: { id } });
  if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
    return jsonApiFailure("PROPOSAL_NOT_FOUND");
  }
  if (isProposalEditLocked(proposal.status)) {
    return jsonApiFailure("STATUS_LOCKED");
  }

  const target = await db.proposalVersion.findUnique({
    where: { proposalId_version: { proposalId: id, version: versionNum } },
  });
  if (!target) {
    return jsonApiFailure("VERSION_NOT_FOUND");
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
    return jsonApiFailure("PROPOSAL_VERSION_CONFLICT");
  }

  await audit({
    userId,
    action: AUDIT_ACTIONS.PROPOSAL_EDIT,
    resource: "GeneratedProposal",
    resourceId: id,
    details: { revertedFrom: versionNum, newVersion: nextVersion },
  });

  await recordProposalAnalyticsEvent({
    eventType: "proposal_edited",
    proposalId: id,
    mutationRef: `revert:v${nextVersion}:from:${versionNum}`,
    origin: analyticsRequestOrigin({
      tenantWorkspaceId: workspace.id,
      actorUserId: userId,
    }),
    metadata: {
      revision: nextVersion,
      projectId: updated.projectId,
    },
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
