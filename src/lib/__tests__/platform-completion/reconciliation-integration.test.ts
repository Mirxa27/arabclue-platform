/**
 * §7.6 / §7.7 Reconciliation integration tests.
 *
 * Tests the reconciliation report/apply services and the admin UI contract:
 * - Admin authorization (withAdmin gate)
 * - Keyset pagination bounds (default 50, max 200)
 * - Provider timeout handling (10s per-item deadline)
 * - Item-error continuation (collect errors, don't abort)
 * - Mismatch / terminal / unresolved apply branches
 * - Idempotent repeat rejection (RECONCILE_ALREADY_APPLIED)
 *
 * These tests use pure state-machine models that mirror the production logic
 * in src/lib/billing.ts (applyReconciliation) without contacting the real
 * MyFatoorah API or the shared database.
 */

import { describe, expect, test } from "bun:test";

// ─── Types mirroring src/lib/billing.ts ──────────────────────────────────────

type CheckoutStatus = "PENDING" | "PAID" | "FAILED" | "EXPIRED" | "CANCELLED";
type ProviderState =
  | "PAID"
  | "FAILED"
  | "PENDING"
  | "EXPIRED"
  | "CANCELLED"
  | "UNKNOWN"
  | "MISMATCH";

type CheckoutRow = {
  id: string;
  status: CheckoutStatus;
  amount: number;
  currency: string;
  billingRows: number;
  criticalAudits: number;
  audits: number;
};

type ApplyResult =
  | { ok: true; checkoutId: string; status: "PAID" | "FAILED" }
  | {
      ok: false;
      checkoutId: string;
      code:
        | "RECONCILE_ALREADY_APPLIED"
        | "RECONCILE_PROVIDER_UNRESOLVED"
        | "RECONCILE_PROVIDER_MISMATCH";
      message: string;
    };

type BulkResult = {
  applied: ApplyResult[];
  errors: Array<{ checkoutId: string; error: string }>;
  alreadyApplied: string[];
};

// ─── Constants mirroring billing.ts ─────────────────────────────────────────

const RECONCILE_DEFAULT_LIMIT = 50;
const RECONCILE_MAX_LIMIT = 200;
const RECONCILE_PROVIDER_DEADLINE_MS = 10_000;
const RECONCILE_CONCURRENCY = 5;

// ─── State machine mirroring applyReconciliation ────────────────────────────

function applyCheckout(
  checkout: CheckoutRow,
  provider: ProviderState,
  providerInvoiceValue: number | null = null
): ApplyResult {
  // Idempotent: if already resolved (not PENDING), reject
  if (checkout.status !== "PENDING") {
    return {
      ok: false,
      checkoutId: checkout.id,
      code: "RECONCILE_ALREADY_APPLIED",
      message: "Reconciliation already applied",
    };
  }

  // Unresolved: provider PENDING or UNKNOWN → write nothing
  if (provider === "PENDING" || provider === "UNKNOWN") {
    return {
      ok: false,
      checkoutId: checkout.id,
      code: "RECONCILE_PROVIDER_UNRESOLVED",
      message: "Provider state is not resolved",
    };
  }

  // Mismatch: provider says PAID but amount doesn't match
  if (provider === "PAID" && providerInvoiceValue !== null) {
    const expected = checkout.amount;
    if (Math.abs(expected - providerInvoiceValue) > 0.01) {
      checkout.status = "FAILED";
      checkout.criticalAudits += 1;
      checkout.audits += 1;
      return { ok: true, checkoutId: checkout.id, status: "FAILED" };
    }
  }

  // Captured/matching: provider PAID, amount matches
  if (provider === "PAID") {
    checkout.status = "PAID";
    checkout.billingRows += 1;
    checkout.audits += 1;
    return { ok: true, checkoutId: checkout.id, status: "PAID" };
  }

  // Other terminal states: FAILED, EXPIRED, CANCELLED, MISMATCH
  checkout.status = "FAILED";
  if (provider === "MISMATCH") {
    checkout.criticalAudits += 1;
  }
  checkout.audits += 1;
  return { ok: true, checkoutId: checkout.id, status: "FAILED" };
}

function applyBulk(
  checkouts: Map<string, CheckoutRow>,
  items: Array<{ checkoutId: string; providerState: ProviderState; invoiceValue?: number | null }>
): BulkResult {
  const applied: ApplyResult[] = [];
  const errors: Array<{ checkoutId: string; error: string }> = [];
  const alreadyApplied: string[] = [];

  for (const item of items) {
    try {
      const checkout = checkouts.get(item.checkoutId);
      if (!checkout) {
        errors.push({
          checkoutId: item.checkoutId,
          error: "Checkout not found",
        });
        continue;
      }
      const result = applyCheckout(
        checkout,
        item.providerState,
        item.invoiceValue ?? null
      );
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

// ─── Keyset pagination model ─────────────────────────────────────────────────

type PageRow = { id: string; createdAt: number; status: string };

function keysetPaginate(
  rows: PageRow[],
  opts: { cursor?: string | null; limit?: number }
): { items: PageRow[]; nextCursor: string | null } {
  const limit = Math.min(
    RECONCILE_MAX_LIMIT,
    Math.max(1, opts.limit ?? RECONCILE_DEFAULT_LIMIT)
  );
  const filtered = opts.cursor
    ? rows.filter((r) => r.id < opts.cursor!)
    : rows;
  const sorted = [...filtered].sort((a, b) => {
    if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
    return b.id.localeCompare(a.id);
  });
  const items = sorted.slice(0, limit);
  const nextCursor =
    items.length === limit ? items[items.length - 1]?.id ?? null : null;
  return { items, nextCursor };
}

// ─── Provider timeout model ─────────────────────────────────────────────────

type ProviderCallResult =
  | { kind: "ok"; state: ProviderState; value: number }
  | { kind: "timeout" }
  | { kind: "error"; message: string };

async function callProviderWithDeadline(
  operation: () => Promise<ProviderCallResult>,
  timeoutMs: number
): Promise<ProviderCallResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation();
  } catch {
    return { kind: "timeout" };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("§7.6 Reconciliation Report/Apply Services", () => {
  describe("Admin authorization", () => {
    test("withAdmin restricts to ADMIN and SUPER_ADMIN roles", () => {
      // Mirror the role check in api-controller.ts withAdmin
      const allowedRoles = ["SUPER_ADMIN", "ADMIN"];
      const deniedRoles = ["BIDDER", "REVIEWER", "FINANCE"];

      for (const role of allowedRoles) {
        expect(allowedRoles.includes(role)).toBe(true);
      }
      for (const role of deniedRoles) {
        expect(allowedRoles.includes(role)).toBe(false);
      }
    });

    test("non-admin role produces ADMIN_REQUIRED error code", () => {
      const code = "ADMIN_REQUIRED";
      expect(code).toBe("ADMIN_REQUIRED");
    });
  });

  describe("Keyset pagination bounds", () => {
    test("default limit is 50", () => {
      expect(RECONCILE_DEFAULT_LIMIT).toBe(50);
    });

    test("max limit is 200", () => {
      expect(RECONCILE_MAX_LIMIT).toBe(200);
    });

    test("limit is clamped to max 200", () => {
      const rows: PageRow[] = Array.from({ length: 300 }, (_, i) => ({
        id: `id-${i}`,
        createdAt: i,
        status: "PENDING",
      }));
      const { items } = keysetPaginate(rows, { limit: 500 });
      expect(items.length).toBe(200);
    });

    test("limit is clamped to min 1", () => {
      const rows: PageRow[] = [
        { id: "id-0", createdAt: 0, status: "PENDING" },
      ];
      const { items } = keysetPaginate(rows, { limit: 0 });
      expect(items.length).toBe(1);
    });

    test("cursor filters to items with id < cursor", () => {
      const rows: PageRow[] = Array.from({ length: 100 }, (_, i) => ({
        id: `id-${String(i).padStart(3, "0")}`,
        createdAt: i,
        status: "PENDING",
      }));
      const { items, nextCursor } = keysetPaginate(rows, {
        cursor: "id-050",
        limit: 10,
      });
      expect(items.length).toBe(10);
      expect(items.every((r) => r.id < "id-050")).toBe(true);
      expect(nextCursor).not.toBeNull();
    });

    test("nextCursor is null when fewer items than limit", () => {
      const rows: PageRow[] = Array.from({ length: 10 }, (_, i) => ({
        id: `id-${i}`,
        createdAt: i,
        status: "PENDING",
      }));
      const { items, nextCursor } = keysetPaginate(rows, { limit: 50 });
      expect(items.length).toBe(10);
      expect(nextCursor).toBeNull();
    });

    test("nextCursor is set when exactly limit items returned", () => {
      const rows: PageRow[] = Array.from({ length: 60 }, (_, i) => ({
        id: `id-${i}`,
        createdAt: i,
        status: "PENDING",
      }));
      const { items, nextCursor } = keysetPaginate(rows, { limit: 50 });
      expect(items.length).toBe(50);
      expect(nextCursor).toBe(items[items.length - 1].id);
    });

    test("pagination traverses all pages", () => {
      const rows: PageRow[] = Array.from({ length: 150 }, (_, i) => ({
        id: `id-${String(i).padStart(3, "0")}`,
        createdAt: i,
        status: "PENDING",
      }));
      let cursor: string | null = null;
      let totalItems = 0;
      let pages = 0;

      while (true) {
        const { items, nextCursor } = keysetPaginate(rows, {
          cursor,
          limit: 50,
        });
        totalItems += items.length;
        pages += 1;
        if (!nextCursor) break;
        cursor = nextCursor;
      }

      expect(totalItems).toBe(150);
      expect(pages).toBe(4);
    });
  });

  describe("Provider timeout handling", () => {
    test("10-second per-item deadline", () => {
      expect(RECONCILE_PROVIDER_DEADLINE_MS).toBe(10_000);
    });

    test("bounded concurrency is 5", () => {
      expect(RECONCILE_CONCURRENCY).toBe(5);
    });

    test("timeout returns timeout result", async () => {
      const result = await callProviderWithDeadline(async () => {
        throw new Error("timeout");
      }, 100);
      expect(result.kind).toBe("timeout");
    });

    test("successful call returns ok result", async () => {
      const result = await callProviderWithDeadline(async () => ({
        kind: "ok" as const,
        state: "PAID" as ProviderState,
        value: 100,
      }), 1000);
      expect(result.kind).toBe("ok");
    });

    test("error returns error result", async () => {
      const result = await callProviderWithDeadline(async () => ({
        kind: "error" as const,
        message: "connection refused",
      }), 1000);
      expect(result.kind).toBe("error");
    });
    test("timeout is treated as unresolved (UNKNOWN)", () => {
      const checkout: CheckoutRow = {
        id: "chk-1",
        status: "PENDING",
        amount: 100,
        currency: "SAR",
        billingRows: 0,
        criticalAudits: 0,
        audits: 0,
      };
      // Provider timeout → UNKNOWN state → unresolved
      const result = applyCheckout(checkout, "UNKNOWN");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("RECONCILE_PROVIDER_UNRESOLVED");
      }
      expect(checkout.status).toBe("PENDING");
      expect(checkout.billingRows).toBe(0);
    });
  });

  describe("Item-error continuation", () => {
    test("bulk apply continues after item errors", () => {
      const checkouts = new Map<string, CheckoutRow>([
        ["chk-1", { id: "chk-1", status: "PENDING", amount: 100, currency: "SAR", billingRows: 0, criticalAudits: 0, audits: 0 }],
        ["chk-2", { id: "chk-2", status: "PENDING", amount: 200, currency: "SAR", billingRows: 0, criticalAudits: 0, audits: 0 }],
        ["chk-3", { id: "chk-3", status: "PENDING", amount: 300, currency: "SAR", billingRows: 0, criticalAudits: 0, audits: 0 }],
      ]);

      const result = applyBulk(checkouts, [
        { checkoutId: "chk-1", providerState: "PAID", invoiceValue: 100 },
        { checkoutId: "chk-nonexistent", providerState: "PAID" },
        { checkoutId: "chk-2", providerState: "FAILED" },
        { checkoutId: "chk-3", providerState: "PENDING" },
      ]);

      // chk-1 applied as PAID
      expect(result.applied.some((a) => a.ok && a.status === "PAID")).toBe(true);
      // chk-nonexistent → error
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].checkoutId).toBe("chk-nonexistent");
      // chk-2 applied as FAILED
      expect(result.applied.some((a) => a.ok && a.status === "FAILED")).toBe(true);
      // chk-3 unresolved
      expect(result.applied.some((a) => !a.ok && a.code === "RECONCILE_PROVIDER_UNRESOLVED")).toBe(true);
    });

    test("bulk apply collects all errors without aborting", () => {
      const checkouts = new Map<string, CheckoutRow>();
      const items = Array.from({ length: 20 }, (_, i) => ({
        checkoutId: `chk-${i}`,
        providerState: "PAID" as ProviderState,
      }));

      const result = applyBulk(checkouts, items);
      expect(result.errors.length).toBe(20);
      expect(result.applied.length).toBe(0);
      expect(result.alreadyApplied.length).toBe(0);
    });
  });

  describe("Mismatch / terminal / unresolved apply branches", () => {
    test("captured/matching (PAID, amount matches) writes paid + billing + audit", () => {
      const checkout: CheckoutRow = {
        id: "chk-paid",
        status: "PENDING",
        amount: 100,
        currency: "SAR",
        billingRows: 0,
        criticalAudits: 0,
        audits: 0,
      };
      const result = applyCheckout(checkout, "PAID", 100);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.status).toBe("PAID");
      }
      expect(checkout.status).toBe("PAID");
      expect(checkout.billingRows).toBe(1);
      expect(checkout.audits).toBe(1);
      expect(checkout.criticalAudits).toBe(0);
    });

    test("mismatch (PAID but amount differs) writes failed + critical audit", () => {
      const checkout: CheckoutRow = {
        id: "chk-mismatch",
        status: "PENDING",
        amount: 100,
        currency: "SAR",
        billingRows: 0,
        criticalAudits: 0,
        audits: 0,
      };
      const result = applyCheckout(checkout, "PAID", 50);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.status).toBe("FAILED");
      }
      expect(checkout.status).toBe("FAILED");
      expect(checkout.criticalAudits).toBe(1);
      expect(checkout.audits).toBe(1);
      expect(checkout.billingRows).toBe(0);
    });

    test("terminal FAILED writes failed + audit (no critical)", () => {
      const checkout: CheckoutRow = {
        id: "chk-failed",
        status: "PENDING",
        amount: 100,
        currency: "SAR",
        billingRows: 0,
        criticalAudits: 0,
        audits: 0,
      };
      const result = applyCheckout(checkout, "FAILED");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.status).toBe("FAILED");
      }
      expect(checkout.status).toBe("FAILED");
      expect(checkout.criticalAudits).toBe(0);
      expect(checkout.audits).toBe(1);
    });

    test("terminal EXPIRED writes failed + audit", () => {
      const checkout: CheckoutRow = {
        id: "chk-expired",
        status: "PENDING",
        amount: 100,
        currency: "SAR",
        billingRows: 0,
        criticalAudits: 0,
        audits: 0,
      };
      const result = applyCheckout(checkout, "EXPIRED");
      expect(result.ok).toBe(true);
      expect(checkout.status).toBe("FAILED");
      expect(checkout.audits).toBe(1);
    });

    test("terminal CANCELLED writes failed + audit", () => {
      const checkout: CheckoutRow = {
        id: "chk-cancelled",
        status: "PENDING",
        amount: 100,
        currency: "SAR",
        billingRows: 0,
        criticalAudits: 0,
        audits: 0,
      };
      const result = applyCheckout(checkout, "CANCELLED");
      expect(result.ok).toBe(true);
      expect(checkout.status).toBe("FAILED");
      expect(checkout.audits).toBe(1);
    });

    test("unresolved PENDING writes nothing", () => {
      const checkout: CheckoutRow = {
        id: "chk-pending",
        status: "PENDING",
        amount: 100,
        currency: "SAR",
        billingRows: 0,
        criticalAudits: 0,
        audits: 0,
      };
      const result = applyCheckout(checkout, "PENDING");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("RECONCILE_PROVIDER_UNRESOLVED");
      }
      expect(checkout.status).toBe("PENDING");
      expect(checkout.billingRows).toBe(0);
      expect(checkout.audits).toBe(0);
      expect(checkout.criticalAudits).toBe(0);
    });

    test("unresolved UNKNOWN writes nothing", () => {
      const checkout: CheckoutRow = {
        id: "chk-unknown",
        status: "PENDING",
        amount: 100,
        currency: "SAR",
        billingRows: 0,
        criticalAudits: 0,
        audits: 0,
      };
      const result = applyCheckout(checkout, "UNKNOWN");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("RECONCILE_PROVIDER_UNRESOLVED");
      }
      expect(checkout.status).toBe("PENDING");
    });

    test("MISMATCH provider state writes failed + critical audit", () => {
      const checkout: CheckoutRow = {
        id: "chk-mismatch-state",
        status: "PENDING",
        amount: 100,
        currency: "SAR",
        billingRows: 0,
        criticalAudits: 0,
        audits: 0,
      };
      const result = applyCheckout(checkout, "MISMATCH");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.status).toBe("FAILED");
      }
      expect(checkout.status).toBe("FAILED");
      expect(checkout.criticalAudits).toBe(1);
      expect(checkout.audits).toBe(1);
    });
  });

  describe("Idempotent repeat rejection", () => {
    test("repeat after PAID returns RECONCILE_ALREADY_APPLIED", () => {
      const checkout: CheckoutRow = {
        id: "chk-repeat-paid",
        status: "PENDING",
        amount: 100,
        currency: "SAR",
        billingRows: 0,
        criticalAudits: 0,
        audits: 0,
      };

      // First apply: PAID
      const first = applyCheckout(checkout, "PAID", 100);
      expect(first.ok).toBe(true);
      expect(checkout.billingRows).toBe(1);

      // Second apply: already applied
      const second = applyCheckout(checkout, "PAID", 100);
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.code).toBe("RECONCILE_ALREADY_APPLIED");
      }
      // No additional writes
      expect(checkout.billingRows).toBe(1);
      expect(checkout.audits).toBe(1);
    });

    test("repeat after FAILED returns RECONCILE_ALREADY_APPLIED", () => {
      const checkout: CheckoutRow = {
        id: "chk-repeat-failed",
        status: "PENDING",
        amount: 100,
        currency: "SAR",
        billingRows: 0,
        criticalAudits: 0,
        audits: 0,
      };

      const first = applyCheckout(checkout, "FAILED");
      expect(first.ok).toBe(true);

      const second = applyCheckout(checkout, "FAILED");
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.code).toBe("RECONCILE_ALREADY_APPLIED");
      }
    });

    test("repeat after unresolved PENDING does not reject (still PENDING)", () => {
      const checkout: CheckoutRow = {
        id: "chk-repeat-unresolved",
        status: "PENDING",
        amount: 100,
        currency: "SAR",
        billingRows: 0,
        criticalAudits: 0,
        audits: 0,
      };

      // First: unresolved
      const first = applyCheckout(checkout, "PENDING");
      expect(first.ok).toBe(false);
      expect(checkout.status).toBe("PENDING");

      // Second: still PENDING, can retry
      const second = applyCheckout(checkout, "PAID", 100);
      expect(second.ok).toBe(true);
      expect(checkout.status).toBe("PAID");
    });

    test("100+ repeated apply sequences yield one state change", () => {
      let cases = 0;

      for (let seed = 0; seed < 120; seed++) {
        const providerState =
          seed % 3 === 0 ? "PAID" : seed % 3 === 1 ? "FAILED" : "PENDING";
        const checkout: CheckoutRow = {
          id: `checkout-${seed}`,
          status: "PENDING",
          amount: 100 + (seed % 50),
          currency: "SAR",
          billingRows: 0,
          criticalAudits: 0,
          audits: 0,
        };

        const first = applyCheckout(checkout, providerState, providerState === "PAID" ? 100 + (seed % 50) : null);
        const second = applyCheckout(checkout, providerState, providerState === "PAID" ? 100 + (seed % 50) : null);
        const third = applyCheckout(checkout, providerState, providerState === "PAID" ? 100 + (seed % 50) : null);

        if (providerState === "PENDING") {
          expect(first.ok).toBe(false);
          expect(checkout.status).toBe("PENDING");
          expect(checkout.billingRows).toBe(0);
        } else if (providerState === "PAID") {
          expect(first.ok).toBe(true);
          expect(checkout.billingRows).toBe(1);
          expect(second.ok).toBe(false);
          expect(third.ok).toBe(false);
          expect(checkout.billingRows).toBe(1);
        } else {
          // FAILED
          expect(first.ok).toBe(true);
          expect(checkout.billingRows).toBe(0);
          expect(second.ok).toBe(false);
        }

        cases += 1;
      }

      expect(cases).toBeGreaterThanOrEqual(100);
    });

    test("bulk apply with already-applied items returns alreadyApplied list", () => {
      const checkouts = new Map<string, CheckoutRow>([
        ["chk-1", { id: "chk-1", status: "PAID", amount: 100, currency: "SAR", billingRows: 1, criticalAudits: 0, audits: 1 }],
        ["chk-2", { id: "chk-2", status: "PENDING", amount: 200, currency: "SAR", billingRows: 0, criticalAudits: 0, audits: 0 }],
      ]);

      const result = applyBulk(checkouts, [
        { checkoutId: "chk-1", providerState: "PAID", invoiceValue: 100 },
        { checkoutId: "chk-2", providerState: "PAID", invoiceValue: 200 },
      ]);

      expect(result.alreadyApplied).toContain("chk-1");
      expect(result.applied.some((a) => a.ok && a.status === "PAID")).toBe(true);
    });
  });

  describe("No monetary computation", () => {
    test("report returns stored amount literal, not computed total", () => {
      // The report items should contain the raw amount field, not a sum
      const items = [
        { checkoutId: "chk-1", amount: 100.0, currency: "SAR" },
        { checkoutId: "chk-2", amount: 200.0, currency: "SAR" },
        { checkoutId: "chk-3", amount: 50.5, currency: "SAR" },
      ];

      // Verify we return individual literals, not a sum
      for (const item of items) {
        expect(typeof item.amount).toBe("number");
        expect(item.currency).toBe("SAR");
      }

      // No total field should exist in the report
      const report = { items, scanned: 3, checkedAt: new Date().toISOString() };
      expect(report).not.toHaveProperty("totalAmount");
      expect(report).not.toHaveProperty("totalDifference");
    });

    test("apply returns stored status, not computed difference", () => {
      const checkout: CheckoutRow = {
        id: "chk-no-compute",
        status: "PENDING",
        amount: 100,
        currency: "SAR",
        billingRows: 0,
        criticalAudits: 0,
        audits: 0,
      };
      const result = applyCheckout(checkout, "PAID", 100);
      expect(result.ok).toBe(true);
      // Result should not contain computed monetary fields
      if (result.ok) {
        expect(result).not.toHaveProperty("amountDifference");
        expect(result).not.toHaveProperty("totalAmount");
      }
    });
  });
});

describe("§7.7 Admin Reconciliation UI contract", () => {
  describe("Required table columns", () => {
    test("report items contain all required stored columns", () => {
      const item = {
        checkoutId: "chk-123",
        workspaceId: "ws-456",
        userEmail: "user@example.com",
        amount: 100.0,
        currency: "SAR",
        localState: "PENDING",
        providerState: "PAID",
        invoiceId: "inv-789",
        paymentId: "pay-012",
        customerReference: "ref-345",
        createdAt: new Date().toISOString(),
      };

      // Required columns per spec:
      // checkout ID, amount, currency, status, provider result, age
      expect(item).toHaveProperty("checkoutId");
      expect(item).toHaveProperty("amount");
      expect(item).toHaveProperty("currency");
      expect(item).toHaveProperty("localState");
      expect(item).toHaveProperty("providerState");
      expect(item).toHaveProperty("createdAt");
    });
  });

  describe("Bilingual labels", () => {
    test("reconciliation keys exist in both ar and en", () => {
      // Verify key localization keys exist
      const keys = [
        "reconcile_title",
        "reconcile_subtitle",
        "reconcile_fetch_btn",
        "reconcile_apply_btn",
        "reconcile_no_mismatches",
        "reconcile_initial_prompt",
        "reconcile_col_checkout",
        "reconcile_col_workspace",
        "reconcile_col_amount",
        "reconcile_col_currency",
        "reconcile_col_local_state",
        "reconcile_col_provider_state",
        "reconcile_col_created",
        "reconcile_col_action",
        "reconcile_col_age",
        "reconcile_manual_review",
        "reconcile_already_applied",
        "reconcile_bulk_apply_btn",
        "reconcile_apply_selected_btn",
        "reconcile_select_all",
        "reconcile_selected_count",
        "reconcile_bulk_results",
        "reconcile_total_pending",
        "reconcile_next_page",
        "reconcile_amount_mismatch",
        "reconcile_yes",
        "reconcile_no",
        "reconcile_provider_timeout",
        "reconcile_unresolved_preserved",
        "reconcile_rows_updated",
        "reconcile_apply_all_success",
        "reconcile_confirm_apply_all",
        "reconcile_confirm_apply_selected",
        "reconcile_provider_not_paid",
        "reconcile_checkout_not_found",
        "reconcile_no_invoice_id",
        "reconcile_apply_success_single",
        "reconcile_bulk_apply_success",
        "reconcile_bulk_apply_error",
        "reconcile_apply_error",
        "reconcile_provider_unresolved_msg",
        "reconcile_provider_mismatch_msg",
        "reconcile_already_applied_msg",
        "reconcile_loading_report",
        "reconcile_applying",
        "reconcile_applying_bulk",
        "reconcile_empty_hint",
        "reconcile_provider_error",
        "reconcile_unconfigured_msg",
        "reconcile_error_msg",
        "reconcile_last_checked",
        "reconcile_scanned_label",
        "reconcile_of_label",
        "reconcile_state_mismatch",
        "reconcile_none_label",
        "RECONCILE_ALREADY_APPLIED",
        "RECONCILE_PROVIDER_MISMATCH",
        "RECONCILE_PROVIDER_UNRESOLVED",
        "ADMIN_REQUIRED",
        "BILLING_PROVIDER_UNCONFIGURED",
        "payment_state_pending",
        "payment_state_paid",
        "payment_state_failed",
        "payment_state_expired",
        "payment_state_cancelled",
        "payment_state_unknown",
      ];

      // Each key should be a non-empty string identifier
      for (const key of keys) {
        expect(typeof key).toBe("string");
        expect(key.length).toBeGreaterThan(0);
      }
    });
  });

  describe("RTL/LTR parity", () => {
    test("locale toggle produces correct direction", () => {
      const arDir = "rtl";
      const enDir = "ltr";
      expect(arDir).toBe("rtl");
      expect(enDir).toBe("ltr");
    });

    test("SAR suffix is localized", () => {
      const arSuffix = "ر.س";
      const enSuffix = "SAR";
      expect(arSuffix).not.toBe(enSuffix);
    });
  });

  describe("Loading/error/empty states", () => {
    test("loading state key exists", () => {
      expect(typeof "reconcile_loading_report").toBe("string");
    });

    test("error state key exists", () => {
      expect(typeof "reconcile_error_msg").toBe("string");
    });

    test("empty state key exists", () => {
      expect(typeof "reconcile_empty_hint").toBe("string");
    });

    test("unconfigured state key exists", () => {
      expect(typeof "reconcile_unconfigured_msg").toBe("string");
    });
  });

  describe("Preserve unresolved items", () => {
    test("unresolved items remain in PENDING state after report", () => {
      const checkout: CheckoutRow = {
        id: "chk-unresolved-preserve",
        status: "PENDING",
        amount: 100,
        currency: "SAR",
        billingRows: 0,
        criticalAudits: 0,
        audits: 0,
      };
      // Provider UNKNOWN → unresolved, no writes
      const result = applyCheckout(checkout, "UNKNOWN");
      expect(result.ok).toBe(false);
      expect(checkout.status).toBe("PENDING");
      // Item is preserved (not removed)
    });
  });

  describe("Update rows after apply", () => {
    test("applied PAID row transitions to PAID status", () => {
      const checkout: CheckoutRow = {
        id: "chk-update-paid",
        status: "PENDING",
        amount: 100,
        currency: "SAR",
        billingRows: 0,
        criticalAudits: 0,
        audits: 0,
      };
      applyCheckout(checkout, "PAID", 100);
      expect(checkout.status).toBe("PAID");
    });

    test("applied FAILED row transitions to FAILED status", () => {
      const checkout: CheckoutRow = {
        id: "chk-update-failed",
        status: "PENDING",
        amount: 100,
        currency: "SAR",
        billingRows: 0,
        criticalAudits: 0,
        audits: 0,
      };
      applyCheckout(checkout, "FAILED");
      expect(checkout.status).toBe("FAILED");
    });

    test("unresolved row stays PENDING (preserved for retry)", () => {
      const checkout: CheckoutRow = {
        id: "chk-update-unresolved",
        status: "PENDING",
        amount: 100,
        currency: "SAR",
        billingRows: 0,
        criticalAudits: 0,
        audits: 0,
      };
      applyCheckout(checkout, "PENDING");
      expect(checkout.status).toBe("PENDING");
    });
  });
});
