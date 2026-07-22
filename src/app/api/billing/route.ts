import { db } from "@/lib/db";
import { withTenant, jsonOk } from "@/lib/api-controller";
import { getDecryptedEnv } from "@/lib/env-settings";

export const dynamic = "force-dynamic";

// GET /api/billing — plans + current subscription + usage + history
export async function GET() {
  return withTenant("session", async ({ session }) => {
    const [plans, subscription, records, pendingCheckouts, mfKey] =
      await Promise.all([
        db.subscriptionPlan.findMany({
          where: { isActive: true, isPublic: true },
          orderBy: { priceMonthly: "asc" },
        }),
        db.subscription.findUnique({
          where: { userId: session.user.id },
          include: { plan: true },
        }),
        db.billingRecord.findMany({
          where: { userId: session.user.id },
          orderBy: { createdAt: "desc" },
          take: 30,
        }),
        db.paymentCheckout.findMany({
          where: {
            userId: session.user.id,
            status: { in: ["PENDING", "PAID"] },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { plan: { select: { name: true, nameAr: true } } },
        }),
        getDecryptedEnv("MYFATOORAH_API_KEY"),
      ]);

    return jsonOk({
      plans,
      subscription,
      records,
      checkouts: pendingCheckouts,
      myfatoorahConfigured: Boolean(mfKey?.trim()),
    });
  }, "billing GET");
}
