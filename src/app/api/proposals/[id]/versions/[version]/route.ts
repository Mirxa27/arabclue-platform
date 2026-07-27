import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

/**
 * GET /api/proposals/[id]/versions/[version]
 * Retrieve a single proposal version by version number.
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
    const { id, version: versionStr } = await params;
    const versionNum = Number(versionStr);

    if (!Number.isInteger(versionNum) || versionNum < 1) {
      return NextResponse.json(
        { error: "Invalid version number", code: "INVALID_VERSION" },
        { status: 400 }
      );
    }

    // Validate proposal exists and belongs to workspace
    const proposal = await db.generatedProposal.findUnique({
      where: { id },
      select: { id: true, workspaceId: true },
    });
    if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    // Fetch the specific version
    const version = await db.proposalVersion.findUnique({
      where: { proposalId_version: { proposalId: id, version: versionNum } },
      select: {
        id: true,
        version: true,
        contentMd: true,
        changeLog: true,
        locale: true,
        createdBy: true,
        createdAt: true,
      },
    });

    if (!version) {
      return NextResponse.json(
        { error: "Version not found", code: "VERSION_NOT_FOUND" },
        { status: 404 }
      );
    }

    // Fetch author info
    let author: { name: string; email: string } | null = null;
    if (version.createdBy) {
      const user = await db.user.findUnique({
        where: { id: version.createdBy },
        select: { name: true, email: true },
      });
      if (user) {
        author = { name: user.name, email: user.email };
      }
    }

    return NextResponse.json({
      version: {
        id: version.id,
        version: version.version,
        contentMd: version.contentMd,
        changeLog: version.changeLog,
        locale: version.locale,
        createdAt: version.createdAt.toISOString(),
        author,
      },
    });
  } catch (err) {
    console.error("[proposals version GET single]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
