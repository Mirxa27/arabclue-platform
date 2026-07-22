import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, canGrantRole, revokeUserSessions } from "@/lib/auth";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

// PATCH /api/admin/users/[id] — update role / active status / assign plan
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const before = await db.user.findUnique({
    where: { id },
    select: { role: true, active: true, email: true },
  });
  if (!before) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (body.role) {
    const targetRole = body.role as Role;
    if (!canGrantRole(session.user.role, targetRole)) {
      return NextResponse.json(
        { error: "Insufficient privileges to grant this role" },
        { status: 403 }
      );
    }
    // Non-super-admins cannot demote/modify SUPER_ADMIN accounts
    if (before.role === "SUPER_ADMIN" && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only SUPER_ADMIN can modify SUPER_ADMIN accounts" },
        { status: 403 }
      );
    }
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

  return NextResponse.json({ user: updated });
}

// DELETE /api/admin/users/[id] — deactivate (soft delete)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const target = await db.user.findUnique({ where: { id }, select: { role: true, email: true } });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (target.role === "SUPER_ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Only SUPER_ADMIN can deactivate SUPER_ADMIN accounts" },
      { status: 403 }
    );
  }
  if (id === session.user.id) {
    return NextResponse.json({ error: "Cannot deactivate your own account" }, { status: 400 });
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
}
