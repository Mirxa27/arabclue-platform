import { NextRequest } from "next/server";
import { fulfillCheckout } from "@/lib/billing";
import { verifyWebhookSignature } from "@/lib/myfatoorah";
import { handleRoute, jsonOk, jsonError } from "@/lib/api-controller";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/webhook — MyFatoorah server-to-server events (public).
 * Verifies HMAC signature when MYFATOORAH_WEBHOOK_SECRET is set.
 */
export async function POST(req: NextRequest) {
  return handleRoute("billing webhook", async () => {
    const rawBody = await req.text();
    const signature =
      req.headers.get("MyFatoorah-Signature") ||
      req.headers.get("myfatoorah-signature");

    const valid = await verifyWebhookSignature(rawBody, signature);
    if (!valid) {
      return jsonError("Invalid webhook signature", 401);
    }

    let payload: {
      EventType?: number | string;
      Event?: string;
      Data?: {
        InvoiceId?: number | string;
        CustomerReference?: string;
        InvoiceStatus?: string;
        TransactionStatus?: string;
        PaymentId?: string | number;
      };
    };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return jsonError("Invalid JSON", 400);
    }

    const data = payload.Data ?? {};
    const invoiceStatus = (
      data.InvoiceStatus ||
      data.TransactionStatus ||
      ""
    ).toString();

    if (!/^paid$/i.test(invoiceStatus)) {
      // Acknowledge non-paid events without failing MF retries
      return jsonOk({
        ok: true,
        ignored: true,
        status: invoiceStatus,
      });
    }

    const result = await fulfillCheckout({
      invoiceId: data.InvoiceId != null ? String(data.InvoiceId) : null,
      customerReference: data.CustomerReference ?? undefined,
      paymentId: data.PaymentId != null ? String(data.PaymentId) : null,
    });

    return jsonOk(result);
  });
}
