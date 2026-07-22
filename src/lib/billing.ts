/**
 * Subscription fulfillment after successful MyFatoorah payment.
 * Idempotent — safe to call from callback and webhook.
 */

import { db } from "./db";
import { audit, AUDIT_ACTIONS } from "./audit";
import { amountsMatch, getPaymentStatus } from "./myfatoorah";

function addPeriod(start: Date, cycle: "MONTHLY" | "YEARLY"): Date {
  const end = new Date(start);
  if (cycle === "YEARLY") {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

/**
 * Mark checkout paid and activate/upgrade the user's subscription.
 * Prefers live status from MyFatoorah when paymentId or invoiceId is known.
 */
export async function fulfillCheckout(opts: {
  checkoutId?: string;
  customerReference?: string;
  paymentId?: string | null;
  invoiceId?: string | null;
}): Promise<{ ok: boolean; checkoutId?: string; error?: string }> {
  let checkout = opts.checkoutId
    ? await db.paymentCheckout.findUnique({
        where: { id: opts.checkoutId },
        include: { plan: true, user: true },
      })
    : opts.customerReference
      ? await db.paymentCheckout.findUnique({
          where: { customerReference: opts.customerReference },
          include: { plan: true, user: true },
        })
      : null;

  if (!checkout && opts.invoiceId) {
    checkout = await db.paymentCheckout.findFirst({
      where: { invoiceId: opts.invoiceId },
      include: { plan: true, user: true },
    });
  }

  if (!checkout) {
    return { ok: false, error: "checkout_not_found" };
  }

  if (checkout.status === "PAID") {
    return { ok: true, checkoutId: checkout.id };
  }

  // Verify with MyFatoorah when we have payment/invoice keys
  let paymentMethod = "myfatoorah";
  let paymentId = opts.paymentId ?? checkout.paymentId;
  let invoiceId = opts.invoiceId ?? checkout.invoiceId;
  let paidValue: number | null = null;
  let paidCurrency: string | null = checkout.currency;

  const assertAmount = (status: {
    invoiceValue: number;
    paidCurrency: string | null;
    isPaid: boolean;
  }) => {
    if (!status.isPaid) return;
    if (
      !amountsMatch({
        expectedSar: checkout!.amount,
        paidSar: status.invoiceValue,
        expectedCurrency: checkout!.currency || "SAR",
        paidCurrency: status.paidCurrency,
      })
    ) {
      throw new Error("amount_currency_mismatch");
    }
    paidValue = status.invoiceValue;
    paidCurrency = status.paidCurrency ?? checkout!.currency;
  };

  try {
    if (opts.paymentId) {
      const status = await getPaymentStatus({
        key: opts.paymentId,
        keyType: "PaymentId",
      });
      if (!status.isPaid) {
        if (status.isFailed) {
          await db.paymentCheckout.update({
            where: { id: checkout.id },
            data: {
              status: "FAILED",
              errorMessage: status.invoiceStatus,
              paymentId: status.paymentId,
              invoiceId: status.invoiceId || checkout.invoiceId,
            },
          });
          if (checkout.billingRecordId) {
            await db.billingRecord.update({
              where: { id: checkout.billingRecordId },
              data: { status: "FAILED" },
            });
          }
        }
        return { ok: false, checkoutId: checkout.id, error: status.invoiceStatus };
      }
      assertAmount(status);
      paymentId = status.paymentId ?? opts.paymentId;
      invoiceId = status.invoiceId || invoiceId;
      paymentMethod = status.paymentMethod
        ? `myfatoorah:${status.paymentMethod}`
        : "myfatoorah";
    } else if (invoiceId) {
      const status = await getPaymentStatus({
        key: invoiceId,
        keyType: "InvoiceId",
      });
      if (!status.isPaid) {
        return { ok: false, checkoutId: checkout.id, error: status.invoiceStatus };
      }
      assertAmount(status);
      paymentId = status.paymentId ?? paymentId;
      paymentMethod = status.paymentMethod
        ? `myfatoorah:${status.paymentMethod}`
        : "myfatoorah";
    } else {
      // Never activate entitlements from redirect alone without gateway confirmation
      return { ok: false, checkoutId: checkout.id, error: "missing_payment_keys" };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "status_inquiry_failed";
    if (msg === "amount_currency_mismatch") {
      await db.paymentCheckout.update({
        where: { id: checkout.id },
        data: {
          status: "FAILED",
          errorMessage: "amount_currency_mismatch",
        },
      });
      await audit({
        userId: checkout.userId,
        action: AUDIT_ACTIONS.BILLING_CHANGE,
        resource: "PaymentCheckout",
        resourceId: checkout.id,
        details: { error: "amount_currency_mismatch", paidValue, paidCurrency },
        severity: "CRITICAL",
        success: false,
      });
      return { ok: false, checkoutId: checkout.id, error: msg };
    }
    console.error("[billing] payment status inquiry failed", err);
    return {
      ok: false,
      checkoutId: checkout.id,
      error: msg,
    };
  }

  const cycle = checkout.billingCycle === "YEARLY" ? "YEARLY" : "MONTHLY";
  const now = new Date();
  const periodEnd = addPeriod(now, cycle);

  await db.$transaction(async (tx) => {
    await tx.paymentCheckout.update({
      where: { id: checkout!.id },
      data: {
        status: "PAID",
        paidAt: now,
        paymentId,
        invoiceId,
        errorMessage: null,
      },
    });

    if (checkout!.billingRecordId) {
      await tx.billingRecord.update({
        where: { id: checkout!.billingRecordId },
        data: {
          status: "PAID",
          paymentMethod,
          externalInvoiceId: invoiceId,
          externalPaymentId: paymentId,
          invoiceNumber: invoiceId
            ? `MF-${invoiceId}`
            : `INV-${checkout!.id.slice(0, 8)}`,
        },
      });
    }

    const existing = await tx.subscription.findUnique({
      where: { userId: checkout!.userId },
    });

    if (existing) {
      const isExpired = existing.currentPeriodEnd < now;
      const isPlanChange = existing.planId !== checkout!.planId;
      // Only reset usage on period expiry (renewal) or first creation, not on mid-cycle plan change
      const shouldReset = isExpired || !isPlanChange ? false : false;
      // Correct logic: reset only if period expired (renewal)
      const resetData = isExpired
        ? { proposalsUsed: 0, documentsUsed: 0, tokensUsed: 0, storageUsedBytes: 0 }
        : {};
      // If plan changed mid-cycle, keep current usage counters
      await tx.subscription.update({
        where: { id: existing.id },
        data: {
          planId: checkout!.planId,
          status: "ACTIVE",
          billingCycle: cycle,
          currentPeriodStart: isExpired ? now : existing.currentPeriodStart,
          currentPeriodEnd: isExpired ? periodEnd : existing.currentPeriodEnd,
          cancelledAt: null,
          ...resetData,
        },
      });
    } else {
      await tx.subscription.create({
        data: {
          userId: checkout!.userId,
          planId: checkout!.planId,
          status: "ACTIVE",
          billingCycle: cycle,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });
    }

    // Sync plan label on all workspaces owned by the user
    const memberships = await tx.workspaceMember.findMany({
      where: { userId: checkout!.userId, role: { in: ["OWNER", "ADMIN"] } },
      select: { workspaceId: true },
    });
    if (memberships.length) {
      await tx.workspace.updateMany({
        where: { id: { in: memberships.map((m) => m.workspaceId) } },
        data: { plan: checkout!.plan.name },
      });
    }
  });

  await audit({
    userId: checkout.userId,
    action: AUDIT_ACTIONS.SUBSCRIPTION_UPDATE,
    resource: "PaymentCheckout",
    resourceId: checkout.id,
    details: {
      planId: checkout.planId,
      plan: checkout.plan.name,
      billingCycle: cycle,
      invoiceId,
      paymentId,
      amount: checkout.amount,
    },
    severity: "INFO",
  });

  return { ok: true, checkoutId: checkout.id };
}
