/**
 * Workspace invitation collection (requirements 3.1, 3.5, 3.7, 3.8).
 *
 * The handler stays thin: it resolves the session and `Tenant_Context` through
 * `withTenant`, validates the request against a declared schema, delegates every
 * rule to the Invitation_Service, and maps the typed result through the shared
 * bilingual failure mapper. No raw token value is ever returned.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  jsonApiFailure,
  jsonOk,
  parseSearchParams,
  withTenant,
  type TenantHandlerContext,
} from "@/lib/api-controller";
import { createPrismaInvitationService } from "@/lib/invitation-service-prisma";
import {
  decodeInvitationCursor,
  encodeInvitationCursor,
  INVITATION_PAGE_SIZE_MAX,
  type InvitationActor,
  type InvitationWorkspace,
} from "@/lib/invitation-service";

export const dynamic = "force-dynamic";

const listQuerySchema = z.object({
  limit: z
    .string()
    .regex(/^\d{1,4}$/u)
    .optional(),
  cursor: z.string().min(1).max(4096).optional(),
});

function actorOf(ctx: TenantHandlerContext): InvitationActor {
  return {
    userId: ctx.session.user.id,
    membershipRole: ctx.membershipRole,
    platformRole: ctx.session.user.role,
  };
}

function workspaceOf(ctx: TenantHandlerContext): InvitationWorkspace {
  return { id: ctx.workspace.id, name: ctx.workspace.name };
}

function clientAddress(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip")?.trim() ?? null;
}

export async function GET(req: NextRequest) {
  return withTenant(
    "session",
    async (ctx) => {
      const query = parseSearchParams(req, listQuerySchema);
      const after = query.cursor
        ? decodeInvitationCursor(query.cursor, ctx.workspace.id)
        : null;
      if (query.cursor && !after) {
        return jsonApiFailure("REQUEST_VALIDATION_FAILED", {
          fieldPaths: ["cursor"],
          values: { fieldPath: "cursor" },
        });
      }

      const result = await createPrismaInvitationService().listPendingInvitations({
        actor: actorOf(ctx),
        workspace: workspaceOf(ctx),
        pageSize: query.limit,
        after,
      });
      if (!result.ok) return jsonApiFailure(result.code);

      return jsonOk({
        invitations: result.invitations,
        pageSize: INVITATION_PAGE_SIZE_MAX,
        nextCursor: result.nextPosition
          ? encodeInvitationCursor(ctx.workspace.id, result.nextPosition)
          : null,
      });
    },
    "invitations GET"
  );
}

export async function POST(req: NextRequest) {
  return withTenant(
    "writer",
    async (ctx) => {
      const payload = await req.json().catch(() => null);
      const result = await createPrismaInvitationService().createInvitation({
        actor: actorOf(ctx),
        workspace: workspaceOf(ctx),
        payload,
        sourceAddress: clientAddress(req),
      });

      if (!result.ok) {
        return jsonApiFailure(result.code, {
          status: result.status,
          ...(result.code === "REQUEST_VALIDATION_FAILED"
            ? {
                fieldPaths: result.fieldPaths,
                values: { fieldPath: result.fieldPaths.join(", ") },
              }
            : {}),
        });
      }

      return jsonOk(
        {
          ok: true,
          code: result.code,
          emailDelivery: result.emailDelivery,
          invitation: result.invitation,
        },
        { status: result.status }
      );
    },
    "invitations POST"
  );
}
