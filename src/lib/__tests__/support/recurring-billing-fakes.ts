/**
 * In-memory recurring billing persistence and provider fakes (design 12.2).
 *
 * The repository reproduces the atomicity contract of the Prisma adapter:
 * `reserveCheckoutIntent`, `finalizeDraftProfile`, and `applyProfileTransition`
 * stage every write against a cloned store and publish it only when the whole
 * step succeeds, and each enforces the same guard its production counterpart
 * delegates to a database constraint:
 * - at most one `DRAFT`/`ACTIVE` profile per subscription (criterion 9.11);
 * - `(subscriptionId, idempotencyKey)` uniqueness on reservations;
 * - a conditional state update over the expected stored state;
 * - fingerprint uniqueness on webhook receipts (criterion 9.7).
 *
 * No test using these fakes performs network I/O, reaches a database, or issues
 * a charge.
 */

import type {
  ApplyRecurringTransitionInput,
  ApplyRecurringTransitionOutcome,
  ClaimRecurringWebhookInput,
  ClaimRecurringWebhookOutcome,
  CreateRecurringProfileRequest,
  CreateRecurringProfileResponse,
  FinalizeRecurringProfileInput,
  FinalizeRecurringProfileOutcome,
  RecurringBillingRepository,
  RecurringProviderAdapter,
  ReserveRecurringIntentInput,
  ReserveRecurringIntentOutcome,
  SettleRecurringWebhookInput,
  StoredPlanCycleAmount,
  StoredRecurringProfile,
  StoredRecurringSubscription,
} from "../../recurring-billing";
import {
  OCCUPYING_RECURRING_STATES,
  isReleasedRecurringIntentState,
  isSettledWebhookProcessingState,
  normalizeRecurringProfileState,
  readStoredPlanAmount,
  recurringIntervalDays,
  type RecurringBillingCycle,
} from "../../recurring-billing-state";

export type FakeRecurringPlan = {
  id: string;
  priceMonthly: number | string | null;
  priceYearly: number | string | null;
  currency: string;
};

export type FakeRecurringSubscription = {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  planId: string;
  status: string;
  billingCycle: string;
  currentPeriodEnd: Date;
};

export type FakeRecurringProfileRow = {
  id: string;
  userId: string;
  workspaceId: string | null;
  subscriptionId: string | null;
  planId: string | null;
  recurringId: string;
  status: string;
  recurringType: string | null;
  intervalDays: number | null;
  amountExact: string | null;
  currency: string;
  customerReference: string | null;
  initialInvoiceId: string | null;
  nextChargeAt: Date | null;
  lastChargeAt: Date | null;
  failedCharges: number;
  lastFailureReason: string | null;
  lastFailureAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FakeRecurringIntentRow = {
  id: string;
  workspaceId: string;
  subscriptionId: string;
  planId: string;
  createdById: string;
  idempotencyKey: string;
  billingCycle: string;
  amountExact: string;
  currency: string;
  status: string;
  providerReference: string | null;
  finalizedAt: Date | null;
};

export type FakeWebhookEventRow = {
  id: string;
  eventFingerprint: string;
  eventName: string | null;
  recurringId: string | null;
  invoiceId: string | null;
  paymentId: string | null;
  customerReference: string | null;
  processingStatus: string;
  disposition: string | null;
  signatureValid: boolean;
  attempts: number;
  processedAt: Date | null;
};

export type RecurringStoreSnapshot = Readonly<{
  profiles: readonly FakeRecurringProfileRow[];
  intents: readonly FakeRecurringIntentRow[];
  webhookEvents: readonly FakeWebhookEventRow[];
}>;

/** Write boundary a test can fail inside a staged transaction. */
export type RecurringWriteBoundary = "intent" | "profile" | "finalize" | "transition";

export class InjectedRecurringWriteFailure extends Error {
  constructor(readonly boundary: RecurringWriteBoundary) {
    super(`Injected persistence failure at the ${boundary} write boundary.`);
    this.name = "InjectedRecurringWriteFailure";
  }
}

type RecurringStoreState = {
  plans: FakeRecurringPlan[];
  subscriptions: FakeRecurringSubscription[];
  profiles: FakeRecurringProfileRow[];
  intents: FakeRecurringIntentRow[];
  webhookEvents: FakeWebhookEventRow[];
};

export type FakeRecurringBillingRepository = RecurringBillingRepository &
  Readonly<{
    snapshot(): RecurringStoreSnapshot;
    seedPlan(plan: Readonly<Partial<FakeRecurringPlan> & { id: string }>): FakeRecurringPlan;
    seedSubscription(
      subscription: Readonly<
        Partial<FakeRecurringSubscription> & { workspaceId: string; planId: string }
      >
    ): FakeRecurringSubscription;
    seedProfile(
      profile: Readonly<
        Partial<FakeRecurringProfileRow> & { subscriptionId: string; status: string }
      >
    ): FakeRecurringProfileRow;
    seedIntent(
      intent: Readonly<
        Partial<FakeRecurringIntentRow> & { subscriptionId: string; idempotencyKey: string }
      >
    ): FakeRecurringIntentRow;
    seedWebhookEvent(
      event: Readonly<Partial<FakeWebhookEventRow> & { eventFingerprint: string }>
    ): FakeWebhookEventRow;
    failNextWriteAt(boundary: RecurringWriteBoundary | null): void;
    readonly reserveCalls: readonly ReserveRecurringIntentInput[];
    readonly finalizeCalls: readonly FinalizeRecurringProfileInput[];
    readonly transitionCalls: readonly ApplyRecurringTransitionInput[];
  }>;

const DEFAULT_PERIOD_END = new Date("2026-02-01T00:00:00.000Z");
const EPOCH = new Date("2026-01-01T00:00:00.000Z");

export function createFakeRecurringBillingRepository(): FakeRecurringBillingRepository {
  let state: RecurringStoreState = {
    plans: [],
    subscriptions: [],
    profiles: [],
    intents: [],
    webhookEvents: [],
  };
  let sequence = 0;
  let failBoundary: RecurringWriteBoundary | null = null;
  const reserveCalls: ReserveRecurringIntentInput[] = [];
  const finalizeCalls: FinalizeRecurringProfileInput[] = [];
  const transitionCalls: ApplyRecurringTransitionInput[] = [];

  const nextId = (prefix: string): string => {
    sequence += 1;
    return `${prefix}-${String(sequence).padStart(4, "0")}`;
  };

  const clone = (source: RecurringStoreState): RecurringStoreState => ({
    plans: source.plans.map((plan) => ({ ...plan })),
    subscriptions: source.subscriptions.map((row) => ({ ...row })),
    profiles: source.profiles.map((row) => ({ ...row })),
    intents: source.intents.map((row) => ({ ...row })),
    webhookEvents: source.webhookEvents.map((row) => ({ ...row })),
  });

  const failIfRequested = (boundary: RecurringWriteBoundary): void => {
    if (failBoundary === boundary) {
      failBoundary = null;
      throw new InjectedRecurringWriteFailure(boundary);
    }
  };

  const occupies = (row: FakeRecurringProfileRow): boolean => {
    const normalized = normalizeRecurringProfileState(row.status);
    return (
      normalized !== null &&
      (OCCUPYING_RECURRING_STATES as readonly string[]).includes(normalized)
    );
  };

  const toStored = (row: FakeRecurringProfileRow): StoredRecurringProfile =>
    Object.freeze({ ...row });

  return Object.freeze({
    reserveCalls,
    finalizeCalls,
    transitionCalls,

    snapshot: () => {
      const copy = clone(state);
      return Object.freeze({
        profiles: copy.profiles,
        intents: copy.intents,
        webhookEvents: copy.webhookEvents,
      });
    },

    seedPlan: (plan) => {
      const record: FakeRecurringPlan = {
        id: plan.id,
        priceMonthly: plan.priceMonthly ?? 129.99,
        priceYearly: plan.priceYearly ?? 1299.9,
        currency: plan.currency ?? "SAR",
      };
      state.plans.push(record);
      return { ...record };
    },

    seedSubscription: (subscription) => {
      const record: FakeRecurringSubscription = {
        id: subscription.id ?? nextId("sub"),
        workspaceId: subscription.workspaceId,
        ownerUserId: subscription.ownerUserId ?? nextId("user"),
        planId: subscription.planId,
        status: subscription.status ?? "ACTIVE",
        billingCycle: subscription.billingCycle ?? "MONTHLY",
        currentPeriodEnd: subscription.currentPeriodEnd ?? DEFAULT_PERIOD_END,
      };
      state.subscriptions.push(record);
      return { ...record };
    },

    seedProfile: (profile) => {
      const record: FakeRecurringProfileRow = {
        id: profile.id ?? nextId("profile"),
        userId: profile.userId ?? nextId("user"),
        workspaceId: profile.workspaceId ?? null,
        subscriptionId: profile.subscriptionId,
        planId: profile.planId ?? null,
        recurringId: profile.recurringId ?? nextId("rec"),
        status: profile.status,
        recurringType: profile.recurringType ?? "Monthly",
        intervalDays: profile.intervalDays ?? 30,
        amountExact: profile.amountExact ?? "129.99",
        currency: profile.currency ?? "SAR",
        customerReference: profile.customerReference ?? null,
        initialInvoiceId: profile.initialInvoiceId ?? null,
        nextChargeAt: profile.nextChargeAt ?? null,
        lastChargeAt: profile.lastChargeAt ?? null,
        failedCharges: profile.failedCharges ?? 0,
        lastFailureReason: profile.lastFailureReason ?? null,
        lastFailureAt: profile.lastFailureAt ?? null,
        createdAt: profile.createdAt ?? EPOCH,
        updatedAt: profile.updatedAt ?? EPOCH,
      };
      state.profiles.push(record);
      return { ...record };
    },

    seedIntent: (intent) => {
      const record: FakeRecurringIntentRow = {
        id: intent.id ?? nextId("intent"),
        workspaceId: intent.workspaceId ?? "workspace-seed",
        subscriptionId: intent.subscriptionId,
        planId: intent.planId ?? "plan-seed",
        createdById: intent.createdById ?? nextId("user"),
        idempotencyKey: intent.idempotencyKey,
        billingCycle: intent.billingCycle ?? "MONTHLY",
        amountExact: intent.amountExact ?? "129.99",
        currency: intent.currency ?? "SAR",
        status: intent.status ?? "PENDING",
        providerReference: intent.providerReference ?? null,
        finalizedAt: intent.finalizedAt ?? null,
      };
      state.intents.push(record);
      return { ...record };
    },

    seedWebhookEvent: (event) => {
      const record: FakeWebhookEventRow = {
        id: event.id ?? nextId("event"),
        eventFingerprint: event.eventFingerprint,
        eventName: event.eventName ?? null,
        recurringId: event.recurringId ?? null,
        invoiceId: event.invoiceId ?? null,
        paymentId: event.paymentId ?? null,
        customerReference: event.customerReference ?? null,
        processingStatus: event.processingStatus ?? "RECEIVED",
        disposition: event.disposition ?? null,
        signatureValid: event.signatureValid ?? false,
        attempts: event.attempts ?? 1,
        processedAt: event.processedAt ?? null,
      };
      state.webhookEvents.push(record);
      return { ...record };
    },

    failNextWriteAt: (boundary) => {
      failBoundary = boundary;
    },

    findSubscriptionByWorkspace: async (
      workspaceId: string
    ): Promise<StoredRecurringSubscription | null> => {
      const row = state.subscriptions.find(
        (candidate) => candidate.workspaceId === workspaceId
      );
      if (!row) return null;
      return Object.freeze({
        subscriptionId: row.id,
        workspaceId: row.workspaceId,
        ownerUserId: row.ownerUserId,
        planId: row.planId,
        billingCycle: row.billingCycle,
        status: row.status,
        currentPeriodEnd: row.currentPeriodEnd,
      });
    },

    readPlanCycleAmount: async ({
      planId,
      cycle,
    }: Readonly<{ planId: string; cycle: RecurringBillingCycle }>): Promise<
      StoredPlanCycleAmount | null
    > => {
      const plan = state.plans.find((candidate) => candidate.id === planId);
      if (!plan) return null;
      const stored = cycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly;
      const amount = readStoredPlanAmount(stored);
      if (!amount.ok) return null;
      return Object.freeze({
        planId: plan.id,
        cycle,
        amountExact: amount.amount.text,
        currency: plan.currency,
        intervalDays: recurringIntervalDays(cycle),
      });
    },

    findCurrentProfileBySubscription: async (subscriptionId: string) => {
      const row = [...state.profiles]
        .reverse()
        .find(
          (candidate) =>
            candidate.subscriptionId === subscriptionId && occupies(candidate)
        );
      return row ? toStored(row) : null;
    },

    findLatestProfileByWorkspace: async (workspaceId: string) => {
      const row = [...state.profiles]
        .filter((candidate) => candidate.workspaceId === workspaceId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .at(0);
      return row ? toStored(row) : null;
    },

    reserveCheckoutIntent: async (
      input: ReserveRecurringIntentInput
    ): Promise<ReserveRecurringIntentOutcome> => {
      reserveCalls.push(input);
      const staged = clone(state);

      if (
        staged.profiles.some(
          (row) => row.subscriptionId === input.subscriptionId && occupies(row)
        )
      ) {
        return { kind: "PROFILE_EXISTS" };
      }

      const existing = staged.intents.find(
        (row) =>
          row.subscriptionId === input.subscriptionId &&
          row.idempotencyKey === input.idempotencyKey
      );

      failIfRequested("intent");

      if (existing) {
        if (existing.status === "FINALIZED") return { kind: "PROFILE_EXISTS" };
        if (!isReleasedRecurringIntentState(existing.status)) {
          return { kind: "IN_PROGRESS" };
        }
        existing.status = "PENDING";
        existing.createdById = input.createdById;
        existing.planId = input.planId;
        existing.billingCycle = input.billingCycle;
        existing.amountExact = input.amountExact;
        existing.currency = input.currency;
        existing.providerReference = null;
        existing.finalizedAt = null;
        state = staged;
        return { kind: "RESERVED", intentId: existing.id };
      }

      const created: FakeRecurringIntentRow = {
        id: nextId("intent"),
        workspaceId: input.workspaceId,
        subscriptionId: input.subscriptionId,
        planId: input.planId,
        createdById: input.createdById,
        idempotencyKey: input.idempotencyKey,
        billingCycle: input.billingCycle,
        amountExact: input.amountExact,
        currency: input.currency,
        status: "PENDING",
        providerReference: null,
        finalizedAt: null,
      };
      staged.intents.push(created);
      state = staged;
      return { kind: "RESERVED", intentId: created.id };
    },

    releaseCheckoutIntent: async ({ intentId, state: released }) => {
      const row = state.intents.find((candidate) => candidate.id === intentId);
      if (row && row.status === "PENDING") row.status = released;
    },

    finalizeDraftProfile: async (
      input: FinalizeRecurringProfileInput
    ): Promise<FinalizeRecurringProfileOutcome> => {
      finalizeCalls.push(input);
      const staged = clone(state);

      const intent = staged.intents.find((row) => row.id === input.intentId);
      if (
        !intent ||
        intent.status !== "PENDING" ||
        intent.subscriptionId !== input.subscriptionId
      ) {
        return { kind: "RESERVATION_LOST" };
      }
      if (
        staged.profiles.some(
          (row) => row.subscriptionId === input.subscriptionId && occupies(row)
        )
      ) {
        return { kind: "PROFILE_EXISTS" };
      }

      failIfRequested("profile");
      const created: FakeRecurringProfileRow = {
        id: nextId("profile"),
        userId: input.userId,
        workspaceId: input.workspaceId,
        subscriptionId: input.subscriptionId,
        planId: input.planId,
        recurringId: input.recurringId,
        status: "DRAFT",
        recurringType: input.recurringType,
        intervalDays: input.intervalDays,
        amountExact: input.amountExact,
        currency: input.currency,
        customerReference: input.customerReference,
        initialInvoiceId: input.initialInvoiceId,
        nextChargeAt: input.nextChargeAt,
        lastChargeAt: null,
        failedCharges: 0,
        lastFailureReason: null,
        lastFailureAt: null,
        createdAt: input.finalizedAt,
        updatedAt: input.finalizedAt,
      };
      staged.profiles.push(created);

      failIfRequested("finalize");
      intent.status = "FINALIZED";
      intent.providerReference = input.recurringId;
      intent.finalizedAt = input.finalizedAt;

      state = staged;
      return { kind: "FINALIZED", profile: toStored(created) };
    },

    applyProfileTransition: async (
      input: ApplyRecurringTransitionInput
    ): Promise<ApplyRecurringTransitionOutcome> => {
      transitionCalls.push(input);
      const staged = clone(state);
      const row = staged.profiles.find(
        (candidate) => candidate.id === input.profileId
      );
      if (!row) return { kind: "NOT_FOUND" };

      // Conditional update over the expected stored state.
      if (normalizeRecurringProfileState(row.status) !== input.expectedState) {
        return { kind: "STATE_CHANGED" };
      }

      failIfRequested("transition");
      row.status = input.nextState;
      row.updatedAt = input.occurredAt;
      if (input.nextChargeAt !== undefined) row.nextChargeAt = input.nextChargeAt;
      if (input.lastChargeAt !== undefined) row.lastChargeAt = input.lastChargeAt;
      if (input.incrementFailureCount) {
        row.failedCharges += 1;
        row.lastFailureReason = input.failureReason ?? null;
        row.lastFailureAt = input.occurredAt;
      }
      if (input.clearFailureState) {
        row.failedCharges = 0;
        row.lastFailureReason = null;
        row.lastFailureAt = null;
      }

      state = staged;
      return { kind: "APPLIED", profile: toStored(row) };
    },

    claimWebhookEvent: async (
      input: ClaimRecurringWebhookInput
    ): Promise<ClaimRecurringWebhookOutcome> => {
      const existing = state.webhookEvents.find(
        (row) => row.eventFingerprint === input.fingerprint
      );

      if (existing && isSettledWebhookProcessingState(existing.processingStatus)) {
        return {
          kind: "DUPLICATE",
          eventId: existing.id,
          processingStatus: existing.processingStatus,
        };
      }
      if (existing) {
        existing.attempts += 1;
        return {
          kind: "CLAIMED",
          eventId: existing.id,
          attempts: existing.attempts,
        };
      }

      const created: FakeWebhookEventRow = {
        id: nextId("event"),
        eventFingerprint: input.fingerprint,
        eventName: input.eventName,
        recurringId: input.recurringId,
        invoiceId: input.invoiceId,
        paymentId: input.paymentId,
        customerReference: input.customerReference,
        processingStatus: "RECEIVED",
        disposition: null,
        signatureValid: false,
        attempts: 1,
        processedAt: null,
      };
      state.webhookEvents.push(created);
      return { kind: "CLAIMED", eventId: created.id, attempts: created.attempts };
    },

    settleWebhookEvent: async (input: SettleRecurringWebhookInput) => {
      const row = state.webhookEvents.find(
        (candidate) => candidate.id === input.eventId
      );
      if (!row) return;
      row.processingStatus = input.processingStatus;
      row.disposition = input.disposition;
      row.signatureValid = input.signatureValid;
      row.processedAt = input.settledAt;
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Provider fake                                                              */
/* -------------------------------------------------------------------------- */

export type FakeRecurringProviderBehavior =
  | Readonly<{ kind: "unconfigured" }>
  | Readonly<{
      kind: "created";
      recurringId?: string;
      reportedAmount?: string | null;
      reportedCurrency?: string | null;
    }>
  /** Accepted, but no recurring identifier was returned (criterion 9.2). */
  | Readonly<{ kind: "missingRecurringId" }>
  | Readonly<{ kind: "rejected" }>
  /** Never settles until the injected deadline aborts the call. */
  | Readonly<{ kind: "hangs" }>;

export type FakeRecurringProvider = RecurringProviderAdapter &
  Readonly<{
    readonly requests: readonly CreateRecurringProfileRequest[];
    readonly cancelled: readonly string[];
    readonly resumed: readonly string[];
    readonly abortReasons: readonly unknown[];
    setBehavior(behavior: FakeRecurringProviderBehavior): void;
    setAck(ack: boolean): void;
  }>;

export function createFakeRecurringProvider(
  initial: FakeRecurringProviderBehavior = { kind: "created" }
): FakeRecurringProvider {
  let behavior = initial;
  let ack = true;
  const requests: CreateRecurringProfileRequest[] = [];
  const cancelled: string[] = [];
  const resumed: string[] = [];
  const abortReasons: unknown[] = [];

  return Object.freeze({
    requests,
    cancelled,
    resumed,
    abortReasons,
    setBehavior: (next: FakeRecurringProviderBehavior) => {
      behavior = next;
    },
    setAck: (next: boolean) => {
      ack = next;
    },

    isConfigured: async () => behavior.kind !== "unconfigured",

    createRecurringProfile: async (
      request,
      context
    ): Promise<CreateRecurringProfileResponse> => {
      requests.push(request);
      switch (behavior.kind) {
        case "created":
          return {
            recurringId: behavior.recurringId ?? "rec-provider-0001",
            invoiceId: "inv-0001",
            paymentUrl: "https://apitest.myfatoorah.com/pay/inv-0001",
            customerReference: request.customerReference,
            reportedAmount: behavior.reportedAmount ?? null,
            reportedCurrency: behavior.reportedCurrency ?? null,
          };
        case "missingRecurringId":
          return {
            recurringId: "",
            invoiceId: "inv-0002",
            paymentUrl: null,
            customerReference: request.customerReference,
          };
        case "rejected":
          throw new Error("Injected MyFatoorah recurring rejection");
        case "unconfigured":
          throw new Error("MyFatoorah is not configured");
        case "hangs":
          return new Promise<CreateRecurringProfileResponse>((_, reject) => {
            context.signal.addEventListener(
              "abort",
              () => {
                abortReasons.push(context.signal.reason);
                reject(context.signal.reason);
              },
              { once: true }
            );
          });
      }
    },

    cancelRecurringProfile: async ({ recurringId }) => {
      cancelled.push(recurringId);
      return { ok: ack };
    },

    resumeRecurringProfile: async ({ recurringId }) => {
      resumed.push(recurringId);
      return { ok: ack };
    },
  });
}
