/**
 * Feature: platform-completion
 * Property 28: One current recurring profile per subscription
 * Property 29: Invalid recurring webhooks are side-effect free
 */

import { describe, expect, test } from "bun:test";
import {
  createRecurringBillingService,
  type StoredRecurringProfile,
} from "../../recurring-billing";
import {
  DeterministicClock,
  createFakeRecurringBillingRepository,
  createFakeRecurringProvider,
  type FakeRecurringBillingRepository,
} from "../support";

const WORKSPACE = "workspace-p28";
const PLAN = "plan-pro";
const NOW = "2026-07-20T00:00:00.000Z";
const ACTOR = Object.freeze({ userId: "user-writer" });

function fixture() {
  const repository = createFakeRecurringBillingRepository();
  const provider = createFakeRecurringProvider();
  const clock = new DeterministicClock(NOW);
  const service = createRecurringBillingService({ repository, provider, clock });
  repository.seedPlan({
    id: PLAN,
    priceMonthly: 199,
    priceYearly: 1990,
    currency: "SAR",
  });
  const subscription = repository.seedSubscription({
    id: "sub-p28",
    workspaceId: WORKSPACE,
    planId: PLAN,
    ownerUserId: ACTOR.userId,
  });
  return { repository, provider, clock, service, subscription };
}

function occupyingCount(repository: FakeRecurringBillingRepository): number {
  return repository.snapshot().profiles.filter((profile) => {
    const status = profile.status.toUpperCase();
    return status === "DRAFT" || status === "ACTIVE";
  }).length;
}

describe("Feature: platform-completion, Property 28: One current recurring profile per subscription", () => {
  test("checkout sequences keep at most one DRAFT/ACTIVE profile across 100+ cases", async () => {
    let cases = 0;

    for (let seed = 0; seed < 120; seed++) {
      const { repository, provider, service, subscription } = fixture();
      const occupyingState = seed % 3 === 0 ? "DRAFT" : seed % 3 === 1 ? "ACTIVE" : null;

      if (occupyingState) {
        repository.seedProfile({
          subscriptionId: subscription.id,
          workspaceId: WORKSPACE,
          status: occupyingState,
          amountExact: "199",
          currency: "SAR",
        });
      }

      const beforeCalls = provider.requests.length;
      const reserve = await service.reserveCheckout({
        actor: ACTOR,
        workspaceId: WORKSPACE,
        planId: PLAN,
        billingCycle: seed % 2 === 0 ? "MONTHLY" : "YEARLY",
      });

      if (occupyingState) {
        expect(reserve.ok).toBe(false);
        if (!reserve.ok) {
          expect(reserve.code).toBe("RECURRING_PROFILE_EXISTS");
        }
        expect(provider.requests.length).toBe(beforeCalls);
        expect(occupyingCount(repository)).toBe(1);
      } else {
        expect(reserve.ok).toBe(true);
        // Reservation alone never calls the provider and never creates a profile.
        expect(provider.requests.length).toBe(beforeCalls);
        expect(occupyingCount(repository)).toBe(0);
      }
      cases += 1;
    }

    expect(cases).toBeGreaterThanOrEqual(100);
  });
});

describe("Feature: platform-completion, Property 29: Invalid recurring webhooks are side-effect free", () => {
  test("amount/currency mismatches leave profile unchanged across 100+ cases", async () => {
    let cases = 0;

    for (let seed = 0; seed < 120; seed++) {
      const { repository, service, subscription } = fixture();
      const profile: StoredRecurringProfile = repository.seedProfile({
        subscriptionId: subscription.id,
        workspaceId: WORKSPACE,
        status: "ACTIVE",
        amountExact: "199.00",
        currency: "SAR",
        lastChargeAt: null,
        nextChargeAt: new Date("2026-08-20T00:00:00.000Z"),
        failedCharges: 0,
      });

      const badAmount = seed % 2 === 0;
      const validation = service.validateProviderCharge({
        profile,
        reportedAmount: badAmount ? "250.00" : "199.00",
        reportedCurrency: badAmount ? "SAR" : "USD",
      });
      expect(validation.ok).toBe(false);

      // No transition is applied after a failed validation.
      expect(repository.transitionCalls).toHaveLength(0);
      const stored = repository.snapshot().profiles.find((p) => p.id === profile.id);
      expect(stored?.status).toBe("ACTIVE");
      expect(stored?.lastChargeAt).toBeNull();
      expect(stored?.failedCharges).toBe(0);
      cases += 1;
    }

    expect(cases).toBeGreaterThanOrEqual(100);
  });
});
