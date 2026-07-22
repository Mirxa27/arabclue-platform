import { NextRequest } from "next/server";
import { fulfillCheckout } from "@/lib/billing";
import { handleRoute, jsonOk, jsonError } from "@/lib/api-controller";

export const dynamic = "force-dynamic";

/**
 * GET /api/billing/callback?paymentId=...&Id=...&ref=...
 * Called by the browser after MyFatoorah redirect (authenticated session).
 * Also accepts PaymentId query param naming variants from MF.
 */
export async function GET(req: NextRequest) {
  return handleRoute("billing callback", async () => {
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

    const result = await fulfillCheckout({
      paymentId,
      customerReference: ref ?? undefined,
    });

    return jsonOk(result);
  });
}
