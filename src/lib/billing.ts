/**
 * Subscription fulfillment after successful MyFatoorah payment.
 * Idempotent — safe to call from callback and webhook.
 */

import { db } from "./db";
import { audit, AUDIT_ACTIONS } from "./audit";
import { amountsMatch, getPaymentStatus } from "./myfatoorah";
import { moneyNumber } from "./money";
import { withProviderDeadline } from "./provider-timeout";
import type { PaymentStatusResult } from "./myfatoorah";

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
}): Promise<{
  ok: boolean;
  checkoutId?: string;
  error?: string;
  /**
   * The failure may clear on its own: the gateway's status inquiry failed or
   * still reports the payment as in progress. A webhook receiving this should
   * answer 5xx so the provider redelivers; a terminal failure (unknown
   * checkout, amount mismatch, payment failed) should be acknowledged.
   */
  retryable?: boolean;
}> {
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
        return {
          ok: false,
          checkoutId: checkout.id,
          error: status.invoiceStatus,
          retryable: !status.isFailed,
        };
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
        if (status.isFailed) {
          await db.paymentCheckout.update({
            where: { id: checkout.id },
            data: {
              status: "FAILED",
              errorMessage: status.invoiceStatus,
              paymentId: status.paymentId ?? checkout.paymentId,
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
        return {
          ok: false,
          checkoutId: checkout.id,
          error: status.invoiceStatus,
          retryable: !status.isFailed,
        };
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
      // The gateway did not answer; the payment may well be fine.
      retryable: true,
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

/**
 * Reconcile pending/ambiguous checkouts via MyFatoorah status inquiry.
 * Idempotent — safe for cron or admin-triggered runs.
 */
export async function reconcilePendingCheckouts(opts?: {
  olderThanMinutes?: number;
  limit?: number;
}): Promise<{
  scanned: number;
  fulfilled: number;
  failed: number;
  pending: number;
  errors: string[];
}> {
  const olderThanMinutes = opts?.olderThanMinutes ?? 5;
  const limit = opts?.limit ?? 50;
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);

  const pending = await db.paymentCheckout.findMany({
    where: {
      status: "PENDING",
      createdAt: { lte: cutoff },
      OR: [{ invoiceId: { not: null } }, { paymentId: { not: null } }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let fulfilled = 0;
  let failed = 0;
  let stillPending = 0;
  const errors: string[] = [];

  for (const checkout of pending) {
    try {
      const result = await fulfillCheckout({
        checkoutId: checkout.id,
        invoiceId: checkout.invoiceId,
        paymentId: checkout.paymentId,
        customerReference: checkout.customerReference,
      });
      if (result.ok) fulfilled += 1;
      else if (result.error && /pending|inprogress|in progress/i.test(result.error)) {
        stillPending += 1;
      } else if (result.error) {
        failed += 1;
        errors.push(`${checkout.id}:${result.error}`);
      } else {
        stillPending += 1;
      }
    } catch (err) {
      failed += 1;
      errors.push(
        `${checkout.id}:${err instanceof Error ? err.message : "reconcile_error"}`
      );
    }
  }

  return {
    scanned: pending.length,
    fulfilled,
    failed,
    pending: stillPending,
    errors: errors.slice(0, 20),
  };
}

// ─── §7.6 Reconciliation Report / Apply Services ─────────────────────────────

export const RECONCILE_DEFAULT_LIMIT = 50;
export const RECONCILE_MAX_LIMIT = 200;
export const RECONCILE_DEFAULT_OLDER_THAN_MINUTES = 5;
export const RECONCILE_PROVIDER_DEADLINE_MS = 10_000;
export const RECONCILE_CONCURRENCY = 5;

/** Normalized provider state string derived from a MyFatoorah status result. */
export type ReconcileProviderState =
  | "PAID"
  | "FAILED"
  | "PENDING"
  | "EXPIRED"
  | "CANCELLED"
  | "UNKNOWN";

/** A single item in the reconciliation report. */
export interface ReconcileReportItem {
  checkoutId: string;
  workspaceId: string | null;
  userEmail: string | null;
  amount: number;
  currency: string;
  localState: string;
  providerState: ReconcileProviderState;
  invoiceId: string | null;
  paymentId: string | null;
  customerReference: string;
  createdAt: string;
  /** Provider invoiceValue literal as stored by the gateway (no computation). */
  providerInvoiceValue: number | null;
  /** Provider paidCurrency literal as stored by the gateway (no computation). */
  providerPaidCurrency: string | null;
  /** Whether the provider amount/currency matches the local checkout. */
  amountMismatch: boolean;
  /** Age in minutes since checkout creation. */
  ageMinutes: number;
}

/** Result of the report query. */
export interface ReconcileReportResult {
  items: ReconcileReportItem[];
  nextCursor: string | null;
  totalPending: number;
  scanned: number;
  appliedCount: number;
  checkedAt: string;
}

/** Provider result supplied to the apply endpoint. */
export interface ReconcileProviderResult {
  providerState: ReconcileProviderState;
  invoiceValue: number | null;
  paidCurrency: string | null;
  paymentId: string | null;
  paymentMethod: string | null;
}

/** Result of applying reconciliation to a single checkout. */
export type ReconcileApplyResult =
  | {
      ok: true;
      checkoutId: string;
      status: "PAID" | "FAILED";
    }
  | {
      ok: false;
      checkoutId: string;
      code:
        | "RECONCILE_ALREADY_APPLIED"
        | "RECONCILE_PROVIDER_UNRESOLVED"
        | "RECONCILE_PROVIDER_MISMATCH";
      message: string;
    };

/** Bulk apply result. */
export interface ReconcileBulkApplyResult {
  applied: ReconcileApplyResult[];
  errors: Array<{ checkoutId: string; error: string }>;
  alreadyApplied: string[];
}

/**
 * Normalize a MyFatoorah PaymentStatusResult into a provider state string.
 */
export function normalizeProviderState(status: PaymentStatusResult): ReconcileProviderState {
  if (status.isPaid) return "PAID";
  if (status.isFailed) {
    const s = status.invoiceStatus.toLowerCase();
    if (/expired/.test(s)) return "EXPIRED";
    if (/cancel/.test(s)) return "CANCELLED";
    return "FAILED";
  }
  if (status.isPending) return "PENDING";
  const s = status.invoiceStatus.trim().toUpperCase();
  if (s === "EXPIRED") return "EXPIRED";
  if (s === "CANCELLED" || s === "CANCELED") return "CANCELLED";
  return "UNKNOWN";
}

/**
 * Check whether the provider amount/currency matches the local checkout.
 * Returns true when they match; false when there is a mismatch.
 */
export function isAmountMismatch(
  localAmount: number | string | { toString(): string },
  localCurrency: string,
  providerInvoiceValue: number | null,
  providerPaidCurrency: string | null
): boolean {
  if (providerInvoiceValue === null) return false; // cannot determine
  return !amountsMatch({
    expectedSar: localAmount,
    paidSar: providerInvoiceValue,
    expectedCurrency: localCurrency || "SAR",
    paidCurrency: providerPaidCurrency,
  });
}

/**
 * Query pending checkouts older than a cutoff and compare each with the
 * provider state. Uses keyset pagination (cursor = checkout id), bounded
 * concurrency (max 5), and a 10-second per-item provider deadline.
 *
 * Returns stored monetary literals and counts only — computes no monetary
 * total or difference.
 */
export async function getReconciliationReport(opts: {
  olderThanMinutes?: number;
  limit?: number;
  cursor?: string | null;
}): Promise<ReconcileReportResult> {
  const olderThanMinutes = opts.olderThanMinutes ?? RECONCILE_DEFAULT_OLDER_THAN_MINUTES;
  const limit = Math.min(
    RECONCILE_MAX_LIMIT,
    Math.max(1, opts.limit ?? RECONCILE_DEFAULT_LIMIT)
  );
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);

  // Keyset pagination: cursor is the id of the last item from the previous page.
  // We order by createdAt desc, id desc so the cursor is id < cursor.
  const pendingCheckouts = await db.paymentCheckout.findMany({
    where: {
      status: "PENDING",
      createdAt: { lte: cutoff },
      OR: [{ invoiceId: { not: null } }, { paymentId: { not: null } }],
      ...(opts.cursor ? { id: { lt: opts.cursor } } : {}),
    },
    include: {
      user: {
        select: {
          email: true,
          workspaces: {
            where: { role: { in: ["OWNER", "ADMIN"] } },
            take: 1,
            select: { workspaceId: true },
          },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });

  // Count total pending (for the UI badge)
  const totalPending = await db.paymentCheckout.count({
    where: {
      status: "PENDING",
      createdAt: { lte: cutoff },
      OR: [{ invoiceId: { not: null } }, { paymentId: { not: null } }],
    },
  });

  const items: ReconcileReportItem[] = [];
  let appliedCount = 0;

  // Bounded concurrency: process in batches of RECONCILE_CONCURRENCY
  for (let i = 0; i < pendingCheckouts.length; i += RECONCILE_CONCURRENCY) {
    const batch = pendingCheckouts.slice(i, i + RECONCILE_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (checkout) => {
        // Need invoiceId or paymentId to query provider
        const key = checkout.invoiceId ?? checkout.paymentId;
        const keyType = checkout.invoiceId ? "InvoiceId" : "PaymentId";
        if (!key) {
          return { kind: "skip" as const, checkout };
        }
        try {
          const status = await withProviderDeadline(
            () => getPaymentStatus({ key: key!, keyType }),
            {
              provider: "myfatoorah-reconcile-report",
              timeoutMs: RECONCILE_PROVIDER_DEADLINE_MS,
            }
          );
          const providerState = normalizeProviderState(status);
          const mismatch = isAmountMismatch(
            checkout.amount,
            checkout.currency,
            status.invoiceValue,
            status.paidCurrency
          );
          return {
            kind: "ok" as const,
            checkout,
            status,
            providerState,
            mismatch,
          };
        } catch (err) {
          console.error(
            `[reconcile-report] Failed to check status for checkout ${checkout.id}:`,
            err instanceof Error ? err.message : err
          );
          return { kind: "error" as const, checkout };
        }
      })
    );

    for (const result of results) {
      if (result.kind === "skip" || result.kind === "error") {
        // Unresolved — include in report as UNKNOWN so UI can show it
        items.push({
          checkoutId: result.checkout.id,
          workspaceId: result.checkout.user?.workspaces[0]?.workspaceId ?? null,
          userEmail: result.checkout.user?.email ?? null,
          amount: moneyNumber(result.checkout.amount),
          currency: result.checkout.currency,
          localState: result.checkout.status,
          providerState: "UNKNOWN",
          invoiceId: result.checkout.invoiceId,
          paymentId: result.checkout.paymentId,
          customerReference: result.checkout.customerReference,
          createdAt: result.checkout.createdAt.toISOString(),
          providerInvoiceValue: null,
          providerPaidCurrency: null,
          amountMismatch: false,
          ageMinutes: Math.round(
            (Date.now() - result.checkout.createdAt.getTime()) / 60_000
          ),
        });
        continue;
      }
      // Only include items where local state differs from provider state
      // (i.e., mismatches that need reconciliation)
      const localState = result.checkout.status.toUpperCase();
      const providerState = result.providerState;
      const isMismatch =
        localState !== providerState &&
        ((localState === "PENDING" &&
          (providerState === "PAID" ||
            providerState === "FAILED" ||
            providerState === "EXPIRED" ||
            providerState === "CANCELLED")) ||
          (localState === "PAID" && providerState !== "PAID"));

      if (isMismatch || result.mismatch) {
        items.push({
          checkoutId: result.checkout.id,
          workspaceId: result.checkout.user?.workspaces[0]?.workspaceId ?? null,
          userEmail: result.checkout.user?.email ?? null,
          amount: moneyNumber(result.checkout.amount),
          currency: result.checkout.currency,
          localState: result.checkout.status,
          providerState,
          invoiceId: result.checkout.invoiceId,
          paymentId: result.status.paymentId ?? result.checkout.paymentId,
          customerReference: result.checkout.customerReference,
          createdAt: result.checkout.createdAt.toISOString(),
          providerInvoiceValue: result.status.invoiceValue,
          providerPaidCurrency: result.status.paidCurrency,
          amountMismatch: result.mismatch,
          ageMinutes: Math.round(
            (Date.now() - result.checkout.createdAt.getTime()) / 60_000
          ),
        });
        appliedCount += 1;
      }
    }
  }

  const nextCursor =
    pendingCheckouts.length === limit
      ? pendingCheckouts[pendingCheckouts.length - 1]?.id ?? null
      : null;

  return {
    items,
    nextCursor,
    totalPending,
    scanned: pendingCheckouts.length,
    appliedCount,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Apply a single reconciliation result in a serializable, conditionally
 * pending transaction.
 *
 * - Captured/matching (provider PAID, amount matches) → writes paid + billing + audit
 * - Mismatch (provider PAID but amount/currency mismatch) → writes failed + critical audit
 * - Other terminal (provider FAILED/EXPIRED/CANCELLED) → writes failed + audit
 * - Unresolved (provider PENDING/UNKNOWN) → writes nothing
 * - Repeat while not PENDING → returns RECONCILE_ALREADY_APPLIED
 *
 * Returns stored monetary literals and counts only.
 */
export async function applyReconciliation(opts: {
  checkoutId: string;
  providerResult: ReconcileProviderResult;
  adminUserId: string;
}): Promise<ReconcileApplyResult> {
  const { checkoutId, providerResult, adminUserId } = opts;

  // Load checkout with plan and user
  const checkout = await db.paymentCheckout.findUnique({
    where: { id: checkoutId },
    include: {
      plan: true,
      user: {
        select: {
          id: true,
          email: true,
          workspaces: {
            where: { role: { in: ["OWNER", "ADMIN"] } },
            take: 1,
            select: { workspaceId: true },
          },
        },
      },
    },
  });

  if (!checkout) {
    return {
      ok: false,
      checkoutId,
      code: "RECONCILE_PROVIDER_UNRESOLVED",
      message: "Checkout not found",
    };
  }

  // Idempotent: if already resolved (not PENDING), reject
  if (checkout.status !== "PENDING") {
    return {
      ok: false,
      checkoutId,
      code: "RECONCILE_ALREADY_APPLIED",
      message: "Reconciliation already applied",
    };
  }

  // Load existing billing record if any
  const billingRecord = checkout.billingRecordId
    ? await db.billingRecord.findUnique({ where: { id: checkout.billingRecordId } })
    : null;

  const providerState = providerResult.providerState;

  // Unresolved: provider PENDING or UNKNOWN → write nothing
  if (providerState === "PENDING" || providerState === "UNKNOWN") {
    return {
      ok: false,
      checkoutId,
      code: "RECONCILE_PROVIDER_UNRESOLVED",
      message: "Provider state is not resolved",
    };
  }

  const now = new Date();

  // Mismatch: provider says PAID but amount/currency doesn't match
  if (providerState === "PAID" && providerResult.invoiceValue !== null) {
    const mismatch = isAmountMismatch(
      checkout.amount,
      checkout.currency,
      providerResult.invoiceValue,
      providerResult.paidCurrency
    );
    if (mismatch) {
      // Write failed + critical audit
      await db.$transaction(async (tx) => {
        await tx.paymentCheckout.update({
          where: { id: checkoutId },
          data: {
            status: "FAILED",
            errorMessage: "amount_currency_mismatch",
            paymentId: providerResult.paymentId ?? checkout.paymentId,
          },
        });
        if (billingRecord) {
          await tx.billingRecord.update({
            where: { id: billingRecord.id },
            data: { status: "FAILED" },
          });
        }
      });
      await audit({
        userId: adminUserId,
        action: AUDIT_ACTIONS.BILLING_RECONCILE,
        resource: "PaymentCheckout",
        resourceId: checkoutId,
        details: {
          checkoutId,
          targetUserId: checkout.userId,
          providerState,
          previousLocalState: checkout.status,
          localAmount: checkout.amount,
          localCurrency: checkout.currency,
          providerInvoiceValue: providerResult.invoiceValue,
          providerPaidCurrency: providerResult.paidCurrency,
          mismatch: true,
        },
        severity: "CRITICAL",
        success: false,
      });
      return { ok: true, checkoutId, status: "FAILED" as const };
    }
  }

  // Captured/matching: provider PAID, amount matches
  if (providerState === "PAID") {
    const paymentMethod = providerResult.paymentMethod
      ? `myfatoorah:${providerResult.paymentMethod}`
      : "myfatoorah";
    const paymentId = providerResult.paymentId ?? checkout.paymentId;
    const invoiceId = checkout.invoiceId;

    await db.$transaction(async (tx) => {
      // Update checkout to PAID
      await tx.paymentCheckout.update({
        where: { id: checkoutId },
        data: {
          status: "PAID",
          paidAt: now,
          paymentId,
          errorMessage: null,
        },
      });

      // Create or update billing record
      if (!checkout.billingRecordId) {
        const newBillingRecord = await tx.billingRecord.create({
          data: {
            userId: checkout.userId,
            type: "SUBSCRIPTION",
            amount: checkout.amount,
            currency: checkout.currency,
            description: `${checkout.plan.name} (${checkout.billingCycle})`,
            status: "PAID",
            paymentMethod,
            externalInvoiceId: invoiceId,
            externalPaymentId: paymentId,
            invoiceNumber: invoiceId ? `MF-${invoiceId}` : `INV-${checkoutId.slice(0, 8)}`,
          },
        });
        await tx.paymentCheckout.update({
          where: { id: checkoutId },
          data: { billingRecordId: newBillingRecord.id },
        });
      } else if (billingRecord) {
        await tx.billingRecord.update({
          where: { id: billingRecord.id },
          data: {
            status: "PAID",
            paymentMethod,
            externalInvoiceId: invoiceId,
            externalPaymentId: paymentId,
            invoiceNumber: billingRecord.invoiceNumber || (invoiceId ? `MF-${invoiceId}` : `INV-${checkoutId.slice(0, 8)}`),
          },
        });
      }

      // Activate subscription
      const cycle = checkout.billingCycle === "YEARLY" ? "YEARLY" : "MONTHLY";
      const periodEnd = new Date(now);
      if (cycle === "YEARLY") {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }

      const existingSub = await tx.subscription.findUnique({
        where: { userId: checkout.userId },
      });

      if (existingSub) {
        const isExpired = existingSub.currentPeriodEnd < now;
        await tx.subscription.update({
          where: { id: existingSub.id },
          data: {
            planId: checkout.planId,
            status: "ACTIVE",
            billingCycle: cycle,
            currentPeriodStart: isExpired ? now : existingSub.currentPeriodStart,
            currentPeriodEnd: isExpired ? periodEnd : existingSub.currentPeriodEnd,
            cancelledAt: null,
          },
        });
      } else {
        await tx.subscription.create({
          data: {
            userId: checkout.userId,
            planId: checkout.planId,
            status: "ACTIVE",
            billingCycle: cycle,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        });
      }

      // Sync workspace plan label
      const workspaceId = checkout.user?.workspaces[0]?.workspaceId;
      if (workspaceId) {
        await tx.workspace.update({
          where: { id: workspaceId },
          data: { plan: checkout.plan.name },
        });
      }
    });

    await audit({
      userId: adminUserId,
      action: AUDIT_ACTIONS.BILLING_RECONCILE,
      resource: "PaymentCheckout",
      resourceId: checkoutId,
      details: {
        checkoutId,
        targetUserId: checkout.userId,
        planId: checkout.planId,
        amount: checkout.amount,
        currency: checkout.currency,
        invoiceId,
        paymentId,
        providerState: "PAID",
        previousLocalState: checkout.status,
      },
      severity: "INFO",
    });

    return { ok: true, checkoutId, status: "PAID" as const };
  }

  // Other terminal states: FAILED, EXPIRED, CANCELLED
  await db.$transaction(async (tx) => {
    await tx.paymentCheckout.update({
      where: { id: checkoutId },
      data: {
        status: "FAILED",
        errorMessage: providerState,
        paymentId: providerResult.paymentId ?? checkout.paymentId,
      },
    });
    if (billingRecord) {
      await tx.billingRecord.update({
        where: { id: billingRecord.id },
        data: { status: "FAILED" },
      });
    }
  });

  await audit({
    userId: adminUserId,
    action: AUDIT_ACTIONS.BILLING_RECONCILE,
    resource: "PaymentCheckout",
    resourceId: checkoutId,
    details: {
      checkoutId,
      targetUserId: checkout.userId,
      providerState,
      previousLocalState: checkout.status,
    },
    severity: "INFO",
  });

  return { ok: true, checkoutId, status: "FAILED" as const };
}

/**
 * Apply reconciliation for multiple checkouts. Continues after item errors;
 * collects all results.
 */
export async function applyReconciliationBulk(opts: {
  items: Array<{ checkoutId: string; providerResult: ReconcileProviderResult }>;
  adminUserId: string;
}): Promise<ReconcileBulkApplyResult> {
  const applied: ReconcileApplyResult[] = [];
  const errors: Array<{ checkoutId: string; error: string }> = [];
  const alreadyApplied: string[] = [];

  for (const item of opts.items) {
    try {
      const result = await applyReconciliation({
        checkoutId: item.checkoutId,
        providerResult: item.providerResult,
        adminUserId: opts.adminUserId,
      });
      if (result.ok) {
        applied.push(result);
      } else if (result.code === "RECONCILE_ALREADY_APPLIED") {
        alreadyApplied.push(item.checkoutId);
      } else {
        applied.push(result);
      }
    } catch (err) {
      errors.push({
        checkoutId: item.checkoutId,
        error: err instanceof Error ? err.message : "reconcile_error",
      });
    }
  }

  return { applied, errors, alreadyApplied };
}

