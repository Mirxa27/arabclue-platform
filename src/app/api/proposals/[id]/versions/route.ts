import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonApiFailure, toErrorResponse } from "@/lib/api-controller";
import { requireSession } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import {
  decodeProposalVersionCursor,
  encodeProposalVersionCursor,
} from "@/lib/version-history-cursor";

export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

/**
 * GET /api/proposals/[id]/versions
 * List proposal versions in descending revision order with keyset pagination.
 * Query params:
 *   - limit (optional, default 20, max 50)
 *   - cursor (optional, strict scoped keyset cursor - exclusive)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    if (!session) {
      return jsonApiFailure("UNAUTHORIZED");
    }
    const { workspace } = await getTenantContext(session.user.id);
    const { id } = await params;

    // Validate proposal exists and belongs to workspace
    const proposal = await db.generatedProposal.findUnique({
      where: { id },
      select: { id: true, workspaceId: true, version: true },
    });
    if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
      return jsonApiFailure("PROPOSAL_NOT_FOUND");
    }

    // Parse pagination params
    const searchParams = req.nextUrl.searchParams;
    const limitParam = searchParams.get("limit");
    const cursorParam = searchParams.get("cursor");

    const limit = Math.min(
      Math.max(1, limitParam ? parseInt(limitParam, 10) || DEFAULT_PAGE_SIZE : DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE
    );

    let cursorVersion: number | null = null;
    if (cursorParam) {
      cursorVersion = decodeProposalVersionCursor(
        cursorParam,
        workspace.id,
        id
      );
      if (cursorVersion === null) {
        return jsonApiFailure("VERSION_CURSOR_INVALID");
      }
    }

    // Build query with keyset pagination (descending by version)
    const versions = await db.proposalVersion.findMany({
      where: {
        proposalId: id,
        ...(cursorVersion !== null ? { version: { lt: cursorVersion } } : {}),
      },
      orderBy: { version: "desc" },
      take: limit + 1, // Fetch one extra to determine if there's a next page
      select: {
        id: true,
        version: true,
        changeLog: true,
        locale: true,
        createdBy: true,
        createdAt: true,
      },
    });

    // Determine if there's more data
    const hasMore = versions.length > limit;
    const results = hasMore ? versions.slice(0, limit) : versions;
    const last = results[results.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeProposalVersionCursor(workspace.id, id, last.version)
        : null;

    // Fetch author info for display
    const authorIds = [...new Set(results.map((v) => v.createdBy).filter(Boolean))];
    const authors = authorIds.length
      ? await db.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const authorMap = new Map(authors.map((a) => [a.id, { name: a.name, email: a.email }]));

    // List returns metadata only; detail route serves exact content bytes.
    const versionsWithAuthors = results.map((v) => ({
      id: v.id,
      version: v.version,
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
    return toErrorResponse(err, "[proposals versions GET]");
  }
}
