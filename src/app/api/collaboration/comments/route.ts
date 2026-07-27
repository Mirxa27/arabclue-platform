import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  withTenant,
  jsonOk,
  parseSearchParams,
  parseJsonBody,
  requireTenantRecord,
  type TenantHandlerContext,
} from "@/lib/api-controller";

const commentListSchema = z
  .object({
    proposalId: z.string().min(1),
    sectionKey: z.string().optional(),
  })
  .strict();

const commentCreateSchema = z
  .object({
    proposalId: z.string().min(1),
    sectionKey: z.string().optional(),
    content: z.string().min(1).max(10_000),
    parentId: z.string().optional(),
  })
  .strict();

async function loadOwnedProposal(
  proposalId: string,
  workspaceId: string,
) {
  const proposal = await db.generatedProposal.findUnique({
    where: { id: proposalId },
    select: { workspaceId: true },
  });
  return requireTenantRecord(
    proposal ? { workspaceId: proposal.workspaceId } : null,
    workspaceId,
  );
}

export async function GET(request: NextRequest) {
  return withTenant("session", async (ctx: TenantHandlerContext) => {
    const { proposalId, sectionKey } = parseSearchParams(
      request,
      commentListSchema,
    );

    await loadOwnedProposal(proposalId, ctx.workspace.id);

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

    return jsonOk({
      comments: comments.map((c) => ({
        id: c.id,
        proposalId: c.proposalId,
        sectionKey: c.sectionKey,
        content: c.content,
        mentions: c.mentions,
        isResolved: c.isResolved,
        isWithdrawn: c.isWithdrawn,
        parentId: c.parentId,
        createdBy: c.createdBy,
        creatorName: c.creator.name,
        creatorAvatar: c.creator.avatarUrl,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        editedAt: c.editedAt?.toISOString() ?? null,
        replies: c.replies.map((r) => ({
          id: r.id,
          content: r.content,
          isResolved: r.isResolved,
          isWithdrawn: r.isWithdrawn,
          createdBy: r.createdBy,
          creatorName: r.creator.name,
          creatorAvatar: r.creator.avatarUrl,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          editedAt: r.editedAt?.toISOString() ?? null,
        })),
      })),
    });
  }, "collaboration/comments GET");
}

export async function POST(request: NextRequest) {
  return withTenant("session", async (ctx: TenantHandlerContext) => {
    const { proposalId, sectionKey, content, parentId } = await parseJsonBody(
      request,
      commentCreateSchema,
    );

    await loadOwnedProposal(proposalId, ctx.workspace.id);

    const comment = await db.collaborationComment.create({
      data: {
        proposalId,
        sectionKey,
        content: content.trim(),
        mentions: [],
        isResolved: false,
        parentId,
        createdBy: ctx.userId,
      },
      include: {
        creator: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    await audit({
      userId: ctx.userId,
      action: "COMMENT_CREATE",
      resource: "CollaborationComment",
      resourceId: comment.id,
      details: { proposalId, sectionKey, parentId: parentId ?? null },
      success: true,
    });

    return jsonOk({
      comment: {
        id: comment.id,
        proposalId: comment.proposalId,
        sectionKey: comment.sectionKey,
        content: comment.content,
        mentions: comment.mentions,
        isResolved: comment.isResolved,
        isWithdrawn: comment.isWithdrawn,
        parentId: comment.parentId,
        createdBy: comment.createdBy,
        creatorName: comment.creator.name,
        creatorAvatar: comment.creator.avatarUrl,
        createdAt: comment.createdAt.toISOString(),
        updatedAt: comment.updatedAt.toISOString(),
        editedAt: comment.editedAt?.toISOString() ?? null,
        replies: [],
      },
    });
  }, "collaboration/comments POST");
}