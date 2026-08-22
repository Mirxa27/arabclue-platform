import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { parseJsonBody, withAdmin } from "@/lib/api-controller";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { adminBillingCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

// GET /api/admin/billing — revenue, usage, recent billing records
export async function GET() {
  return withAdmin(async () => {
  await getBootstrapContext();

  const [records, activeSubs, allSubs, plans] = await Promise.all([
    db.billingRecord.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { name: true, email: true } } },
    }),
    db.subscription.count({ where: { status: "ACTIVE" } }),
    db.subscription.findMany({
      include: {
        plan: true,
        user: { select: { name: true, email: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.subscriptionPlan.findMany({ orderBy: { priceMonthly: "asc" } }),
  ]);

  // Revenue: sum of paid billing records
  const revenue = records
    .filter((r) => r.status === "PAID")
    .reduce((sum, r) => sum + r.amount, 0);

  // MRR: sum of active monthly subscriptions
  const mrr = allSubs
    .filter((s) => s.status === "ACTIVE" && s.billingCycle === "MONTHLY")
    .reduce((sum, s) => sum + (s.plan?.priceMonthly ?? 0), 0);

  // Usage aggregation
  const totalProposalsUsed = allSubs.reduce((s, sub) => s + sub.proposalsUsed, 0);
  const totalTokensUsed = allSubs.reduce((s, sub) => s + sub.tokensUsed, 0);
  const totalDocumentsUsed = allSubs.reduce((s, sub) => s + sub.documentsUsed, 0);

  return NextResponse.json({
    records,
    subscriptions: allSubs,
    plans,
    stats: {
      activeSubscriptions: activeSubs,
      totalSubscriptions: allSubs.length,
      totalRevenue: revenue,
      mrr,
      totalProposalsUsed,
      totalTokensUsed,
      totalDocumentsUsed,
    },
  });
  }, "admin/billing");
}

// POST /api/admin/billing — record a manual billing event (topup/usage/refund)
export async function POST(req: NextRequest) {
  return withAdmin(async (session) => {
  await getBootstrapContext();
  const body = await parseJsonBody(req, adminBillingCreateSchema);
  const record = await db.billingRecord.create({
    data: {
      userId: body.userId,
      type: body.type ?? "TOPUP",
      amount: body.amount ?? 0,
      currency: "SAR",
      description: body.description ?? "Manual adjustment",
      tokensIncluded: body.tokensIncluded ?? 0,
      proposalsIncluded: body.proposalsIncluded ?? 0,
      status: body.status ?? "PAID",
      invoiceNumber: body.invoiceNumber ?? `INV-${crypto.randomUUID()}`,
      paymentMethod: body.paymentMethod ?? "bank_transfer",
    },
  });

  // Increment the user's subscription usage counters for topups
  if (body.type === "TOPUP" || body.type === "USAGE") {
    await db.subscription.updateMany({
      where: { userId: body.userId },
      data: {
        proposalsUsed: { increment: body.proposalsIncluded ?? 0 },
        tokensUsed: { increment: body.tokensIncluded ?? 0 },
      },
    });
  }

  await audit({
    userId: session.user.id,
    action: AUDIT_ACTIONS.BILLING_CHANGE,
    resource: "BillingRecord",
    resourceId: record.id,
    details: { userId: body.userId, amount: record.amount, type: record.type },
    severity: "WARN",
  });
  return NextResponse.json({ record });
  }, "admin/billing");
}
