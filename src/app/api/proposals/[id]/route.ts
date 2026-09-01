import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonApiFailure, toErrorResponse } from "@/lib/api-controller";
import { apiFailure } from "@/lib/api-failure";
import { requireSession, requireWriter } from "@/lib/auth";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import {
  getTenantContext,
  assertWorkspaceMatch,
} from "@/lib/workspace-context";
import { parseJsonBody, proposalPatchSchema } from "@/lib/validation";
import { isProposalEditLocked } from "@/lib/proposal-status";
import { STRUCTURED_SNAPSHOT_INVALIDATION } from "@/lib/proposal-snapshot-persistence";
import { CONTRACT_RENDER_SNAPSHOT_INVALIDATION } from "@/lib/contract-render-snapshot";
import { matchesProposalEditPrecondition } from "@/lib/proposal-edit-precondition";
import {
  analyticsRequestOrigin,
  recordProposalAnalyticsEvent,
} from "@/lib/analytics-collector";

export const dynamic = "force-dynamic";

// GET /api/proposals/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    if (!session) {
      return jsonApiFailure("UNAUTHORIZED");
    }
    const { workspace } = await getTenantContext(session.user.id);
    const { id } = await params;
    const proposal = await db.generatedProposal.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            title: true,
            titleAr: true,
            etimadRef: true,
            category: true,
          },
        },
        // Collapsed UI preview only — full history loads via /versions cursor.
        versions: { orderBy: { version: "desc" }, take: 3 },
      },
    });
    if (
      !proposal ||
      !assertWorkspaceMatch(proposal.workspaceId, workspace.id)
    ) {
      return jsonApiFailure("PROPOSAL_NOT_FOUND");
    }
    return NextResponse.json({
      proposal: {
        ...proposal,
        artifacts: proposal.artifactsJson
          ? JSON.parse(proposal.artifactsJson)
          : [],
      },
    });
  } catch (err) {
    return toErrorResponse(err, "[proposals GET id]");
  }
}

// PATCH /api/proposals/[id] — edit markdown content (bumps version, snapshots history)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireWriter();
    if (!session) {
      return jsonApiFailure("FORBIDDEN");
    }
    const parsed = await parseJsonBody(req, proposalPatchSchema);
    if (!parsed.ok) return parsed.response;

    const { workspace } = await getTenantContext(session.user.id);
    const { id } = await params;
    const {
      contentMd,
      locale,
      title,
      titleAr,
      expectedVersion,
      expectedUpdatedAt,
    } = parsed.data;
    const changeLog = parsed.data.changeLog ?? "Manual edit";

    const existing = await db.generatedProposal.findUnique({ where: { id } });
    if (
      !existing ||
      !assertWorkspaceMatch(existing.workspaceId, workspace.id)
    ) {
      return jsonApiFailure("PROPOSAL_NOT_FOUND");
    }
    if (isProposalEditLocked(existing.status)) {
      return jsonApiFailure("STATUS_LOCKED");
    }
    if (
      !matchesProposalEditPrecondition(existing, {
        version: expectedVersion,
        updatedAt: expectedUpdatedAt,
      })
    ) {
      // The extra fields are the reload target, so the editor can jump straight
      // to the current revision instead of re-fetching to find out what it is.
      return NextResponse.json(
        {
          ...apiFailure("PROPOSAL_VERSION_CONFLICT"),
          currentVersion: existing.version,
          currentUpdatedAt: existing.updatedAt.toISOString(),
        },
        { status: 409 },
      );
    }

    const nextVersion =
      contentMd != null && contentMd !== existing.contentMd
        ? existing.version + 1
        : existing.version;
    const invalidatesStructuredSnapshot =
      (contentMd !== undefined && contentMd !== existing.contentMd) ||
      (locale !== undefined && locale !== existing.locale) ||
      (title !== undefined && title !== existing.title) ||
      (titleAr !== undefined && titleAr !== existing.titleAr);

    const updated = await db.$transaction(async (tx) => {
      const write = await tx.generatedProposal.updateMany({
        where: {
          id,
          workspaceId: workspace.id,
          status: existing.status,
          version: existing.version,
          updatedAt: existing.updatedAt,
        },
        data: {
          ...(contentMd != null ? { contentMd, version: nextVersion } : {}),
          ...(locale ? { locale } : {}),
          ...(title ? { title } : {}),
          ...(titleAr !== undefined ? { titleAr } : {}),
          ...(invalidatesStructuredSnapshot
            ? {
                status: "DRAFT",
                submittedAt: null,
                approvedAt: null,
                artifactsJson: null,
                ...STRUCTURED_SNAPSHOT_INVALIDATION,
                ...CONTRACT_RENDER_SNAPSHOT_INVALIDATION,
              }
            : {}),
        },
      });
      if (write.count !== 1) return null;
      if (invalidatesStructuredSnapshot) {
        await tx.proposalReview.deleteMany({ where: { proposalId: id } });
      }
      if (contentMd != null && contentMd !== existing.contentMd) {
        await tx.proposalVersion.create({
          data: {
            proposalId: id,
            version: nextVersion,
            contentMd,
            changeLog,
            locale: locale ?? existing.locale ?? "ar",
            createdBy: session.user.id,
          },
        });
      }
      return tx.generatedProposal.findUniqueOrThrow({
        where: { id },
      });
    });
    if (!updated) {
      return jsonApiFailure("PROPOSAL_VERSION_CONFLICT");
    }

    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.PROPOSAL_EDIT,
      resource: "GeneratedProposal",
      resourceId: id,
      details: { version: updated.version, changeLog },
    });

    if (contentMd != null && contentMd !== existing.contentMd) {
      await recordProposalAnalyticsEvent({
        eventType: "proposal_edited",
        proposalId: id,
        mutationRef: `patch:v${updated.version}`,
        origin: analyticsRequestOrigin({
          tenantWorkspaceId: workspace.id,
          actorUserId: session.user.id,
        }),
        metadata: {
          revision: updated.version,
          projectId: updated.projectId,
        },
      });
    }

    return NextResponse.json({
      proposal: {
        ...updated,
        artifacts: updated.artifactsJson
          ? JSON.parse(updated.artifactsJson)
          : [],
      },
    });
  } catch (err) {
    return toErrorResponse(err, "[proposals PATCH]");
  }
}
