import { db } from "@/lib/db";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import {
  workspaceSwitchSchema,
  workspaceProfileSchema,
} from "@/lib/validation";
import { setActiveWorkspace } from "@/lib/workspace-context";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { isWorkspaceManager } from "@/lib/auth";
import { computeOnboardingSteps } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

// Membership changes live elsewhere:
// - adding someone: POST /api/invitations (consent, seat check, audit, email);
// - changing a role or removing: PATCH/DELETE /api/workspaces/members/[id].
// The former POST here attached any existing account by email without the
// person's consent and answered 404 for an unknown address — a registry of who
// has an account. It is gone rather than gated.

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
  return withTenant("session", async ({ session, workspace, membershipRole }) => {
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    // Shape 1: workspace switch. Validate the id explicitly so a 300KB
    // string can't reach setActiveWorkspace.
    if (typeof body.workspaceId === "string" && body.workspaceId) {
      const switchParsed = workspaceSwitchSchema.safeParse({
        workspaceId: body.workspaceId,
      });
      if (!switchParsed.success) {
        throw new ApiError("Invalid workspaceId", 400);
      }
      const ctx = await setActiveWorkspace(
        session.user.id,
        switchParsed.data.workspaceId
      );
      if (!ctx) throw new ApiError("Workspace not found or access denied", 404);
      return jsonOk({
        workspace: ctx.workspace,
        membershipRole: ctx.membershipRole,
      });
    }

    // Shape 2: legal / profile update — workspace managers only.
    if (session.user.role === "REVIEWER") {
      throw new ApiError("Forbidden", 403);
    }
    if (!isWorkspaceManager(membershipRole, session.user.role)) {
      throw new ApiError(
        "Only workspace owners/admins can update workspace settings",
        403
      );
    }

    // The previous code fed the raw body straight into Prisma; a malformed
    // client could set unrelated columns or push oversized strings into the
    // legal identity fields. Route it through zod first.
    const parsed = workspaceProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError("Invalid workspace profile payload", 400);
    }
    const data = parsed.data;

    const updated = await db.workspace.update({
      where: { id: workspace.id },
      data: {
        ...(data.crNumber !== undefined ? { crNumber: data.crNumber } : {}),
        ...(data.vatNumber !== undefined ? { vatNumber: data.vatNumber } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.nameAr !== undefined ? { nameAr: data.nameAr } : {}),
      },
    });

    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.CONFIG_CHANGE,
      resource: "Workspace",
      resourceId: workspace.id,
      details: {
        fields: Object.keys(data).filter((k) => k !== "workspaceId"),
      },
    });

    // The legal step of onboarding reads crNumber/vatNumber. The stored
    // OnboardingProgress row is what the notification bell now reads, so it is
    // refreshed here rather than on every poll. Never fails the save.
    await computeOnboardingSteps(workspace.id).catch(() => undefined);

    return jsonOk({ workspace: updated });
  }, "workspaces PATCH");
}
