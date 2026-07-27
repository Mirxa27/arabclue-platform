import { NextRequest } from "next/server";
import {
  withTenant,
  jsonOk,
  RequestValidationError,
  ResourceNotFoundError,
} from "@/lib/api-controller";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/**
 * Mark a collaboration comment as resolved.
 *
 * The tenant context (session -> workspace -> role) resolves through
 * `withTenant` and resource ownership is verified before the update
 * (requirement 19.5). A missing `CollaborationComment` relation and every other
 * failure map through the central bilingual `ApiFailure` mapper — HTTP 503
 * `SCHEMA_MIGRATION_PENDING` naming the relation, or a generic 500 that leaks
 * nothing — never a not-implemented stub or a route-local body (requirements
 * 16.2, 16.7, 19.10).
 */
export async function POST(_request: NextRequest, { params }: Params) {
  return withTenant(
    "session",
    async (ctx) => {
      const { id } = await params;
      if (!id) throw new RequestValidationError(["id"]);

      const comment = await db.collaborationComment.findUnique({
        where: { id },
        include: {
          proposal: { select: { workspaceId: true } },
        },
      });

      if (!comment || comment.proposal.workspaceId !== ctx.workspace.id) {
        throw new ResourceNotFoundError();
      }

      const updated = await db.collaborationComment.update({
        where: { id },
        data: { isResolved: true },
      });

      await audit({
        userId: ctx.userId,
        action: "COLLABORATION_COMMENT_RESOLVE",
        resource: "CollaborationComment",
        resourceId: id,
        success: true,
      }).catch(() => undefined);

      return jsonOk({
        ok: true,
        comment: {
          id: updated.id,
          isResolved: updated.isResolved,
          updatedAt: updated.updatedAt.toISOString(),
        },
      });
    },
    "collaboration:comment-resolve"
  );
}
