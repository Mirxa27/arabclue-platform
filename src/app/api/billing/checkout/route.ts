import { redactSensitiveText } from "@/lib/api-failure";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hasSettledPayment, resolveGoverningSubscription } from "@/lib/quotas";
import {
  withTenant,
  jsonOk,
  ApiError,
} from "@/lib/api-controller";
import { parseJsonBody, billingCheckoutSchema } from "@/lib/validation";
import { sendPayment, appBaseUrl } from "@/lib/myfatoorah";
import { moneyNumber } from "@/lib/money";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { startRecurringProfile, RecurringBillingError } from "@/lib/recurring-billing";
import { isCompletionErrorCode } from "@/lib/i18n";
import { resolveEmailVerifiedClaim } from "@/lib/email-verification-policy";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import {
  analyticsRequestOrigin,
  recordActivationAnalyticsEvent,
} from "@/lib/analytics-collector";
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
  return withTenant("session", async ({ session, workspace }) => {
    if (!resolveEmailVerifiedClaim(session.user.emailVerified)) {
      throw new ApiError(
        "Email verification required",
        403,
        "EMAIL_VERIFICATION_REQUIRED"
      );
    }

    // Cap invoice creation attempts. Real users rarely trigger checkout more
    // than a few times per minute; a script scraping payment URLs to embed
    // in phishing pages would trigger this quickly.
    const blocked = await checkAiRateLimit({
      route: "billing.checkout",
      identifier: session.user.id,
      scope: "user",
      limit: 6,
      windowMs: 60_000,
    });
    if (blocked) {
      throw new ApiError(
        "Too many checkout attempts. Please wait a moment.",
        429,
        "RATE_LIMITED"
      );
    }

    const parsed = await parseJsonBody(req, billingCheckoutSchema);
    if (!parsed.ok) return parsed.response;
    const { planId, billingCycle, billingMode, locale } = parsed.data;

    // A teammate's purchase would create a subscription row the quotas never
    // read (they follow the workspace owner's), so refuse it up front.
    const governing = await resolveGoverningSubscription(session.user.id);
    if (!governing.isOwnRow) {
      throw new ApiError(
        "Billing for this workspace is managed by its owner",
        403,
        "BILLING_OWNER_ONLY"
      );
    }

    const plan = await db.subscriptionPlan.findFirst({
      where: { id: planId, isActive: true, isPublic: true },
    });
    if (!plan) throw new ApiError("Plan not found", 404);

    // A cheaper plan bought mid-cycle would charge full price now, start a
    // fresh period, and forfeit the paid days of the current one. Until
    // scheduled plan changes exist, the honest answer is "at renewal".
    const current = governing.sub;
    if (
      current &&
      current.status === "ACTIVE" &&
      current.currentPeriodEnd > new Date() &&
      Number(plan.priceMonthly) < Number(current.plan.priceMonthly) &&
      (await hasSettledPayment(current.userId))
    ) {
      throw new ApiError(
        "Downgrades take effect at renewal",
        409,
        "DOWNGRADE_AT_RENEWAL",
        {
          values: {
            date: current.currentPeriodEnd.toISOString().slice(0, 10),
          },
        }
      );
    }

    const amount =
      billingCycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly;
    if (moneyNumber(amount) <= 0) {
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

    // Funnel: the checkout row is the committed mutation; the response stays
    // unchanged whatever the append does (recordCommittedAnalyticsEvent never throws).
    await recordActivationAnalyticsEvent({
      eventType: "checkout_started",
      entityId: checkout.id,
      mutationRef: checkout.id,
      origin: analyticsRequestOrigin({
        tenantWorkspaceId: workspace.id,
        actorUserId: session.user.id,
      }),
      metadata: {
        planId: plan.id,
        billingCycle,
        checkoutId: checkout.id,
        ...(locale ? { locale } : {}),
      },
    });

    try {
      // Recurring setup is required for MONTHLY/YEARLY unless the client
      // explicitly opts into single-cycle (`billingMode: "single"`). Soft-fail
      // fallthrough to single-cycle is not allowed — surface a stable code.
      //
      // Exactly one invoice is created either way. A recurring checkout is paid
      // through the recurring profile's own initial invoice: that is the one
      // whose payment activates the profile at MyFatoorah. Creating a separate
      // one-time invoice as well sent the customer to pay the wrong one, so the
      // profile stayed DRAFT forever and blocked every later checkout.
      let recurringProfileId: string | null = null;
      let invoiceId: string;
      let paymentUrl: string;
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
            customerName: session.user.name || session.user.email,
            customerEmail: session.user.email,
            language: locale === "en" ? "EN" : "AR",
          });
          if (!profile.initialInvoiceId || !profile.paymentUrl) {
            throw new RecurringBillingError(
              "MyFatoorah returned a recurring profile without a payable invoice",
              "RECURRING_UNAVAILABLE",
              503
            );
          }
          recurringProfileId = profile.id;
          invoiceId = profile.initialInvoiceId;
          paymentUrl = profile.paymentUrl;

          await audit({
            userId: session.user.id,
            action: AUDIT_ACTIONS.BILLING_CHANGE,
            resource: "PaymentCheckout",
            resourceId: checkout.id,
            details: {
              recurringProfileId: profile.id,
              recurringId: profile.recurringId,
              initialInvoiceId: profile.initialInvoiceId,
              message: "Recurring billing profile created",
            },
          });
        } catch (err) {
          const message =
            redactSensitiveText(err instanceof Error ? err.message : "recurring_setup_failed");
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
      } else {
        const invoice = await sendPayment({
          customerName: session.user.name || session.user.email,
          customerEmail: session.user.email,
          invoiceValue: moneyNumber(amount),
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
              UnitPrice: moneyNumber(amount),
            },
          ],
        });
        invoiceId = invoice.invoiceId;
        paymentUrl = invoice.invoiceUrl;
      }

      // The checkout carries the invoice the customer is sent to pay, so the
      // webhook and the callback both resolve this row from it.
      await db.paymentCheckout.update({
        where: { id: checkout.id },
        data: { invoiceId, paymentUrl },
      });
      await db.billingRecord.update({
        where: { id: billingRecord.id },
        data: { externalInvoiceId: invoiceId },
      });

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
          invoiceId,
          recurringProfileId,
        },
      });

      return jsonOk({
        checkoutId: checkout.id,
        paymentUrl,
        invoiceId,
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
        redactSensitiveText(err instanceof Error ? err.message : "checkout_failed")
      );
      throw err instanceof Error
        ? new ApiError(err.message, 502)
        : new ApiError("MyFatoorah checkout failed", 502);
    }
  }, "billing checkout");
}
