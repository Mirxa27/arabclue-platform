/**
 * Recurring_Billing_Service — MyFatoorah recurring subscription billing
 * (requirement 9; design 4.6).
 *
 * The module has two layers:
 *
 * 1. `createRecurringBillingService` — the injectable domain service. Every
 *    boundary it needs (persistence, the MyFatoorah adapter, the UTC clock) is
 *    supplied by the caller, so unit and property tests drive the state model and
 *    persistence rules with in-memory fakes: no provider call, no charge, and no
 *    database write. `recurring-billing-prisma.ts` supplies the production
 *    adapters.
 * 2. The exported functions below it — the existing checkout, cancel, resume, and
 *    webhook helpers the current routes call. They now obey the same state model
 *    and value rules and no longer accept a caller-supplied amount.
 *
 * Requirement 19.7 discipline (see `recurring-billing-state.ts` for the value
 * rules): every amount is the literal the tenant's plan already stores, copied
 * unchanged. Decimal comparison happens only to validate a provider response.
 * No price, total, refund, proration, margin, or commercial value is computed.
 */

import { Prisma } from "@prisma/client";
import { db } from "./db";
import { audit, AUDIT_ACTIONS } from "./audit";
import {
  getMyFatoorahPublicConfig,
  createRecurringPayment,
  cancelRecurringPayment as mfCancelRecurring,
  resumeRecurringPayment as mfResumeRecurring,
  initiatePayment,
  type RecurringModel,
} from "./myfatoorah";
import { notifySubscriptionPastDue } from "./notification-service";
import { systemUtcClock, utcNow, type UtcClock } from "./time";
import type { ProviderCallContext } from "./provider-timeout";
import type { TranslationKey } from "./i18n";
import {
  OCCUPYING_RECURRING_STATES,
  RECURRING_AMOUNT_TOLERANCE,
  RECURRING_PROVIDER_RETRY_COUNT,
  amountWithinProviderTolerance,
  currencyEquals,
  deriveRecurringNextChargeAt,
  exactDecimalEquals,
  isRecurringBillingCycle,
  isReleasedRecurringIntentState,
  normalizeRecurringProfileState,
  parseExactDecimalLiteral,
  readStoredIntervalDays,
  readStoredPlanAmount,
  recurringCheckoutIdempotencyKey,
  recurringIntervalDays,
  recurringProfileStateLabelKey,
  resolveExtendedPeriodEnd,
  resolveRecurringTransition,
  truncateProviderFailureReason,
  type ExactDecimalLiteral,
  type RecurringBillingCycle,
  type RecurringProfileState,
  type RecurringProfileTrigger,
  type RecurringWebhookDisposition,
  type RecurringWebhookProcessingState,
} from "./recurring-billing-state";

export * from "./recurring-billing-state";

export class RecurringBillingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number = 500
  ) {
    super(message);
    this.name = "RecurringBillingError";
  }
}

/* -------------------------------------------------------------------------- */
/* Persisted shapes the repository exchanges with the domain                   */
/* -------------------------------------------------------------------------- */

/** Workspace-scoped subscription a recurring profile belongs to (design 4.6). */
export type StoredRecurringSubscription = Readonly<{
  subscriptionId: string;
  workspaceId: string;
  /** Subscription owner; the profile row and billing records reference it. */
  ownerUserId: string;
  planId: string;
  billingCycle: string;
  status: string;
  currentPeriodEnd: Date;
}>;

/**
 * The plan's stored cycle price and currency, copied verbatim, together with the
 * interval in days criterion 9.1 fixes at 30 or 365.
 */
export type StoredPlanCycleAmount = Readonly<{
  planId: string;
  cycle: RecurringBillingCycle;
  /** Exact stored literal; never rounded, never recomputed. */
  amountExact: string;
  currency: string;
  intervalDays: 30 | 365;
}>;

/** A persisted `MyFatoorahRecurringProfile` row as the repository reads it. */
export type StoredRecurringProfile = Readonly<{
  id: string;
  userId: string;
  workspaceId: string | null;
  subscriptionId: string | null;
  planId: string | null;
  recurringId: string;
  /** Raw stored status text; the domain normalizes it before trusting it. */
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
}>;

export type ReserveRecurringIntentInput = Readonly<{
  workspaceId: string;
  subscriptionId: string;
  planId: string;
  createdById: string;
  idempotencyKey: string;
  billingCycle: RecurringBillingCycle;
  amountExact: string;
  currency: string;
  reservedAt: Date;
}>;

export type ReserveRecurringIntentOutcome =
  | Readonly<{ kind: "RESERVED"; intentId: string }>
  /** A finalized reservation, or an existing draft/active profile. */
  | Readonly<{ kind: "PROFILE_EXISTS" }>
  /** Another attempt for the same subscription is still pending. */
  | Readonly<{ kind: "IN_PROGRESS" }>;

export type FinalizeRecurringProfileInput = Readonly<{
  intentId: string;
  workspaceId: string;
  subscriptionId: string;
  planId: string;
  userId: string;
  recurringId: string;
  recurringType: string | null;
  intervalDays: 30 | 365;
  retryCount: number;
  amountExact: string;
  currency: string;
  customerReference: string | null;
  initialInvoiceId: string | null;
  nextChargeAt: Date;
  finalizedAt: Date;
}>;

export type FinalizeRecurringProfileOutcome =
  | Readonly<{ kind: "FINALIZED"; profile: StoredRecurringProfile }>
  | Readonly<{ kind: "PROFILE_EXISTS" }>
  /** The reservation was released or finalized by another request. */
  | Readonly<{ kind: "RESERVATION_LOST" }>;

export type ApplyRecurringTransitionInput = Readonly<{
  profileId: string;
  /** Conditional guard: the stored state the decision was taken against. */
  expectedState: RecurringProfileState;
  nextState: RecurringProfileState;
  occurredAt: Date;
  nextChargeAt?: Date | null;
  lastChargeAt?: Date | null;
  failureReason?: string | null;
  incrementFailureCount?: boolean;
  clearFailureState?: boolean;
}>;

export type ApplyRecurringTransitionOutcome =
  | Readonly<{ kind: "APPLIED"; profile: StoredRecurringProfile }>
  /** The stored state moved between the read and the write. */
  | Readonly<{ kind: "STATE_CHANGED" }>
  | Readonly<{ kind: "NOT_FOUND" }>;

export type ClaimRecurringWebhookInput = Readonly<{
  fingerprint: string;
  recurringId: string | null;
  invoiceId: string | null;
  paymentId: string | null;
  customerReference: string | null;
  eventName: string | null;
  receivedAt: Date;
}>;

export type ClaimRecurringWebhookOutcome =
  | Readonly<{ kind: "CLAIMED"; eventId: string; attempts: number }>
  | Readonly<{ kind: "DUPLICATE"; eventId: string; processingStatus: string }>;

export type SettleRecurringWebhookInput = Readonly<{
  eventId: string;
  processingStatus: RecurringWebhookProcessingState;
  disposition: RecurringWebhookDisposition;
  signatureValid: boolean;
  settledAt: Date;
}>;

/**
 * Persistence boundary. Each method a requirement describes as one atomic step
 * must be one serializable transaction in the adapter, and every conditional
 * write must re-read the state it guards.
 */
export interface RecurringBillingRepository {
  /** The workspace's subscription, or null when the workspace holds none. */
  findSubscriptionByWorkspace(
    workspaceId: string
  ): Promise<StoredRecurringSubscription | null>;
  /** The plan's stored cycle amount and currency, copied verbatim. */
  readPlanCycleAmount(
    input: Readonly<{ planId: string; cycle: RecurringBillingCycle }>
  ): Promise<StoredPlanCycleAmount | null>;
  /** The subscription's profile in a state that occupies the single slot. */
  findCurrentProfileBySubscription(
    subscriptionId: string
  ): Promise<StoredRecurringProfile | null>;
  /** The workspace's most recent profile, for the console read model. */
  findLatestProfileByWorkspace(
    workspaceId: string
  ): Promise<StoredRecurringProfile | null>;
  reserveCheckoutIntent(
    input: ReserveRecurringIntentInput
  ): Promise<ReserveRecurringIntentOutcome>;
  releaseCheckoutIntent(
    input: Readonly<{ intentId: string; state: "FAILED" | "EXPIRED"; at: Date }>
  ): Promise<void>;
  finalizeDraftProfile(
    input: FinalizeRecurringProfileInput
  ): Promise<FinalizeRecurringProfileOutcome>;
  applyProfileTransition(
    input: ApplyRecurringTransitionInput
  ): Promise<ApplyRecurringTransitionOutcome>;
  claimWebhookEvent(
    input: ClaimRecurringWebhookInput
  ): Promise<ClaimRecurringWebhookOutcome>;
  settleWebhookEvent(input: SettleRecurringWebhookInput): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* Provider boundary                                                          */
/* -------------------------------------------------------------------------- */

export type CreateRecurringProfileRequest = Readonly<{
  customerName: string;
  customerEmail: string;
  customerReference: string;
  /** Copied stored literal; the adapter converts at the gateway boundary only. */
  amountExact: string;
  currency: string;
  cycle: RecurringBillingCycle;
  intervalDays: 30 | 365;
  retryCount: number;
  callBackUrl: string;
  errorUrl: string;
  language: "AR" | "EN";
}>;

export type CreateRecurringProfileResponse = Readonly<{
  recurringId: string;
  invoiceId: string | null;
  paymentUrl: string | null;
  customerReference: string | null;
  /** Echoed amount, when the provider returns one. Validation input only. */
  reportedAmount?: string | null;
  reportedCurrency?: string | null;
}>;

export type RecurringProviderAck = Readonly<{ ok: boolean }>;

/**
 * The MyFatoorah boundary, injected so a test can substitute a fake. Deadlines
 * and the retry count are owned by the caller through `withProviderDeadline`,
 * which is why every method receives an `AbortSignal`.
 */
export interface RecurringProviderAdapter {
  /** Whether the MyFatoorah Configuration_Boundary is set (criterion 9.9). */
  isConfigured(): Promise<boolean>;
  createRecurringProfile(
    request: CreateRecurringProfileRequest,
    context: ProviderCallContext
  ): Promise<CreateRecurringProfileResponse>;
  cancelRecurringProfile(
    request: Readonly<{ recurringId: string }>,
    context: ProviderCallContext
  ): Promise<RecurringProviderAck>;
  resumeRecurringProfile(
    request: Readonly<{ recurringId: string }>,
    context: ProviderCallContext
  ): Promise<RecurringProviderAck>;
}

/* -------------------------------------------------------------------------- */
/* Commands and results                                                       */
/* -------------------------------------------------------------------------- */

export type RecurringActor = Readonly<{ userId: string }>;

export type ReserveRecurringCheckoutCommand = Readonly<{
  actor: RecurringActor;
  workspaceId: string;
  planId: unknown;
  billingCycle: unknown;
  /**
   * Present only so a submitted amount can be rejected. The service never reads
   * a value from it (criterion 9.1, requirement 19.7).
   */
  submittedAmount?: unknown;
}>;

/** The reservation a caller carries into the provider call and finalization. */
export type RecurringCheckoutReservation = Readonly<{
  intentId: string;
  workspaceId: string;
  subscriptionId: string;
  ownerUserId: string;
  planId: string;
  cycle: RecurringBillingCycle;
  amountExact: string;
  currency: string;
  intervalDays: 30 | 365;
  retryCount: number;
  idempotencyKey: string;
  reservedAt: Date;
}>;

export type ReserveRecurringCheckoutResult =
  | Readonly<{ ok: true; reservation: RecurringCheckoutReservation }>
  | Readonly<{
      ok: false;
      status: 400;
      code: "REQUEST_VALIDATION_FAILED";
      fieldPaths: readonly string[];
    }>
  | Readonly<{ ok: false; status: 404; code: "RESOURCE_NOT_FOUND" }>
  | Readonly<{ ok: false; status: 409; code: "RECURRING_PROFILE_EXISTS" }>
  | Readonly<{ ok: false; status: 409; code: "RECURRING_STATE_CONFLICT" }>
  | Readonly<{ ok: false; status: 503; code: "RECURRING_UNAVAILABLE" }>;

export type FinalizeRecurringCheckoutCommand = Readonly<{
  reservation: RecurringCheckoutReservation;
  provider: CreateRecurringProfileResponse;
}>;

export type FinalizeRecurringCheckoutResult =
  | Readonly<{ ok: true; profile: RecurringProfileView }>
  | Readonly<{ ok: false; status: 409; code: "RECURRING_PROFILE_EXISTS" }>
  | Readonly<{ ok: false; status: 409; code: "RECURRING_STATE_CONFLICT" }>
  | Readonly<{ ok: false; status: 422; code: "RECURRING_UNAVAILABLE" }>;

export type TransitionRecurringProfileCommand = Readonly<{
  profile: StoredRecurringProfile;
  trigger: RecurringProfileTrigger;
  occurredAt: Date;
  /** Timestamp of the accepted cycle charge, for a success trigger. */
  chargedAt?: Date | null;
  /** Provider-reported failure reason, bounded on write (criterion 9.4). */
  failureReason?: string | null;
}>;

export type TransitionRecurringProfileResult =
  | Readonly<{ ok: true; profile: RecurringProfileView; changedState: boolean }>
  | Readonly<{ ok: false; status: 404; code: "RESOURCE_NOT_FOUND" }>
  | Readonly<{ ok: false; status: 409; code: "RECURRING_STATE_CONFLICT" }>;

export type ClaimRecurringWebhookCommand = Readonly<{
  fingerprint: unknown;
  recurringId?: string | null;
  invoiceId?: string | null;
  paymentId?: string | null;
  customerReference?: string | null;
  eventName?: string | null;
}>;

export type ClaimRecurringWebhookResult =
  | Readonly<{ ok: true; eventId: string; attempts: number }>
  /** Criterion 9.7: acknowledge, write nothing else. */
  | Readonly<{ ok: true; duplicate: true; eventId: string }>
  | Readonly<{
      ok: false;
      status: 400;
      code: "REQUEST_VALIDATION_FAILED";
      fieldPaths: readonly string[];
    }>;

export type ValidateProviderChargeCommand = Readonly<{
  profile: StoredRecurringProfile;
  reportedAmount: unknown;
  reportedCurrency: unknown;
}>;

export type ValidateProviderChargeResult =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      reason: "AMOUNT_OUT_OF_TOLERANCE" | "CURRENCY_MISMATCH" | "PROFILE_VALUE_UNREADABLE";
    }>;

/**
 * Projection of a stored profile: literals exactly as stored, the normalized
 * state with its registered bilingual label key, and the derived next charge date
 * (criteria 9.6, 9.8). No monetary value is formatted or derived here.
 */
export type RecurringProfileView = Readonly<{
  id: string;
  workspaceId: string | null;
  subscriptionId: string | null;
  planId: string | null;
  recurringId: string;
  state: RecurringProfileState | null;
  stateLabelKey: TranslationKey | null;
  intervalDays: number | null;
  amountExact: string | null;
  currency: string;
  nextChargeAt: Date | null;
  lastChargeAt: Date | null;
  failedCharges: number;
  lastFailureReason: string | null;
  lastFailureAt: Date | null;
  createdAt: Date;
  cancelAllowed: boolean;
  resumeAllowed: boolean;
}>;

export type ReadWorkspaceRecurringProfileResult = Readonly<{
  ok: true;
  profile: RecurringProfileView | null;
}>;

export interface RecurringBillingService {
  reserveCheckout(
    command: ReserveRecurringCheckoutCommand
  ): Promise<ReserveRecurringCheckoutResult>;
  releaseCheckout(
    command: Readonly<{ intentId: string; state?: "FAILED" | "EXPIRED" }>
  ): Promise<void>;
  finalizeCheckout(
    command: FinalizeRecurringCheckoutCommand
  ): Promise<FinalizeRecurringCheckoutResult>;
  transitionProfile(
    command: TransitionRecurringProfileCommand
  ): Promise<TransitionRecurringProfileResult>;
  claimWebhookEvent(
    command: ClaimRecurringWebhookCommand
  ): Promise<ClaimRecurringWebhookResult>;
  settleWebhookEvent(input: SettleRecurringWebhookInput): Promise<void>;
  /**
   * Whether the injected MyFatoorah adapter reports its Configuration_Boundary
   * set (criterion 9.9). No adapter reports unconfigured; the real integration
   * path is never replaced by a substitute.
   */
  isProviderConfigured(): Promise<boolean>;
  /** Exact comparison against the stored profile values (criterion 9.10). */
  validateProviderCharge(
    command: ValidateProviderChargeCommand
  ): ValidateProviderChargeResult;
  readWorkspaceProfile(
    command: Readonly<{ workspaceId: string }>
  ): Promise<ReadWorkspaceRecurringProfileResult>;
  projectProfile(profile: StoredRecurringProfile): RecurringProfileView;
}

export type RecurringBillingServiceDependencies = Readonly<{
  repository: RecurringBillingRepository;
  provider?: RecurringProviderAdapter;
  clock?: UtcClock;
}>;

const MAX_IDENTIFIER_LENGTH = 128;
const MAX_FINGERPRINT_LENGTH = 256;

function readIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_IDENTIFIER_LENGTH) return null;
  return trimmed;
}

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

export function createRecurringBillingService(
  dependencies: RecurringBillingServiceDependencies
): RecurringBillingService {
  const repository = dependencies.repository;
  const provider = dependencies.provider ?? null;
  const clock = dependencies.clock ?? systemUtcClock;

  async function isProviderConfigured(): Promise<boolean> {
    if (!provider) return false;
    return provider.isConfigured();
  }

  function projectProfile(profile: StoredRecurringProfile): RecurringProfileView {
    const state = normalizeRecurringProfileState(profile.status);
    const intervalDays = readStoredIntervalDays(profile.intervalDays);
    // Criterion 9.6: derived from the latest successful charge, or the creation
    // timestamp when none exists, advanced by the stored interval.
    const nextChargeAt =
      intervalDays === null
        ? null
        : deriveRecurringNextChargeAt({
            lastSuccessfulChargeAt: profile.lastChargeAt,
            createdAt: profile.createdAt,
            intervalDays,
          });

    return {
      id: profile.id,
      workspaceId: profile.workspaceId,
      subscriptionId: profile.subscriptionId,
      planId: profile.planId,
      recurringId: profile.recurringId,
      state,
      stateLabelKey: state ? recurringProfileStateLabelKey(state) : null,
      intervalDays,
      amountExact: profile.amountExact,
      currency: profile.currency,
      nextChargeAt,
      lastChargeAt: profile.lastChargeAt,
      failedCharges: profile.failedCharges,
      lastFailureReason: profile.lastFailureReason,
      lastFailureAt: profile.lastFailureAt,
      createdAt: profile.createdAt,
      // Criteria 9.5, 9.6: actions are enabled only for the named states.
      cancelAllowed: resolveRecurringTransition(profile.status, "MEMBER_CANCELLED").ok,
      resumeAllowed: resolveRecurringTransition(profile.status, "MEMBER_RESUMED").ok,
    };
  }

  async function reserveCheckout(
    command: ReserveRecurringCheckoutCommand
  ): Promise<ReserveRecurringCheckoutResult> {
    // Criterion 9.1 and requirement 19.7: the amount is never taken from the
    // request. A submitted amount is rejected rather than ignored, so a caller
    // cannot believe it influenced the charge.
    if (command.submittedAmount !== undefined && command.submittedAmount !== null) {
      return {
        ok: false,
        status: 400,
        code: "REQUEST_VALIDATION_FAILED",
        fieldPaths: ["amount"],
      };
    }

    const planId = readIdentifier(command.planId);
    if (planId === null) {
      return {
        ok: false,
        status: 400,
        code: "REQUEST_VALIDATION_FAILED",
        fieldPaths: ["planId"],
      };
    }
    if (!isRecurringBillingCycle(command.billingCycle)) {
      return {
        ok: false,
        status: 400,
        code: "REQUEST_VALIDATION_FAILED",
        fieldPaths: ["billingCycle"],
      };
    }
    const cycle = command.billingCycle;

    const subscription = await repository.findSubscriptionByWorkspace(
      command.workspaceId
    );
    // Requirement 19.5: a workspace with no subscription addresses no record.
    if (!subscription) {
      return { ok: false, status: 404, code: "RESOURCE_NOT_FOUND" };
    }

    // Criterion 9.11: reject before any MyFatoorah operation is attempted.
    const current = await repository.findCurrentProfileBySubscription(
      subscription.subscriptionId
    );
    if (current && isCurrentRecurringProfile(current)) {
      return { ok: false, status: 409, code: "RECURRING_PROFILE_EXISTS" };
    }

    const planAmount = await repository.readPlanCycleAmount({ planId, cycle });
    // Criterion 9.1: the amount must be the stored plan price for the selected
    // cycle and greater than 0.00. An unreadable literal fails closed; nothing
    // is rounded or substituted.
    if (!planAmount) {
      return { ok: false, status: 503, code: "RECURRING_UNAVAILABLE" };
    }
    const amount = readStoredPlanAmount(planAmount.amountExact);
    if (!amount.ok) {
      return { ok: false, status: 503, code: "RECURRING_UNAVAILABLE" };
    }
    if (planAmount.intervalDays !== recurringIntervalDays(cycle)) {
      return { ok: false, status: 503, code: "RECURRING_UNAVAILABLE" };
    }

    const idempotencyKey = recurringCheckoutIdempotencyKey({ planId, cycle });
    const reservedAt = utcNow(clock);
    const outcome = await repository.reserveCheckoutIntent({
      workspaceId: subscription.workspaceId,
      subscriptionId: subscription.subscriptionId,
      planId,
      createdById: command.actor.userId,
      idempotencyKey,
      billingCycle: cycle,
      amountExact: amount.amount.text,
      currency: planAmount.currency,
      reservedAt,
    });

    if (outcome.kind === "PROFILE_EXISTS") {
      return { ok: false, status: 409, code: "RECURRING_PROFILE_EXISTS" };
    }
    if (outcome.kind === "IN_PROGRESS") {
      return { ok: false, status: 409, code: "RECURRING_STATE_CONFLICT" };
    }

    return {
      ok: true,
      reservation: {
        intentId: outcome.intentId,
        workspaceId: subscription.workspaceId,
        subscriptionId: subscription.subscriptionId,
        ownerUserId: subscription.ownerUserId,
        planId,
        cycle,
        amountExact: amount.amount.text,
        currency: planAmount.currency,
        intervalDays: planAmount.intervalDays,
        retryCount: RECURRING_PROVIDER_RETRY_COUNT,
        idempotencyKey,
        reservedAt,
      },
    };
  }

  async function releaseCheckout(
    command: Readonly<{ intentId: string; state?: "FAILED" | "EXPIRED" }>
  ): Promise<void> {
    await repository.releaseCheckoutIntent({
      intentId: command.intentId,
      state: command.state ?? "FAILED",
      at: utcNow(clock),
    });
  }

  async function finalizeCheckout(
    command: FinalizeRecurringCheckoutCommand
  ): Promise<FinalizeRecurringCheckoutResult> {
    const { reservation, provider } = command;
    const recurringId = readIdentifier(provider.recurringId);
    // Criterion 9.2: no recurring identifier means no profile row is created.
    if (recurringId === null) {
      return { ok: false, status: 422, code: "RECURRING_UNAVAILABLE" };
    }

    // Requirement 19.7 boundary: exact comparison against the copied reservation
    // literals, used only to validate what the provider echoed back. Nothing is
    // recomputed and the reservation literal remains authoritative.
    if (!providerEchoMatchesReservation(reservation, provider)) {
      return { ok: false, status: 422, code: "RECURRING_UNAVAILABLE" };
    }

    const finalizedAt = utcNow(clock);
    const nextChargeAt = deriveRecurringNextChargeAt({
      lastSuccessfulChargeAt: null,
      createdAt: finalizedAt,
      intervalDays: reservation.intervalDays,
    });
    if (nextChargeAt === null) {
      return { ok: false, status: 422, code: "RECURRING_UNAVAILABLE" };
    }

    const outcome = await repository.finalizeDraftProfile({
      intentId: reservation.intentId,
      workspaceId: reservation.workspaceId,
      subscriptionId: reservation.subscriptionId,
      planId: reservation.planId,
      userId: reservation.ownerUserId,
      recurringId,
      recurringType: providerRecurringType(reservation.cycle),
      intervalDays: reservation.intervalDays,
      retryCount: reservation.retryCount,
      amountExact: reservation.amountExact,
      currency: reservation.currency,
      customerReference: provider.customerReference ?? null,
      initialInvoiceId: provider.invoiceId ?? null,
      nextChargeAt,
      finalizedAt,
    });

    if (outcome.kind === "PROFILE_EXISTS") {
      return { ok: false, status: 409, code: "RECURRING_PROFILE_EXISTS" };
    }
    if (outcome.kind === "RESERVATION_LOST") {
      return { ok: false, status: 409, code: "RECURRING_STATE_CONFLICT" };
    }
    return { ok: true, profile: projectProfile(outcome.profile) };
  }

  async function transitionProfile(
    command: TransitionRecurringProfileCommand
  ): Promise<TransitionRecurringProfileResult> {
    const resolution = resolveRecurringTransition(
      command.profile.status,
      command.trigger
    );
    // Criterion 9.13: a stored state that does not permit the operation leaves
    // the profile and the subscription untouched.
    if (!resolution.ok) {
      return { ok: false, status: 409, code: "RECURRING_STATE_CONFLICT" };
    }

    const intervalDays = readStoredIntervalDays(command.profile.intervalDays);
    const chargedAt = command.chargedAt ?? null;
    const succeeded = command.trigger === "PROVIDER_CYCLE_SUCCEEDED";
    const failed = command.trigger === "PROVIDER_CYCLE_FAILED";
    const resumed = command.trigger === "MEMBER_RESUMED";

    // Criterion 9.5: a cancelled profile receives no further period extension,
    // so no next charge date is written for it.
    const lastSuccessfulChargeAt = succeeded
      ? (chargedAt ?? command.occurredAt)
      : command.profile.lastChargeAt;
    const nextChargeAt =
      intervalDays !== null && (succeeded || resumed)
        ? deriveRecurringNextChargeAt({
            lastSuccessfulChargeAt,
            createdAt: command.profile.createdAt,
            intervalDays,
          })
        : resolution.to === "CANCELLED"
          ? null
          : undefined;

    const outcome = await repository.applyProfileTransition({
      profileId: command.profile.id,
      expectedState: resolution.from,
      nextState: resolution.to,
      occurredAt: command.occurredAt,
      ...(nextChargeAt !== undefined ? { nextChargeAt } : {}),
      ...(succeeded ? { lastChargeAt: lastSuccessfulChargeAt } : {}),
      // Criterion 9.4: the reason is stored bounded, with its timestamp.
      ...(failed
        ? {
            failureReason: truncateProviderFailureReason(command.failureReason),
            incrementFailureCount: true,
          }
        : {}),
      ...(succeeded || resumed ? { clearFailureState: true } : {}),
    });

    if (outcome.kind === "NOT_FOUND") {
      return { ok: false, status: 404, code: "RESOURCE_NOT_FOUND" };
    }
    if (outcome.kind === "STATE_CHANGED") {
      return { ok: false, status: 409, code: "RECURRING_STATE_CONFLICT" };
    }
    return {
      ok: true,
      profile: projectProfile(outcome.profile),
      changedState: resolution.changesState,
    };
  }

  async function claimWebhookEvent(
    command: ClaimRecurringWebhookCommand
  ): Promise<ClaimRecurringWebhookResult> {
    const fingerprint =
      typeof command.fingerprint === "string" ? command.fingerprint.trim() : "";
    if (fingerprint.length === 0 || fingerprint.length > MAX_FINGERPRINT_LENGTH) {
      return {
        ok: false,
        status: 400,
        code: "REQUEST_VALIDATION_FAILED",
        fieldPaths: ["fingerprint"],
      };
    }

    const outcome = await repository.claimWebhookEvent({
      fingerprint,
      recurringId: command.recurringId ?? null,
      invoiceId: command.invoiceId ?? null,
      paymentId: command.paymentId ?? null,
      customerReference: command.customerReference ?? null,
      eventName: command.eventName ?? null,
      receivedAt: utcNow(clock),
    });

    // Criterion 9.7: a settled fingerprint is acknowledged as a duplicate with
    // no billing record, subscription change, or profile change.
    if (outcome.kind === "DUPLICATE") {
      return { ok: true, duplicate: true, eventId: outcome.eventId };
    }
    return { ok: true, eventId: outcome.eventId, attempts: outcome.attempts };
  }

  function validateProviderCharge(
    command: ValidateProviderChargeCommand
  ): ValidateProviderChargeResult {
    const stored = parseExactDecimalLiteral(command.profile.amountExact);
    if (!stored) return { ok: false, reason: "PROFILE_VALUE_UNREADABLE" };

    // Criterion 9.10: the reported currency must equal the stored currency.
    if (!currencyEquals(command.profile.currency, command.reportedCurrency)) {
      return { ok: false, reason: "CURRENCY_MISMATCH" };
    }

    const reported = parseExactDecimalLiteral(
      typeof command.reportedAmount === "number"
        ? String(command.reportedAmount)
        : command.reportedAmount
    );
    if (!reported) return { ok: false, reason: "AMOUNT_OUT_OF_TOLERANCE" };
    if (
      !amountWithinProviderTolerance(stored, reported, RECURRING_AMOUNT_TOLERANCE)
    ) {
      return { ok: false, reason: "AMOUNT_OUT_OF_TOLERANCE" };
    }
    return { ok: true };
  }

  async function readWorkspaceProfile(
    command: Readonly<{ workspaceId: string }>
  ): Promise<ReadWorkspaceRecurringProfileResult> {
    const profile = await repository.findLatestProfileByWorkspace(
      command.workspaceId
    );
    return { ok: true, profile: profile ? projectProfile(profile) : null };
  }

  return Object.freeze({
    reserveCheckout,
    releaseCheckout,
    finalizeCheckout,
    transitionProfile,
    claimWebhookEvent,
    settleWebhookEvent: (input: SettleRecurringWebhookInput) =>
      repository.settleWebhookEvent(input),
    isProviderConfigured,
    validateProviderCharge,
    readWorkspaceProfile,
    projectProfile,
  });
}

/* -------------------------------------------------------------------------- */
/* Shared rules                                                               */
/* -------------------------------------------------------------------------- */

/** Whether a stored row occupies the single profile slot (criterion 9.11). */
export function isCurrentRecurringProfile(
  profile: Readonly<{ status: string }>
): boolean {
  const state = normalizeRecurringProfileState(profile.status);
  return (
    state !== null && (OCCUPYING_RECURRING_STATES as readonly string[]).includes(state)
  );
}

/**
 * Whether the provider echoed back the same amount and currency the reservation
 * copied from the plan. Exact comparison only; an absent echo is accepted because
 * criterion 9.1 makes the stored plan literal authoritative.
 */
function providerEchoMatchesReservation(
  reservation: RecurringCheckoutReservation,
  provider: CreateRecurringProfileResponse
): boolean {
  const expected = parseExactDecimalLiteral(reservation.amountExact);
  if (!expected) return false;

  if (provider.reportedCurrency !== undefined && provider.reportedCurrency !== null) {
    if (!currencyEquals(reservation.currency, provider.reportedCurrency)) {
      return false;
    }
  }
  if (provider.reportedAmount === undefined || provider.reportedAmount === null) {
    return true;
  }
  const reported = parseExactDecimalLiteral(provider.reportedAmount);
  return reported !== null && exactDecimalEquals(expected, reported);
}

/**
 * Reads a numeric column or provider field as an exact literal, or null when it
 * is absent or cannot be represented exactly. No value is rounded or inferred
 * (requirement 19.7).
 */
function readNumericAmountLiteral(
  value: number | null | undefined
): ExactDecimalLiteral | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return parseExactDecimalLiteral(String(value));
}

/** MyFatoorah recurring model name for a cycle. */
function providerRecurringType(cycle: RecurringBillingCycle): string {
  return cycle === "YEARLY" ? "Custom" : "Monthly";
}

/**
 * Provider recurring model for a cycle. The stored interval stays 30 or 365 days
 * regardless of the provider's own vocabulary (criterion 9.1).
 */
function intervalToRecurringModel(cycle: RecurringBillingCycle): RecurringModel {
  if (cycle === "YEARLY") {
    return {
      recurringType: "Custom",
      intervalDays: recurringIntervalDays("YEARLY"),
      iteration: 0, // unlimited
      retryCount: RECURRING_PROVIDER_RETRY_COUNT,
    };
  }
  return {
    recurringType: "Monthly",
    iteration: 0,
    retryCount: RECURRING_PROVIDER_RETRY_COUNT,
  };
}

/* -------------------------------------------------------------------------- */
/* Existing route helpers                                                     */
/* -------------------------------------------------------------------------- */

export type StartRecurringProfileInput = {
  userId: string;
  /** Workspace that owns the subscription. Required for the checkout intent row. */
  workspaceId: string;
  subscriptionId: string;
  planId: string;
  interval: RecurringBillingCycle;
  customerReference: string;
  initialInvoiceId?: string;
  customerName: string;
  customerEmail: string;
  /** Optional caller-supplied idempotency key; a stable key is derived when absent. */
  idempotencyKey?: string;
};

export type RecurringProfile = {
  id: string;
  userId: string;
  subscriptionId: string | null;
  planId: string | null;
  recurringId: string;
  status: string;
  /** Normalized state of the four-state vocabulary, or null when unknown. */
  state: RecurringProfileState | null;
  recurringType: string | null;
  intervalDays: number | null;
  /** Legacy numeric column retained for compatibility with existing readers. */
  amount: number | null;
  /** Exact stored literal copied from the plan cycle price (criterion 9.1). */
  amountExact: string | null;
  currency: string;
  customerReference: string | null;
  initialInvoiceId: string | null;
  nextChargeAt: Date | null;
  lastChargeAt: Date | null;
  failedCharges: number;
  lastFailureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Start a new recurring payment profile with MyFatoorah.
 *
 * Criteria 9.1 and 9.11: the amount and currency are copied from the stored plan
 * cycle price — the caller cannot submit either — the stored interval is 30 or
 * 365 days, the row is created in `DRAFT`, and a `RecurringCheckoutIntent` whose
 * `(subscriptionId, idempotencyKey)` uniqueness makes two concurrent attempts
 * resolve to one winner reserves the subscription before the provider is called.
 *
 * @throws RecurringBillingError on configuration, concurrency, or API issues
 */
export async function startRecurringProfile(
  input: StartRecurringProfileInput
): Promise<RecurringProfile> {
  if (!isRecurringBillingCycle(input.interval)) {
    throw new RecurringBillingError(
      "Recurring billing requires a monthly or yearly cycle",
      "REQUEST_VALIDATION_FAILED",
      400
    );
  }

  // Criterion 9.11 — reject before any MyFatoorah operation.
  const occupying = await db.myFatoorahRecurringProfile.findFirst({
    where: {
      subscriptionId: input.subscriptionId,
      status: { in: [...OCCUPYING_RECURRING_STATES] },
    },
    select: { id: true, status: true },
  });
  if (occupying) {
    throw new RecurringBillingError(
      `Subscription already holds a ${occupying.status.toLowerCase()} recurring profile`,
      "RECURRING_PROFILE_EXISTS",
      409
    );
  }

  // Check MyFatoorah configuration
  const config = await getMyFatoorahPublicConfig();
  if (!config.configured || !config.apiKeyConfigured) {
    throw new RecurringBillingError(
      "MyFatoorah billing provider is not configured",
      "BILLING_PROVIDER_UNCONFIGURED",
      503
    );
  }

  // Criterion 9.1: the amount and currency come from the stored plan row for the
  // selected cycle. No caller value participates.
  const cycleAmount = await readPlanCycleAmountRow(input.planId, input.interval);

  const idempotencyKey =
    input.idempotencyKey?.trim() ||
    recurringCheckoutIdempotencyKey({
      planId: input.planId,
      cycle: input.interval,
    });

  const intent = await reserveRecurringCheckoutIntent({
    workspaceId: input.workspaceId,
    subscriptionId: input.subscriptionId,
    planId: input.planId,
    createdById: input.userId,
    idempotencyKey,
    billingCycle: input.interval,
    amountExact: cycleAmount.amountExact,
    currency: cycleAmount.currency,
  });

  try {
    const profile = await executeRecurringProfile(input, cycleAmount);
    await db.recurringCheckoutIntent.update({
      where: { id: intent.id },
      data: {
        status: "FINALIZED",
        providerReference: profile.recurringId,
        finalizedAt: new Date(),
      },
    });
    return profile;
  } catch (error) {
    await db.recurringCheckoutIntent
      .update({ where: { id: intent.id }, data: { status: "FAILED" } })
      .catch(() => undefined);
    throw error;
  }
}

/**
 * The plan's stored cycle price and currency, copied verbatim (criterion 9.1).
 *
 * A stored value that is not already an exact decimal literal, or that is not
 * greater than 0.00, fails closed. Nothing is rounded, inferred, or substituted
 * (requirement 19.7).
 */
async function readPlanCycleAmountRow(
  planId: string,
  cycle: RecurringBillingCycle
): Promise<StoredPlanCycleAmount> {
  const plan = await db.subscriptionPlan.findFirst({
    where: { id: planId, isActive: true },
    select: { id: true, priceMonthly: true, priceYearly: true, currency: true },
  });
  if (!plan) {
    throw new RecurringBillingError(
      "Recurring billing plan was not found",
      "RESOURCE_NOT_FOUND",
      404
    );
  }

  const stored = cycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly;
  const amount = readStoredPlanAmount(stored);
  if (!amount.ok) {
    throw new RecurringBillingError(
      "The stored plan cycle price is not an exact chargeable amount",
      "RECURRING_UNAVAILABLE",
      503
    );
  }

  return {
    planId: plan.id,
    cycle,
    amountExact: amount.amount.text,
    currency: plan.currency || "SAR",
    intervalDays: recurringIntervalDays(cycle),
  };
}

/**
 * Reserves the single recurring-checkout slot of a subscription.
 *
 * A `PENDING` intent means another attempt is in flight; a `FINALIZED` intent
 * means the profile already exists. Both are rejected. A released intent
 * (`FAILED` or `EXPIRED`) is reclaimed so a customer can retry after a provider
 * failure.
 */
async function reserveRecurringCheckoutIntent(data: {
  workspaceId: string;
  subscriptionId: string;
  planId: string;
  createdById: string;
  idempotencyKey: string;
  billingCycle: string;
  amountExact: string;
  currency: string;
}): Promise<{ id: string }> {
  try {
    return await db.recurringCheckoutIntent.create({
      data: { ...data, status: "PENDING" },
      select: { id: true },
    });
  } catch (error) {
    const isDuplicate =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002";
    if (!isDuplicate) throw error;

    const existing = await db.recurringCheckoutIntent.findUnique({
      where: {
        subscriptionId_idempotencyKey: {
          subscriptionId: data.subscriptionId,
          idempotencyKey: data.idempotencyKey,
        },
      },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new RecurringBillingError(
        "Recurring checkout intent could not be reserved",
        "RECURRING_STATE_CONFLICT",
        409
      );
    }

    if (existing.status === "FINALIZED") {
      throw new RecurringBillingError(
        "Subscription already holds a recurring profile for this plan and cycle",
        "RECURRING_PROFILE_EXISTS",
        409
      );
    }

    if (!isReleasedRecurringIntentState(existing.status)) {
      throw new RecurringBillingError(
        "Another recurring checkout for this subscription is already in progress",
        "RECURRING_STATE_CONFLICT",
        409
      );
    }

    // Reclaim a failed or expired reservation.
    await db.recurringCheckoutIntent.update({
      where: { id: existing.id },
      data: {
        status: "PENDING",
        createdById: data.createdById,
        amountExact: data.amountExact,
        currency: data.currency,
        billingCycle: data.billingCycle,
        planId: data.planId,
        providerReference: null,
        finalizedAt: null,
      },
    });
    return { id: existing.id };
  }
}

async function executeRecurringProfile(
  input: StartRecurringProfileInput,
  cycleAmount: StoredPlanCycleAmount
): Promise<RecurringProfile> {
  // The gateway takes a decimal SAR number; the exact stored literal stays
  // authoritative for everything the platform persists or displays.
  const gatewayAmount = Number(cycleAmount.amountExact);

  // Get available payment methods - we need at least one for recurring
  const paymentMethods = await initiatePayment({
    invoiceAmount: gatewayAmount,
    currencyIso: cycleAmount.currency,
  });

  if (paymentMethods.length === 0) {
    throw new RecurringBillingError(
      "No payment methods available for recurring billing",
      "NO_PAYMENT_METHODS",
      502
    );
  }

  // Use first available payment method (typically card-based for recurring)
  const paymentMethodId = paymentMethods[0].paymentMethodId;

  const recurringModel = intervalToRecurringModel(input.interval);
  const intervalDays = cycleAmount.intervalDays;

  // Determine callback URLs
  const base =
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  const callBackUrl = `${base}/billing/callback?status=success&recurring=1&ref=${input.customerReference}`;
  const errorUrl = `${base}/billing/callback?status=error&recurring=1&ref=${input.customerReference}`;

  // Call MyFatoorah to create recurring payment
  const result = await createRecurringPayment({
    paymentMethodId,
    invoiceValue: gatewayAmount,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerReference: input.customerReference,
    callBackUrl,
    errorUrl,
    language: "AR",
    recurring: recurringModel,
  });

  const createdAt = new Date();
  const nextChargeAt = deriveRecurringNextChargeAt({
    lastSuccessfulChargeAt: null,
    createdAt,
    intervalDays,
  });

  // Criterion 9.1: exactly one row in DRAFT carrying the copied literals.
  const profile = await db.myFatoorahRecurringProfile.create({
    data: {
      userId: input.userId,
      workspaceId: input.workspaceId,
      subscriptionId: input.subscriptionId,
      planId: input.planId,
      recurringId: result.recurringId,
      status: "DRAFT",
      recurringType: recurringModel.recurringType,
      intervalDays,
      retryCount: recurringModel.retryCount ?? RECURRING_PROVIDER_RETRY_COUNT,
      amount: gatewayAmount,
      amountExact: cycleAmount.amountExact,
      currency: cycleAmount.currency,
      customerReference: result.customerReference,
      initialInvoiceId: result.invoiceId,
      nextChargeAt,
    },
  });

  await audit({
    userId: input.userId,
    action: AUDIT_ACTIONS.BILLING_CHANGE,
    resource: "MyFatoorahRecurringProfile",
    resourceId: profile.id,
    details: {
      action: "start_recurring",
      recurringId: result.recurringId,
      subscriptionId: input.subscriptionId,
      planId: input.planId,
      interval: input.interval,
      intervalDays,
    },
  });

  return mapProfileToResult(profile);
}

/**
 * Cancel a recurring payment profile (criterion 9.5).
 *
 * Only an active profile may be cancelled. The subscription keeps its stored
 * period end, no further period extension follows, and no refund or proration is
 * computed.
 */
export async function cancelRecurringProfile(
  recurringId: string,
  userId?: string
): Promise<RecurringProfile> {
  const profile = await db.myFatoorahRecurringProfile.findUnique({
    where: { recurringId },
  });

  if (!profile) {
    throw new RecurringBillingError(
      "Recurring profile not found",
      "RECURRING_PROFILE_NOT_FOUND",
      404
    );
  }

  const resolution = resolveRecurringTransition(profile.status, "MEMBER_CANCELLED");
  if (!resolution.ok) {
    if (normalizeRecurringProfileState(profile.status) === "CANCELLED") {
      // Already cancelled: report the stored state without a provider call.
      return mapProfileToResult(profile);
    }
    throw new RecurringBillingError(
      "The stored recurring profile state does not permit cancellation",
      "RECURRING_STATE_CONFLICT",
      409
    );
  }

  // Call MyFatoorah to cancel
  const success = await mfCancelRecurring(recurringId);
  if (!success) {
    throw new RecurringBillingError(
      "Failed to cancel recurring payment with MyFatoorah",
      "RECURRING_PROVIDER_ERROR",
      502
    );
  }

  const updated = await db.myFatoorahRecurringProfile.update({
    where: { recurringId },
    data: {
      status: resolution.to,
      // No further period extension applies to a cancelled profile.
      nextChargeAt: null,
      lastWebhookAt: new Date(),
    },
  });

  await audit({
    userId: userId ?? profile.userId,
    action: AUDIT_ACTIONS.BILLING_CHANGE,
    resource: "MyFatoorahRecurringProfile",
    resourceId: profile.id,
    details: {
      action: "cancel_recurring",
      recurringId,
      previousStatus: resolution.from,
      newStatus: resolution.to,
    },
  });

  return mapProfileToResult(updated);
}

/**
 * Resume a suspended recurring payment profile (criterion 9.6).
 *
 * The next charge date is the latest successful cycle charge, or the profile
 * creation timestamp when no successful charge exists, advanced by the stored
 * interval in days.
 */
export async function resumeRecurringProfile(
  recurringId: string,
  userId?: string
): Promise<RecurringProfile> {
  const profile = await db.myFatoorahRecurringProfile.findUnique({
    where: { recurringId },
  });

  if (!profile) {
    throw new RecurringBillingError(
      "Recurring profile not found",
      "RECURRING_PROFILE_NOT_FOUND",
      404
    );
  }

  const resolution = resolveRecurringTransition(profile.status, "MEMBER_RESUMED");
  if (!resolution.ok) {
    if (normalizeRecurringProfileState(profile.status) === "ACTIVE") {
      // Already active: report the stored state without a provider call.
      return mapProfileToResult(profile);
    }
    throw new RecurringBillingError(
      "The stored recurring profile state does not permit resumption",
      "RECURRING_STATE_CONFLICT",
      409
    );
  }

  // Call MyFatoorah to resume
  const success = await mfResumeRecurring(recurringId);
  if (!success) {
    throw new RecurringBillingError(
      "Failed to resume recurring payment with MyFatoorah",
      "RECURRING_PROVIDER_ERROR",
      502
    );
  }

  const intervalDays = readStoredIntervalDays(profile.intervalDays);
  const nextChargeAt =
    intervalDays === null
      ? null
      : deriveRecurringNextChargeAt({
          lastSuccessfulChargeAt: profile.lastChargeAt,
          createdAt: profile.createdAt,
          intervalDays,
        });

  const updated = await db.myFatoorahRecurringProfile.update({
    where: { recurringId },
    data: {
      status: resolution.to,
      nextChargeAt,
      failedCharges: 0,
      lastFailureReason: null,
      lastFailureAt: null,
      lastWebhookAt: new Date(),
    },
  });

  await audit({
    userId: userId ?? profile.userId,
    action: AUDIT_ACTIONS.BILLING_CHANGE,
    resource: "MyFatoorahRecurringProfile",
    resourceId: profile.id,
    details: {
      action: "resume_recurring",
      recurringId,
      previousStatus: resolution.from,
      newStatus: resolution.to,
    },
  });

  return mapProfileToResult(updated);
}

/**
 * Get all recurring profiles for a user.
 */
export async function getUserRecurringProfiles(
  userId: string,
  options?: { status?: string }
): Promise<RecurringProfile[]> {
  const profiles = await db.myFatoorahRecurringProfile.findMany({
    where: {
      userId,
      ...(options?.status ? { status: options.status } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return profiles.map(mapProfileToResult);
}

/**
 * Get a single recurring profile by ID.
 */
export async function getRecurringProfileById(
  id: string,
  userId?: string
): Promise<RecurringProfile | null> {
  const profile = await db.myFatoorahRecurringProfile.findFirst({
    where: {
      id,
      ...(userId ? { userId } : {}),
    },
  });

  return profile ? mapProfileToResult(profile) : null;
}

/**
 * Get a recurring profile by MyFatoorah recurringId.
 */
export async function getRecurringProfileByRecurringId(
  recurringId: string
): Promise<RecurringProfile | null> {
  const profile = await db.myFatoorahRecurringProfile.findUnique({
    where: { recurringId },
  });

  return profile ? mapProfileToResult(profile) : null;
}

/**
 * Handle successful recurring charge from webhook (criterion 9.3).
 *
 * Appends one billing record carrying the charged amount, the currency, and the
 * provider invoice identifier, then sets the subscription period end to the later
 * of the stored period end and the charge timestamp advanced by the stored
 * interval in days. No amount is recomputed.
 */
export async function handleRecurringChargeSuccess(opts: {
  recurringId: string;
  invoiceId: string;
  amount?: number;
  paymentId?: string;
}): Promise<void> {
  const profile = await db.myFatoorahRecurringProfile.findUnique({
    where: { recurringId: opts.recurringId },
  });

  if (!profile) {
    console.warn(
      "[recurring-billing] Recurring charge success for unknown profile:",
      opts.recurringId
    );
    return;
  }

  const resolution = resolveRecurringTransition(
    profile.status,
    "PROVIDER_CYCLE_SUCCEEDED"
  );
  if (!resolution.ok) {
    // Criterion 9.5: a cancelled profile receives no further period extension.
    console.warn(
      "[recurring-billing] Recurring charge ignored for stored state:",
      profile.status
    );
    return;
  }

  const intervalDays = readStoredIntervalDays(profile.intervalDays);
  if (intervalDays === null) {
    console.warn(
      "[recurring-billing] Recurring charge ignored for unreadable interval:",
      opts.recurringId
    );
    return;
  }

  const chargedAt = new Date();
  const nextChargeAt = deriveRecurringNextChargeAt({
    lastSuccessfulChargeAt: chargedAt,
    createdAt: profile.createdAt,
    intervalDays,
  });
  // Criterion 9.3 and requirement 19.7: the charged amount is the provider's
  // verified report when present, and otherwise the literal already stored on the
  // profile. Neither branch derives a value, and an unreadable amount stops the
  // update rather than writing a fabricated one.
  const chargedLiteral =
    readNumericAmountLiteral(opts.amount) ??
    parseExactDecimalLiteral(profile.amountExact) ??
    readNumericAmountLiteral(profile.amount);
  if (!chargedLiteral) {
    console.warn(
      "[recurring-billing] Recurring charge ignored for unreadable amount:",
      opts.recurringId
    );
    return;
  }
  const chargedAmount = Number(chargedLiteral.text);

  await db.$transaction(async (tx) => {
    await tx.myFatoorahRecurringProfile.update({
      where: { recurringId: opts.recurringId },
      data: {
        status: resolution.to,
        lastChargeAt: chargedAt,
        nextChargeAt,
        failedCharges: 0,
        lastFailureReason: null,
        lastFailureAt: null,
        lastWebhookAt: chargedAt,
      },
    });

    await tx.billingRecord.create({
      data: {
        userId: profile.userId,
        type: "SUBSCRIPTION",
        amount: chargedAmount,
        currency: profile.currency,
        description: `Recurring subscription payment (${intervalDays} days)`,
        status: "PAID",
        paymentMethod: "myfatoorah:recurring",
        invoiceNumber: `REC-${opts.invoiceId}`,
        externalInvoiceId: opts.invoiceId,
        externalPaymentId: opts.paymentId,
        metadata: JSON.stringify({
          recurringId: opts.recurringId,
          profileId: profile.id,
          planId: profile.planId,
          intervalDays,
        }),
      },
    });

    const subscription = profile.subscriptionId
      ? await tx.subscription.findUnique({ where: { id: profile.subscriptionId } })
      : await tx.subscription.findUnique({ where: { userId: profile.userId } });

    if (subscription) {
      // Criterion 9.3: the later of the stored period end and the charge
      // timestamp, advanced by the stored interval in days.
      const periodEnd = resolveExtendedPeriodEnd({
        currentPeriodEnd: subscription.currentPeriodEnd,
        chargedAt,
        intervalDays,
      });
      if (periodEnd) {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: "ACTIVE",
            currentPeriodEnd: periodEnd,
            proposalsUsed: 0,
            documentsUsed: 0,
            tokensUsed: 0,
          },
        });
      }
    }
  });

  await audit({
    userId: profile.userId,
    action: AUDIT_ACTIONS.BILLING_CHANGE,
    resource: "MyFatoorahRecurringProfile",
    resourceId: profile.id,
    details: {
      action: "recurring_charge_success",
      recurringId: opts.recurringId,
      invoiceId: opts.invoiceId,
      intervalDays,
    },
  });
}

/**
 * Handle failed recurring charge from webhook (criterion 9.4).
 *
 * Sets the subscription to past due, stores the bounded provider-reported
 * failure reason with its timestamp, and appends no billing record.
 */
export async function handleRecurringChargeFailure(opts: {
  recurringId: string;
  reason?: string;
}): Promise<void> {
  const profile = await db.myFatoorahRecurringProfile.findUnique({
    where: { recurringId: opts.recurringId },
  });

  if (!profile) {
    console.warn(
      "[recurring-billing] Recurring charge failure for unknown profile:",
      opts.recurringId
    );
    return;
  }

  const resolution = resolveRecurringTransition(
    profile.status,
    "PROVIDER_CYCLE_FAILED"
  );
  if (!resolution.ok) {
    console.warn(
      "[recurring-billing] Recurring failure ignored for stored state:",
      profile.status
    );
    return;
  }

  let subscriptionId: string | null = null;
  const failedAt = new Date();
  const reason =
    truncateProviderFailureReason(opts.reason) ?? "Payment failed";

  await db.$transaction(async (tx) => {
    // Criterion 9.4: the profile state is unchanged; the reason and its
    // timestamp are stored and no billing record is appended.
    await tx.myFatoorahRecurringProfile.update({
      where: { recurringId: opts.recurringId },
      data: {
        status: resolution.to,
        failedCharges: { increment: 1 },
        lastFailureReason: reason,
        lastFailureAt: failedAt,
        lastWebhookAt: failedAt,
      },
    });

    const subscription = profile.subscriptionId
      ? await tx.subscription.findUnique({ where: { id: profile.subscriptionId } })
      : await tx.subscription.findUnique({ where: { userId: profile.userId } });

    if (subscription) {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: "PAST_DUE" },
      });
      subscriptionId = subscription.id;
    }
  });

  await audit({
    userId: profile.userId,
    action: AUDIT_ACTIONS.BILLING_CHANGE,
    resource: "MyFatoorahRecurringProfile",
    resourceId: profile.id,
    details: {
      action: "recurring_charge_failure",
      recurringId: opts.recurringId,
      reason,
      failedCharges: profile.failedCharges + 1,
    },
    severity: "WARN",
  });

  // Send notification to workspace OWNER/ADMIN (fire-and-forget)
  if (subscriptionId) {
    const workspaceId =
      profile.workspaceId ??
      (
        await db.workspaceMember.findFirst({
          where: { userId: profile.userId },
          select: { workspaceId: true },
        })
      )?.workspaceId ??
      null;

    if (workspaceId) {
      notifySubscriptionPastDue({
        subscriptionId,
        workspaceId,
        userId: profile.userId,
      }).catch((err) => {
        console.error("[recurring-billing] notification error:", err);
      });
    }
  }
}

// Helper to map DB record to typed result
function mapProfileToResult(
  profile: Awaited<ReturnType<typeof db.myFatoorahRecurringProfile.findUnique>>
): RecurringProfile {
  if (!profile) {
    throw new Error("Profile is null");
  }
  return {
    id: profile.id,
    userId: profile.userId,
    subscriptionId: profile.subscriptionId,
    planId: profile.planId,
    recurringId: profile.recurringId,
    status: profile.status,
    state: normalizeRecurringProfileState(profile.status),
    recurringType: profile.recurringType,
    intervalDays: profile.intervalDays,
    amount: profile.amount,
    amountExact: profile.amountExact,
    currency: profile.currency,
    customerReference: profile.customerReference,
    initialInvoiceId: profile.initialInvoiceId,
    nextChargeAt: profile.nextChargeAt,
    lastChargeAt: profile.lastChargeAt,
    failedCharges: profile.failedCharges,
    lastFailureReason: profile.lastFailureReason,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}
