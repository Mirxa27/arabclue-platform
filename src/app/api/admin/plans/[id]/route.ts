import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { requireAdmin } from "@/lib/auth";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

export const dynamic = "force-dynamic";

// PATCH /api/admin/plans/[id] — whitelist fields to prevent mass-assignment
const ALLOWED_PLAN_FIELDS = new Set([
  "name",
  "nameAr",
  "description",
  "priceMonthly",
  "priceYearly",
  "currency",
  "maxProposals",
  "maxDocuments",
  "maxWorkspaces",
  "maxTokensPerMonth",
  "maxStorageGb",
  "featuresJson",
  "isActive",
  "isPublic",
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await getBootstrapContext();
  const body = await req.json();

  const data: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (ALLOWED_PLAN_FIELDS.has(key)) data[key] = body[key];
  }

  // Validate numeric bounds
  if (data.priceMonthly != null && (typeof data.priceMonthly !== "number" || (data.priceMonthly as number) < 0)) {
    return NextResponse.json({ error: "priceMonthly must be >=0" }, { status: 400 });
  }
  if (data.priceYearly != null && (typeof data.priceYearly !== "number" || (data.priceYearly as number) < 0)) {
    return NextResponse.json({ error: "priceYearly must be >=0" }, { status: 400 });
  }
  for (const f of ["maxProposals", "maxDocuments", "maxWorkspaces", "maxTokensPerMonth", "maxStorageGb"] as const) {
    if (data[f] != null) {
      const v = data[f] as number;
      if (typeof v !== "number" || v < -1) return NextResponse.json({ error: `${f} must be >=-1 (-1=unlimited)` }, { status: 400 });
    }
  }

  const updated = await db.subscriptionPlan.update({
    where: { id },
    data,
  });
  await audit({
    userId: session.user.id,
    action: AUDIT_ACTIONS.PLAN_UPDATE,
    resource: "SubscriptionPlan",
    resourceId: id,
    details: { changes: Object.keys(data) },
  });
  return NextResponse.json({ plan: updated });
}

// DELETE /api/admin/plans/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await getBootstrapContext();
  await db.subscriptionPlan.delete({ where: { id } });
  await audit({
    userId: session.user.id,
    action: AUDIT_ACTIONS.PLAN_UPDATE,
    resource: "SubscriptionPlan",
    resourceId: id,
    details: { action: "DELETE" },
    severity: "WARN",
  });
  return NextResponse.json({ ok: true });
}
