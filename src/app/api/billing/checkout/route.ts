import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  withTenant,
  jsonOk,
  ApiError,
} from "@/lib/api-controller";
import { parseJsonBody, billingCheckoutSchema } from "@/lib/validation";
import { sendPayment, appBaseUrl } from "@/lib/myfatoorah";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { startRecurringProfile, RecurringBillingError } from "@/lib/recurring-billing";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

// POST /api/billing/checkout — create MyFatoorah invoice and return payment URL
export async function POST(req: NextRequest) {
  return withTenant("session", async ({ session }) => {
    const parsed = await parseJsonBody(req, billingCheckoutSchema);
    if (!parsed.ok) return parsed.response;
    const { planId, billingCycle, locale } = parsed.data;

    const plan = await db.subscriptionPlan.findFirst({
      where: { id: planId, isActive: true, isPublic: true },
    });
    if (!plan) throw new ApiError("Plan not found", 404);

    const amount =
      billingCycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly;
    if (amount <= 0) {
      throw new ApiError(
        "This plan is free — contact an administrator to assign it",
        400
      );
    }

    const customerReference = `ac_${randomBytes(12).toString("hex")}`;
    const base = appBaseUrl();
    // MyFatoorah rejects localhost — use NEXTAUTH_URL in deployed environments
    const callBackUrl = `${base}/billing/callback?status=success`;
    const errorUrl = `${base}/billing/callback?status=error`;
    const webhookUrl = `${base}/api/billing/webhook`;

    const billingRecord = await db.billingRecord.create({
      data: {
        userId: session.user.id,
        type: "SUBSCRIPTION",
        amount,
        currency: plan.currency || "SAR",
        description: `${plan.name} (${billingCycle}) via MyFatoorah`,
        status: "PENDING",
        paymentMethod: "myfatoorah",
        invoiceNumber: customerReference,
        metadata: JSON.stringify({ planId, billingCycle }),
      },
    });

    const checkout = await db.paymentCheckout.create({
      data: {
        userId: session.user.id,
        planId: plan.id,
        billingCycle,
        amount,
        currency: plan.currency || "SAR",
        status: "PENDING",
        customerReference,
        billingRecordId: billingRecord.id,
      },
    });

    try {
      const invoice = await sendPayment({
        customerName: session.user.name || session.user.email,
        customerEmail: session.user.email,
        invoiceValue: amount,
        currencyIso: plan.currency || "SAR",
        customerReference,
        callBackUrl: `${callBackUrl}&ref=${customerReference}`,
        errorUrl: `${errorUrl}&ref=${customerReference}`,
        language: locale === "en" ? "EN" : "AR",
        userDefinedField: checkout.id,
        webhookUrl,
        invoiceItems: [
          {
            ItemName: `Arabclue ${plan.name} — ${billingCycle}`,
            Quantity: 1,
            UnitPrice: amount,
          },
        ],
      });

      await db.paymentCheckout.update({
        where: { id: checkout.id },
        data: {
          invoiceId: invoice.invoiceId,
          paymentUrl: invoice.invoiceUrl,
        },
      });
      await db.billingRecord.update({
        where: { id: billingRecord.id },
        data: { externalInvoiceId: invoice.invoiceId },
      });

      // Try to set up recurring billing for MONTHLY/YEARLY plans
      let recurringProfileId: string | null = null;
      if (billingCycle === "MONTHLY" || billingCycle === "YEARLY") {
        try {
          // The recurring profile and its checkout intent both reference a real
          // Subscription row. A subscription created here carries status
          // "PENDING", which grants no entitlement (see assertWithinQuota) until
          // confirmCheckout activates it on verified payment.
          const now = new Date();
          const existingSub = await db.subscription.findUnique({
            where: { userId: session.user.id },
            select: { id: true },
          });
          const subscriptionId =
            existingSub?.id ??
            (
              await db.subscription.create({
                data: {
                  userId: session.user.id,
                  planId: plan.id,
                  status: "PENDING",
                  billingCycle,
                  currentPeriodStart: now,
                  currentPeriodEnd: now,
                },
                select: { id: true },
              })
            ).id;

          // Criterion 9.1: no amount is passed. The service copies the stored
          // plan cycle price and currency itself.
          const profile = await startRecurringProfile({
            userId: session.user.id,
            workspaceId: session.user.workspaceId,
            subscriptionId,
            planId: plan.id,
            interval: billingCycle,
            customerReference,
            initialInvoiceId: invoice.invoiceId,
            customerName: session.user.name || session.user.email,
            customerEmail: session.user.email,
          });
          recurringProfileId = profile.id;

          await audit({
            userId: session.user.id,
            action: AUDIT_ACTIONS.BILLING_CHANGE,
            resource: "PaymentCheckout",
            resourceId: checkout.id,
            details: {
              recurringProfileId: profile.id,
              recurringId: profile.recurringId,
              message: "Recurring billing profile created",
            },
          });
        } catch (err) {
          // If merchant rejects recurring (422) or not supported, log warning and continue single-cycle
          const isRecurringRejection =
            err instanceof RecurringBillingError &&
            (err.httpStatus === 422 || err.code === "NO_PAYMENT_METHODS");

          if (isRecurringRejection || (err instanceof Error && /recurring.*not.*available/i.test(err.message))) {
            console.warn(
              "[checkout] Recurring billing rejected by merchant, continuing with single-cycle:",
              err instanceof Error ? err.message : err
            );
            await audit({
              userId: session.user.id,
              action: AUDIT_ACTIONS.BILLING_CHANGE,
              resource: "PaymentCheckout",
              resourceId: checkout.id,
              details: {
                warning: "Recurring billing not available",
                error: err instanceof Error ? err.message : "unknown",
                fallback: "single-cycle",
              },
              severity: "WARN",
            });
          } else {
            // Log other errors but don't fail checkout
            console.error("[checkout] Failed to start recurring profile:", err);
          }
        }
      }

      await audit({
        userId: session.user.id,
        action: AUDIT_ACTIONS.BILLING_CHANGE,
        resource: "PaymentCheckout",
        resourceId: checkout.id,
        details: {
          planId,
          billingCycle,
          amount,
          invoiceId: invoice.invoiceId,
          recurringProfileId,
        },
      });

      return jsonOk({
        checkoutId: checkout.id,
        paymentUrl: invoice.invoiceUrl,
        invoiceId: invoice.invoiceId,
        amount,
        currency: plan.currency || "SAR",
        recurringProfileId,
      });
    } catch (err) {
      await db.paymentCheckout.update({
        where: { id: checkout.id },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "checkout_failed",
        },
      });
      await db.billingRecord.update({
        where: { id: billingRecord.id },
        data: { status: "FAILED" },
      });
      throw err instanceof Error
        ? new ApiError(err.message, 502)
        : new ApiError("MyFatoorah checkout failed", 502);
    }
  }, "billing checkout");
}
