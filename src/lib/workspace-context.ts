/**
 * Resolve the caller's workspace from membership — never share a global
 * default workspace across unrelated users for tenant data access.
 */

import { db } from "./db";
import { getBootstrapContext } from "./bootstrap";
import type { BrandProfile, Workspace } from "@prisma/client";

export type TenantContext = {
  workspace: Workspace & { brandProfiles: BrandProfile[] };
  brandProfile: BrandProfile | null;
  userId: string;
  membershipRole: string;
};

/**
 * Ensure seed data exists (admin/plans/providers), then return the workspace
 * that `userId` belongs to. Honors `User.activeWorkspaceId` when valid.
 */
export async function getTenantContext(userId: string): Promise<TenantContext> {
  await getBootstrapContext();

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, activeWorkspaceId: true },
  });
  if (!user) throw new Error("User not found");

  if (user.activeWorkspaceId) {
    const preferred = await db.workspaceMember.findFirst({
      where: { userId, workspaceId: user.activeWorkspaceId },
      include: {
        workspace: { include: { brandProfiles: true } },
      },
    });
    if (preferred) {
      return {
        workspace: preferred.workspace,
        brandProfile: preferred.workspace.brandProfiles[0] ?? null,
        userId,
        membershipRole: preferred.role,
      };
    }
  }

  const membership = await db.workspaceMember.findFirst({
    where: { userId },
    include: {
      workspace: { include: { brandProfiles: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (membership) {
    if (user.activeWorkspaceId !== membership.workspaceId) {
      await db.user.update({
        where: { id: userId },
        data: { activeWorkspaceId: membership.workspaceId },
      });
    }
    return {
      workspace: membership.workspace,
      brandProfile: membership.workspace.brandProfiles[0] ?? null,
      userId,
      membershipRole: membership.role,
    };
  }

  const slug = `ws-${userId.slice(-8)}-${crypto.randomUUID()}`;
  const workspace = await db.workspace.create({
    data: {
      name: `${user.name}'s Workspace`,
      nameAr: `مساحة ${user.name}`,
      slug,
      plan: "STARTER",
      brandProfiles: {
        create: {
          primaryColor: "#1E3A8A",
          secondaryColor: "#0F172A",
          accentColor: "#0EA5E9",
          fontFamily: "IBM Plex Sans Arabic",
          tagline: "Arabclue",
          taglineAr: "أراب كلاو",
          vision2030Alignment: "thriving-economy",
        },
      },
      members: {
        create: { userId, role: "OWNER" },
      },
    },
    include: { brandProfiles: true },
  });

  await db.user.update({
    where: { id: userId },
    data: { activeWorkspaceId: workspace.id },
  });

  const { seedOnboardingDefaults } = await import("./bootstrap");
  await seedOnboardingDefaults(workspace.id, userId).catch(() => {});

  return {
    workspace,
    brandProfile: workspace.brandProfiles[0] ?? null,
    userId,
    membershipRole: "OWNER",
  };
}

/** Assert a resource belongs to the tenant workspace */
export function assertWorkspaceMatch(
  resourceWorkspaceId: string | null | undefined,
  tenantWorkspaceId: string
): boolean {
  return !!resourceWorkspaceId && resourceWorkspaceId === tenantWorkspaceId;
}

/**
 * Resolve a client-supplied project identifier to a project the tenant owns.
 *
 * Returns the project identifier when the project exists inside
 * `tenantWorkspaceId`, and `null` for every other case — absent value, unknown
 * identifier, or a project belonging to another workspace. Callers that accept
 * a project identifier from a request body, a tool argument, or any other
 * client-controlled source must route it through here before it reaches a
 * query, a write, or the agent pipeline.
 */
export async function resolveOwnedProjectId(
  projectId: string | null | undefined,
  tenantWorkspaceId: string
): Promise<string | null> {
  const candidate = projectId?.trim();
  if (!candidate) return null;
  const project = await db.tenderProject.findFirst({
    where: { id: candidate, workspaceId: tenantWorkspaceId },
    select: { id: true },
  });
  return project?.id ?? null;
}

/** Switch active workspace when caller is a member. */
export async function setActiveWorkspace(
  userId: string,
  workspaceId: string
): Promise<TenantContext | null> {
  const membership = await db.workspaceMember.findFirst({
    where: { userId, workspaceId },
    include: {
      workspace: { include: { brandProfiles: true } },
    },
  });
  if (!membership) return null;
  await db.user.update({
    where: { id: userId },
    data: { activeWorkspaceId: workspaceId },
  });
  return {
    workspace: membership.workspace,
    brandProfile: membership.workspace.brandProfiles[0] ?? null,
    userId,
    membershipRole: membership.role,
  };
}
