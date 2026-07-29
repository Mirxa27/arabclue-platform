/**
 * Reconciliation apply state machine (task 7.8 slice).
 */

import { describe, expect, test } from "bun:test";

type CheckoutStatus = "PENDING" | "PAID" | "FAILED";
type ProviderState = "PAID" | "FAILED" | "PENDING" | "MISMATCH" | "UNKNOWN";

type Checkout = {
  status: CheckoutStatus;
  amountExact: string;
  currency: string;
  billingRows: number;
  criticalAudits: number;
  audits: number;
};

type ApplyResult =
  | { ok: true; status: CheckoutStatus }
  | {
      ok: false;
      code: "RECONCILE_ALREADY_APPLIED" | "RECONCILE_PROVIDER_UNRESOLVED";
    };

function applyCheckout(
  checkout: Checkout,
  provider: ProviderState
): ApplyResult {
  if (checkout.status !== "PENDING") {
    return { ok: false, code: "RECONCILE_ALREADY_APPLIED" };
  }
  if (provider === "PENDING" || provider === "UNKNOWN") {
    return { ok: false, code: "RECONCILE_PROVIDER_UNRESOLVED" };
  }
  if (provider === "PAID") {
    checkout.status = "PAID";
    checkout.billingRows += 1;
    checkout.audits += 1;
    return { ok: true, status: "PAID" };
  }
  if (provider === "MISMATCH") {
    checkout.status = "FAILED";
    checkout.criticalAudits += 1;
    checkout.audits += 1;
    return { ok: true, status: "FAILED" };
  }
  checkout.status = "FAILED";
  checkout.audits += 1;
  return { ok: true, status: "FAILED" };
}

function selectPendingForReport(
  rows: Array<{ id: string; status: CheckoutStatus; ageMinutes: number }>,
  olderThanMinutes = 5,
  limit = 50
) {
  return rows
    .filter((r) => r.status === "PENDING" && r.ageMinutes >= olderThanMinutes)
    .sort((a, b) => b.ageMinutes - a.ageMinutes || a.id.localeCompare(b.id))
    .slice(0, Math.min(200, Math.max(1, limit)));
}

describe("billing reconcile apply branches", () => {
  test("report selection respects olderThanMinutes, order, and bounds", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      id: `c-${String(i).padStart(3, "0")}`,
      status: (i % 5 === 0 ? "PAID" : "PENDING") as CheckoutStatus,
      ageMinutes: i,
    }));
    const selected = selectPendingForReport(rows, 5, 50);
    expect(selected.every((r) => r.status === "PENDING")).toBe(true);
    expect(selected.every((r) => r.ageMinutes >= 5)).toBe(true);
    expect(selected.length).toBeLessThanOrEqual(50);
    for (let i = 1; i < selected.length; i++) {
      expect(selected[i - 1]!.ageMinutes).toBeGreaterThanOrEqual(
        selected[i]!.ageMinutes
      );
    }
  });

  test("paid/mismatch/failed/unresolved and already-applied paths", () => {
    const paid: Checkout = {
      status: "PENDING",
      amountExact: "100.00",
      currency: "SAR",
      billingRows: 0,
      criticalAudits: 0,
      audits: 0,
    };
    expect(applyCheckout(paid, "PAID")).toEqual({ ok: true, status: "PAID" });
    expect(paid.billingRows).toBe(1);
    expect(applyCheckout(paid, "PAID")).toEqual({
      ok: false,
      code: "RECONCILE_ALREADY_APPLIED",
    });

    const mismatch: Checkout = {
      status: "PENDING",
      amountExact: "100.00",
      currency: "SAR",
      billingRows: 0,
      criticalAudits: 0,
      audits: 0,
    };
    expect(applyCheckout(mismatch, "MISMATCH")).toEqual({
      ok: true,
      status: "FAILED",
    });
    expect(mismatch.criticalAudits).toBe(1);
    expect(mismatch.billingRows).toBe(0);

    const failed: Checkout = {
      status: "PENDING",
      amountExact: "50.00",
      currency: "SAR",
      billingRows: 0,
      criticalAudits: 0,
      audits: 0,
    };
    expect(applyCheckout(failed, "FAILED")).toEqual({
      ok: true,
      status: "FAILED",
    });
    expect(failed.criticalAudits).toBe(0);

    const unresolved: Checkout = {
      status: "PENDING",
      amountExact: "10.00",
      currency: "SAR",
      billingRows: 0,
      criticalAudits: 0,
      audits: 0,
    };
    expect(applyCheckout(unresolved, "PENDING")).toEqual({
      ok: false,
      code: "RECONCILE_PROVIDER_UNRESOLVED",
    });
    expect(unresolved.status).toBe("PENDING");
  });
});
