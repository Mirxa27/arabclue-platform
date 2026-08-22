import { NextRequest } from "next/server";
import { withAdmin, jsonOk, jsonError } from "@/lib/api-controller";
import {
  getReconciliationReport,
  applyReconciliation,
  applyReconciliationBulk,
  normalizeProviderState,
  isAmountMismatch,
  RECONCILE_DEFAULT_LIMIT,
  RECONCILE_MAX_LIMIT,
  RECONCILE_DEFAULT_OLDER_THAN_MINUTES,
  RECONCILE_PROVIDER_DEADLINE_MS,
  RECONCILE_CONCURRENCY,
  type ReconcileProviderState,
  type ReconcileProviderResult,
} from "@/lib/billing";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { db } from "@/lib/db";
import { getPaymentStatus, getMyFatoorahPublicConfig } from "@/lib/myfatoorah";
import { withProviderDeadline } from "@/lib/provider-timeout";

export const dynamic = "force-dynamic";

// Re-export constants for backward compatibility
export {
  RECONCILE_DEFAULT_LIMIT,
  RECONCILE_MAX_LIMIT,
  RECONCILE_DEFAULT_OLDER_THAN_MINUTES,
  RECONCILE_PROVIDER_DEADLINE_MS,
  RECONCILE_CONCURRENCY,
};

// Re-export types for backward compatibility
export type {
  ReconcileProviderState,
  ReconcileProviderResult,
  ReconcileReportItem,
  ReconcileReportResult,
  ReconcileApplyResult,
  ReconcileBulkApplyResult,
} from "@/lib/billing";

// Legacy types kept for backward compatibility with existing UI
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

// ─── GET: Reconciliation Report (legacy + new) ──────────────────────────────

/**
 * GET /api/admin/billing/reconcile — Return list of PaymentCheckout rows
 * with provider state mismatches. For each pending checkout with invoiceId,
 * call getPaymentStatus to compare local vs provider state.
 *
 * Query: olderThanMinutes (default 5), limit (default 50, max 200), cursor (id).
 */
export async function GET(req: NextRequest) {
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

    const params = req.nextUrl.searchParams;
    const olderThanMinutes = Math.max(
      1,
      Number.parseInt(
        params.get("olderThanMinutes") ?? String(RECONCILE_DEFAULT_OLDER_THAN_MINUTES),
        10
      ) || RECONCILE_DEFAULT_OLDER_THAN_MINUTES
    );
    const limit = Math.min(
      RECONCILE_MAX_LIMIT,
      Math.max(
        1,
        Number.parseInt(params.get("limit") ?? String(RECONCILE_DEFAULT_LIMIT), 10) ||
          RECONCILE_DEFAULT_LIMIT
      )
    );
    const cursor = params.get("cursor");
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);

    // Get pending checkouts with invoiceId (can query provider)
    const pendingCheckouts = await db.paymentCheckout.findMany({
      where: {
        status: "PENDING",
        invoiceId: { not: null },
        createdAt: { lte: cutoff },
        ...(cursor ? { id: { lt: cursor } } : {}),
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

    const mismatches: ReconciliationMismatch[] = [];
    let unresolved = 0;

    // Bounded concurrency with a 10s per-item provider deadline.
    for (let i = 0; i < pendingCheckouts.length; i += RECONCILE_CONCURRENCY) {
      const batch = pendingCheckouts.slice(i, i + RECONCILE_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (checkout) => {
          if (!checkout.invoiceId) {
            return { kind: "skip" as const };
          }
          try {
            const status = await withProviderDeadline(
              () =>
                getPaymentStatus({
                  key: checkout.invoiceId!,
                  keyType: "InvoiceId",
                }),
              {
                provider: "myfatoorah-reconcile-status",
                timeoutMs: RECONCILE_PROVIDER_DEADLINE_MS,
              }
            );
            const providerState = normalizeProviderState(status);
            const localState = checkout.status.toUpperCase();

            // Check if mismatch
            const isMismatch =
              localState !== providerState &&
              ((localState === "PENDING" &&
                (providerState === "PAID" ||
                  providerState === "FAILED" ||
                  providerState === "EXPIRED" ||
                  providerState === "CANCELLED")) ||
                (localState === "PAID" && providerState !== "PAID"));

            // Also check amount mismatch
            const amountMismatch = isAmountMismatch(
              checkout.amount,
              checkout.currency,
              status.invoiceValue,
              status.paidCurrency
            );

            if (!isMismatch && !amountMismatch) {
              return { kind: "ok" as const };
            }
            return {
              kind: "mismatch" as const,
              row: {
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
              } satisfies ReconciliationMismatch,
            };
          } catch (err) {
            console.error(
              `[reconcile] Failed to check status for checkout ${checkout.id}:`,
              err instanceof Error ? err.message : err
            );
            return { kind: "unresolved" as const };
          }
        })
      );
      for (const result of results) {
        if (result.kind === "mismatch") mismatches.push(result.row);
        if (result.kind === "unresolved") unresolved += 1;
      }
    }

    const nextCursor =
      pendingCheckouts.length === limit
        ? pendingCheckouts[pendingCheckouts.length - 1]?.id ?? null
        : null;

    const report: ReconciliationReport & {
      unresolved: number;
      nextCursor: string | null;
      olderThanMinutes: number;
      limit: number;
    } = {
      mismatches,
      scanned: pendingCheckouts.length,
      unresolved,
      nextCursor,
      olderThanMinutes,
      limit,
      checkedAt: new Date().toISOString(),
    };

    return jsonOk(report);
  }, "billing reconcile report");
}

/**
 * Resolve authoritative provider state for each checkout, server-side.
 *
 * The only trustworthy source for "did this invoice get paid" is the payment
 * gateway. A `providerResult` supplied in the request body is ignored
 * everywhere in this route; this helper is the single place the answer comes
 * from. Concurrency and per-item deadline match the GET report so a slow
 * gateway cannot stall the request.
 */
async function verifyProviderResults(checkoutIds: readonly string[]): Promise<{
  resolved: Array<{ checkoutId: string; providerResult: ReconcileProviderResult }>;
  errors: Array<{ checkoutId: string; error: string }>;
}> {
  const unique = [...new Set(checkoutIds.filter(Boolean))];
  const resolved: Array<{
    checkoutId: string;
    providerResult: ReconcileProviderResult;
  }> = [];
  const errors: Array<{ checkoutId: string; error: string }> = [];

  const rows = await db.paymentCheckout.findMany({
    where: { id: { in: unique } },
    select: { id: true, invoiceId: true },
  });
  const invoiceByCheckout = new Map(rows.map((r) => [r.id, r.invoiceId]));

  type VerifyOutcome =
    | { kind: "error"; checkoutId: string; error: string }
    | {
        kind: "ok";
        checkoutId: string;
        providerResult: ReconcileProviderResult;
      };

  for (let i = 0; i < unique.length; i += RECONCILE_CONCURRENCY) {
    const batch = unique.slice(i, i + RECONCILE_CONCURRENCY);
    const settled: VerifyOutcome[] = await Promise.all(
      batch.map(async (checkoutId): Promise<VerifyOutcome> => {
        const invoiceId = invoiceByCheckout.get(checkoutId);
        if (invoiceId === undefined) {
          return { kind: "error", checkoutId, error: "CHECKOUT_NOT_FOUND" };
        }
        if (!invoiceId) {
          return { kind: "error", checkoutId, error: "NO_INVOICE_ID" };
        }
        try {
          const status = await withProviderDeadline(
            () => getPaymentStatus({ key: invoiceId, keyType: "InvoiceId" }),
            {
              provider: "myfatoorah-reconcile-verify",
              timeoutMs: RECONCILE_PROVIDER_DEADLINE_MS,
            }
          );
          return {
            kind: "ok",
            checkoutId,
            providerResult: {
              providerState: normalizeProviderState(status),
              invoiceValue: status.invoiceValue,
              paidCurrency: status.paidCurrency,
              paymentId: status.paymentId,
              paymentMethod: status.paymentMethod,
            } satisfies ReconcileProviderResult,
          };
        } catch (err) {
          console.error(
            `[reconcile] provider verification failed for ${checkoutId}:`,
            err instanceof Error ? err.message : err
          );
          return { kind: "error", checkoutId, error: "PROVIDER_UNREACHABLE" };
        }
      })
    );

    for (const entry of settled) {
      if (entry.kind === "error") {
        errors.push({ checkoutId: entry.checkoutId, error: entry.error });
      } else {
        resolved.push({
          checkoutId: entry.checkoutId,
          providerResult: entry.providerResult,
        });
      }
    }
  }

  return { resolved, errors };
}

// ─── POST: Apply Reconciliation ──────────────────────────────────────────────

/**
 * POST /api/admin/billing/reconcile — Apply reconciliation.
 *
 * Supports two modes via `action` query param:
 * - `action=report` (default): Run the report query (same as GET)
 * - `action=apply`: Apply reconciliation for one or more checkouts
 *
 * Body for apply:
 * - { checkoutId: string, providerResult?: ReconcileProviderResult } — single apply
 * - { items: [{ checkoutId, providerResult }] } — bulk apply
 * - { checkoutId: string } (legacy) — single apply with live provider query
 * - {} (legacy) — bulk reconcile via reconcilePendingCheckouts
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

    const action = req.nextUrl.searchParams.get("action") ?? "apply";

    // ─── action=report: Run report query ─────────────────────────────────
    if (action === "report") {
      const params = req.nextUrl.searchParams;
      const olderThanMinutes = Math.max(
        1,
        Number.parseInt(
          params.get("olderThanMinutes") ?? String(RECONCILE_DEFAULT_OLDER_THAN_MINUTES),
          10
        ) || RECONCILE_DEFAULT_OLDER_THAN_MINUTES
      );
      const limit = Math.min(
        RECONCILE_MAX_LIMIT,
        Math.max(
          1,
          Number.parseInt(params.get("limit") ?? String(RECONCILE_DEFAULT_LIMIT), 10) ||
            RECONCILE_DEFAULT_LIMIT
        )
      );
      const cursor = params.get("cursor");

      const report = await getReconciliationReport({
        olderThanMinutes,
        limit,
        cursor,
      });

      return jsonOk(report);
    }

    // ─── action=apply: Apply reconciliation ──────────────────────────────
    let body: {
      checkoutId?: string;
      items?: Array<{ checkoutId: string; providerResult: ReconcileProviderResult }>;
      providerResult?: ReconcileProviderResult;
      olderThanMinutes?: number;
      limit?: number;
    } = {};
    try {
      body = await req.json();
    } catch {
      /* empty body ok for legacy bulk reconcile */
    }

    // ─── Bulk apply ─────────────────────────────────────────────────────
    if (body.items && Array.isArray(body.items) && body.items.length > 0) {
      // Provider state is re-fetched here and any client-supplied
      // `providerResult` is discarded. Reconciliation exists to confirm local
      // state against the gateway, so accepting the answer from the browser
      // defeats the entire operation: the admin UI sent
      // providerState:"PAID" with invoiceValue:null for every selected row,
      // which also skipped the amount/currency mismatch guard, so "select all
      // -> bulk apply" marked FAILED and EXPIRED checkouts as paid.
      const verifiedItems = await verifyProviderResults(
        body.items.map((item) => item.checkoutId)
      );

      const result = await applyReconciliationBulk({
        items: verifiedItems.resolved,
        adminUserId: session.user.id,
      });
      result.errors.push(...verifiedItems.errors);

      await audit({
        userId: session.user.id,
        action: AUDIT_ACTIONS.BILLING_RECONCILE,
        resource: "PaymentCheckout",
        details: {
          action: "bulk-apply",
          applied: result.applied.length,
          errors: result.errors.length,
          alreadyApplied: result.alreadyApplied.length,
        },
        severity: "INFO",
      });

      return jsonOk(result);
    }

    // ─── Single checkout apply ───────────────────────────────────────────
    // `body.providerResult` is accepted for backward compatibility with the
    // existing client but is never used: the state is re-fetched from the
    // gateway here, exactly as the legacy branch below already did.
    if (body.checkoutId && body.providerResult) {
      const verified = await verifyProviderResults([body.checkoutId]);
      const entry = verified.resolved[0];
      if (!entry) {
        const failure = verified.errors[0];
        return jsonError(
          failure?.error === "CHECKOUT_NOT_FOUND"
            ? "Checkout not found"
            : failure?.error === "NO_INVOICE_ID"
              ? "Checkout has no invoiceId to verify"
              : "Could not verify payment state with the provider",
          failure?.error === "CHECKOUT_NOT_FOUND" ? 404 : 502,
          failure?.error ?? "PROVIDER_UNREACHABLE"
        );
      }

      const result = await applyReconciliation({
        checkoutId: body.checkoutId,
        providerResult: entry.providerResult,
        adminUserId: session.user.id,
      });

      if (!result.ok && result.code !== "RECONCILE_ALREADY_APPLIED") {
        return jsonError(result.message, 400, result.code);
      }
      if (!result.ok && result.code === "RECONCILE_ALREADY_APPLIED") {
        return jsonError(result.message, 409, result.code);
      }

      return jsonOk(result);
    }

    // ─── Single checkout apply with live provider query (legacy) ────────
    if (body.checkoutId) {
      const checkoutId = body.checkoutId;

      // Load checkout
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

      const billingRecord = checkout?.billingRecordId
        ? await db.billingRecord.findUnique({ where: { id: checkout.billingRecordId } })
        : null;

      if (!checkout) {
        return jsonError("Checkout not found", 404, "CHECKOUT_NOT_FOUND");
      }

      // Idempotent: already reconciled
      if (checkout.status === "PAID" && billingRecord && billingRecord.status === "PAID") {
        return jsonError(
          "Checkout already reconciled",
          409,
          "RECONCILE_ALREADY_APPLIED"
        );
      }

      if (!checkout.invoiceId) {
        return jsonError(
          "Checkout has no invoiceId to verify",
          400,
          "NO_INVOICE_ID"
        );
      }

      // Query provider with deadline
      const status = await withProviderDeadline(
        () => getPaymentStatus({ key: checkout.invoiceId!, keyType: "InvoiceId" }),
        {
          provider: "myfatoorah-reconcile-apply",
          timeoutMs: RECONCILE_PROVIDER_DEADLINE_MS,
        }
      );

      const providerState = normalizeProviderState(status);

      // Build providerResult and delegate to applyReconciliation
      const providerResult: ReconcileProviderResult = {
        providerState,
        invoiceValue: status.invoiceValue,
        paidCurrency: status.paidCurrency,
        paymentId: status.paymentId,
        paymentMethod: status.paymentMethod,
      };

      const result = await applyReconciliation({
        checkoutId,
        providerResult,
        adminUserId: session.user.id,
      });

      if (!result.ok && result.code === "RECONCILE_ALREADY_APPLIED") {
        return jsonError(result.message, 409, result.code);
      }
      if (!result.ok) {
        return jsonError(result.message, 400, result.code);
      }

      return jsonOk({
        success: true,
        checkoutId,
        status: result.status,
        message: "Reconciliation applied successfully",
      });
    }

    // ─── Legacy bulk reconcile (no checkoutId, no items) ────────────────
    const { reconcilePendingCheckouts } = await import("@/lib/billing");
    let olderThanMinutes = RECONCILE_DEFAULT_OLDER_THAN_MINUTES;
    let limit = RECONCILE_DEFAULT_LIMIT;
    if (typeof body.olderThanMinutes === "number") {
      olderThanMinutes = body.olderThanMinutes;
    }
    if (typeof body.limit === "number") {
      limit = Math.min(RECONCILE_MAX_LIMIT, body.limit);
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
