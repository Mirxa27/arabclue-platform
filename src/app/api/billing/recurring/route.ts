import { withTenant, jsonOk } from "@/lib/api-controller";
import { getUserRecurringProfiles } from "@/lib/recurring-billing";

export const dynamic = "force-dynamic";

/**
 * GET /api/billing/recurring — List user's recurring billing profiles.
 * Query params:
 *   - status: filter by status (ACTIVE, CANCELED, etc.)
 */
export async function GET(req: Request) {
  return withTenant("session", async ({ session }) => {
    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status") ?? undefined;

    const profiles = await getUserRecurringProfiles(session.user.id, {
      status: statusFilter,
    });

    return jsonOk({
      profiles: profiles.map((p) => ({
        id: p.id,
        recurringId: p.recurringId,
        status: p.status,
        recurringType: p.recurringType,
        intervalDays: p.intervalDays,
        amount: p.amount,
        currency: p.currency,
        planId: p.planId,
        subscriptionId: p.subscriptionId,
        nextChargeAt: p.nextChargeAt?.toISOString() ?? null,
        lastChargeAt: p.lastChargeAt?.toISOString() ?? null,
        failedCharges: p.failedCharges,
        lastFailureReason: p.lastFailureReason,
        createdAt: p.createdAt.toISOString(),
      })),
    });
  }, "list recurring profiles");
}
