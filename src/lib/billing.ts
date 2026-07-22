/**
 * Subscription fulfillment after successful MyFatoorah payment.
 * Idempotent — safe to call from callback and webhook.
 */

import { db } from "./db";
import { audit, AUDIT_ACTIONS } from "./audit";
import { getPaymentStatus } from "./myfatoorah";

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
      paymentId = status.paymentId ?? paymentId;
      paymentMethod = status.paymentMethod
        ? `myfatoorah:${status.paymentMethod}`
        : "myfatoorah";
    }
  } catch (err) {
    console.error("[billing] payment status inquiry failed", err);
    // If we cannot reach MF, do not mark paid
    return {
      ok: false,
      checkoutId: checkout.id,
      error: err instanceof Error ? err.message : "status_inquiry_failed",
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
      await tx.subscription.update({
        where: { id: existing.id },
        data: {
          planId: checkout!.planId,
          status: "ACTIVE",
          billingCycle: cycle,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelledAt: null,
          // Reset usage on plan change / renewal
          proposalsUsed: 0,
          documentsUsed: 0,
          tokensUsed: 0,
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
