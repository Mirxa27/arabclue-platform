import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, requireWriter } from "@/lib/auth";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { parseJsonBody, proposalPatchSchema } from "@/lib/validation";
import { isProposalEditLocked } from "@/lib/proposal-status";

export const dynamic = "force-dynamic";

// GET /api/proposals/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        versions: { orderBy: { version: "desc" }, take: 20 },
      },
    });
    if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
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
    console.error("[proposals GET id]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}

// PATCH /api/proposals/[id] — edit markdown content (bumps version, snapshots history)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireWriter();
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const parsed = await parseJsonBody(req, proposalPatchSchema);
    if (!parsed.ok) return parsed.response;

    const { workspace } = await getTenantContext(session.user.id);
    const { id } = await params;
    const { contentMd, locale, title, titleAr } = parsed.data;
    const changeLog = parsed.data.changeLog ?? "Manual edit";

    const existing = await db.generatedProposal.findUnique({ where: { id } });
    if (!existing || !assertWorkspaceMatch(existing.workspaceId, workspace.id)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (isProposalEditLocked(existing.status)) {
      return NextResponse.json(
        {
          error: "Proposal is locked for editing in current status",
          code: "status_locked",
        },
        { status: 409 }
      );
    }

    const nextVersion =
      contentMd != null && contentMd !== existing.contentMd
        ? existing.version + 1
        : existing.version;

    const updated = await db.$transaction(async (tx) => {
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
      return tx.generatedProposal.update({
        where: { id },
        data: {
          ...(contentMd != null
            ? { contentMd, version: nextVersion, status: "REVIEWED" }
            : {}),
          ...(locale ? { locale } : {}),
          ...(title ? { title } : {}),
          ...(titleAr !== undefined ? { titleAr } : {}),
        },
      });
    });

    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.PROPOSAL_EDIT,
      resource: "GeneratedProposal",
      resourceId: id,
      details: { version: updated.version, changeLog },
    });

    return NextResponse.json({
      proposal: {
        ...updated,
        artifacts: updated.artifactsJson
          ? JSON.parse(updated.artifactsJson)
          : [],
      },
    });
  } catch (err) {
    console.error("[proposals PATCH]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
