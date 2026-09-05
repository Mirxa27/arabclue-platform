/**
 * `resolveEntitlementState` is the one rule that decides whether a
 * subscription row still entitles its owner, and it has to close two holes the
 * status column alone left open: a signup trial never ended (`quotas.ts` only
 * ever asked "is the status ACTIVE or TRIALING"), and rows written before the
 * trial carried a status are `ACTIVE` Starter rows that nobody ever paid for.
 */

import { describe, expect, test } from "bun:test";
import { resolveEntitlementState } from "@/lib/quotas";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-05T12:00:00.000Z");
const days = (n: number) => new Date(NOW.getTime() + n * DAY_MS);

describe("resolveEntitlementState", () => {
  test("a TRIALING row before its end is a running trial with whole days left", () => {
    // Arrange
    const sub = {
      status: "TRIALING",
      currentPeriodEnd: days(12),
      trialEndsAt: days(12),
      plan: { name: "STARTER" },
    };
    // Act
    const state = resolveEntitlementState(sub, NOW);
    // Assert
    expect(state).toEqual({ kind: "TRIAL", endsAt: days(12), daysLeft: 12 });
  });

  test("a partial day still counts as a day left, never zero", () => {
    const state = resolveEntitlementState(
      { status: "TRIALING", currentPeriodEnd: days(0.4), trialEndsAt: days(0.4) },
      NOW
    );
    expect(state.kind).toBe("TRIAL");
    if (state.kind === "TRIAL") expect(state.daysLeft).toBe(1);
  });

  test("a TRIALING row at or past its end has ended", () => {
    for (const end of [days(0), days(-1), days(-90)]) {
      const state = resolveEntitlementState(
        { status: "TRIALING", currentPeriodEnd: end, trialEndsAt: end },
        NOW
      );
      expect(state).toEqual({ kind: "TRIAL_ENDED", endedAt: end });
    }
  });

  test("a TRIALING row without trialEndsAt ends with its period", () => {
    const state = resolveEntitlementState(
      { status: "TRIALING", currentPeriodEnd: days(-2), trialEndsAt: null },
      NOW
    );
    expect(state).toEqual({ kind: "TRIAL_ENDED", endedAt: days(-2) });
  });

  test("a paid ACTIVE row is entitled, whatever the period date says", () => {
    for (const end of [days(20), days(-20)]) {
      expect(
        resolveEntitlementState(
          { status: "ACTIVE", currentPeriodEnd: end, plan: { name: "STARTER" }, hasPaid: true },
          NOW
        )
      ).toEqual({ kind: "ACTIVE" });
    }
  });

  test("an ACTIVE row on any plan but Starter is entitled without a payment", () => {
    // Admin-assigned Pro / Enterprise / Pay-as-you-go: not a trial.
    for (const name of ["PRO", "ENTERPRISE", "PAY_AS_YOU_GO"]) {
      expect(
        resolveEntitlementState(
          { status: "ACTIVE", currentPeriodEnd: days(-5), plan: { name }, hasPaid: false },
          NOW
        )
      ).toEqual({ kind: "ACTIVE" });
    }
  });

  test("a legacy ACTIVE Starter row that never paid is a trial that ends with its period", () => {
    const running = resolveEntitlementState(
      { status: "ACTIVE", currentPeriodEnd: days(7), plan: { name: "STARTER" }, hasPaid: false },
      NOW
    );
    expect(running).toEqual({ kind: "TRIAL", endsAt: days(7), daysLeft: 7 });

    const lapsed = resolveEntitlementState(
      { status: "ACTIVE", currentPeriodEnd: days(-1), plan: { name: "STARTER" }, hasPaid: false },
      NOW
    );
    expect(lapsed).toEqual({ kind: "TRIAL_ENDED", endedAt: days(-1) });
  });

  test("when payment history is unknown an ACTIVE Starter row is not demoted", () => {
    // `hasPaid` absent means the caller did not look; fail open to the status.
    expect(
      resolveEntitlementState(
        { status: "ACTIVE", currentPeriodEnd: days(-1), plan: { name: "STARTER" } },
        NOW
      )
    ).toEqual({ kind: "ACTIVE" });
  });

  test("every other status, and no row at all, is inactive", () => {
    for (const status of ["PENDING", "PAST_DUE", "CANCELLED", "EXPIRED", "bogus"]) {
      expect(
        resolveEntitlementState({ status, currentPeriodEnd: days(30) }, NOW)
      ).toEqual({ kind: "INACTIVE" });
    }
    expect(resolveEntitlementState(null, NOW)).toEqual({ kind: "INACTIVE" });
    expect(resolveEntitlementState(undefined, NOW)).toEqual({ kind: "INACTIVE" });
  });
});
