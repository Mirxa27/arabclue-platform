import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { jsonOk, parseJsonBody, withAdmin } from "@/lib/api-controller";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { DEFAULT_PLANS } from "@/lib/constants";
import { PLAN_MONEY_KEYS, withPublicMoney } from "@/lib/money";
import { adminPlanCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdmin(async () => {
    await getBootstrapContext();
    const plans = await db.subscriptionPlan.findMany({
      orderBy: [{ priceMonthly: "asc" }],
      include: { _count: { select: { subscriptions: true } } },
    });
    return jsonOk({
      plans: plans.map((plan) => withPublicMoney({ ...plan }, PLAN_MONEY_KEYS)),
      defaults: DEFAULT_PLANS,
    });
  }, "admin/plans");
}

export async function POST(req: NextRequest) {
  return withAdmin(async (session) => {
    await getBootstrapContext();
    const body = await parseJsonBody(req, adminPlanCreateSchema);
    const plan = await db.subscriptionPlan.create({
      data: {
        name: body.name,
        nameAr: body.nameAr ?? null,
        description: body.description ?? null,
        priceMonthly: body.priceMonthly ?? 0,
        priceYearly: body.priceYearly ?? 0,
        currency: "SAR",
        maxProposals: body.maxProposals ?? 10,
        maxDocuments: body.maxDocuments ?? 50,
        maxWorkspaces: body.maxWorkspaces ?? 1,
        maxTokensPerMonth: body.maxTokensPerMonth ?? 500000,
        maxStorageGb: body.maxStorageGb ?? 5,
        featuresJson: body.featuresJson ?? JSON.stringify([]),
        isActive: body.isActive ?? true,
        isPublic: body.isPublic ?? true,
      },
    });
    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.PLAN_CREATE,
      resource: "SubscriptionPlan",
      resourceId: plan.id,
      details: { name: plan.name, priceMonthly: plan.priceMonthly },
    });
    return jsonOk({ plan: withPublicMoney({ ...plan }, PLAN_MONEY_KEYS) });
  }, "admin/plans");
}
