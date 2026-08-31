import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import { fulfillCheckout } from "@/lib/billing";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

export const dynamic = "force-dynamic";

// GET /api/billing/callback?ref=&paymentId=&status=
//
// Redirect-confirmation endpoint for the MyFatoorah return page
// (`/billing/callback`). It never activates entitlements from the redirect
// alone: it resolves the caller's own checkout and defers to
// `fulfillCheckout`, which re-queries the gateway and verifies amounts.
// The webhook and the reconcile cron remain the durable fulfillment paths;
// this endpoint exists so the user who just paid sees the truth immediately.
export async function GET(req: NextRequest) {
  return withTenant("session", async ({ session }) => {
    const params = new URL(req.url).searchParams;
    const ref = params.get("ref");
    const paymentId = params.get("paymentId");

    // The one-time ErrorUrl is `/billing/callback?status=error` and carries no
    // payment reference, so cancellation has to be read here or the user who
    // backed out is told their reference is missing instead.
    if (params.get("status") === "error" && !paymentId) {
      return jsonOk({ ok: false, error: "payment_cancelled_or_failed" });
    }

    if (!ref && !paymentId) {
      return jsonOk({ ok: false, error: "missing_payment_reference" });
    }

    // Status inquiries hit MyFatoorah; cap probing the same way checkout does.
    const blocked = await checkAiRateLimit({
      route: "billing.callback",
      identifier: session.user.id,
      scope: "user",
      limit: 12,
      windowMs: 60_000,
    });
    if (blocked) {
      throw new ApiError(
        "Too many confirmation attempts. Please wait a moment.",
        429,
        "RATE_LIMITED"
      );
    }

    const checkout = ref
      ? await db.paymentCheckout.findUnique({
          where: { customerReference: ref },
        })
      : await db.paymentCheckout.findFirst({ where: { paymentId } });

    // Unknown reference and someone else's checkout answer identically so the
    // endpoint cannot be used to probe other tenants' payment state. The
    // operator still gets to see the probe.
    if (checkout && checkout.userId !== session.user.id) {
      await audit({
        userId: session.user.id,
        action: AUDIT_ACTIONS.BILLING_CALLBACK,
        resource: "PaymentCheckout",
        details: { reason: "callback_ownership_mismatch", ref, paymentId },
        severity: "WARN",
        success: false,
      });
    }
    if (!checkout || checkout.userId !== session.user.id) {
      return jsonOk({ ok: false, error: "checkout_not_found" });
    }

    const result = await fulfillCheckout({
      checkoutId: checkout.id,
      paymentId,
    });

    return jsonOk(
      result.ok
        ? { ok: true }
        : { ok: false, error: result.error ?? "not_paid" }
    );
  }, "billing-callback");
}
