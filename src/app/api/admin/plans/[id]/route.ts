import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { jsonOk, parseJsonBody, withAdmin } from "@/lib/api-controller";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { PLAN_MONEY_KEYS, withPublicMoney } from "@/lib/money";
import { adminPlanWriteSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAdmin(async (session) => {
    const { id } = await params;
    await getBootstrapContext();
    const body = await parseJsonBody(req, adminPlanWriteSchema);

    const updated = await db.subscriptionPlan.update({
      where: { id },
      data: {
        name: body.name,
        nameAr: body.nameAr,
        description: body.description,
        priceMonthly: body.priceMonthly,
        priceYearly: body.priceYearly,
        currency: body.currency,
        maxProposals: body.maxProposals,
        maxDocuments: body.maxDocuments,
        maxWorkspaces: body.maxWorkspaces,
        maxTokensPerMonth: body.maxTokensPerMonth,
        maxStorageGb: body.maxStorageGb,
        featuresJson: body.featuresJson,
        isActive: body.isActive,
        isPublic: body.isPublic,
      },
    });
    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.PLAN_UPDATE,
      resource: "SubscriptionPlan",
      resourceId: id,
      details: { changes: Object.keys(body) },
    });
    return jsonOk({ plan: withPublicMoney({ ...updated }, PLAN_MONEY_KEYS) });
  }, "admin/plans/[id]");
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAdmin(async (session) => {
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
  }, "admin/plans/[id]");
}
