import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

/**
 * GET /api/proposals/[id]/versions/[version]
 * Immutable proposal revision detail (full markdown + author metadata).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspace } = await getTenantContext(session.user.id);
    const { id, version: versionRaw } = await params;
    const versionNum = Number.parseInt(versionRaw, 10);
    if (!Number.isFinite(versionNum) || versionNum < 1) {
      return NextResponse.json({ error: "Invalid version" }, { status: 400 });
    }

    const proposal = await db.generatedProposal.findUnique({
      where: { id },
      select: {
        id: true,
        workspaceId: true,
        title: true,
        titleAr: true,
        version: true,
        status: true,
      },
    });
    if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const row = await db.proposalVersion.findUnique({
      where: {
        proposalId_version: {
          proposalId: id,
          version: versionNum,
        },
      },
    });
    if (!row) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const author = row.createdBy
      ? await db.user.findUnique({
          where: { id: row.createdBy },
          select: { id: true, name: true, email: true },
        })
      : null;

    return NextResponse.json({
      proposal: {
        id: proposal.id,
        title: proposal.title,
        titleAr: proposal.titleAr,
        currentVersion: proposal.version,
        status: proposal.status,
      },
      version: {
        id: row.id,
        version: row.version,
        contentMd: row.contentMd,
        changeLog: row.changeLog,
        locale: row.locale,
        createdAt: row.createdAt.toISOString(),
        author,
      },
    });
  } catch (err) {
    console.error("[proposals version detail GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
