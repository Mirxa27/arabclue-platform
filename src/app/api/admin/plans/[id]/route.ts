import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

export const dynamic = "force-dynamic";

// PATCH /api/admin/plans/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user } = await getBootstrapContext();
  const body = await req.json();
  const updated = await db.subscriptionPlan.update({
    where: { id },
    data: { ...body, id: undefined, createdAt: undefined, updatedAt: undefined },
  });
  await audit({
    userId: user.id,
    action: AUDIT_ACTIONS.PLAN_UPDATE,
    resource: "SubscriptionPlan",
    resourceId: id,
    details: { changes: body },
  });
  return NextResponse.json({ plan: updated });
}

// DELETE /api/admin/plans/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user } = await getBootstrapContext();
  await db.subscriptionPlan.delete({ where: { id } });
  await audit({
    userId: user.id,
    action: AUDIT_ACTIONS.PLAN_UPDATE,
    resource: "SubscriptionPlan",
    resourceId: id,
    details: { action: "DELETE" },
    severity: "WARN",
  });
  return NextResponse.json({ ok: true });
}
