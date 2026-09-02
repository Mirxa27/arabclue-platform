import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canGrantRole, revokeUserSessions } from "@/lib/auth";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { jsonApiFailure, parseJsonBody, withAdmin } from "@/lib/api-controller";
import { toPublicAdminUser } from "@/lib/admin-user-public";
import { unsealMfaSecret } from "@/lib/mfa-secret";
import { adminUserPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

// PATCH /api/admin/users/[id] — update role / active status / assign plan
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAdmin(async (session) => {
  const { id } = await params;
  const body = await parseJsonBody(req, adminUserPatchSchema);

  const before = await db.user.findUnique({
    where: { id },
    select: { role: true, active: true, email: true, mfaSecret: true, mfaEnabled: true },
  });
  if (!before) {
    return jsonApiFailure("USER_NOT_FOUND", { status: 404 });
  }

  // Applies to ANY mutation of a SUPER_ADMIN, not just a role change.
  //
  // This guard used to sit inside `if (body.role)`, so `{ active: false }` or
  // `{ mfaEnabled: false }` skipped it entirely and an ADMIN could deactivate a
  // SUPER_ADMIN or strip their MFA — neutralising the only role that outranks
  // them. Hoisted so the target's rank is checked before any field is written.
  if (before.role === "SUPER_ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return jsonApiFailure("SUPER_ADMIN_REQUIRED", { status: 403 });
  }

  if (body.role) {
    const targetRole = body.role;
    if (!canGrantRole(session.user.role, targetRole)) {
      return jsonApiFailure("ROLE_GRANT_FORBIDDEN", { status: 403 });
    }
  }

  if (body.mfaEnabled === true && !unsealMfaSecret(before.mfaSecret)) {
    return jsonApiFailure("MFA_NOT_SET_UP", { status: 400 });
  }

  const updated = await db.user.update({
    where: { id },
    data: {
      role: body.role ?? undefined,
      active: body.active ?? undefined,
      mfaEnabled: body.mfaEnabled ?? undefined,
      locale: body.locale ?? undefined,
    },
  });

  const privilegeChanged =
    (body.role !== undefined && body.role !== before.role) ||
    (body.active !== undefined && body.active !== before.active) ||
    body.active === false;
  if (privilegeChanged) {
    await revokeUserSessions(id);
  }

  if (body.planId) {
    const plan = await db.subscriptionPlan.findUnique({ where: { id: body.planId } });
    if (plan) {
      const now = new Date();
      await db.subscription.upsert({
        where: { userId: id },
        update: {
          planId: plan.id,
          status: "ACTIVE",
          billingCycle: body.billingCycle ?? "MONTHLY",
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()),
        },
        create: {
          userId: id,
          planId: plan.id,
          status: "ACTIVE",
          billingCycle: body.billingCycle ?? "MONTHLY",
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()),
        },
      });
    }
  }

  await audit({
    userId: session.user.id,
    action: AUDIT_ACTIONS.ROLE_CHANGE,
    resource: "User",
    resourceId: id,
    details: {
      before: { role: before.role, active: before.active },
      after: { role: updated.role, active: updated.active },
      sessionsRevoked: privilegeChanged,
    },
    severity: "CRITICAL",
  });

  return NextResponse.json({
    user: toPublicAdminUser(updated as unknown as Record<string, unknown>),
  });
  }, "admin/users/[id]");
}

// DELETE /api/admin/users/[id] — deactivate (soft delete)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAdmin(async (session) => {
  const { id } = await params;

  const target = await db.user.findUnique({ where: { id }, select: { role: true, email: true } });
  if (!target) {
    return jsonApiFailure("USER_NOT_FOUND", { status: 404 });
  }
  if (target.role === "SUPER_ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return jsonApiFailure("SUPER_ADMIN_REQUIRED", { status: 403 });
  }
  if (id === session.user.id) {
    return jsonApiFailure("CANNOT_DEACTIVATE_OWN_ACCOUNT", { status: 400 });
  }

  const updated = await db.user.update({
    where: { id },
    data: { active: false },
  });
  await revokeUserSessions(id);
  await audit({
    userId: session.user.id,
    action: AUDIT_ACTIONS.USER_DEACTIVATE,
    resource: "User",
    resourceId: id,
    details: { email: updated.email, sessionsRevoked: true },
    severity: "CRITICAL",
  });
  return NextResponse.json({ ok: true });
  }, "admin/users/[id]");
}
