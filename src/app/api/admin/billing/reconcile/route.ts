import { NextRequest } from "next/server";
import { withAdmin, jsonOk, jsonError, ApiError } from "@/lib/api-controller";
import { reconcilePendingCheckouts } from "@/lib/billing";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { db } from "@/lib/db";
import { getPaymentStatus, getMyFatoorahPublicConfig } from "@/lib/myfatoorah";

export const dynamic = "force-dynamic";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReconciliationMismatch {
  checkoutId: string;
  workspaceId: string | null;
  amount: number;
  currency: string;
  localState: string;
  providerState: string;
  invoiceId: string | null;
  paymentId: string | null;
  customerReference: string;
  createdAt: string;
  userEmail: string | null;
}

export interface ReconciliationReport {
  mismatches: ReconciliationMismatch[];
  scanned: number;
  checkedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Map MyFatoorah payment status to a normalized provider state string.
 */
function normalizeProviderState(status: {
  isPaid: boolean;
  isFailed: boolean;
  isPending: boolean;
  invoiceStatus: string;
}): string {
  if (status.isPaid) return "PAID";
  if (status.isFailed) return "FAILED";
  if (status.isPending) return "PENDING";
  return status.invoiceStatus.toUpperCase() || "UNKNOWN";
}

/**
 * Check if local and provider states are mismatched.
 * - Local PENDING + Provider PAID = mismatch (needs reconciliation)
 * - Local PENDING + Provider FAILED = mismatch (needs reconciliation)
 * - Local PAID + Provider PAID = no mismatch
 */
function isMismatch(localState: string, providerState: string): boolean {
  // Normalize local state
  const local = localState.toUpperCase();
  const provider = providerState.toUpperCase();

  // If both match, no mismatch
  if (local === provider) return false;

  // Local PENDING but provider has resolved state = mismatch
  if (local === "PENDING" && (provider === "PAID" || provider === "FAILED")) {
    return true;
  }

  // Local PAID but provider says not paid = potential issue (rare, flag it)
  if (local === "PAID" && provider !== "PAID") {
    return true;
  }

  return false;
}

// ─── GET: Reconciliation Report ──────────────────────────────────────────────

/**
 * GET /api/admin/billing/reconcile — Return list of PaymentCheckout rows
 * with provider state mismatches. For each pending checkout with invoiceId,
 * call getPaymentStatus to compare local vs provider state.
 */
export async function GET() {
  return withAdmin(async () => {
    // Check if MyFatoorah is configured
    const mfConfig = await getMyFatoorahPublicConfig();
    if (!mfConfig.configured || !mfConfig.apiKeyConfigured) {
      return jsonError(
        "Billing provider is not configured",
        503,
        "BILLING_PROVIDER_UNCONFIGURED"
      );
    }

    // Get pending checkouts with invoiceId (can query provider)
    const pendingCheckouts = await db.paymentCheckout.findMany({
      where: {
        status: "PENDING",
        invoiceId: { not: null },
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
      orderBy: { createdAt: "desc" },
      take: 100, // Limit to avoid overloading provider API
    });

    const mismatches: ReconciliationMismatch[] = [];

    for (const checkout of pendingCheckouts) {
      if (!checkout.invoiceId) continue;

      try {
        const status = await getPaymentStatus({
          key: checkout.invoiceId,
          keyType: "InvoiceId",
        });

        const providerState = normalizeProviderState(status);

        if (isMismatch(checkout.status, providerState)) {
          mismatches.push({
            checkoutId: checkout.id,
            workspaceId: checkout.user?.workspaces[0]?.workspaceId ?? null,
            amount: checkout.amount,
            currency: checkout.currency,
            localState: checkout.status,
            providerState,
            invoiceId: checkout.invoiceId,
            paymentId: status.paymentId ?? checkout.paymentId,
            customerReference: checkout.customerReference,
            createdAt: checkout.createdAt.toISOString(),
            userEmail: checkout.user?.email ?? null,
          });
        }
      } catch (err) {
        // Log but don't fail the whole report for one checkout
        console.error(
          `[reconcile] Failed to check status for checkout ${checkout.id}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    const report: ReconciliationReport = {
      mismatches,
      scanned: pendingCheckouts.length,
      checkedAt: new Date().toISOString(),
    };

    return jsonOk(report);
  }, "billing reconcile report");
}

// ─── POST: Apply Reconciliation or Bulk Reconcile ────────────────────────────

/**
 * POST /api/admin/billing/reconcile — Apply reconciliation for a single checkout
 * OR run bulk reconciliation.
 *
 * Body:
 * - { checkoutId: string } — Apply reconciliation for specific checkout
 * - { olderThanMinutes?: number, limit?: number } — Bulk reconcile (legacy)
 */
export async function POST(req: NextRequest) {
  return withAdmin(async (session) => {
    // Check if MyFatoorah is configured
    const mfConfig = await getMyFatoorahPublicConfig();
    if (!mfConfig.configured || !mfConfig.apiKeyConfigured) {
      return jsonError(
        "Billing provider is not configured",
        503,
        "BILLING_PROVIDER_UNCONFIGURED"
      );
    }

    let body: {
      checkoutId?: string;
      olderThanMinutes?: number;
      limit?: number;
    } = {};
    try {
      body = await req.json();
    } catch {
      /* empty body ok for legacy bulk reconcile */
    }

    // ─── Single Checkout Reconciliation ────────────────────────────────────
    if (body.checkoutId) {
      const checkoutId = body.checkoutId;

      // Load checkout with billing record
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

      // Also load billing record if exists
      const billingRecord = checkout?.billingRecordId
        ? await db.billingRecord.findUnique({ where: { id: checkout.billingRecordId } })
        : null;

      if (!checkout) {
        throw new ApiError("Checkout not found", 404, "CHECKOUT_NOT_FOUND");
      }

      // Check if already reconciled (status matches and billingRecord exists with PAID status)
      if (
        checkout.status === "PAID" &&
        billingRecord &&
        billingRecord.status === "PAID"
      ) {
        return jsonError(
          "Checkout already reconciled",
          409,
          "RECONCILE_ALREADY_APPLIED"
        );
      }

      // Get provider state
      if (!checkout.invoiceId) {
        throw new ApiError(
          "Checkout has no invoiceId to verify",
          400,
          "NO_INVOICE_ID"
        );
      }

      const status = await getPaymentStatus({
        key: checkout.invoiceId,
        keyType: "InvoiceId",
      });

      // Only reconcile if provider says PAID
      if (!status.isPaid) {
        return jsonError(
          `Provider state is ${status.invoiceStatus}, not PAID`,
          400,
          "PROVIDER_NOT_PAID"
        );
      }

      const now = new Date();
      const paymentMethod = status.paymentMethod
        ? `myfatoorah:${status.paymentMethod}`
        : "myfatoorah";

      // Transaction: Update checkout + create/update billing record + audit
      await db.$transaction(async (tx) => {
        // Update PaymentCheckout status to PAID
        await tx.paymentCheckout.update({
          where: { id: checkoutId },
          data: {
            status: "PAID",
            paidAt: now,
            paymentId: status.paymentId ?? checkout.paymentId,
            errorMessage: null,
          },
        });

        // Append BillingRecord if missing
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
              externalInvoiceId: checkout.invoiceId,
              externalPaymentId: status.paymentId ?? checkout.paymentId,
              invoiceNumber: `MF-${checkout.invoiceId}`,
            },
          });

          await tx.paymentCheckout.update({
            where: { id: checkoutId },
            data: { billingRecordId: newBillingRecord.id },
          });
        } else if (billingRecord) {
          // Update existing billing record to PAID
          await tx.billingRecord.update({
            where: { id: checkout.billingRecordId! },
            data: {
              status: "PAID",
              paymentMethod,
              externalInvoiceId: checkout.invoiceId,
              externalPaymentId: status.paymentId ?? checkout.paymentId,
              invoiceNumber:
                billingRecord.invoiceNumber || `MF-${checkout.invoiceId}`,
            },
          });
        }

        // Activate subscription if not already active
        const existingSub = await tx.subscription.findUnique({
          where: { userId: checkout.userId },
        });

        const cycle = checkout.billingCycle === "YEARLY" ? "YEARLY" : "MONTHLY";
        const periodEnd = new Date(now);
        if (cycle === "YEARLY") {
          periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        } else {
          periodEnd.setMonth(periodEnd.getMonth() + 1);
        }

        if (existingSub) {
          await tx.subscription.update({
            where: { id: existingSub.id },
            data: {
              planId: checkout.planId,
              status: "ACTIVE",
              billingCycle: cycle,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
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

        // Update workspace plan label
        const workspaceId = checkout.user?.workspaces[0]?.workspaceId;
        if (workspaceId) {
          await tx.workspace.update({
            where: { id: workspaceId },
            data: { plan: checkout.plan.name },
          });
        }
      });

      // Append audit BILLING_RECONCILE
      await audit({
        userId: session.user.id,
        action: "BILLING_RECONCILE",
        resource: "PaymentCheckout",
        resourceId: checkoutId,
        details: {
          checkoutId,
          targetUserId: checkout.userId,
          planId: checkout.planId,
          amount: checkout.amount,
          currency: checkout.currency,
          invoiceId: checkout.invoiceId,
          paymentId: status.paymentId,
          providerState: "PAID",
          previousLocalState: checkout.status,
        },
        severity: "INFO",
      });

      return jsonOk({
        success: true,
        checkoutId,
        status: "PAID",
        message: "Reconciliation applied successfully",
      });
    }

    // ─── Legacy Bulk Reconciliation ────────────────────────────────────────
    let olderThanMinutes = 5;
    let limit = 50;
    if (typeof body.olderThanMinutes === "number") {
      olderThanMinutes = body.olderThanMinutes;
    }
    if (typeof body.limit === "number") {
      limit = Math.min(200, body.limit);
    }

    const result = await reconcilePendingCheckouts({ olderThanMinutes, limit });
    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.BILLING_CHANGE,
      resource: "PaymentCheckout",
      details: { action: "reconcile", ...result },
      severity: "INFO",
    });
    return jsonOk(result);
  }, "billing reconcile");
}
