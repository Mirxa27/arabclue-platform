import { db } from "@/lib/db";
import { withTenant, jsonOk } from "@/lib/api-controller";
import { getDecryptedEnv } from "@/lib/env-settings";
import {
  AMOUNT_MONEY_KEYS,
  PLAN_MONEY_KEYS,
  withPublicMoney,
} from "@/lib/money";
import { hasSettledPayment, resolveEntitlementState } from "@/lib/quotas";

export const dynamic = "force-dynamic";

// GET /api/billing — plans + current subscription + usage + history
export async function GET() {
  return withTenant("session", async ({ session }) => {
    const [plans, subscription, records, pendingCheckouts, mfKey, hasPaid] =
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
        hasSettledPayment(session.user.id),
      ]);

    const entitlement = resolveEntitlementState(
      subscription ? { ...subscription, hasPaid } : null
    );
    const trial =
      entitlement.kind === "TRIAL"
        ? {
            active: true,
            endsAt: entitlement.endsAt.toISOString(),
            daysLeft: entitlement.daysLeft,
          }
        : entitlement.kind === "TRIAL_ENDED"
          ? { active: false, endsAt: entitlement.endedAt.toISOString(), daysLeft: 0 }
          : { active: false, endsAt: null, daysLeft: null };

    return jsonOk({
      /** Read-time classification of `subscription`; see resolveEntitlementState. */
      entitlement: entitlement.kind,
      trial,
      plans: plans.map((plan) => withPublicMoney({ ...plan }, PLAN_MONEY_KEYS)),
      subscription: subscription
        ? {
            ...subscription,
            plan: subscription.plan
              ? withPublicMoney({ ...subscription.plan }, PLAN_MONEY_KEYS)
              : subscription.plan,
          }
        : subscription,
      records: records.map((record) =>
        withPublicMoney({ ...record }, AMOUNT_MONEY_KEYS)
      ),
      checkouts: pendingCheckouts.map((checkout) =>
        withPublicMoney({ ...checkout }, AMOUNT_MONEY_KEYS)
      ),
      myfatoorahConfigured: Boolean(mfKey?.trim()),
    });
  }, "billing GET");
}
