import { NextRequest } from "next/server";
import { fulfillCheckout } from "@/lib/billing";
import {
  verifyWebhookSignature,
  webhookEventFingerprint,
  type WebhookV2Body,
} from "@/lib/myfatoorah";
import {
  handleRecurringChargeSuccess,
  handleRecurringChargeFailure,
} from "@/lib/recurring-billing";
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
            RecurringStatus:
              (data.Recurring as { Status?: string } | undefined)?.Status ??
              null,
          }),
        },
      }));

    await db.paymentWebhookEvent.update({
      where: { id: eventRow.id },
      data: { attempts: { increment: 1 } },
    });

    try {
      // Enhanced recurring status updates handling
      if (eventName === "RECURRING_UPDATES" && recurringId) {
        const recurringData = data.Recurring as {
          Id?: string;
          Status?: string;
          InitialInvoiceId?: string | number;
          Value?: number;
        } | undefined;

        const status = String(recurringData?.Status ?? "").toUpperCase();
        const initialInvoiceId = String(recurringData?.InitialInvoiceId ?? "");
        const recurringValue = recurringData?.Value;

        // Determine if this is a successful charge or failure
        const isSuccessfulCharge =
          status === "ACTIVE" ||
          status === "COMPLETED" ||
          /^(paid|success|succss)$/i.test(status);
        const isFailedCharge =
          status === "FAILED" ||
          status === "UNCOMPLETED" ||
          /^(fail|error|declined|rejected)$/i.test(status);
        const isCanceled = status === "CANCELED" || status === "CANCELLED";

        // Do not mutate profile status before charge handlers — handlers own
        // state transitions, amount/currency checks, and idempotent billing rows.
        if (initialInvoiceId) {
          await db.myFatoorahRecurringProfile.updateMany({
            where: { recurringId },
            data: {
              lastWebhookAt: new Date(),
              initialInvoiceId,
            },
          });
        }

        // Handle successful recurring charge
        if (isSuccessfulCharge && invoiceId) {
          try {
            await handleRecurringChargeSuccess({
              recurringId,
              invoiceId,
              amount: recurringValue,
              paymentId: paymentId || undefined,
            });

            await db.paymentWebhookEvent.update({
              where: { id: eventRow.id },
              data: {
                processingStatus: "PROCESSED",
                disposition: "recurring_charge_success",
                processedAt: new Date(),
              },
            });

            return jsonOk({
              ok: true,
              recurring: true,
              action: "charge_success",
              id: eventRow.id,
            });
          } catch (err) {
            // Do NOT fall through to the acknowledge path. Falling through
            // marked the event PROCESSED and answered 200, so MyFatoorah
            // considered an unapplied charge delivered and never retried it —
            // the customer was billed and the entitlement never granted.
            console.error("[webhook] Failed to handle recurring charge success:", err);
            await db.paymentWebhookEvent.update({
              where: { id: eventRow.id },
              data: {
                processingStatus: "FAILED",
                disposition: "recurring_charge_success_failed",
                errorMessage:
                  err instanceof Error ? err.message.slice(0, 500) : "handler_failed",
              },
            });
            return jsonError(
              "Recurring charge could not be applied; retry delivery",
              500,
              "RECURRING_CHARGE_APPLY_FAILED"
            );
          }
        }

        // Handle failed recurring charge
        if (isFailedCharge) {
          try {
            const failureReason =
              (data.Transaction as { Error?: string } | undefined)?.Error ||
              (data.Error as string | undefined) ||
              status;

            await handleRecurringChargeFailure({
              recurringId,
              reason: failureReason,
            });

            await db.paymentWebhookEvent.update({
              where: { id: eventRow.id },
              data: {
                processingStatus: "PROCESSED",
                disposition: "recurring_charge_failure",
                processedAt: new Date(),
              },
            });

            return jsonOk({
              ok: true,
              recurring: true,
              action: "charge_failure",
              id: eventRow.id,
            });
          } catch (err) {
            // Same reasoning as the success branch: an unrecorded failure must
            // stay retryable rather than be acknowledged as handled.
            console.error("[webhook] Failed to handle recurring charge failure:", err);
            await db.paymentWebhookEvent.update({
              where: { id: eventRow.id },
              data: {
                processingStatus: "FAILED",
                disposition: "recurring_charge_failure_failed",
                errorMessage:
                  err instanceof Error ? err.message.slice(0, 500) : "handler_failed",
              },
            });
            return jsonError(
              "Recurring charge failure could not be recorded; retry delivery",
              500,
              "RECURRING_CHARGE_FAILURE_NOT_RECORDED"
            );
          }
        }

        // Provider-side cancellation — apply only via the cancel transition.
        if (isCanceled) {
          await db.myFatoorahRecurringProfile.updateMany({
            where: {
              recurringId,
              status: { in: ["ACTIVE", "SUSPENDED", "DRAFT", "Active", "Suspended"] },
            },
            data: {
              status: "CANCELLED",
              nextChargeAt: null,
              lastWebhookAt: new Date(),
            },
          });
          await db.paymentWebhookEvent.update({
            where: { id: eventRow.id },
            data: {
              processingStatus: "PROCESSED",
              disposition: "recurring_cancelled",
              processedAt: new Date(),
            },
          });
          return jsonOk({
            ok: true,
            recurring: true,
            action: "cancelled",
            id: eventRow.id,
          });
        }

        // Default: acknowledge without inventing a profile state change
        await db.paymentWebhookEvent.update({
          where: { id: eventRow.id },
          data: {
            processingStatus: "PROCESSED",
            disposition: `recurring_${status.toLowerCase() || "updated"}`,
            processedAt: new Date(),
          },
        });

        return jsonOk({
          ok: true,
          recurring: true,
          status,
          id: eventRow.id,
        });
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
