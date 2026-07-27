/**
 * Feature: platform-completion — exact-value recurring state and persistence
 * rules (task 7.1).
 *
 * Validates: Requirements 9.1, 9.3, 9.5, 9.6, 9.7, 9.10, 9.11, 19.7
 *
 * Every case below runs against in-memory fakes: no MyFatoorah call, no charge,
 * and no database write.
 */
import { describe, expect, test } from "bun:test";
import {
  DYNAMIC_TRANSLATION_KEY_MANIFEST,
  localizationRegistry,
} from "../../i18n";
import {
  OCCUPYING_RECURRING_STATES,
  RECURRING_AMOUNT_TOLERANCE,
  RECURRING_BILLING_CYCLES,
  RECURRING_FAILURE_REASON_MAX_LENGTH,
  RECURRING_INTERVAL_DAYS,
  RECURRING_PROFILE_STATES,
  RECURRING_PROFILE_TRIGGERS,
  RECURRING_PROVIDER_DEADLINE_MS,
  RECURRING_PROVIDER_RETRY_COUNT,
  amountWithinProviderTolerance,
  canMemberCancel,
  canMemberResume,
  currencyEquals,
  deriveRecurringNextChargeAt,
  exactDecimalEquals,
  normalizeRecurringProfileState,
  parseExactDecimalLiteral,
  readStoredPlanAmount,
  recurringCheckoutIdempotencyKey,
  recurringIntervalDays,
  recurringProfileStateLabelKey,
  resolveExtendedPeriodEnd,
  resolveRecurringTransition,
  truncateProviderFailureReason,
  type RecurringProfileState,
} from "../../recurring-billing-state";
import {
  createRecurringBillingService,
  isCurrentRecurringProfile,
  type RecurringCheckoutReservation,
  type StoredRecurringProfile,
} from "../../recurring-billing";
import {
  DeterministicClock,
  createFakeRecurringBillingRepository,
  createFakeRecurringProvider,
  type FakeRecurringBillingRepository,
} from "../support";

const DAY_MS = 24 * 60 * 60 * 1000;
const WORKSPACE = "workspace-riyadh";
const OTHER_WORKSPACE = "workspace-jeddah";
const PLAN = "plan-pro";
const ACTOR = Object.freeze({ userId: "user-writer" });
const NOW = "2026-03-01T00:00:00.000Z";

function literal(text: string) {
  const parsed = parseExactDecimalLiteral(text);
  if (!parsed) throw new Error(`fixture ${text} is not an exact literal`);
  return parsed;
}

function scenario(
  options: Readonly<{
    priceMonthly?: number | string | null;
    priceYearly?: number | string | null;
    currency?: string;
  }> = {}
) {
  const repository = createFakeRecurringBillingRepository();
  const provider = createFakeRecurringProvider();
  const clock = new DeterministicClock(NOW);
  const service = createRecurringBillingService({ repository, provider, clock });

  repository.seedPlan({
    id: PLAN,
    priceMonthly: options.priceMonthly ?? 129.99,
    priceYearly: options.priceYearly ?? 1299.9,
    currency: options.currency ?? "SAR",
  });
  const subscription = repository.seedSubscription({
    id: "sub-0001",
    workspaceId: WORKSPACE,
    planId: PLAN,
    ownerUserId: "user-owner",
  });

  return { repository, provider, clock, service, subscription };
}

async function reserved(
  fixture: ReturnType<typeof scenario>
): Promise<RecurringCheckoutReservation> {
  const result = await fixture.service.reserveCheckout({
    actor: ACTOR,
    workspaceId: WORKSPACE,
    planId: PLAN,
    billingCycle: "MONTHLY",
  });
  if (!result.ok) throw new Error(`reservation failed: ${result.code}`);
  return result.reservation;
}

function storedProfile(
  repository: FakeRecurringBillingRepository,
  overrides: Readonly<
    Partial<StoredRecurringProfile> & { subscriptionId: string; status: string }
  >
): StoredRecurringProfile {
  const row = repository.seedProfile(overrides);
  return { ...row };
}

/* -------------------------------------------------------------------------- */

describe("exact stored value rules (criterion 9.1, requirement 19.7)", () => {
  test("copies an exact stored plan literal unchanged", () => {
    for (const [stored, expected] of [
      ["129.99", "129.99"],
      [129.99, "129.99"],
      [1299.9, "1299.9"],
      [1200, "1200"],
      ["0.01", "0.01"],
    ] as const) {
      const read = readStoredPlanAmount(stored);
      expect(read.ok).toBe(true);
      if (read.ok) expect(read.amount.text).toBe(expected);
    }
  });

  test("refuses a stored value it cannot represent exactly rather than rounding", () => {
    for (const stored of [0.1 + 0.2, 129.999, 1e21, -5, "12.3.4", "1,299.90", "abc", true]) {
      const read = readStoredPlanAmount(stored);
      expect(read.ok).toBe(false);
      if (!read.ok) expect(read.reason).toBe("NOT_EXACT");
    }
  });

  test("reports a missing or non-positive stored price distinctly", () => {
    expect(readStoredPlanAmount(null)).toEqual({ ok: false, reason: "MISSING" });
    expect(readStoredPlanAmount(undefined)).toEqual({ ok: false, reason: "MISSING" });
    expect(readStoredPlanAmount("   ")).toEqual({ ok: false, reason: "MISSING" });
    // Criterion 9.1 requires an amount greater than 0.00.
    expect(readStoredPlanAmount(0)).toEqual({ ok: false, reason: "NOT_POSITIVE" });
    expect(readStoredPlanAmount("0.00")).toEqual({ ok: false, reason: "NOT_POSITIVE" });
  });

  test("stores 30 days for a monthly cycle and 365 for a yearly cycle", () => {
    expect(recurringIntervalDays("MONTHLY")).toBe(30);
    expect(recurringIntervalDays("YEARLY")).toBe(365);
    expect(RECURRING_INTERVAL_DAYS).toEqual({ MONTHLY: 30, YEARLY: 365 });
    expect([...RECURRING_BILLING_CYCLES]).toEqual(["MONTHLY", "YEARLY"]);
  });

  test("fixes the provider retry count at 3 and the deadline at 30 seconds", () => {
    expect(RECURRING_PROVIDER_RETRY_COUNT).toBe(3);
    expect(RECURRING_PROVIDER_DEADLINE_MS).toBe(30_000);
  });

  test("bounds a stored provider failure reason at 500 characters", () => {
    expect(truncateProviderFailureReason(null)).toBeNull();
    expect(truncateProviderFailureReason("  ")).toBeNull();
    expect(truncateProviderFailureReason(" declined ")).toBe("declined");
    const long = "x".repeat(RECURRING_FAILURE_REASON_MAX_LENGTH + 40);
    expect(truncateProviderFailureReason(long)).toHaveLength(
      RECURRING_FAILURE_REASON_MAX_LENGTH
    );
  });
});

describe("comparison is validation only (criteria 9.10, requirement 19.7)", () => {
  test("treats equal values of different scale as equal", () => {
    expect(exactDecimalEquals(literal("10"), literal("10.00"))).toBe(true);
    expect(exactDecimalEquals(literal("10.10"), literal("10.1"))).toBe(true);
    expect(exactDecimalEquals(literal("10.01"), literal("10.1"))).toBe(false);
  });

  test("accepts a reported amount inside the 0.01 tolerance and rejects beyond it", () => {
    const stored = literal("129.99");
    for (const reported of ["129.99", "129.98", "130.00", "129.990"]) {
      expect(
        amountWithinProviderTolerance(stored, literal(reported), RECURRING_AMOUNT_TOLERANCE)
      ).toBe(true);
    }
    for (const reported of ["129.97", "130.01", "1299.90", "0.01"]) {
      expect(
        amountWithinProviderTolerance(stored, literal(reported), RECURRING_AMOUNT_TOLERANCE)
      ).toBe(false);
    }
  });

  test("compares currencies as canonical ISO codes and rejects anything else", () => {
    expect(currencyEquals("SAR", "sar")).toBe(true);
    expect(currencyEquals(" SAR ", "SAR")).toBe(true);
    expect(currencyEquals("SAR", "AED")).toBe(false);
    expect(currencyEquals("SAR", null)).toBe(false);
    expect(currencyEquals("SAR", "SARR")).toBe(false);
  });

  test("rejects a literal carrying a sign, exponent, or separator", () => {
    for (const text of ["-1.00", "+1.00", "1e3", "1_000", "1 000", ".5", "5.", ""]) {
      expect(parseExactDecimalLiteral(text)).toBeNull();
    }
  });
});

describe("profile state model (criteria 9.5, 9.6, 9.11)", () => {
  test("declares exactly the four states requirement 9 names", () => {
    expect([...RECURRING_PROFILE_STATES]).toEqual([
      "DRAFT",
      "ACTIVE",
      "SUSPENDED",
      "CANCELLED",
    ]);
    expect([...OCCUPYING_RECURRING_STATES]).toEqual(["DRAFT", "ACTIVE"]);
  });

  test("normalizes legacy stored values and rejects unknown text", () => {
    expect(normalizeRecurringProfileState("CANCELED")).toBe("CANCELLED");
    expect(normalizeRecurringProfileState("COMPLETED")).toBe("CANCELLED");
    expect(normalizeRecurringProfileState("UNCOMPLETED")).toBe("SUSPENDED");
    expect(normalizeRecurringProfileState("active")).toBe("ACTIVE");
    expect(normalizeRecurringProfileState("PENDING")).toBe("DRAFT");
    expect(normalizeRecurringProfileState("WHATEVER")).toBeNull();
    expect(normalizeRecurringProfileState(null)).toBeNull();
  });

  test("permits a member cancel only from ACTIVE and a resume only from SUSPENDED", () => {
    for (const state of RECURRING_PROFILE_STATES) {
      expect(canMemberCancel(state)).toBe(state === "ACTIVE");
      expect(canMemberResume(state)).toBe(state === "SUSPENDED");
    }
  });

  test("keeps CANCELLED terminal for every trigger except a repeated provider cancellation", () => {
    for (const trigger of RECURRING_PROFILE_TRIGGERS) {
      const resolution = resolveRecurringTransition("CANCELLED", trigger);
      if (trigger === "PROVIDER_REPORTED_CANCELLED") {
        expect(resolution.ok).toBe(true);
        if (resolution.ok) expect(resolution.changesState).toBe(false);
      } else {
        expect(resolution).toEqual({ ok: false, code: "RECURRING_STATE_CONFLICT" });
      }
    }
  });

  test("activates a draft on the first accepted cycle charge", () => {
    expect(resolveRecurringTransition("DRAFT", "PROVIDER_CYCLE_SUCCEEDED")).toEqual({
      ok: true,
      from: "DRAFT",
      to: "ACTIVE",
      changesState: true,
    });
  });

  test("leaves the state unchanged for a failed cycle charge", () => {
    for (const state of ["DRAFT", "ACTIVE", "SUSPENDED"] as const) {
      const resolution = resolveRecurringTransition(state, "PROVIDER_CYCLE_FAILED");
      expect(resolution.ok).toBe(true);
      if (resolution.ok) {
        expect(resolution.to).toBe(state);
        expect(resolution.changesState).toBe(false);
      }
    }
  });

  test("treats an unreadable stored state as a conflict for every trigger", () => {
    for (const trigger of RECURRING_PROFILE_TRIGGERS) {
      expect(resolveRecurringTransition("NOT_A_STATE", trigger).ok).toBe(false);
    }
  });

  test("registers one bilingual label per state and no orphan member", () => {
    const family = DYNAMIC_TRANSLATION_KEY_MANIFEST.recurringProfileState;
    expect(Object.keys(family).sort()).toEqual([...RECURRING_PROFILE_STATES].sort());
    for (const state of RECURRING_PROFILE_STATES) {
      const key = recurringProfileStateLabelKey(state);
      expect(key).toBe(family[state]);
      const pair = localizationRegistry[key];
      expect(pair.ar.trim().length).toBeGreaterThan(0);
      expect(pair.en.trim().length).toBeGreaterThan(0);
    }
  });

  test("reports only DRAFT and ACTIVE rows as occupying the single slot", () => {
    const occupying: RecurringProfileState[] = [];
    for (const state of RECURRING_PROFILE_STATES) {
      if (isCurrentRecurringProfile({ status: state })) occupying.push(state);
    }
    expect(occupying).toEqual(["DRAFT", "ACTIVE"]);
    expect(isCurrentRecurringProfile({ status: "CANCELED" })).toBe(false);
    expect(isCurrentRecurringProfile({ status: "PENDING" })).toBe(true);
  });
});

describe("date derivations (criteria 9.3, 9.6)", () => {
  test("derives the next charge from the latest successful charge plus the stored interval", () => {
    const lastCharge = new Date("2026-03-10T09:00:00.000Z");
    expect(
      deriveRecurringNextChargeAt({
        lastSuccessfulChargeAt: lastCharge,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        intervalDays: 30,
      })
    ).toEqual(new Date(lastCharge.getTime() + 30 * DAY_MS));
  });

  test("falls back to the creation timestamp when no successful charge exists", () => {
    const createdAt = new Date("2026-02-05T06:30:00.000Z");
    expect(
      deriveRecurringNextChargeAt({
        lastSuccessfulChargeAt: null,
        createdAt,
        intervalDays: 365,
      })
    ).toEqual(new Date(createdAt.getTime() + 365 * DAY_MS));
  });

  test("rejects an unusable stored interval instead of assuming one", () => {
    for (const intervalDays of [0, -30, 1.5, Number.NaN, 100_000]) {
      expect(
        deriveRecurringNextChargeAt({
          lastSuccessfulChargeAt: null,
          createdAt: new Date(NOW),
          intervalDays,
        })
      ).toBeNull();
    }
  });

  test("extends from the later of the stored period end and the charge timestamp", () => {
    const storedEnd = new Date("2026-04-01T00:00:00.000Z");
    const earlyCharge = new Date("2026-03-20T00:00:00.000Z");
    const lateCharge = new Date("2026-04-10T00:00:00.000Z");

    expect(
      resolveExtendedPeriodEnd({
        currentPeriodEnd: storedEnd,
        chargedAt: earlyCharge,
        intervalDays: 30,
      })
    ).toEqual(new Date(storedEnd.getTime() + 30 * DAY_MS));

    expect(
      resolveExtendedPeriodEnd({
        currentPeriodEnd: storedEnd,
        chargedAt: lateCharge,
        intervalDays: 30,
      })
    ).toEqual(new Date(lateCharge.getTime() + 30 * DAY_MS));
  });
});

describe("checkout reservation (criteria 9.1, 9.11)", () => {
  test("copies the plan cycle amount, currency, and interval into the reservation", async () => {
    const fixture = scenario();
    const monthly = await reserved(fixture);

    expect(monthly.amountExact).toBe("129.99");
    expect(monthly.currency).toBe("SAR");
    expect(monthly.intervalDays).toBe(30);
    expect(monthly.retryCount).toBe(3);
    expect(monthly.subscriptionId).toBe(fixture.subscription.id);
    expect(monthly.ownerUserId).toBe("user-owner");
    expect(monthly.idempotencyKey).toBe(
      recurringCheckoutIdempotencyKey({ planId: PLAN, cycle: "MONTHLY" })
    );
    expect(fixture.repository.snapshot().intents).toHaveLength(1);
    // No provider operation is attempted while reserving.
    expect(fixture.provider.requests).toHaveLength(0);
  });

  test("copies the yearly literal and 365-day interval for a yearly cycle", async () => {
    const fixture = scenario();
    const result = await fixture.service.reserveCheckout({
      actor: ACTOR,
      workspaceId: WORKSPACE,
      planId: PLAN,
      billingCycle: "YEARLY",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reservation.amountExact).toBe("1299.9");
      expect(result.reservation.intervalDays).toBe(365);
    }
  });

  test("rejects a submitted amount instead of ignoring it", async () => {
    const fixture = scenario();
    for (const submittedAmount of [1, "1.00", 0]) {
      const result = await fixture.service.reserveCheckout({
        actor: ACTOR,
        workspaceId: WORKSPACE,
        planId: PLAN,
        billingCycle: "MONTHLY",
        submittedAmount,
      });
      expect(result).toEqual({
        ok: false,
        status: 400,
        code: "REQUEST_VALIDATION_FAILED",
        fieldPaths: ["amount"],
      });
    }
    expect(fixture.repository.snapshot().intents).toHaveLength(0);
  });

  test("rejects a cycle outside monthly and yearly", async () => {
    const fixture = scenario();
    for (const billingCycle of ["WEEKLY", "monthly", "", null, 30]) {
      const result = await fixture.service.reserveCheckout({
        actor: ACTOR,
        workspaceId: WORKSPACE,
        planId: PLAN,
        billingCycle,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("REQUEST_VALIDATION_FAILED");
      }
    }
    expect(fixture.repository.snapshot().intents).toHaveLength(0);
  });

  test("addresses no record for a workspace holding no subscription", async () => {
    const fixture = scenario();
    const result = await fixture.service.reserveCheckout({
      actor: ACTOR,
      workspaceId: OTHER_WORKSPACE,
      planId: PLAN,
      billingCycle: "MONTHLY",
    });
    expect(result).toEqual({ ok: false, status: 404, code: "RESOURCE_NOT_FOUND" });
    expect(fixture.repository.snapshot().intents).toHaveLength(0);
  });

  test("fails closed when the stored plan price is not an exact amount", async () => {
    const fixture = scenario({ priceMonthly: 0.1 + 0.2 });
    const result = await fixture.service.reserveCheckout({
      actor: ACTOR,
      workspaceId: WORKSPACE,
      planId: PLAN,
      billingCycle: "MONTHLY",
    });
    expect(result).toEqual({ ok: false, status: 503, code: "RECURRING_UNAVAILABLE" });
    expect(fixture.repository.snapshot().intents).toHaveLength(0);
  });

  test.each(["DRAFT", "ACTIVE"] as const)(
    "rejects a second checkout while a %s profile exists, calling no provider operation",
    async (status) => {
      const fixture = scenario();
      fixture.repository.seedProfile({
        subscriptionId: fixture.subscription.id,
        workspaceId: WORKSPACE,
        status,
      });

      const result = await fixture.service.reserveCheckout({
        actor: ACTOR,
        workspaceId: WORKSPACE,
        planId: PLAN,
        billingCycle: "MONTHLY",
      });

      expect(result).toEqual({
        ok: false,
        status: 409,
        code: "RECURRING_PROFILE_EXISTS",
      });
      expect(fixture.repository.snapshot().intents).toHaveLength(0);
      expect(fixture.repository.snapshot().profiles).toHaveLength(1);
      expect(fixture.provider.requests).toHaveLength(0);
    }
  );

  test.each(["SUSPENDED", "CANCELLED"] as const)(
    "permits a new checkout when the only profile is %s",
    async (status) => {
      const fixture = scenario();
      fixture.repository.seedProfile({
        subscriptionId: fixture.subscription.id,
        workspaceId: WORKSPACE,
        status,
      });
      const result = await fixture.service.reserveCheckout({
        actor: ACTOR,
        workspaceId: WORKSPACE,
        planId: PLAN,
        billingCycle: "MONTHLY",
      });
      expect(result.ok).toBe(true);
    }
  );

  test("resolves two concurrent attempts to one reservation and one conflict", async () => {
    const fixture = scenario();
    const command = {
      actor: ACTOR,
      workspaceId: WORKSPACE,
      planId: PLAN,
      billingCycle: "MONTHLY" as const,
    };

    const first = await fixture.service.reserveCheckout(command);
    const second = await fixture.service.reserveCheckout(command);

    expect(first.ok).toBe(true);
    expect(second).toEqual({
      ok: false,
      status: 409,
      code: "RECURRING_STATE_CONFLICT",
    });
    expect(fixture.repository.snapshot().intents).toHaveLength(1);
  });

  test("reclaims a released reservation so a customer can retry", async () => {
    const fixture = scenario();
    const first = await reserved(fixture);
    await fixture.service.releaseCheckout({ intentId: first.intentId });

    const retry = await reserved(fixture);
    expect(retry.intentId).toBe(first.intentId);
    expect(fixture.repository.snapshot().intents).toHaveLength(1);
  });
});

describe("draft finalization (criterion 9.1)", () => {
  test("persists exactly one DRAFT profile carrying the copied literals", async () => {
    const fixture = scenario();
    const reservation = await reserved(fixture);

    const result = await fixture.service.finalizeCheckout({
      reservation,
      provider: {
        recurringId: "rec-0001",
        invoiceId: "inv-0001",
        paymentUrl: null,
        customerReference: "ac_ref",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.state).toBe("DRAFT");
    expect(result.profile.amountExact).toBe("129.99");
    expect(result.profile.currency).toBe("SAR");
    expect(result.profile.intervalDays).toBe(30);
    expect(result.profile.recurringId).toBe("rec-0001");
    // Criterion 9.6: derived from creation plus the stored interval.
    expect(result.profile.nextChargeAt).toEqual(
      new Date(new Date(NOW).getTime() + 30 * DAY_MS)
    );

    const snapshot = fixture.repository.snapshot();
    expect(snapshot.profiles).toHaveLength(1);
    expect(snapshot.intents[0].status).toBe("FINALIZED");
    expect(snapshot.intents[0].providerReference).toBe("rec-0001");
  });

  test("creates no profile when the provider returned no recurring identifier", async () => {
    const fixture = scenario();
    const reservation = await reserved(fixture);

    const result = await fixture.service.finalizeCheckout({
      reservation,
      provider: {
        recurringId: "   ",
        invoiceId: null,
        paymentUrl: null,
        customerReference: null,
      },
    });

    expect(result).toEqual({ ok: false, status: 422, code: "RECURRING_UNAVAILABLE" });
    expect(fixture.repository.snapshot().profiles).toHaveLength(0);
  });

  test("creates no profile when the provider echoes a different amount or currency", async () => {
    for (const echo of [
      { reportedAmount: "130.00" },
      { reportedCurrency: "AED" },
    ] as const) {
      const fixture = scenario();
      const reservation = await reserved(fixture);
      const result = await fixture.service.finalizeCheckout({
        reservation,
        provider: {
          recurringId: "rec-0002",
          invoiceId: null,
          paymentUrl: null,
          customerReference: null,
          ...echo,
        },
      });
      expect(result).toEqual({
        ok: false,
        status: 422,
        code: "RECURRING_UNAVAILABLE",
      });
      expect(fixture.repository.snapshot().profiles).toHaveLength(0);
    }
  });

  test("accepts an echoed amount that differs only in scale", async () => {
    const fixture = scenario();
    const reservation = await reserved(fixture);
    const result = await fixture.service.finalizeCheckout({
      reservation,
      provider: {
        recurringId: "rec-0003",
        invoiceId: null,
        paymentUrl: null,
        customerReference: null,
        reportedAmount: "129.990",
        reportedCurrency: "sar",
      },
    });
    expect(result.ok).toBe(true);
  });

  test("reports a conflict when the reservation was closed by another request", async () => {
    const fixture = scenario();
    const reservation = await reserved(fixture);
    await fixture.service.releaseCheckout({ intentId: reservation.intentId });

    const result = await fixture.service.finalizeCheckout({
      reservation,
      provider: {
        recurringId: "rec-0004",
        invoiceId: null,
        paymentUrl: null,
        customerReference: null,
      },
    });
    expect(result).toEqual({
      ok: false,
      status: 409,
      code: "RECURRING_STATE_CONFLICT",
    });
    expect(fixture.repository.snapshot().profiles).toHaveLength(0);
  });

  test("rejects a second profile when one appeared after the reservation", async () => {
    const fixture = scenario();
    const reservation = await reserved(fixture);
    fixture.repository.seedProfile({
      subscriptionId: fixture.subscription.id,
      workspaceId: WORKSPACE,
      status: "ACTIVE",
    });

    const result = await fixture.service.finalizeCheckout({
      reservation,
      provider: {
        recurringId: "rec-0005",
        invoiceId: null,
        paymentUrl: null,
        customerReference: null,
      },
    });
    expect(result).toEqual({
      ok: false,
      status: 409,
      code: "RECURRING_PROFILE_EXISTS",
    });
    expect(fixture.repository.snapshot().profiles).toHaveLength(1);
  });

  test("leaves the store untouched when a staged write fails", async () => {
    const fixture = scenario();
    const reservation = await reserved(fixture);
    fixture.repository.failNextWriteAt("finalize");

    await expect(
      fixture.service.finalizeCheckout({
        reservation,
        provider: {
          recurringId: "rec-0006",
          invoiceId: null,
          paymentUrl: null,
          customerReference: null,
        },
      })
    ).rejects.toThrow(/Injected persistence failure/);

    const snapshot = fixture.repository.snapshot();
    expect(snapshot.profiles).toHaveLength(0);
    expect(snapshot.intents[0].status).toBe("PENDING");
  });
});

describe("state transitions and derived reads (criteria 9.3, 9.5, 9.6)", () => {
  test("activates a draft and records the charge timestamp on an accepted cycle", async () => {
    const fixture = scenario();
    const profile = storedProfile(fixture.repository, {
      subscriptionId: fixture.subscription.id,
      workspaceId: WORKSPACE,
      status: "DRAFT",
      failedCharges: 2,
      lastFailureReason: "declined",
    });
    const chargedAt = new Date("2026-03-05T00:00:00.000Z");

    const result = await fixture.service.transitionProfile({
      profile,
      trigger: "PROVIDER_CYCLE_SUCCEEDED",
      occurredAt: chargedAt,
      chargedAt,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.state).toBe("ACTIVE");
    expect(result.profile.lastChargeAt).toEqual(chargedAt);
    expect(result.profile.nextChargeAt).toEqual(
      new Date(chargedAt.getTime() + 30 * DAY_MS)
    );
    expect(result.profile.failedCharges).toBe(0);
    expect(result.profile.lastFailureReason).toBeNull();
    // The stored literal is untouched by the transition.
    expect(result.profile.amountExact).toBe("129.99");
  });

  test("stores a bounded failure reason and its timestamp without changing state", async () => {
    const fixture = scenario();
    const profile = storedProfile(fixture.repository, {
      subscriptionId: fixture.subscription.id,
      workspaceId: WORKSPACE,
      status: "ACTIVE",
    });
    const occurredAt = new Date("2026-03-07T00:00:00.000Z");

    const result = await fixture.service.transitionProfile({
      profile,
      trigger: "PROVIDER_CYCLE_FAILED",
      occurredAt,
      failureReason: "y".repeat(RECURRING_FAILURE_REASON_MAX_LENGTH + 10),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changedState).toBe(false);
    expect(result.profile.state).toBe("ACTIVE");
    expect(result.profile.failedCharges).toBe(1);
    expect(result.profile.lastFailureReason).toHaveLength(
      RECURRING_FAILURE_REASON_MAX_LENGTH
    );
    expect(result.profile.lastFailureAt).toEqual(occurredAt);
  });

  test("cancels an active profile and applies no further next charge date", async () => {
    const fixture = scenario();
    const profile = storedProfile(fixture.repository, {
      subscriptionId: fixture.subscription.id,
      workspaceId: WORKSPACE,
      status: "ACTIVE",
      nextChargeAt: new Date("2026-04-01T00:00:00.000Z"),
    });

    const result = await fixture.service.transitionProfile({
      profile,
      trigger: "MEMBER_CANCELLED",
      occurredAt: new Date(NOW),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.state).toBe("CANCELLED");
    expect(result.profile.cancelAllowed).toBe(false);
    expect(result.profile.resumeAllowed).toBe(false);
    expect(fixture.repository.snapshot().profiles[0].nextChargeAt).toBeNull();
  });

  test("rejects a member cancel and resume that the stored state does not permit", async () => {
    const fixture = scenario();
    for (const [status, trigger] of [
      ["DRAFT", "MEMBER_CANCELLED"],
      ["SUSPENDED", "MEMBER_CANCELLED"],
      ["CANCELLED", "MEMBER_CANCELLED"],
      ["ACTIVE", "MEMBER_RESUMED"],
      ["DRAFT", "MEMBER_RESUMED"],
    ] as const) {
      const profile = storedProfile(fixture.repository, {
        subscriptionId: fixture.subscription.id,
        workspaceId: WORKSPACE,
        status,
      });
      const result = await fixture.service.transitionProfile({
        profile,
        trigger,
        occurredAt: new Date(NOW),
      });
      expect(result).toEqual({
        ok: false,
        status: 409,
        code: "RECURRING_STATE_CONFLICT",
      });
    }
    // Nothing was written for any rejected transition.
    expect(fixture.repository.transitionCalls).toHaveLength(0);
  });

  test("resumes a suspended profile from the latest successful charge", async () => {
    const fixture = scenario();
    const lastCharge = new Date("2026-02-10T00:00:00.000Z");
    const profile = storedProfile(fixture.repository, {
      subscriptionId: fixture.subscription.id,
      workspaceId: WORKSPACE,
      status: "SUSPENDED",
      lastChargeAt: lastCharge,
    });

    const result = await fixture.service.transitionProfile({
      profile,
      trigger: "MEMBER_RESUMED",
      occurredAt: new Date(NOW),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.state).toBe("ACTIVE");
    expect(result.profile.nextChargeAt).toEqual(
      new Date(lastCharge.getTime() + 30 * DAY_MS)
    );
  });

  test("resumes from the creation timestamp when no successful charge exists", async () => {
    const fixture = scenario();
    const createdAt = new Date("2026-01-15T00:00:00.000Z");
    const profile = storedProfile(fixture.repository, {
      subscriptionId: fixture.subscription.id,
      workspaceId: WORKSPACE,
      status: "SUSPENDED",
      lastChargeAt: null,
      createdAt,
    });

    const result = await fixture.service.transitionProfile({
      profile,
      trigger: "MEMBER_RESUMED",
      occurredAt: new Date(NOW),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.nextChargeAt).toEqual(
        new Date(createdAt.getTime() + 30 * DAY_MS)
      );
    }
  });

  test("reports a conflict when the stored state moved before the write", async () => {
    const fixture = scenario();
    const profile = storedProfile(fixture.repository, {
      subscriptionId: fixture.subscription.id,
      workspaceId: WORKSPACE,
      status: "ACTIVE",
    });
    // Another request cancelled the same profile first.
    await fixture.service.transitionProfile({
      profile,
      trigger: "MEMBER_CANCELLED",
      occurredAt: new Date(NOW),
    });

    const second = await fixture.service.transitionProfile({
      profile,
      trigger: "MEMBER_CANCELLED",
      occurredAt: new Date(NOW),
    });
    expect(second).toEqual({
      ok: false,
      status: 409,
      code: "RECURRING_STATE_CONFLICT",
    });
  });

  test("projects the workspace profile with stored literals and the derived date", async () => {
    const fixture = scenario();
    const createdAt = new Date("2026-02-01T00:00:00.000Z");
    fixture.repository.seedProfile({
      subscriptionId: fixture.subscription.id,
      workspaceId: WORKSPACE,
      status: "SUSPENDED",
      amountExact: "1299.9",
      currency: "SAR",
      intervalDays: 365,
      createdAt,
    });

    const result = await fixture.service.readWorkspaceProfile({
      workspaceId: WORKSPACE,
    });
    expect(result.profile).not.toBeNull();
    const view = result.profile;
    if (!view) return;
    expect(view.amountExact).toBe("1299.9");
    expect(view.intervalDays).toBe(365);
    expect(view.state).toBe("SUSPENDED");
    expect(view.stateLabelKey).toBe("recurring_state_suspended");
    expect(view.nextChargeAt).toEqual(new Date(createdAt.getTime() + 365 * DAY_MS));
    expect(view.cancelAllowed).toBe(false);
    expect(view.resumeAllowed).toBe(true);
  });

  test("reports no profile for a workspace that holds none", async () => {
    const fixture = scenario();
    expect(
      await fixture.service.readWorkspaceProfile({ workspaceId: OTHER_WORKSPACE })
    ).toEqual({ ok: true, profile: null });
  });
});

describe("webhook idempotency and charge validation (criteria 9.7, 9.10)", () => {
  test("claims a new fingerprint once and reports a settled fingerprint as duplicate", async () => {
    const fixture = scenario();
    const claim = await fixture.service.claimWebhookEvent({
      fingerprint: "fp-0001",
      recurringId: "rec-0001",
    });
    expect(claim.ok).toBe(true);
    if (!("attempts" in claim)) throw new Error("expected a fresh claim");
    expect(claim.attempts).toBe(1);

    await fixture.service.settleWebhookEvent({
      eventId: claim.eventId,
      processingStatus: "PROCESSED",
      disposition: "CYCLE_CHARGED",
      signatureValid: true,
      settledAt: new Date(NOW),
    });

    const replay = await fixture.service.claimWebhookEvent({
      fingerprint: "fp-0001",
      recurringId: "rec-0001",
    });
    expect(replay).toEqual({
      ok: true,
      duplicate: true,
      eventId: claim.eventId,
    });

    const events = fixture.repository.snapshot().webhookEvents;
    expect(events).toHaveLength(1);
    expect(events[0].processingStatus).toBe("PROCESSED");
    expect(events[0].disposition).toBe("CYCLE_CHARGED");
  });

  test("allows a retry of an unsettled receipt", async () => {
    const fixture = scenario();
    const first = await fixture.service.claimWebhookEvent({ fingerprint: "fp-0002" });
    const retry = await fixture.service.claimWebhookEvent({ fingerprint: "fp-0002" });

    if (!("attempts" in first) || !("attempts" in retry)) {
      throw new Error("expected two fresh claims");
    }
    expect(first.attempts).toBe(1);
    expect(retry.attempts).toBe(2);
    expect(retry.eventId).toBe(first.eventId);
    expect(fixture.repository.snapshot().webhookEvents).toHaveLength(1);
  });

  test("rejects an absent or oversized fingerprint", async () => {
    const fixture = scenario();
    for (const fingerprint of ["", "   ", null, 42, "z".repeat(300)]) {
      const result = await fixture.service.claimWebhookEvent({ fingerprint });
      expect(result).toEqual({
        ok: false,
        status: 400,
        code: "REQUEST_VALIDATION_FAILED",
        fieldPaths: ["fingerprint"],
      });
    }
    expect(fixture.repository.snapshot().webhookEvents).toHaveLength(0);
  });

  test("reports the injected provider's configuration state and never substitutes one", async () => {
    const fixture = scenario();
    expect(await fixture.service.isProviderConfigured()).toBe(true);

    fixture.provider.setBehavior({ kind: "unconfigured" });
    expect(await fixture.service.isProviderConfigured()).toBe(false);

    // With no adapter injected the service reports unconfigured rather than
    // inventing a provider (criterion 9.9, requirement 19.2).
    const withoutProvider = createRecurringBillingService({
      repository: fixture.repository,
    });
    expect(await withoutProvider.isProviderConfigured()).toBe(false);
  });

  test("validates a reported charge against the stored profile values only", async () => {
    const fixture = scenario();
    const profile = storedProfile(fixture.repository, {
      subscriptionId: fixture.subscription.id,
      workspaceId: WORKSPACE,
      status: "ACTIVE",
      amountExact: "129.99",
      currency: "SAR",
    });

    expect(
      fixture.service.validateProviderCharge({
        profile,
        reportedAmount: 130,
        reportedCurrency: "SAR",
      })
    ).toEqual({ ok: true });

    expect(
      fixture.service.validateProviderCharge({
        profile,
        reportedAmount: "129.97",
        reportedCurrency: "SAR",
      })
    ).toEqual({ ok: false, reason: "AMOUNT_OUT_OF_TOLERANCE" });

    expect(
      fixture.service.validateProviderCharge({
        profile,
        reportedAmount: "129.99",
        reportedCurrency: "AED",
      })
    ).toEqual({ ok: false, reason: "CURRENCY_MISMATCH" });

    expect(
      fixture.service.validateProviderCharge({
        profile: { ...profile, amountExact: null },
        reportedAmount: "129.99",
        reportedCurrency: "SAR",
      })
    ).toEqual({ ok: false, reason: "PROFILE_VALUE_UNREADABLE" });
  });
});
