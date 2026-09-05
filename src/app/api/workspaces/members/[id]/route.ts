import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonOk, withTenant, type TenantHandlerContext } from "@/lib/api-controller";
import {
  changeWorkspaceMemberRole,
  removeWorkspaceMember,
  type MembershipActor,
} from "@/lib/workspace-members";

export const dynamic = "force-dynamic";

/**
 * Manage one membership of the caller's active workspace.
 *
 * PATCH  { role: "OWNER" | "ADMIN" | "MEMBER" }  → { member }
 * DELETE                                          → { ok, removedMemberId, removedUserId }
 *
 * Workspace managers only (OWNER/ADMIN membership or platform admin). Every
 * rule — own membership, last owner, owner-role custody — lives in
 * `workspace-members.ts`; this file is the request boundary.
 */
function actorOf(ctx: TenantHandlerContext): MembershipActor {
  return {
    userId: ctx.session.user.id,
    membershipRole: ctx.membershipRole,
    platformRole: ctx.session.user.role,
  };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTenant(
    "writer",
    async (ctx) => {
      const { id } = await params;
      const payload = await req.json().catch(() => null);
      const member = await changeWorkspaceMemberRole({
        actor: actorOf(ctx),
        workspaceId: ctx.workspace.id,
        memberId: id,
        payload,
        deps: { client: db },
      });
      return jsonOk({ member });
    },
    "workspaces/members PATCH"
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTenant(
    "writer",
    async (ctx) => {
      const { id } = await params;
      const removed = await removeWorkspaceMember({
        actor: actorOf(ctx),
        workspaceId: ctx.workspace.id,
        memberId: id,
        deps: { client: db },
      });
      return jsonOk({ ok: true, ...removed });
    },
    "workspaces/members DELETE"
  );
}
