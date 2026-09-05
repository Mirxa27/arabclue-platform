/**
 * Workspace membership management — the rules behind
 * PATCH/DELETE /api/workspaces/members/[id].
 *
 * Until now nothing could change or remove a WorkspaceMember: a departed
 * colleague kept access and a mis-assigned role stayed wrong. The rules live
 * here, with persistence and the audit sink injected, so a test can drive
 * every guard against an in-memory fake and never a database.
 *
 * Guards, in order:
 * - the actor must be a workspace manager (OWNER/ADMIN membership, or a
 *   platform ADMIN/SUPER_ADMIN);
 * - the target must be a member of the same workspace;
 * - nobody edits or removes their own membership (a manager who wants out asks
 *   another manager, which is what keeps a workspace from orphaning itself);
 * - touching an OWNER, or granting OWNER, takes an OWNER or a platform admin;
 * - the last OWNER can be neither demoted nor removed.
 */

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { ApiError, WorkspaceRoleForbiddenError } from "./api-failure";
import { audit as defaultAudit, AUDIT_ACTIONS, type AuditContext } from "./audit";
import { isWorkspaceManager } from "./auth";
import type { Role } from "./types";

export const WORKSPACE_MEMBER_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;
export type WorkspaceMemberRole = (typeof WORKSPACE_MEMBER_ROLES)[number];

export const memberRolePatchSchema = z
  .object({ role: z.enum(WORKSPACE_MEMBER_ROLES) })
  .strict();

/** The slice of the Prisma client membership management touches. */
export type WorkspaceMemberClient = Pick<PrismaClient, "workspaceMember" | "user">;

export type MembershipActor = Readonly<{
  userId: string;
  membershipRole: string;
  platformRole: Role;
}>;

export type WorkspaceMemberView = Readonly<{
  id: string;
  role: string;
  user: Readonly<{ id: string; name: string; email: string }>;
}>;

type Dependencies = Readonly<{
  client: WorkspaceMemberClient;
  /** Audit sink; the production logger when omitted. */
  audit?: (ctx: AuditContext) => Promise<void>;
}>;

const MEMBER_SELECT = {
  id: true,
  role: true,
  userId: true,
  workspaceId: true,
  user: { select: { id: true, name: true, email: true } },
} as const;

function isPlatformAdmin(actor: MembershipActor): boolean {
  return actor.platformRole === "SUPER_ADMIN" || actor.platformRole === "ADMIN";
}

/** Whether the actor may hand out, take away, or act upon the OWNER role. */
export function canActOnOwnerRole(actor: MembershipActor): boolean {
  return actor.membershipRole === "OWNER" || isPlatformAdmin(actor);
}

async function loadTarget(
  deps: Dependencies,
  actor: MembershipActor,
  workspaceId: string,
  memberId: string
) {
  if (!isWorkspaceManager(actor.membershipRole, actor.platformRole)) {
    throw new WorkspaceRoleForbiddenError();
  }
  const target = await deps.client.workspaceMember.findFirst({
    where: { id: memberId, workspaceId },
    select: MEMBER_SELECT,
  });
  if (!target) {
    throw new ApiError("Workspace member not found", 404, "WORKSPACE_MEMBER_NOT_FOUND");
  }
  if (target.userId === actor.userId) {
    throw new ApiError(
      "You cannot change your own membership",
      400,
      "CANNOT_CHANGE_OWN_MEMBERSHIP"
    );
  }
  return target;
}

async function assertNotLastOwner(
  deps: Dependencies,
  workspaceId: string
): Promise<void> {
  const owners = await deps.client.workspaceMember.count({
    where: { workspaceId, role: "OWNER" },
  });
  if (owners <= 1) {
    throw new ApiError(
      "A workspace must keep at least one owner",
      409,
      "WORKSPACE_LAST_OWNER"
    );
  }
}

/** PATCH: assign a new membership role. Idempotent when the role is unchanged. */
export async function changeWorkspaceMemberRole(input: {
  readonly actor: MembershipActor;
  readonly workspaceId: string;
  readonly memberId: string;
  readonly payload: unknown;
  readonly deps: Dependencies;
}): Promise<WorkspaceMemberView> {
  const { actor, workspaceId, memberId, deps } = input;
  const target = await loadTarget(deps, actor, workspaceId, memberId);

  const parsed = memberRolePatchSchema.safeParse(input.payload);
  if (!parsed.success) {
    throw new ApiError("Invalid role", 400, "REQUEST_VALIDATION_FAILED", {
      fieldPaths: ["role"],
      values: { fieldPath: "role" },
    });
  }
  const nextRole = parsed.data.role;

  if (target.role === nextRole) {
    return { id: target.id, role: target.role, user: target.user };
  }

  const previousRole = target.role;
  const touchesOwner = previousRole === "OWNER" || nextRole === "OWNER";
  if (touchesOwner && !canActOnOwnerRole(actor)) {
    throw new ApiError(
      "Only an owner can assign or revoke the owner role",
      403,
      "MEMBER_ROLE_FORBIDDEN"
    );
  }
  if (previousRole === "OWNER") await assertNotLastOwner(deps, workspaceId);

  const updated = await deps.client.workspaceMember.update({
    where: { id: target.id },
    data: { role: nextRole },
    select: MEMBER_SELECT,
  });

  await (deps.audit ?? defaultAudit)({
    userId: actor.userId,
    action: AUDIT_ACTIONS.ROLE_CHANGE,
    resource: "WorkspaceMember",
    resourceId: target.id,
    details: {
      workspaceId,
      memberUserId: target.userId,
      before: { role: previousRole },
      after: { role: updated.role },
    },
    severity: "WARN",
  });

  return { id: updated.id, role: updated.role, user: updated.user };
}

/** DELETE: remove the membership and detach it as the user's active workspace. */
export async function removeWorkspaceMember(input: {
  readonly actor: MembershipActor;
  readonly workspaceId: string;
  readonly memberId: string;
  readonly deps: Dependencies;
}): Promise<{ removedMemberId: string; removedUserId: string }> {
  const { actor, workspaceId, memberId, deps } = input;
  const target = await loadTarget(deps, actor, workspaceId, memberId);

  if (target.role === "OWNER") {
    if (!canActOnOwnerRole(actor)) {
      throw new ApiError(
        "Only an owner can remove another owner",
        403,
        "MEMBER_ROLE_FORBIDDEN"
      );
    }
    await assertNotLastOwner(deps, workspaceId);
  }

  await deps.client.workspaceMember.delete({ where: { id: target.id } });
  // Otherwise the next request would resolve a workspace the user no longer
  // belongs to; getTenantContext falls back to their earliest membership.
  await deps.client.user.updateMany({
    where: { id: target.userId, activeWorkspaceId: workspaceId },
    data: { activeWorkspaceId: null },
  });

  await (deps.audit ?? defaultAudit)({
    userId: actor.userId,
    action: AUDIT_ACTIONS.WORKSPACE_MEMBER_REMOVE,
    resource: "WorkspaceMember",
    resourceId: target.id,
    details: {
      workspaceId,
      memberUserId: target.userId,
      email: target.user.email,
      role: target.role,
    },
    severity: "WARN",
  });

  return { removedMemberId: target.id, removedUserId: target.userId };
}
