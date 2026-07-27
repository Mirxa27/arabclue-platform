/**
 * Production adapters for the Recurring_Billing_Service (design 4.6, section 6).
 *
 * This module owns every external boundary the domain service declares:
 * PostgreSQL through Prisma serializable transactions and the MyFatoorah
 * recurring endpoints. Keeping the adapters here lets `recurring-billing.ts`
 * express the state model and persistence rules while unit and property tests
 * drive them with in-memory fakes — no provider call, no charge, no database
 * write.
 *
 * Atomicity notes, one method per requirement step:
 * - `reserveCheckoutIntent` re-reads the subscription's occupying profile and
 *   inserts or reclaims the reservation in one serializable transaction; the
 *   `(subscriptionId, idempotencyKey)` unique index decides a concurrent race
 *   before MyFatoorah is called (criterion 9.11).
 * - `finalizeDraftProfile` re-checks the reservation and the occupying profile,
 *   then inserts exactly one `DRAFT` row. The partial unique index
 *   `MyFatoorahRecurringProfile_subscriptionId_current_key` rejects a second
 *   draft or active row for the same subscription even under a lost race.
 * - `applyProfileTransition` is a conditional update over the expected stored
 *   state, so a state that moved between the read and the write reports a
 *   conflict rather than overwriting the newer state (criteria 9.5, 9.6, 9.13).
 * - `claimWebhookEvent` inserts the fingerprint or reports the settled row as a
 *   duplicate, so a replayed event applies nothing (criterion 9.7).
 *
 * No method computes a monetary value: amounts move as the stored literal
 * (requirement 19.7).
 */

import { Prisma } from "@prisma/client";
import { db } from "./db";
import { asSchemaMigrationPendingError } from "./api-failure";
import {
  cancelRecurringPayment,
  createRecurringPayment,
  getMyFatoorahPublicConfig,
  initiatePayment,
  resumeRecurringPayment,
} from "./myfatoorah";
import {
  createRecurringBillingService,
  isCurrentRecurringProfile,
  type ApplyRecurringTransitionInput,
  type ApplyRecurringTransitionOutcome,
  type ClaimRecurringWebhookInput,
  type ClaimRecurringWebhookOutcome,
  type CreateRecurringProfileRequest,
  type CreateRecurringProfileResponse,
  type FinalizeRecurringProfileInput,
  type FinalizeRecurringProfileOutcome,
  type RecurringBillingRepository,
  type RecurringBillingService,
  type RecurringBillingServiceDependencies,
  type RecurringProviderAdapter,
  type ReserveRecurringIntentInput,
  type ReserveRecurringIntentOutcome,
  type SettleRecurringWebhookInput,
  type StoredPlanCycleAmount,
  type StoredRecurringProfile,
  type StoredRecurringSubscription,
} from "./recurring-billing";
import {
  OCCUPYING_RECURRING_STATES,
  RECURRING_PROVIDER_RETRY_COUNT,
  isReleasedRecurringIntentState,
  isSettledWebhookProcessingState,
  readStoredPlanAmount,
  recurringIntervalDays,
  type RecurringBillingCycle,
} from "./recurring-billing-state";

type PrismaClientLike = typeof db;
type PrismaTransactionClient = Prisma.TransactionClient;

const RECURRING_TRANSACTION_MAX_WAIT_MS = 2_000;
const RECURRING_TRANSACTION_TIMEOUT_MS = 10_000;

const PROFILE_SELECT = {
  id: true,
  userId: true,
  workspaceId: true,
  subscriptionId: true,
  planId: true,
  recurringId: true,
  status: true,
  recurringType: true,
  intervalDays: true,
  amountExact: true,
  currency: true,
  customerReference: true,
  initialInvoiceId: true,
  nextChargeAt: true,
  lastChargeAt: true,
  failedCharges: true,
  lastFailureReason: true,
  lastFailureAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Copies a selected row field by field, so a column added later cannot reach the
 * domain until this adapter is updated. `PROFILE_SELECT` and
 * `StoredRecurringProfile` carry the same field set, which is what makes the
 * parameter type valid for every read below.
 */
function toStoredProfile(row: StoredRecurringProfile): StoredRecurringProfile {
  return Object.freeze({
    id: row.id,
    userId: row.userId,
    workspaceId: row.workspaceId,
    subscriptionId: row.subscriptionId,
    planId: row.planId,
    recurringId: row.recurringId,
    status: row.status,
    recurringType: row.recurringType,
    intervalDays: row.intervalDays,
    amountExact: row.amountExact,
    currency: row.currency,
    customerReference: row.customerReference,
    initialInvoiceId: row.initialInvoiceId,
    nextChargeAt: row.nextChargeAt,
    lastChargeAt: row.lastChargeAt,
    failedCharges: row.failedCharges,
    lastFailureReason: row.lastFailureReason,
    lastFailureAt: row.lastFailureAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

/** Missing relations and columns surface as the typed schema-pending failure. */
async function withMappedFailures<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const pending = asSchemaMigrationPendingError(error);
    if (pending) throw pending;
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

/* -------------------------------------------------------------------------- */
/* Repository                                                                 */
/* -------------------------------------------------------------------------- */

export function createPrismaRecurringBillingRepository(
  client: PrismaClientLike = db
): RecurringBillingRepository {
  return Object.freeze({
    async findSubscriptionByWorkspace(workspaceId) {
      return withMappedFailures(() =>
        readSubscriptionByWorkspace(client, workspaceId)
      );
    },

    async readPlanCycleAmount({ planId, cycle }) {
      return withMappedFailures(() => readPlanCycleAmount(client, planId, cycle));
    },

    async findCurrentProfileBySubscription(subscriptionId) {
      return withMappedFailures(async () => {
        const row = await client.myFatoorahRecurringProfile.findFirst({
          where: {
            subscriptionId,
            status: { in: [...OCCUPYING_RECURRING_STATES] },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: PROFILE_SELECT,
        });
        return row ? toStoredProfile(row) : null;
      });
    },

    async findLatestProfileByWorkspace(workspaceId) {
      return withMappedFailures(async () => {
        const row = await client.myFatoorahRecurringProfile.findFirst({
          where: { workspaceId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: PROFILE_SELECT,
        });
        return row ? toStoredProfile(row) : null;
      });
    },

    async reserveCheckoutIntent(input) {
      return withMappedFailures(() => runReserveTransaction(client, input));
    },

    async releaseCheckoutIntent({ intentId, state, at }) {
      await withMappedFailures(() =>
        client.recurringCheckoutIntent.updateMany({
          where: { id: intentId, status: "PENDING" },
          data: { status: state, updatedAt: at },
        })
      );
    },

    async finalizeDraftProfile(input) {
      return withMappedFailures(() => runFinalizeTransaction(client, input));
    },

    async applyProfileTransition(input) {
      return withMappedFailures(() => runTransitionTransaction(client, input));
    },

    async claimWebhookEvent(input) {
      return withMappedFailures(() => claimWebhookEventRow(client, input));
    },

    async settleWebhookEvent(input) {
      await withMappedFailures(() => settleWebhookEvent(client, input));
    },
  });
}

/**
 * The workspace's subscription, resolved through the workspace owner
 * (design 4.6: recurring billing is scoped to workspace subscription, not merely
 * to a user). `Subscription.userId` is unique, so the owner's row is the
 * workspace subscription.
 */
async function readSubscriptionByWorkspace(
  client: PrismaClientLike | PrismaTransactionClient,
  workspaceId: string
): Promise<StoredRecurringSubscription | null> {
  const owner = await client.workspaceMember.findFirst({
    where: { workspaceId, role: "OWNER" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!owner) return null;

  const subscription = await client.subscription.findUnique({
    where: { userId: owner.userId },
    select: {
      id: true,
      userId: true,
      planId: true,
      status: true,
      billingCycle: true,
      currentPeriodEnd: true,
    },
  });
  if (!subscription) return null;

  return Object.freeze({
    subscriptionId: subscription.id,
    workspaceId,
    ownerUserId: subscription.userId,
    planId: subscription.planId,
    billingCycle: subscription.billingCycle,
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
  });
}

/**
 * The plan's stored cycle price and currency, copied verbatim (criterion 9.1).
 *
 * `readStoredPlanAmount` refuses a stored value that is not already an exact
 * decimal literal, so this read returns null rather than rounding a price the
 * tenant never stored (requirement 19.7).
 */
async function readPlanCycleAmount(
  client: PrismaClientLike | PrismaTransactionClient,
  planId: string,
  cycle: RecurringBillingCycle
): Promise<StoredPlanCycleAmount | null> {
  const plan = await client.subscriptionPlan.findFirst({
    where: { id: planId, isActive: true },
    select: { id: true, priceMonthly: true, priceYearly: true, currency: true },
  });
  if (!plan) return null;

  const stored = cycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly;
  const amount = readStoredPlanAmount(stored);
  if (!amount.ok) return null;

  return Object.freeze({
    planId: plan.id,
    cycle,
    amountExact: amount.amount.text,
    currency: plan.currency || "SAR",
    intervalDays: recurringIntervalDays(cycle),
  });
}

/* -------------------------------------------------------------------------- */
/* Reservation                                                                */
/* -------------------------------------------------------------------------- */

async function runReserveTransaction(
  client: PrismaClientLike,
  input: ReserveRecurringIntentInput
): Promise<ReserveRecurringIntentOutcome> {
  return client.$transaction(
    async (tx) => {
      // Criterion 9.11: re-read the occupying profile inside the transaction so
      // a profile created by a concurrent request is seen before reserving.
      const occupying = await tx.myFatoorahRecurringProfile.findFirst({
        where: {
          subscriptionId: input.subscriptionId,
          status: { in: [...OCCUPYING_RECURRING_STATES] },
        },
        select: { id: true, status: true },
      });
      if (occupying && isCurrentRecurringProfile(occupying)) {
        return { kind: "PROFILE_EXISTS" as const };
      }

      const existing = await tx.recurringCheckoutIntent.findUnique({
        where: {
          subscriptionId_idempotencyKey: {
            subscriptionId: input.subscriptionId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        select: { id: true, status: true },
      });

      if (existing) {
        if (existing.status === "FINALIZED") {
          return { kind: "PROFILE_EXISTS" as const };
        }
        if (!isReleasedRecurringIntentState(existing.status)) {
          return { kind: "IN_PROGRESS" as const };
        }
        // Reclaim a released reservation so a customer can retry after a
        // provider failure, refreshing the copied literals.
        const reclaimed = await tx.recurringCheckoutIntent.updateMany({
          where: { id: existing.id, status: { in: ["FAILED", "EXPIRED"] } },
          data: {
            status: "PENDING",
            createdById: input.createdById,
            planId: input.planId,
            billingCycle: input.billingCycle,
            amountExact: input.amountExact,
            currency: input.currency,
            providerReference: null,
            finalizedAt: null,
            updatedAt: input.reservedAt,
          },
        });
        if (reclaimed.count !== 1) return { kind: "IN_PROGRESS" as const };
        return { kind: "RESERVED" as const, intentId: existing.id };
      }

      const created = await tx.recurringCheckoutIntent.create({
        data: {
          workspaceId: input.workspaceId,
          subscriptionId: input.subscriptionId,
          planId: input.planId,
          createdById: input.createdById,
          idempotencyKey: input.idempotencyKey,
          billingCycle: input.billingCycle,
          amountExact: input.amountExact,
          currency: input.currency,
          status: "PENDING",
        },
        select: { id: true },
      });
      return { kind: "RESERVED" as const, intentId: created.id };
    },
    {
      isolationLevel: "Serializable",
      maxWait: RECURRING_TRANSACTION_MAX_WAIT_MS,
      timeout: RECURRING_TRANSACTION_TIMEOUT_MS,
    }
  ).catch((error: unknown) => {
    // The unique index decided the race: another attempt holds the slot.
    if (isUniqueViolation(error)) return { kind: "IN_PROGRESS" as const };
    throw error;
  });
}

/* -------------------------------------------------------------------------- */
/* Finalization                                                               */
/* -------------------------------------------------------------------------- */

async function runFinalizeTransaction(
  client: PrismaClientLike,
  input: FinalizeRecurringProfileInput
): Promise<FinalizeRecurringProfileOutcome> {
  return client.$transaction(
    async (tx) => {
      const intent = await tx.recurringCheckoutIntent.findUnique({
        where: { id: input.intentId },
        select: { id: true, status: true, subscriptionId: true },
      });
      if (
        !intent ||
        intent.status !== "PENDING" ||
        intent.subscriptionId !== input.subscriptionId
      ) {
        return { kind: "RESERVATION_LOST" as const };
      }

      // Criterion 9.11: re-check immediately before the insert.
      const occupying = await tx.myFatoorahRecurringProfile.findFirst({
        where: {
          subscriptionId: input.subscriptionId,
          status: { in: [...OCCUPYING_RECURRING_STATES] },
        },
        select: { id: true, status: true },
      });
      if (occupying && isCurrentRecurringProfile(occupying)) {
        return { kind: "PROFILE_EXISTS" as const };
      }

      // Criterion 9.1: exactly one row in DRAFT carrying the copied literals and
      // the stored interval of 30 or 365 days.
      const profile = await tx.myFatoorahRecurringProfile.create({
        data: {
          userId: input.userId,
          workspaceId: input.workspaceId,
          subscriptionId: input.subscriptionId,
          planId: input.planId,
          recurringId: input.recurringId,
          status: "DRAFT",
          recurringType: input.recurringType,
          intervalDays: input.intervalDays,
          retryCount: input.retryCount,
          amountExact: input.amountExact,
          currency: input.currency,
          customerReference: input.customerReference,
          initialInvoiceId: input.initialInvoiceId,
          nextChargeAt: input.nextChargeAt,
        },
        select: PROFILE_SELECT,
      });

      const finalized = await tx.recurringCheckoutIntent.updateMany({
        where: { id: input.intentId, status: "PENDING" },
        data: {
          status: "FINALIZED",
          providerReference: input.recurringId,
          finalizedAt: input.finalizedAt,
          updatedAt: input.finalizedAt,
        },
      });
      if (finalized.count !== 1) throw new RecurringReservationRaceError();

      return { kind: "FINALIZED" as const, profile: toStoredProfile(profile) };
    },
    {
      isolationLevel: "Serializable",
      maxWait: RECURRING_TRANSACTION_MAX_WAIT_MS,
      timeout: RECURRING_TRANSACTION_TIMEOUT_MS,
    }
  ).catch((error: unknown) => {
    if (error instanceof RecurringReservationRaceError) {
      return { kind: "RESERVATION_LOST" as const };
    }
    // The partial unique index rejected a second draft or active profile.
    if (isUniqueViolation(error)) return { kind: "PROFILE_EXISTS" as const };
    throw error;
  });
}

/** Raised inside the finalization transaction to abandon a lost reservation. */
class RecurringReservationRaceError extends Error {
  constructor() {
    super("The recurring checkout reservation was closed by another request.");
    this.name = "RecurringReservationRaceError";
  }
}

/* -------------------------------------------------------------------------- */
/* State transitions                                                          */
/* -------------------------------------------------------------------------- */

async function runTransitionTransaction(
  client: PrismaClientLike,
  input: ApplyRecurringTransitionInput
): Promise<ApplyRecurringTransitionOutcome> {
  return client.$transaction(
    async (tx) => {
      const current = await tx.myFatoorahRecurringProfile.findUnique({
        where: { id: input.profileId },
        select: { id: true, status: true },
      });
      if (!current) return { kind: "NOT_FOUND" as const };

      // Conditional update over the expected stored state: a state that moved
      // between the read and the write reports a conflict and writes nothing.
      const applied = await tx.myFatoorahRecurringProfile.updateMany({
        where: { id: input.profileId, status: current.status },
        data: {
          status: input.nextState,
          lastWebhookAt: input.occurredAt,
          ...(input.nextChargeAt !== undefined
            ? { nextChargeAt: input.nextChargeAt }
            : {}),
          ...(input.lastChargeAt !== undefined
            ? { lastChargeAt: input.lastChargeAt }
            : {}),
          ...(input.incrementFailureCount
            ? {
                failedCharges: { increment: 1 },
                lastFailureReason: input.failureReason ?? null,
                lastFailureAt: input.occurredAt,
              }
            : {}),
          ...(input.clearFailureState
            ? { failedCharges: 0, lastFailureReason: null, lastFailureAt: null }
            : {}),
        },
      });
      if (applied.count !== 1) return { kind: "STATE_CHANGED" as const };

      const row = await tx.myFatoorahRecurringProfile.findUniqueOrThrow({
        where: { id: input.profileId },
        select: PROFILE_SELECT,
      });
      return { kind: "APPLIED" as const, profile: toStoredProfile(row) };
    },
    {
      isolationLevel: "Serializable",
      maxWait: RECURRING_TRANSACTION_MAX_WAIT_MS,
      timeout: RECURRING_TRANSACTION_TIMEOUT_MS,
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Webhook receipts                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Claims a receipt for one fingerprint (criterion 9.7).
 *
 * Atomicity comes from the `eventFingerprint` unique index rather than a
 * transaction: a losing concurrent insert re-reads the winning row and reports
 * the same outcome, so two deliveries of one event can never both be claimed.
 */
async function claimWebhookEventRow(
  client: PrismaClientLike,
  input: ClaimRecurringWebhookInput
): Promise<ClaimRecurringWebhookOutcome> {
  const settled = await client.paymentWebhookEvent.findUnique({
    where: { eventFingerprint: input.fingerprint },
    select: { id: true, processingStatus: true, attempts: true },
  });

  // Criterion 9.7: a fingerprint already settled is a duplicate.
  if (settled && isSettledWebhookProcessingState(settled.processingStatus)) {
    return {
      kind: "DUPLICATE",
      eventId: settled.id,
      processingStatus: settled.processingStatus,
    };
  }

  if (settled) {
    const claimed = await client.paymentWebhookEvent.update({
      where: { id: settled.id },
      data: { attempts: { increment: 1 } },
      select: { id: true, attempts: true },
    });
    return { kind: "CLAIMED", eventId: claimed.id, attempts: claimed.attempts };
  }

  try {
    const created = await client.paymentWebhookEvent.create({
      data: {
        eventFingerprint: input.fingerprint,
        eventName: input.eventName,
        recurringId: input.recurringId,
        invoiceId: input.invoiceId,
        paymentId: input.paymentId,
        customerReference: input.customerReference,
        processingStatus: "RECEIVED",
        attempts: 1,
      },
      select: { id: true, attempts: true },
    });
    return { kind: "CLAIMED", eventId: created.id, attempts: created.attempts };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Another delivery of the same fingerprint inserted first.
    const raced = await client.paymentWebhookEvent.findUniqueOrThrow({
      where: { eventFingerprint: input.fingerprint },
      select: { id: true, processingStatus: true, attempts: true },
    });
    if (isSettledWebhookProcessingState(raced.processingStatus)) {
      return {
        kind: "DUPLICATE",
        eventId: raced.id,
        processingStatus: raced.processingStatus,
      };
    }
    return { kind: "CLAIMED", eventId: raced.id, attempts: raced.attempts };
  }
}

async function settleWebhookEvent(
  client: PrismaClientLike,
  input: SettleRecurringWebhookInput
): Promise<void> {
  await client.paymentWebhookEvent.updateMany({
    where: { id: input.eventId },
    data: {
      processingStatus: input.processingStatus,
      disposition: input.disposition,
      signatureValid: input.signatureValid,
      processedAt: input.settledAt,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Provider adapter                                                           */
/* -------------------------------------------------------------------------- */

/**
 * MyFatoorah recurring boundary.
 *
 * The gateway API takes a decimal SAR number, so the copied stored literal is
 * converted at this boundary only. Everything the platform persists or displays
 * keeps the literal (requirement 19.7). The SDK cannot observe an `AbortSignal`;
 * the domain caller enforces the 30-second deadline through
 * `withProviderDeadline`.
 */
export function createMyFatoorahRecurringProviderAdapter(): RecurringProviderAdapter {
  return Object.freeze({
    async isConfigured(): Promise<boolean> {
      const config = await getMyFatoorahPublicConfig();
      return config.configured === true && config.apiKeyConfigured === true;
    },

    async createRecurringProfile(
      request: CreateRecurringProfileRequest
    ): Promise<CreateRecurringProfileResponse> {
      const gatewayAmount = Number(request.amountExact);
      const methods = await initiatePayment({
        invoiceAmount: gatewayAmount,
        currencyIso: request.currency,
      });
      if (methods.length === 0) {
        throw new Error("No MyFatoorah payment method supports recurring billing");
      }

      const result = await createRecurringPayment({
        paymentMethodId: methods[0].paymentMethodId,
        invoiceValue: gatewayAmount,
        customerName: request.customerName,
        customerEmail: request.customerEmail,
        customerReference: request.customerReference,
        callBackUrl: request.callBackUrl,
        errorUrl: request.errorUrl,
        language: request.language,
        recurring:
          request.cycle === "YEARLY"
            ? {
                recurringType: "Custom",
                intervalDays: request.intervalDays,
                iteration: 0,
                retryCount: request.retryCount,
              }
            : {
                recurringType: "Monthly",
                iteration: 0,
                retryCount: request.retryCount,
              },
      });

      return Object.freeze({
        recurringId: result.recurringId,
        invoiceId: result.invoiceId ?? null,
        paymentUrl: result.paymentUrl ?? null,
        customerReference: result.customerReference ?? null,
      });
    },

    async cancelRecurringProfile({ recurringId }) {
      return { ok: await cancelRecurringPayment(recurringId) };
    },

    async resumeRecurringProfile({ recurringId }) {
      return { ok: await resumeRecurringPayment(recurringId) };
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Production wiring                                                          */
/* -------------------------------------------------------------------------- */

/** Recurring provider retry count required by criterion 9.1. */
export const PRISMA_RECURRING_RETRY_COUNT = RECURRING_PROVIDER_RETRY_COUNT;

/** Production wiring used by the recurring billing routes. */
export function createPrismaRecurringBillingService(
  overrides: Partial<RecurringBillingServiceDependencies> = {}
): RecurringBillingService {
  return createRecurringBillingService({
    ...overrides,
    repository: overrides.repository ?? createPrismaRecurringBillingRepository(),
    provider: overrides.provider ?? createMyFatoorahRecurringProviderAdapter(),
  });
}
