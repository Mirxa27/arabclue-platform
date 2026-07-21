import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

export const dynamic = "force-dynamic";

// PATCH /api/admin/users/[id] — update role / active status / assign plan
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user: admin } = await getBootstrapContext();
  const body = await req.json();

  const before = await db.user.findUnique({
    where: { id },
    select: { role: true, active: true, email: true },
  });

  const updated = await db.user.update({
    where: { id },
    data: {
      role: body.role ?? undefined,
      active: body.active ?? undefined,
      mfaEnabled: body.mfaEnabled ?? undefined,
      locale: body.locale ?? undefined,
    },
  });

  // Assign / change subscription plan
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
    userId: admin.id,
    action: AUDIT_ACTIONS.ROLE_CHANGE,
    resource: "User",
    resourceId: id,
    details: {
      before: { role: before?.role, active: before?.active },
      after: { role: updated.role, active: updated.active },
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
  const { id } = await params;
  const { user: admin } = await getBootstrapContext();
  const updated = await db.user.update({
    where: { id },
    data: { active: false },
  });
  await audit({
    userId: admin.id,
    action: AUDIT_ACTIONS.USER_DEACTIVATE,
    resource: "User",
    resourceId: id,
    details: { email: updated.email },
    severity: "CRITICAL",
  });
  return NextResponse.json({ ok: true });
}
