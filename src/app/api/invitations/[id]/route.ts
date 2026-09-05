/**
 * Workspace invitation item — revocation (requirements 3.5, 3.6).
 *
 * Owner/administrator authorization, tenant scoping, the conditional state
 * change, and the audit entry are owned by the Invitation_Service; the handler
 * only resolves `Tenant_Context` and maps the typed result.
 */

import { NextRequest } from "next/server";
import { jsonApiFailure, jsonOk, withTenant } from "@/lib/api-controller";
import { createPrismaInvitationService } from "@/lib/invitation-service-prisma";
import { extractClientIpOrNull } from "@/lib/login-rate-limit";

export const dynamic = "force-dynamic";


export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTenant(
    "writer",
    async (ctx) => {
      const { id } = await params;
      const result = await createPrismaInvitationService().revokeInvitation({
        actor: {
          userId: ctx.session.user.id,
          membershipRole: ctx.membershipRole,
          platformRole: ctx.session.user.role,
        },
        workspace: { id: ctx.workspace.id, name: ctx.workspace.name },
        invitationId: id,
        sourceAddress: extractClientIpOrNull(req.headers),
      });

      if (!result.ok) {
        return jsonApiFailure(result.code, { status: result.status });
      }

      return jsonOk({
        ok: true,
        code: result.code,
        id: result.invitationId,
      });
    },
    "invitations DELETE"
  );
}
