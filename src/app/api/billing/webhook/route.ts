import { NextRequest } from "next/server";
import { fulfillCheckout } from "@/lib/billing";
import {
  verifyWebhookSignature,
  webhookEventFingerprint,
  type WebhookV2Body,
} from "@/lib/myfatoorah";
import { handleRoute, jsonOk, jsonError } from "@/lib/api-controller";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/webhook — MyFatoorah Webhook V2 (public).
 * Verifies myfatoorah-signature via event-specific HMAC-SHA256 canonicalization.
 * Persists event before processing; idempotent on event fingerprint.
 */
export async function POST(req: NextRequest) {
  return handleRoute("billing webhook", async () => {
    const rawBody = await req.text();
    const signature =
      req.headers.get("MyFatoorah-Signature") ||
      req.headers.get("myfatoorah-signature");

    let payload: WebhookV2Body;
    try {
      payload = JSON.parse(rawBody) as WebhookV2Body;
    } catch {
      return jsonError("Invalid JSON", 400);
    }

    const valid = await verifyWebhookSignature(rawBody, signature, payload);
    if (!valid) {
      return jsonError("Invalid webhook signature", 401);
    }

    const fingerprint = webhookEventFingerprint(payload, signature);
    const eventName = payload.Event?.Name ?? String(payload.EventType ?? "");
    const eventCode =
      typeof payload.Event?.Code === "number" ? payload.Event.Code : null;
    const eventReference = payload.Event?.Reference ?? null;

    const data = payload.Data ?? {};
    const invoiceId = String(
      (data.Invoice as { Id?: string | number } | undefined)?.Id ??
        data.InvoiceId ??
        ""
    );
    const paymentId = String(
      (data.Transaction as { PaymentId?: string } | undefined)?.PaymentId ??
        data.PaymentId ??
        ""
    );
    const recurringId = String(
      (data.Recurring as { Id?: string } | undefined)?.Id ??
        data.RecurringId ??
        ""
    );
    const customerReference = String(
      (data.Invoice as { ExternalIdentifier?: string } | undefined)
        ?.ExternalIdentifier ??
        data.CustomerReference ??
        ""
    );

    // Durable receipt before side effects
    const existing = await db.paymentWebhookEvent.findUnique({
      where: { eventFingerprint: fingerprint },
    });
    if (existing?.processingStatus === "PROCESSED") {
      return jsonOk({ ok: true, duplicate: true, id: existing.id });
    }

    const eventRow =
      existing ??
      (await db.paymentWebhookEvent.create({
        data: {
          eventFingerprint: fingerprint,
          eventName: eventName || null,
          eventCode,
          eventReference,
          invoiceId: invoiceId || null,
          paymentId: paymentId || null,
          recurringId: recurringId || null,
          customerReference: customerReference || null,
          signatureValid: true,
          processingStatus: "RECEIVED",
          attempts: 0,
          payloadRedacted: JSON.stringify({
            Event: payload.Event,
            DataKeys: Object.keys(data),
            InvoiceStatus:
              (data.Invoice as { Status?: string } | undefined)?.Status ??
              data.InvoiceStatus ??
              null,
            TransactionStatus:
              (data.Transaction as { Status?: string } | undefined)?.Status ??
              data.TransactionStatus ??
              null,
          }),
        },
      }));

    await db.paymentWebhookEvent.update({
      where: { id: eventRow.id },
      data: { attempts: { increment: 1 } },
    });

    try {
      // Recurring status updates
      if (eventName === "RECURRING_UPDATES" && recurringId) {
        const status = String(
          (data.Recurring as { Status?: string } | undefined)?.Status ?? ""
        ).toUpperCase();
        await db.myFatoorahRecurringProfile.updateMany({
          where: { recurringId },
          data: {
            status: status || "ACTIVE",
            lastWebhookAt: new Date(),
            initialInvoiceId:
              String(
                (data.Recurring as { InitialInvoiceId?: string | number } | undefined)
                  ?.InitialInvoiceId ?? ""
              ) || undefined,
          },
        });
        await db.paymentWebhookEvent.update({
          where: { id: eventRow.id },
          data: {
            processingStatus: "PROCESSED",
            disposition: `recurring_${status || "updated"}`,
            processedAt: new Date(),
          },
        });
        return jsonOk({ ok: true, recurring: true, id: eventRow.id });
      }

      const invoiceStatus = String(
        (data.Invoice as { Status?: string } | undefined)?.Status ||
          data.InvoiceStatus ||
          data.TransactionStatus ||
          (data.Transaction as { Status?: string } | undefined)?.Status ||
          ""
      );
      const txStatus = String(
        (data.Transaction as { Status?: string } | undefined)?.Status || ""
      );
      const isPaid =
        /^paid$/i.test(invoiceStatus) ||
        /^(succss|success)$/i.test(txStatus);

      if (!isPaid) {
        await db.paymentWebhookEvent.update({
          where: { id: eventRow.id },
          data: {
            processingStatus: "IGNORED",
            disposition: `status_${invoiceStatus || txStatus || "unknown"}`,
            processedAt: new Date(),
          },
        });
        return jsonOk({
          ok: true,
          ignored: true,
          status: invoiceStatus || txStatus,
          id: eventRow.id,
        });
      }

      const result = await fulfillCheckout({
        invoiceId: invoiceId || null,
        customerReference: customerReference || undefined,
        paymentId: paymentId || null,
      });

      await db.paymentWebhookEvent.update({
        where: { id: eventRow.id },
        data: {
          processingStatus: result.ok ? "PROCESSED" : "FAILED",
          disposition: result.ok ? "fulfilled" : result.error,
          errorMessage: result.ok ? null : result.error,
          processedAt: new Date(),
        },
      });

      return jsonOk({ ...result, webhookEventId: eventRow.id });
    } catch (err) {
      await db.paymentWebhookEvent.update({
        where: { id: eventRow.id },
        data: {
          processingStatus: "FAILED",
          errorMessage: err instanceof Error ? err.message : "webhook_failed",
        },
      });
      throw err;
    }
  });
}
