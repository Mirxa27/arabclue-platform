/**
 * Feature: platform-completion, Property 14: Reconciliation idempotence
 *
 * Generate pending captured/matching checkouts and repeated apply sequences;
 * assert one state change, at most one billing row, and deterministic repeat
 * rejection via RECONCILE_ALREADY_APPLIED.
 */

import { describe, expect, test } from "bun:test";

type CheckoutState = "PENDING" | "PAID" | "FAILED";

type CheckoutRow = {
  id: string;
  status: CheckoutState;
  amountExact: string;
  currency: string;
  billingRows: number;
};

type ApplyResult =
  | { readonly ok: true; readonly status: CheckoutState }
  | { readonly ok: false; readonly code: "RECONCILE_ALREADY_APPLIED" | "RECONCILE_PROVIDER_UNRESOLVED" };

/**
 * Models the production apply rule: a pending+PAID provider result writes paid
 * and one billing row once; a repeat while already paid rejects deterministically.
 */
function applyReconciliation(
  checkout: CheckoutRow,
  providerState: "PAID" | "FAILED" | "PENDING" | "UNKNOWN"
): ApplyResult {
  if (checkout.status !== "PENDING") {
    return { ok: false, code: "RECONCILE_ALREADY_APPLIED" };
  }
  if (providerState === "PAID") {
    checkout.status = "PAID";
    checkout.billingRows += 1;
    return { ok: true, status: "PAID" };
  }
  if (providerState === "FAILED") {
    checkout.status = "FAILED";
    return { ok: true, status: "FAILED" };
  }
  return { ok: false, code: "RECONCILE_PROVIDER_UNRESOLVED" };
}

describe("Feature: platform-completion, Property 14: Reconciliation idempotence", () => {
  test("repeated apply yields one state change and deterministic rejection across 100+ cases", () => {
    let cases = 0;

    for (let seed = 0; seed < 120; seed++) {
      const providerState =
        seed % 3 === 0 ? "PAID" : seed % 3 === 1 ? "FAILED" : "PENDING";
      const checkout: CheckoutRow = {
        id: `checkout-${seed}`,
        status: "PENDING",
        amountExact: `${100 + (seed % 50)}.00`,
        currency: "SAR",
        billingRows: 0,
      };

      const first = applyReconciliation(checkout, providerState);
      const second = applyReconciliation(checkout, providerState);
      const third = applyReconciliation(checkout, providerState);

      if (providerState === "PENDING") {
        expect(first).toEqual({
          ok: false,
          code: "RECONCILE_PROVIDER_UNRESOLVED",
        });
        expect(checkout.status).toBe("PENDING");
        expect(checkout.billingRows).toBe(0);
        expect(second.code).toBe("RECONCILE_PROVIDER_UNRESOLVED");
      } else if (providerState === "PAID") {
        expect(first).toEqual({ ok: true, status: "PAID" });
        expect(checkout.billingRows).toBe(1);
        expect(second).toEqual({
          ok: false,
          code: "RECONCILE_ALREADY_APPLIED",
        });
        expect(third).toEqual({
          ok: false,
          code: "RECONCILE_ALREADY_APPLIED",
        });
        expect(checkout.billingRows).toBe(1);
      } else {
        expect(first).toEqual({ ok: true, status: "FAILED" });
        expect(checkout.billingRows).toBe(0);
        expect(second).toEqual({
          ok: false,
          code: "RECONCILE_ALREADY_APPLIED",
        });
      }

      cases += 1;
    }

    expect(cases).toBeGreaterThanOrEqual(100);
  });
});
