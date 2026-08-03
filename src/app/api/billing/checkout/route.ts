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
import { isCompletionErrorCode } from "@/lib/i18n";
import { resolveEmailVerifiedClaim } from "@/lib/email-verification-policy";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

async function markCheckoutFailed(
  checkoutId: string,
  billingRecordId: string,
  message: string
): Promise<void> {
  await db.paymentCheckout.update({
    where: { id: checkoutId },
    data: {
      status: "FAILED",
      errorMessage: message.slice(0, 500),
    },
  });
  await db.billingRecord.update({
    where: { id: billingRecordId },
    data: { status: "FAILED" },
  });
}

// POST /api/billing/checkout — create MyFatoorah invoice and return payment URL
export async function POST(req: NextRequest) {
  return withTenant("session", async ({ session }) => {
    if (!resolveEmailVerifiedClaim(session.user.emailVerified)) {
      throw new ApiError(
        "Email verification required",
        403,
        "EMAIL_VERIFICATION_REQUIRED"
      );
    }
    const parsed = await parseJsonBody(req, billingCheckoutSchema);
    if (!parsed.ok) return parsed.response;
    const { planId, billingCycle, billingMode, locale } = parsed.data;

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

      // Recurring setup is required for MONTHLY/YEARLY unless the client
      // explicitly opts into single-cycle (`billingMode: "single"`). Soft-fail
      // fallthrough to single-cycle is not allowed — surface a stable code.
      let recurringProfileId: string | null = null;
      const wantsRecurring =
        billingMode === "recurring" &&
        (billingCycle === "MONTHLY" || billingCycle === "YEARLY");

      if (wantsRecurring) {
        try {
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
          const message =
            err instanceof Error ? err.message : "recurring_setup_failed";
          await markCheckoutFailed(checkout.id, billingRecord.id, message);
          await audit({
            userId: session.user.id,
            action: AUDIT_ACTIONS.BILLING_CHANGE,
            resource: "PaymentCheckout",
            resourceId: checkout.id,
            details: {
              error: message,
              billingMode,
              code:
                err instanceof RecurringBillingError
                  ? err.code
                  : "RECURRING_UNAVAILABLE",
            },
            severity: "ERROR",
          });

          if (err instanceof RecurringBillingError) {
            const code = isCompletionErrorCode(err.code)
              ? err.code
              : "RECURRING_UNAVAILABLE";
            throw new ApiError(err.message, err.httpStatus, code);
          }
          throw new ApiError(
            message,
            503,
            "RECURRING_UNAVAILABLE"
          );
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
          billingMode,
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
        billingMode,
        recurringProfileId,
      });
    } catch (err) {
      if (err instanceof ApiError) throw err;
      await markCheckoutFailed(
        checkout.id,
        billingRecord.id,
        err instanceof Error ? err.message : "checkout_failed"
      );
      throw err instanceof Error
        ? new ApiError(err.message, 502)
        : new ApiError("MyFatoorah checkout failed", 502);
    }
  }, "billing checkout");
}
