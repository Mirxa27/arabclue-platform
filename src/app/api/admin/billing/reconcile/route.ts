import { NextRequest } from "next/server";
import { withAdmin, jsonOk } from "@/lib/api-controller";
import { reconcilePendingCheckouts } from "@/lib/billing";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/billing/reconcile — reconcile pending MyFatoorah checkouts.
 * GET — reconciliation health summary.
 */
export async function GET() {
  return withAdmin(async () => {
    const [pending, paid24h, failed24h, webhookFailed] = await Promise.all([
      db.paymentCheckout.count({ where: { status: "PENDING" } }),
      db.paymentCheckout.count({
        where: {
          status: "PAID",
          paidAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      db.paymentCheckout.count({
        where: {
          status: "FAILED",
          updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      db.paymentWebhookEvent.count({
        where: { processingStatus: "FAILED" },
      }),
    ]);

    return jsonOk({
      pendingCheckouts: pending,
      paidLast24h: paid24h,
      failedLast24h: failed24h,
      failedWebhooks: webhookFailed,
      healthy: pending < 50 && webhookFailed < 20,
    });
  }, "billing reconcile health");
}

export async function POST(req: NextRequest) {
  return withAdmin(async (session) => {
    let olderThanMinutes = 5;
    let limit = 50;
    try {
      const body = await req.json();
      if (typeof body.olderThanMinutes === "number") {
        olderThanMinutes = body.olderThanMinutes;
      }
      if (typeof body.limit === "number") {
        limit = Math.min(200, body.limit);
      }
    } catch {
      /* empty body ok */
    }

    const result = await reconcilePendingCheckouts({ olderThanMinutes, limit });
    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.BILLING_CHANGE,
      resource: "PaymentCheckout",
      details: { action: "reconcile", ...result },
      severity: "INFO",
    });
    return jsonOk(result);
  }, "billing reconcile");
}
