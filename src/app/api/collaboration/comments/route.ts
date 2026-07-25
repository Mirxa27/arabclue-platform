import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { isPrismaMissingTable } from "@/lib/prisma-missing-table";

const COMMENTS_UNAVAILABLE = {
  ok: true,
  empty: true,
  comments: [] as const,
};

const COMMENTS_WRITE_UNAVAILABLE = {
  ok: false,
  empty: true,
  error: "Collaboration comments are not available on this database yet.",
};

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const proposalId = searchParams.get("proposalId");
  const sectionKey = searchParams.get("sectionKey");

  if (!proposalId) return NextResponse.json({ error: "Missing proposalId" }, { status: 400 });

  try {
    const proposal = await db.generatedProposal.findUnique({
      where: { id: proposalId },
      select: { workspaceId: true },
    });

    if (!proposal || proposal.workspaceId !== session.user.workspaceId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const where: { proposalId: string; sectionKey?: string } = { proposalId };
    if (sectionKey) where.sectionKey = sectionKey;

    const comments = await db.collaborationComment.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: {
        creator: { select: { id: true, name: true, avatarUrl: true } },
        replies: {
          orderBy: { createdAt: "asc" },
          include: {
            creator: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      comments: comments.map((c) => ({
        id: c.id,
        proposalId: c.proposalId,
        sectionKey: c.sectionKey,
        content: c.content,
        mentions: c.mentions,
        isResolved: c.isResolved,
        parentId: c.parentId,
        createdBy: c.createdBy,
        creatorName: c.creator.name,
        creatorAvatar: c.creator.avatarUrl,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        replies: c.replies.map((r) => ({
          id: r.id,
          content: r.content,
          isResolved: r.isResolved,
          createdBy: r.createdBy,
          creatorName: r.creator.name,
          creatorAvatar: r.creator.avatarUrl,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      })),
    });
  } catch (error) {
    if (isPrismaMissingTable(error)) {
      return NextResponse.json(COMMENTS_UNAVAILABLE);
    }
    console.error("Comments fetch error:", error);
    return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { proposalId, sectionKey, content, parentId } = body;

    if (!proposalId || !content?.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const proposal = await db.generatedProposal.findUnique({
      where: { id: proposalId },
      select: { workspaceId: true },
    });

    if (!proposal || proposal.workspaceId !== session.user.workspaceId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const comment = await db.collaborationComment.create({
      data: {
        proposalId,
        sectionKey,
        content: content.trim(),
        mentions: [],
        isResolved: false,
        parentId,
        createdBy: session.user.id,
      },
      include: {
        creator: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    await audit({
      userId: session.user.id,
      action: "COMMENT_CREATE",
      resource: "CollaborationComment",
      resourceId: comment.id,
      details: { proposalId, sectionKey, parentId: parentId ?? null },
      success: true,
    });

    return NextResponse.json({
      ok: true,
      comment: {
        id: comment.id,
        proposalId: comment.proposalId,
        sectionKey: comment.sectionKey,
        content: comment.content,
        mentions: comment.mentions,
        isResolved: comment.isResolved,
        parentId: comment.parentId,
        createdBy: comment.createdBy,
        creatorName: comment.creator.name,
        creatorAvatar: comment.creator.avatarUrl,
        createdAt: comment.createdAt.toISOString(),
        updatedAt: comment.updatedAt.toISOString(),
        replies: [],
      },
    });
  } catch (error) {
    if (isPrismaMissingTable(error)) {
      return NextResponse.json(COMMENTS_WRITE_UNAVAILABLE, { status: 501 });
    }
    console.error("Comment create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
