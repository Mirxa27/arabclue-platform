import { NextRequest } from "next/server";
import { fulfillCheckout } from "@/lib/billing";
import { withTenant, jsonOk, jsonError } from "@/lib/api-controller";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * GET /api/billing/callback?paymentId=...&Id=...&ref=...
 * Authenticated + ownership check: checkout must belong to caller.
 * Rate-limited to prevent ref guessing brute force.
 */
export async function GET(req: NextRequest) {
  return withTenant("session", async ({ session, userId }) => {
    const rl = rateLimit({ key: `billing:callback:${userId}`, limit: 10, windowMs: 5 * 60 * 1000 });
    if (!rl.ok) return jsonError("rate_limited", 429);

    const paymentId =
      req.nextUrl.searchParams.get("paymentId") ||
      req.nextUrl.searchParams.get("PaymentId") ||
      req.nextUrl.searchParams.get("Id");
    const ref = req.nextUrl.searchParams.get("ref");
    const status = req.nextUrl.searchParams.get("status");

    if (status === "error" && !paymentId) {
      return jsonOk({
        ok: false,
        error: "payment_cancelled_or_failed",
        customerReference: ref,
      });
    }

    if (!paymentId && !ref) {
      return jsonError("paymentId or ref is required", 400);
    }

    // Ownership pre-check when ref is provided
    if (ref) {
      const checkout = await db.paymentCheckout.findUnique({ where: { customerReference: ref } });
      if (checkout && checkout.userId !== userId) {
        await audit({
          userId,
          action: AUDIT_ACTIONS.BILLING_CHANGE,
          details: { reason: "callback_ownership_mismatch", ref },
          severity: "WARN",
          success: false,
        });
        return jsonError("forbidden: checkout not owned", 403);
      }
    }

    const result = await fulfillCheckout({
      paymentId,
      customerReference: ref ?? undefined,
    });

    // Post-fulfill ownership verification (in case paymentId path)
    if (result.ok && result.checkoutId) {
      const c = await db.paymentCheckout.findUnique({ where: { id: result.checkoutId } });
      if (c && c.userId !== userId) {
        return jsonError("forbidden", 403);
      }
    }

    return jsonOk(result);
  }, "billing callback");
}
