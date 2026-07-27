import { NextRequest } from "next/server";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import {
  resumeRecurringProfile,
  getRecurringProfileById,
  RecurringBillingError,
} from "@/lib/recurring-billing";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/billing/recurring/[id]/resume — Resume a canceled recurring billing profile.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  return withTenant("session", async ({ session }) => {
    const { id } = await params;

    // Verify profile belongs to user
    const profile = await getRecurringProfileById(id, session.user.id);
    if (!profile) {
      throw new ApiError("Recurring profile not found", 404);
    }

    try {
      const updated = await resumeRecurringProfile(profile.recurringId, session.user.id);
      return jsonOk({
        ok: true,
        profile: {
          id: updated.id,
          recurringId: updated.recurringId,
          status: updated.status,
          amount: updated.amount,
          currency: updated.currency,
          intervalDays: updated.intervalDays,
          nextChargeAt: updated.nextChargeAt?.toISOString() ?? null,
          lastChargeAt: updated.lastChargeAt?.toISOString() ?? null,
        },
      });
    } catch (err) {
      if (err instanceof RecurringBillingError) {
        throw new ApiError(err.message, err.httpStatus);
      }
      throw err;
    }
  }, "resume recurring profile");
}
