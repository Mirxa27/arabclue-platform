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
        },
      });

      return jsonOk({
        checkoutId: checkout.id,
        paymentUrl: invoice.invoiceUrl,
        invoiceId: invoice.invoiceId,
        amount,
        currency: plan.currency || "SAR",
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
