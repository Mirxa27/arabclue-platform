import { db } from "@/lib/db";
import {
  withTenant,
  jsonOk,
  jsonError,
  ApiError,
} from "@/lib/api-controller";
import {
  parseJsonBody,
  workspaceSwitchSchema,
  workspaceInviteSchema,
} from "@/lib/validation";
import { setActiveWorkspace } from "@/lib/workspace-context";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

export const dynamic = "force-dynamic";

// GET /api/workspaces — active workspace, members, and all memberships
export async function GET() {
  return withTenant("session", async ({ session, workspace, membershipRole }) => {
    const [members, memberships] = await Promise.all([
      db.workspaceMember.findMany({
        where: { workspaceId: workspace.id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              locale: true,
              mfaEnabled: true,
            },
          },
        },
      }),
      db.workspaceMember.findMany({
        where: { userId: session.user.id },
        include: {
          workspace: {
            select: {
              id: true,
              name: true,
              nameAr: true,
              slug: true,
              plan: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return jsonOk({
      workspace,
      membershipRole,
      members: members.map((m) => ({
        id: m.id,
        role: m.role,
        user: m.user,
      })),
      memberships: memberships.map((m) => ({
        id: m.id,
        role: m.role,
        workspace: m.workspace,
        active: m.workspaceId === workspace.id,
      })),
    });
  }, "workspaces GET");
}

// PATCH /api/workspaces — switch active workspace OR update legal profile
export async function PATCH(req: Request) {
  return withTenant("session", async ({ session, workspace }) => {
    const body = await req.json().catch(() => ({}));

    if (typeof body.workspaceId === "string" && body.workspaceId) {
      const ctx = await setActiveWorkspace(session.user.id, body.workspaceId);
      if (!ctx) throw new ApiError("Workspace not found or access denied", 404);
      return jsonOk({
        workspace: ctx.workspace,
        membershipRole: ctx.membershipRole,
      });
    }

    // Legal / profile fields (writers only)
    if (session.user.role === "REVIEWER") {
      throw new ApiError("Forbidden", 403);
    }

    const updated = await db.workspace.update({
      where: { id: workspace.id },
      data: {
        ...(body.crNumber !== undefined ? { crNumber: body.crNumber } : {}),
        ...(body.vatNumber !== undefined ? { vatNumber: body.vatNumber } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.nameAr !== undefined ? { nameAr: body.nameAr } : {}),
      },
    });

    return jsonOk({ workspace: updated });
  }, "workspaces PATCH");
}

// POST /api/workspaces — invite existing user by email
export async function POST(req: Request) {
  return withTenant("writer", async ({ session, workspace, membershipRole }) => {
    if (membershipRole !== "OWNER" && membershipRole !== "ADMIN") {
      if (
        session.user.role !== "SUPER_ADMIN" &&
        session.user.role !== "ADMIN"
      ) {
        throw new ApiError("Only workspace owners/admins can invite", 403);
      }
    }

    const parsed = await parseJsonBody(req, workspaceInviteSchema);
    if (!parsed.ok) return parsed.response;

    const email = parsed.data.email.toLowerCase();
    const invitee = await db.user.findUnique({ where: { email } });
    if (!invitee) {
      throw new ApiError(
        "User must have an Arabclue account before invite — ask them to sign in first",
        404
      );
    }

    const existing = await db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: invitee.id,
        },
      },
    });
    if (existing) {
      return jsonOk({ member: existing, alreadyMember: true });
    }

    const member = await db.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: invitee.id,
        role: parsed.data.role,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.ROLE_CHANGE,
      resource: "WorkspaceMember",
      resourceId: member.id,
      details: {
        inviteeId: invitee.id,
        email,
        role: parsed.data.role,
        workspaceId: workspace.id,
      },
    });

    return jsonOk({ member, alreadyMember: false });
  }, "workspaces POST");
}
