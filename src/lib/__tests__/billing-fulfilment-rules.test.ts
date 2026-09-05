/**
 * The pure rules `fulfillCheckout`, `applyReconciliation`, and the admin
 * billing route apply once a payment is real. Each closes a defect observed in
 * the fulfilment code:
 *
 * - an early renewal of the same plan added no days (`isExpired ? … : existing`);
 * - a renewal reset `storageUsedBytes` to zero while the files stayed on disk;
 * - a paid trial kept `TRIALING` semantics through `trialEndsAt`;
 * - a settled payment activated a checkout without being compared to it;
 * - an admin TOPUP *consumed* the quota it was meant to grant.
 */

import { describe, expect, test } from "bun:test";
import {
  adjustUsageForManualRecord,
  nextSubscriptionPeriod,
  settlementBelongsToCheckout,
} from "@/lib/billing";
import { allowUnsignedWebhook } from "@/lib/myfatoorah";

const NOW = new Date("2026-09-05T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const days = (n: number) => new Date(NOW.getTime() + n * DAY_MS);

function monthsAfter(date: Date, months: number): Date {
  const out = new Date(date);
  out.setMonth(out.getMonth() + months);
  return out;
}

describe("nextSubscriptionPeriod", () => {
  const plan = "plan-starter";

  test("an early same-plan payment extends from the stored period end, not from now", () => {
    // Arrange: 20 days still paid for.
    const existing = {
      planId: plan,
      currentPeriodStart: days(-10),
      currentPeriodEnd: days(20),
    };
    // Act
    const next = nextSubscriptionPeriod(existing, { planId: plan, cycle: "MONTHLY" }, NOW);
    // Assert: the full month lands on top of the remaining 20 days.
    expect(next.currentPeriodEnd).toEqual(monthsAfter(days(20), 1));
    expect(next.currentPeriodStart).toEqual(days(-10));
    expect(next.resetUsage).toBe(false);
  });

  test("a same-plan payment after the period lapsed starts a fresh period now and resets counters", () => {
    const existing = {
      planId: plan,
      currentPeriodStart: days(-40),
      currentPeriodEnd: days(-10),
    };
    const next = nextSubscriptionPeriod(existing, { planId: plan, cycle: "YEARLY" }, NOW);
    expect(next.currentPeriodStart).toEqual(NOW);
    expect(next.currentPeriodEnd).toEqual(
      new Date(Date.UTC(2027, 8, 5, 12, 0, 0))
    );
    expect(next.resetUsage).toBe(true);
  });

  test("a plan change mid-cycle starts the new plan's full cycle from now and keeps counters", () => {
    // A trial user buying Pro used to get Pro only until the trial's own end.
    const existing = {
      planId: plan,
      currentPeriodStart: days(-5),
      currentPeriodEnd: days(25),
    };
    const next = nextSubscriptionPeriod(existing, { planId: "plan-pro", cycle: "MONTHLY" }, NOW);
    expect(next.currentPeriodStart).toEqual(NOW);
    expect(next.currentPeriodEnd).toEqual(monthsAfter(NOW, 1));
    expect(next.resetUsage).toBe(false);
  });

  test("a plan change after the period lapsed resets counters", () => {
    const existing = {
      planId: plan,
      currentPeriodStart: days(-60),
      currentPeriodEnd: days(-30),
    };
    const next = nextSubscriptionPeriod(existing, { planId: "plan-pro", cycle: "MONTHLY" }, NOW);
    expect(next.resetUsage).toBe(true);
  });
});

describe("settlementBelongsToCheckout", () => {
  const checkout = { customerReference: "ac_abc123", invoiceId: "700100" };

  test("matching reference and invoice belong", () => {
    expect(
      settlementBelongsToCheckout(checkout, {
        customerReference: "ac_abc123",
        invoiceId: "700100",
      })
    ).toBe(true);
  });

  test("a different customer reference is a mismatch", () => {
    expect(
      settlementBelongsToCheckout(checkout, {
        customerReference: "ac_someone_else",
        invoiceId: "700100",
      })
    ).toBe(false);
  });

  test("a different invoice for a checkout that knows its invoice is a mismatch", () => {
    expect(
      settlementBelongsToCheckout(checkout, {
        customerReference: null,
        invoiceId: "999999",
      })
    ).toBe(false);
  });

  test("absent gateway fields are not a mismatch", () => {
    // Older status payloads omit the echo; the amount check still runs after.
    expect(
      settlementBelongsToCheckout(checkout, { customerReference: null, invoiceId: "" })
    ).toBe(true);
    expect(
      settlementBelongsToCheckout(
        { customerReference: "ac_abc123", invoiceId: null },
        { customerReference: "  ", invoiceId: "123" }
      )
    ).toBe(true);
  });
});

describe("adjustUsageForManualRecord", () => {
  const current = { proposalsUsed: 7, tokensUsed: 120_000 };

  test("USAGE spends allowance", () => {
    expect(
      adjustUsageForManualRecord(current, {
        type: "USAGE",
        proposalsIncluded: 2,
        tokensIncluded: 30_000,
      })
    ).toEqual({ proposalsUsed: 9, tokensUsed: 150_000 });
  });

  test("TOPUP restores allowance instead of consuming it", () => {
    expect(
      adjustUsageForManualRecord(current, {
        type: "TOPUP",
        proposalsIncluded: 5,
        tokensIncluded: 20_000,
      })
    ).toEqual({ proposalsUsed: 2, tokensUsed: 100_000 });
  });

  test("TOPUP is clamped at zero", () => {
    expect(
      adjustUsageForManualRecord(current, {
        type: "TOPUP",
        proposalsIncluded: 50,
        tokensIncluded: 1_000_000,
      })
    ).toEqual({ proposalsUsed: 0, tokensUsed: 0 });
  });

  test("other record types move no counter", () => {
    for (const type of ["SUBSCRIPTION", "REFUND", "OVERAGE"]) {
      expect(
        adjustUsageForManualRecord(current, {
          type,
          proposalsIncluded: 3,
          tokensIncluded: 3,
        })
      ).toBeNull();
    }
  });
});

describe("webhook signature without a configured secret", () => {
  test("fails closed in every environment but the test runner", () => {
    for (const NODE_ENV of ["development", "production", "staging", undefined]) {
      expect(allowUnsignedWebhook({ NODE_ENV }), String(NODE_ENV)).toBe(false);
    }
  });

  test("the test runner and the explicit local opt-in are the only exceptions", () => {
    expect(allowUnsignedWebhook({ NODE_ENV: "test" })).toBe(true);
    expect(
      allowUnsignedWebhook({
        NODE_ENV: "development",
        MYFATOORAH_ALLOW_UNSIGNED_WEBHOOKS: "1",
      })
    ).toBe(true);
    // Only the literal "1" opts in; a stray "true" or "yes" does not.
    expect(
      allowUnsignedWebhook({
        NODE_ENV: "development",
        MYFATOORAH_ALLOW_UNSIGNED_WEBHOOKS: "true",
      })
    ).toBe(false);
  });
});
