import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

/**
 * GET /api/proposals/[id]/versions
 * List proposal versions in descending revision order with keyset pagination.
 * Query params:
 *   - limit (optional, default 20, max 50)
 *   - cursor (optional, version number for keyset pagination - exclusive)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = await getTenantContext(session.user.id);
    const { id } = await params;

    // Validate proposal exists and belongs to workspace
    const proposal = await db.generatedProposal.findUnique({
      where: { id },
      select: { id: true, workspaceId: true, version: true },
    });
    if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    // Parse pagination params
    const searchParams = req.nextUrl.searchParams;
    const limitParam = searchParams.get("limit");
    const cursorParam = searchParams.get("cursor");

    const limit = Math.min(
      Math.max(1, limitParam ? parseInt(limitParam, 10) || DEFAULT_PAGE_SIZE : DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE
    );
    const cursor = cursorParam ? parseInt(cursorParam, 10) : null;

    // Build query with keyset pagination (descending by version)
    const versions = await db.proposalVersion.findMany({
      where: {
        proposalId: id,
        ...(cursor !== null ? { version: { lt: cursor } } : {}),
      },
      orderBy: { version: "desc" },
      take: limit + 1, // Fetch one extra to determine if there's a next page
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

    // Determine if there's more data
    const hasMore = versions.length > limit;
    const results = hasMore ? versions.slice(0, limit) : versions;
    const nextCursor = hasMore && results.length > 0 ? results[results.length - 1].version : null;

    // Fetch author info for display
    const authorIds = [...new Set(results.map((v) => v.createdBy).filter(Boolean))];
    const authors = authorIds.length
      ? await db.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const authorMap = new Map(authors.map((a) => [a.id, { name: a.name, email: a.email }]));

    const versionsWithAuthors = results.map((v) => ({
      id: v.id,
      version: v.version,
      contentMd: v.contentMd,
      changeLog: v.changeLog,
      locale: v.locale,
      createdAt: v.createdAt.toISOString(),
      author: v.createdBy ? authorMap.get(v.createdBy) ?? null : null,
    }));

    return NextResponse.json({
      versions: versionsWithAuthors,
      nextCursor,
      hasMore,
    });
  } catch (err) {
    console.error("[proposals versions GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
