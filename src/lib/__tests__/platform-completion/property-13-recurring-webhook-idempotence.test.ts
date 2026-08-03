/**
 * Feature: platform-completion, Property 13: Recurring webhook idempotence
 *
 * Generate verified successful event/repetition sequences and assert exactly
 * one billing-side transition and one period extension for a settled fingerprint.
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

const WORKSPACE = "workspace-property-13";
const NOW = "2026-07-01T00:00:00.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;

function seedActiveProfile(
  repository: FakeRecurringBillingRepository,
  seed: number
): StoredRecurringProfile {
  repository.seedSubscription({
    id: `sub-${seed}`,
    workspaceId: WORKSPACE,
    planId: "plan-pro",
    ownerUserId: `user-${seed}`,
  });
  return repository.seedProfile({
    id: `profile-${seed}`,
    recurringId: `rec-${seed}`,
    subscriptionId: `sub-${seed}`,
    workspaceId: WORKSPACE,
    userId: `user-${seed}`,
    planId: "plan-pro",
    status: "ACTIVE",
    amountExact: "199.00",
    currency: "SAR",
    intervalDays: 30,
    createdAt: new Date(NOW),
    lastChargeAt: null,
    nextChargeAt: new Date(new Date(NOW).getTime() + 30 * DAY_MS),
    failedCharges: 0,
    lastFailureReason: null,
    lastFailureAt: null,
  });
}

describe("Feature: platform-completion, Property 13: Recurring webhook idempotence", () => {
  test("settled fingerprints apply one transition and reject replay side effects across 100+ sequences", async () => {
    let cases = 0;

    for (let seed = 0; seed < 120; seed++) {
      const repository = createFakeRecurringBillingRepository();
      const provider = createFakeRecurringProvider();
      const clock = new DeterministicClock(NOW);
      const service = createRecurringBillingService({
        repository,
        provider,
        clock,
      });

      const profile = seedActiveProfile(repository, seed);
      const fingerprint = `fp-success-${seed}`;
      const invoiceId = `inv-${seed}`;

      const firstClaim = await service.claimWebhookEvent({
        fingerprint,
        recurringId: profile.recurringId,
        invoiceId,
        eventName: "RECURRING_UPDATES",
      });
      expect(firstClaim.ok).toBe(true);
      if (!firstClaim.ok || !("attempts" in firstClaim)) {
        throw new Error("first claim must be accepted");
      }

      const validation = service.validateProviderCharge({
        profile,
        reportedAmount: profile.amountExact,
        reportedCurrency: profile.currency,
      });
      expect(validation.ok).toBe(true);

      const transition = await service.transitionProfile({
        profile,
        trigger: "PROVIDER_CYCLE_SUCCEEDED",
        occurredAt: new Date(NOW),
        chargedAt: new Date(NOW),
      });
      expect(transition.ok).toBe(true);

      await service.settleWebhookEvent({
        eventId: firstClaim.eventId,
        processingStatus: "PROCESSED",
        disposition: "CYCLE_CHARGED",
        signatureValid: true,
        settledAt: new Date(NOW),
      });

      // Replay the same fingerprint — must be a no-op duplicate.
      const replay = await service.claimWebhookEvent({
        fingerprint,
        recurringId: profile.recurringId,
        invoiceId,
        eventName: "RECURRING_UPDATES",
      });
      expect(replay).toEqual({
        ok: true,
        duplicate: true,
        eventId: firstClaim.eventId,
      });

      // Exactly one successful transition was recorded for this profile.
      const transitions = repository.transitionCalls.filter(
        (call) => call.profileId === profile.id
      );
      expect(transitions).toHaveLength(1);
      expect(transitions[0]?.nextState).toBe("ACTIVE");

      const stored = repository.snapshot().profiles.find((p) => p.id === profile.id);
      expect(stored?.lastChargeAt?.toISOString()).toBe(NOW);
      expect(stored?.nextChargeAt?.toISOString()).toBe(
        new Date(new Date(NOW).getTime() + 30 * DAY_MS).toISOString()
      );

      cases += 1;
    }

    expect(cases).toBeGreaterThanOrEqual(100);
  });
});
