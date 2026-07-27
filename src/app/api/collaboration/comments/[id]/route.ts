import { NextRequest } from "next/server";
import { z } from "zod";
import { isWorkspaceManager } from "@/lib/auth";
import {
  withTenant,
  jsonOk,
  jsonApiFailure,
  parseJsonBody,
  RequestValidationError,
  type TenantHandlerContext,
} from "@/lib/api-controller";
import {
  amendCollaborationComment,
  deleteCollaborationComment,
  type CommentActor,
  type CommentProjection,
} from "@/lib/comment-lifecycle";
import { createPrismaCommentRepository } from "@/lib/comment-lifecycle-prisma";

type Params = { params: Promise<{ id: string }> };

/**
 * Amendment payload.
 *
 * The schema validates shape only. The permitted trimmed length is enforced by
 * the Comment_Service so the rejection carries `COMMENT_CONTENT_INVALID` with the
 * bounds in Arabic and English rather than a generic validation code
 * (criterion 12.10).
 */
const commentAmendmentSchema = z
  .object({
    content: z.string(),
  })
  .strict();

const repository = createPrismaCommentRepository();

function actorFrom(ctx: TenantHandlerContext): CommentActor {
  return {
    userId: ctx.userId,
    workspaceId: ctx.workspace.id,
    membershipRole: ctx.membershipRole,
    // Owner/administrator override applies to deletion only (criterion 12.5).
    isWorkspaceManager: isWorkspaceManager(
      ctx.membershipRole,
      ctx.session.user.role
    ),
  };
}

function serializeComment(comment: CommentProjection) {
  return {
    id: comment.id,
    proposalId: comment.proposalId,
    sectionKey: comment.sectionKey,
    content: comment.content,
    mentions: [...comment.mentions],
    isResolved: comment.isResolved,
    isWithdrawn: comment.isWithdrawn,
    parentId: comment.parentId,
    createdBy: comment.createdBy,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    editedAt: comment.editedAt?.toISOString() ?? null,
    replyCount: comment.directReplyCount,
  };
}

/**
 * PATCH /api/collaboration/comments/[id] — amend one comment.
 *
 * `withTenant` resolves session, workspace, and role before any read, and the
 * repository scopes every statement to the caller's workspace through the parent
 * proposal, so a comment outside that workspace is a not-found result that
 * mutates nothing (criteria 12.9, 12.11).
 *
 * Only the author may amend, whatever their workspace role (criterion 12.2); a
 * resolved comment is a conflict (criterion 12.6); the accepted write replaces
 * content and sets the edited timestamp while retaining the author, the creation
 * timestamp, the parent reference, and every reply (criterion 12.1). Failures are
 * bilingual bodies from the shared mapper, and a missing relation or column
 * surfaces as HTTP 503 `SCHEMA_MIGRATION_PENDING` (requirements 16.2, 18.4).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  return withTenant(
    "session",
    async (ctx: TenantHandlerContext) => {
      const { id } = await params;
      if (!id) throw new RequestValidationError(["id"]);

      const { content } = await parseJsonBody(request, commentAmendmentSchema);

      const result = await amendCollaborationComment({
        repository,
        actor: actorFrom(ctx),
        commentId: id,
        content,
      });

      if (!result.ok) {
        return jsonApiFailure(result.code, { values: result.values });
      }

      return jsonOk({ ok: true, comment: serializeComment(result.comment) });
    },
    "collaboration:comment-amend"
  );
}

/**
 * DELETE /api/collaboration/comments/[id] — delete one comment, preserving replies.
 *
 * A comment with no direct reply row is removed whatever its resolved state
 * (criterion 12.3). A comment with at least one direct reply is withdrawn with
 * empty content and a cleared mention list while every direct and nested reply
 * stays unchanged (criterion 12.4). A workspace owner or administrator may delete
 * any comment in the workspace under those same rules, and the audit entry records
 * the acting role (criterion 12.5). The mutation and its `COMMENT_DELETE` audit
 * entry commit together or not at all.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  return withTenant(
    "session",
    async (ctx: TenantHandlerContext) => {
      const { id } = await params;
      if (!id) throw new RequestValidationError(["id"]);

      const result = await deleteCollaborationComment({
        repository,
        actor: actorFrom(ctx),
        commentId: id,
      });

      if (!result.ok) {
        return jsonApiFailure(result.code, { values: result.values });
      }

      return jsonOk({
        ok: true,
        deleted: true,
        hardDeleted: result.disposition === "HARD_DELETED",
        disposition: result.disposition,
        comment: serializeComment(result.comment),
      });
    },
    "collaboration:comment-delete"
  );
}
