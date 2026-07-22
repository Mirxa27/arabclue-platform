import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { requireAdmin } from "@/lib/auth";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { DEFAULT_PLANS } from "@/lib/constants";

export const dynamic = "force-dynamic";

// GET /api/admin/plans
export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await getBootstrapContext();
  const plans = await db.subscriptionPlan.findMany({
    orderBy: [{ priceMonthly: "asc" }],
    include: { _count: { select: { subscriptions: true } } },
  });
  return NextResponse.json({ plans, defaults: DEFAULT_PLANS });
}

// POST /api/admin/plans — create a plan
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await getBootstrapContext();
  const body = await req.json();
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
  return NextResponse.json({ plan });
}
