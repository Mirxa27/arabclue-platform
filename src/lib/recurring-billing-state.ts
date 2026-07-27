/**
 * Recurring_Billing_Service state model and persistence rules
 * (requirements 9.1, 9.3, 9.5, 9.6, 9.7, 9.10, 9.11, 19.7; design 4.6).
 *
 * This module is the exact-value core of recurring billing. It is deliberately
 * free of Prisma, of the MyFatoorah SDK, and of every other I/O boundary, so the
 * rules below are exercised by unit and property tests with in-memory fakes —
 * no provider call, no charge, no database write. `recurring-billing-prisma.ts`
 * supplies the production adapters and `recurring-billing.ts` re-exports this
 * surface so `@/lib/recurring-billing` stays the single entry point.
 *
 * Requirement 19.7 is structural here, not advisory:
 * - No function in this module produces a monetary value. Amounts arrive as the
 *   literal the tenant's plan already stores and are copied unchanged.
 * - `readStoredPlanAmount` is a *representation* reader. It refuses any stored
 *   value that is not already an exact decimal literal instead of rounding it,
 *   because rounding would invent an amount the tenant never stored.
 * - Decimal comparison exists only to validate a provider response
 *   (criterion 9.10). The comparison helpers return booleans; the difference
 *   they compute internally is a `bigint` of scaled units that never escapes,
 *   is never persisted, and is never displayed.
 * - No refund, proration, margin, discount, or total is computed anywhere.
 *
 * Dates are derived (criteria 9.3, 9.6) because a schedule is not a monetary
 * value. Every derivation uses the injected UTC clock and the interval in days
 * already stored on the profile.
 */

import { addUtcMilliseconds } from "./time";
import { getDynamicTranslationKey, type TranslationKey } from "./i18n";

/* -------------------------------------------------------------------------- */
/* Contract constants                                                         */
/* -------------------------------------------------------------------------- */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Billing cycles that may hold a recurring profile (criterion 9.1). */
export const RECURRING_BILLING_CYCLES = Object.freeze([
  "MONTHLY",
  "YEARLY",
] as const);

export type RecurringBillingCycle = (typeof RECURRING_BILLING_CYCLES)[number];

/**
 * Interval in days stored on the profile: 30 for a monthly cycle and 365 for a
 * yearly cycle (criterion 9.1). These are the literal integers the requirement
 * names, not a derivation from a calendar.
 */
export const RECURRING_INTERVAL_DAYS: Readonly<
  Record<RecurringBillingCycle, 30 | 365>
> = Object.freeze({ MONTHLY: 30, YEARLY: 365 });

/** Provider cycle retry count required by criterion 9.1. */
export const RECURRING_PROVIDER_RETRY_COUNT = 3;

/** Provider call deadline required by criteria 9.1, 9.2, 9.5, 9.6, 9.13. */
export const RECURRING_PROVIDER_DEADLINE_MS = 30_000;

/** Amount tolerance criterion 9.10 permits when validating a charge report. */
export const RECURRING_AMOUNT_TOLERANCE_LITERAL = "0.01";

/** Fraction digits an exact recurring amount literal may carry. */
export const RECURRING_AMOUNT_MAX_SCALE = 2;

/** Bound criterion 9.4 places on a stored provider failure reason. */
export const RECURRING_FAILURE_REASON_MAX_LENGTH = 500;

/** Largest stored interval accepted, so a date derivation cannot overflow. */
export const RECURRING_INTERVAL_DAYS_MAX = 3_660;

export function isRecurringBillingCycle(
  value: unknown
): value is RecurringBillingCycle {
  return (
    typeof value === "string" &&
    (RECURRING_BILLING_CYCLES as readonly string[]).includes(value)
  );
}

/** Stored interval in days for a cycle (criterion 9.1). */
export function recurringIntervalDays(
  cycle: RecurringBillingCycle
): 30 | 365 {
  return RECURRING_INTERVAL_DAYS[cycle];
}

/** A stored interval usable for a date derivation, or null when unusable. */
export function readStoredIntervalDays(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  if (value < 1 || value > RECURRING_INTERVAL_DAYS_MAX) return null;
  return value;
}

/* -------------------------------------------------------------------------- */
/* Exact decimal literals (requirement 19.7)                                  */
/* -------------------------------------------------------------------------- */

/**
 * A non-negative decimal amount held as the literal text it was stored as, plus
 * the scaled integer form used only for comparison.
 *
 * `text` is authoritative: it is what gets persisted and displayed, unchanged.
 * `units` and `scale` exist so two literals of different scale can be compared
 * without floating-point arithmetic. Neither is ever rendered.
 */
export type ExactDecimalLiteral = Readonly<{
  text: string;
  units: bigint;
  scale: number;
}>;

const DECIMAL_LITERAL_PATTERN = /^\d+(?:\.\d+)?$/u;

/**
 * Parses a non-negative decimal literal without arithmetic on its value.
 *
 * The text is preserved exactly as supplied (after trimming, which the stored
 * column already guarantees). No sign, exponent, separator, or currency symbol
 * is accepted, so a provider-supplied string cannot smuggle in a different
 * numeric interpretation.
 */
export function parseExactDecimalLiteral(
  value: unknown
): ExactDecimalLiteral | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length === 0 || text.length > 40) return null;
  if (!DECIMAL_LITERAL_PATTERN.test(text)) return null;

  const separator = text.indexOf(".");
  const scale = separator === -1 ? 0 : text.length - separator - 1;
  const digits = separator === -1 ? text : text.slice(0, separator) + text.slice(separator + 1);
  return Object.freeze({ text, units: BigInt(digits), scale });
}

/**
 * `BigInt` values are constructed through the function rather than written as
 * `0n`/`10n` literals: the repository compiles against the `ES2017` target in
 * `tsconfig.json`, which does not admit BigInt literal syntax. `lib` already
 * includes `esnext`, so the type and the constructor are available. Behaviour is
 * identical; only the syntax differs.
 */
const BIG_ZERO = BigInt(0);
const BIG_ONE = BigInt(1);
const BIG_TEN = BigInt(10);

/** Whether a parsed literal is strictly greater than zero (criterion 9.1). */
export function isPositiveExactDecimal(literal: ExactDecimalLiteral): boolean {
  return literal.units > BIG_ZERO;
}

const SCALE_MULTIPLIERS: readonly bigint[] = Object.freeze([
  BigInt(1),
  BigInt(10),
  BigInt(100),
  BigInt(1_000),
  BigInt(10_000),
  BigInt(100_000),
  BigInt(1_000_000),
]);

/** Scale factor for aligning two literals; comparison support only. */
function scaleFactor(exponent: number): bigint {
  const cached = SCALE_MULTIPLIERS[exponent];
  if (cached !== undefined) return cached;
  let factor = BIG_ONE;
  for (let index = 0; index < exponent; index += 1) factor *= BIG_TEN;
  return factor;
}

/** Both literals expressed at the same scale, for comparison only. */
function alignedUnits(
  left: ExactDecimalLiteral,
  right: ExactDecimalLiteral
): Readonly<{ left: bigint; right: bigint }> {
  const scale = Math.max(left.scale, right.scale);
  return {
    left: left.units * scaleFactor(scale - left.scale),
    right: right.units * scaleFactor(scale - right.scale),
  };
}

/**
 * Exact numeric equality of two stored literals, independent of trailing zeros
 * (`"10.00"` equals `"10"`). Validation only — no value is derived.
 */
export function exactDecimalEquals(
  left: ExactDecimalLiteral,
  right: ExactDecimalLiteral
): boolean {
  const aligned = alignedUnits(left, right);
  return aligned.left === aligned.right;
}

/**
 * Whether a provider-reported amount differs from the stored profile amount by
 * at most the tolerance (criterion 9.10).
 *
 * The internal difference is a `bigint` of scaled units used exclusively for
 * this predicate. It is not returned, persisted, logged, or displayed, so no
 * monetary value is produced (requirement 19.7).
 */
export function amountWithinProviderTolerance(
  stored: ExactDecimalLiteral,
  reported: ExactDecimalLiteral,
  tolerance: ExactDecimalLiteral
): boolean {
  const scale = Math.max(stored.scale, reported.scale, tolerance.scale);
  const storedUnits = stored.units * scaleFactor(scale - stored.scale);
  const reportedUnits = reported.units * scaleFactor(scale - reported.scale);
  const toleranceUnits = tolerance.units * scaleFactor(scale - tolerance.scale);
  const distance =
    storedUnits > reportedUnits
      ? storedUnits - reportedUnits
      : reportedUnits - storedUnits;
  return distance <= toleranceUnits;
}

/** The tolerance literal of criterion 9.10, parsed once. */
export const RECURRING_AMOUNT_TOLERANCE: ExactDecimalLiteral = (() => {
  const parsed = parseExactDecimalLiteral(RECURRING_AMOUNT_TOLERANCE_LITERAL);
  if (!parsed) throw new TypeError("Recurring amount tolerance is not a literal.");
  return parsed;
})();

const CURRENCY_PATTERN = /^[A-Za-z]{3}$/u;

/** Canonical ISO 4217 form of a stored or reported currency, or null. */
export function readCurrencyCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim();
  if (!CURRENCY_PATTERN.test(code)) return null;
  return code.toUpperCase();
}

/**
 * Whether a reported currency equals the stored profile currency
 * (criterion 9.10). ISO 4217 codes are case-insensitive identifiers, so the
 * comparison is over the canonical uppercase form of both stored strings.
 */
export function currencyEquals(stored: unknown, reported: unknown): boolean {
  const left = readCurrencyCode(stored);
  const right = readCurrencyCode(reported);
  return left !== null && right !== null && left === right;
}

export type StoredAmountReadFailure = "MISSING" | "NOT_EXACT" | "NOT_POSITIVE";

export type StoredAmountRead =
  | Readonly<{ ok: true; amount: ExactDecimalLiteral }>
  | Readonly<{ ok: false; reason: StoredAmountReadFailure }>;

/**
 * Reads the plan's stored cycle price as an exact literal (criterion 9.1).
 *
 * A stored exact string is taken verbatim. A stored numeric column is rendered
 * through its shortest round-trip decimal form and then *validated*: if that
 * form is not already an exact literal of at most two fraction digits the read
 * fails with `NOT_EXACT` rather than rounding, because rounding would produce an
 * amount the tenant never stored (requirement 19.7). Callers surface the failure
 * instead of substituting a value.
 */
export function readStoredPlanAmount(stored: unknown): StoredAmountRead {
  if (stored === null || stored === undefined) {
    return { ok: false, reason: "MISSING" };
  }

  let text: string;
  if (typeof stored === "string") {
    text = stored.trim();
    if (text.length === 0) return { ok: false, reason: "MISSING" };
  } else if (typeof stored === "number") {
    if (!Number.isFinite(stored) || stored < 0) {
      return { ok: false, reason: "NOT_EXACT" };
    }
    // Shortest round-trip form of the stored double. This selects an existing
    // representation; it neither rounds nor rescales the stored value.
    text = String(stored);
  } else {
    return { ok: false, reason: "NOT_EXACT" };
  }

  const parsed = parseExactDecimalLiteral(text);
  if (!parsed || parsed.scale > RECURRING_AMOUNT_MAX_SCALE) {
    return { ok: false, reason: "NOT_EXACT" };
  }
  if (!isPositiveExactDecimal(parsed)) {
    return { ok: false, reason: "NOT_POSITIVE" };
  }
  return { ok: true, amount: parsed };
}

/** Provider failure reason bounded by criterion 9.4, or null when absent. */
export function truncateProviderFailureReason(
  reason: unknown
): string | null {
  if (typeof reason !== "string") return null;
  const trimmed = reason.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > RECURRING_FAILURE_REASON_MAX_LENGTH
    ? trimmed.slice(0, RECURRING_FAILURE_REASON_MAX_LENGTH)
    : trimmed;
}

/* -------------------------------------------------------------------------- */
/* Profile state vocabulary and transitions                                   */
/* -------------------------------------------------------------------------- */

/** The four profile states requirement 9 names. */
export const RECURRING_PROFILE_STATES = Object.freeze([
  "DRAFT",
  "ACTIVE",
  "SUSPENDED",
  "CANCELLED",
] as const);

export type RecurringProfileState = (typeof RECURRING_PROFILE_STATES)[number];

/**
 * States that occupy the single-profile slot of a subscription
 * (criterion 9.11). The partial unique index
 * `MyFatoorahRecurringProfile_subscriptionId_current_key` enforces the same set
 * in PostgreSQL, so a lost race fails at the constraint rather than creating a
 * second profile.
 */
export const OCCUPYING_RECURRING_STATES = Object.freeze([
  "DRAFT",
  "ACTIVE",
] as const);

export function isRecurringProfileState(
  value: unknown
): value is RecurringProfileState {
  return (
    typeof value === "string" &&
    (RECURRING_PROFILE_STATES as readonly string[]).includes(value)
  );
}

export function isOccupyingRecurringState(
  state: RecurringProfileState
): boolean {
  return (OCCUPYING_RECURRING_STATES as readonly string[]).includes(state);
}

/**
 * Stored values written before the four-state vocabulary existed.
 *
 * - `CANCELED` is the single-l spelling the earlier code wrote.
 * - `COMPLETED` is a MyFatoorah profile that has finished its iterations: it
 *   charges no further cycle, so it maps to the terminal state. No refund or
 *   proration follows from the mapping (criterion 9.5).
 * - `UNCOMPLETED`, `INACTIVE`, and `PAUSED` are provider reports of a profile
 *   that is inactive and not cancelled, which is exactly the suspended state
 *   criterion 9.6 defines.
 * - `PENDING` was written for a profile awaiting its first charge.
 */
const LEGACY_PROFILE_STATE_ALIASES: Readonly<Record<string, RecurringProfileState>> =
  Object.freeze({
    CANCELED: "CANCELLED",
    COMPLETED: "CANCELLED",
    UNCOMPLETED: "SUSPENDED",
    INACTIVE: "SUSPENDED",
    PAUSED: "SUSPENDED",
    PENDING: "DRAFT",
  });

/**
 * Normalizes a stored status onto the four-state vocabulary, or returns null
 * when the stored value belongs to no known state. A null is a state conflict
 * for every command; it is never silently treated as active.
 */
export function normalizeRecurringProfileState(
  stored: unknown
): RecurringProfileState | null {
  if (typeof stored !== "string") return null;
  const value = stored.trim().toUpperCase();
  if (isRecurringProfileState(value)) return value;
  return LEGACY_PROFILE_STATE_ALIASES[value] ?? null;
}

/** Events that may change a stored profile state. */
export const RECURRING_PROFILE_TRIGGERS = Object.freeze([
  "PROVIDER_CYCLE_SUCCEEDED",
  "PROVIDER_CYCLE_FAILED",
  "PROVIDER_REPORTED_INACTIVE",
  "PROVIDER_REPORTED_CANCELLED",
  "MEMBER_CANCELLED",
  "MEMBER_RESUMED",
] as const);

export type RecurringProfileTrigger =
  (typeof RECURRING_PROFILE_TRIGGERS)[number];

/**
 * Allowed transitions, keyed by trigger then by stored state.
 *
 * `CANCELLED` is terminal for every trigger except an idempotent repeat of a
 * provider cancellation report, so a late cycle report can never extend a
 * cancelled subscription (criterion 9.5). A failed cycle leaves the state
 * unchanged; criterion 9.4 records the reason and moves the subscription to past
 * due instead.
 */
export const RECURRING_PROFILE_TRANSITIONS: Readonly<
  Record<
    RecurringProfileTrigger,
    Readonly<Partial<Record<RecurringProfileState, RecurringProfileState>>>
  >
> = Object.freeze({
  // Criterion 9.3: the first accepted cycle charge activates the draft profile.
  PROVIDER_CYCLE_SUCCEEDED: Object.freeze({
    DRAFT: "ACTIVE",
    ACTIVE: "ACTIVE",
    SUSPENDED: "ACTIVE",
  }),
  // Criterion 9.4: the profile state is unchanged by a failed cycle.
  PROVIDER_CYCLE_FAILED: Object.freeze({
    DRAFT: "DRAFT",
    ACTIVE: "ACTIVE",
    SUSPENDED: "SUSPENDED",
  }),
  // Criterion 9.6: an inactive, not-cancelled provider report is suspension.
  PROVIDER_REPORTED_INACTIVE: Object.freeze({
    DRAFT: "SUSPENDED",
    ACTIVE: "SUSPENDED",
    SUSPENDED: "SUSPENDED",
  }),
  PROVIDER_REPORTED_CANCELLED: Object.freeze({
    DRAFT: "CANCELLED",
    ACTIVE: "CANCELLED",
    SUSPENDED: "CANCELLED",
    CANCELLED: "CANCELLED",
  }),
  // Criterion 9.5: a member may cancel only an active profile.
  MEMBER_CANCELLED: Object.freeze({ ACTIVE: "CANCELLED" }),
  // Criterion 9.6: a member may resume only a suspended profile.
  MEMBER_RESUMED: Object.freeze({ SUSPENDED: "ACTIVE" }),
});

export type RecurringTransitionResolution =
  | Readonly<{ ok: true; from: RecurringProfileState; to: RecurringProfileState; changesState: boolean }>
  | Readonly<{ ok: false; code: "RECURRING_STATE_CONFLICT" }>;

/**
 * Resolves the target state for a trigger, or reports the state conflict
 * criterion 9.13 requires. A stored value outside the vocabulary is a conflict.
 */
export function resolveRecurringTransition(
  storedState: unknown,
  trigger: RecurringProfileTrigger
): RecurringTransitionResolution {
  const from = normalizeRecurringProfileState(storedState);
  if (from === null) return { ok: false, code: "RECURRING_STATE_CONFLICT" };

  const to = RECURRING_PROFILE_TRANSITIONS[trigger][from];
  if (to === undefined) return { ok: false, code: "RECURRING_STATE_CONFLICT" };

  return { ok: true, from, to, changesState: to !== from };
}

/** Whether a member may cancel a profile in the stored state (criterion 9.5). */
export function canMemberCancel(storedState: unknown): boolean {
  return resolveRecurringTransition(storedState, "MEMBER_CANCELLED").ok;
}

/** Whether a member may resume a profile in the stored state (criterion 9.6). */
export function canMemberResume(storedState: unknown): boolean {
  return resolveRecurringTransition(storedState, "MEMBER_RESUMED").ok;
}

/** Registered bilingual label key for a profile state (requirement 18.4). */
export function recurringProfileStateLabelKey(
  state: RecurringProfileState
): TranslationKey {
  return getDynamicTranslationKey("recurringProfileState", state);
}

/* -------------------------------------------------------------------------- */
/* Date derivations (criteria 9.3, 9.6, 9.8)                                  */
/* -------------------------------------------------------------------------- */

/**
 * Next charge date: the latest successful cycle charge, or the profile creation
 * timestamp when no successful cycle exists, advanced by the stored interval in
 * days (criteria 9.6, 9.8).
 */
export function deriveRecurringNextChargeAt(input: {
  readonly lastSuccessfulChargeAt: Date | null;
  readonly createdAt: Date;
  readonly intervalDays: number;
}): Date | null {
  const intervalDays = readStoredIntervalDays(input.intervalDays);
  if (intervalDays === null) return null;
  const base = input.lastSuccessfulChargeAt ?? input.createdAt;
  if (!Number.isFinite(base.getTime())) return null;
  return addUtcMilliseconds(base, intervalDays * DAY_MS);
}

/**
 * Period end after an accepted cycle charge: the later of the stored period end
 * and the charge timestamp, advanced by the stored interval in days
 * (criterion 9.3). A late-arriving charge therefore never shortens a period.
 */
export function resolveExtendedPeriodEnd(input: {
  readonly currentPeriodEnd: Date;
  readonly chargedAt: Date;
  readonly intervalDays: number;
}): Date | null {
  const intervalDays = readStoredIntervalDays(input.intervalDays);
  if (intervalDays === null) return null;
  const storedEnd = input.currentPeriodEnd.getTime();
  const chargedAt = input.chargedAt.getTime();
  if (!Number.isFinite(storedEnd) || !Number.isFinite(chargedAt)) return null;
  const base = storedEnd >= chargedAt ? input.currentPeriodEnd : input.chargedAt;
  return addUtcMilliseconds(base, intervalDays * DAY_MS);
}

/* -------------------------------------------------------------------------- */
/* Checkout idempotency (criterion 9.11)                                      */
/* -------------------------------------------------------------------------- */

/** Reservation states of a `RecurringCheckoutIntent` row. */
export const RECURRING_INTENT_STATES = Object.freeze([
  "PENDING",
  "FINALIZED",
  "FAILED",
  "EXPIRED",
] as const);

export type RecurringIntentState = (typeof RECURRING_INTENT_STATES)[number];

/** Intent states that no longer reserve the single checkout slot. */
export const RELEASED_RECURRING_INTENT_STATES = Object.freeze([
  "FAILED",
  "EXPIRED",
] as const);

export function isRecurringIntentState(
  value: unknown
): value is RecurringIntentState {
  return (
    typeof value === "string" &&
    (RECURRING_INTENT_STATES as readonly string[]).includes(value)
  );
}

export function isReleasedRecurringIntentState(value: unknown): boolean {
  return (
    typeof value === "string" &&
    (RELEASED_RECURRING_INTENT_STATES as readonly string[]).includes(value)
  );
}

/**
 * Stable idempotency key for a recurring checkout attempt.
 *
 * The key is derived from the plan and cycle only, so repeated submissions of
 * the same intent collide on `(subscriptionId, idempotencyKey)` and resolve to
 * one winner before any provider operation is attempted (criterion 9.11).
 */
export function recurringCheckoutIdempotencyKey(input: {
  readonly planId: string;
  readonly cycle: RecurringBillingCycle;
}): string {
  return `${input.planId.trim()}:${input.cycle}`;
}

/* -------------------------------------------------------------------------- */
/* Webhook idempotency (criterion 9.7)                                        */
/* -------------------------------------------------------------------------- */

/** Durable processing states of a `PaymentWebhookEvent` row. */
export const RECURRING_WEBHOOK_PROCESSING_STATES = Object.freeze([
  "RECEIVED",
  "PROCESSED",
  "FAILED",
  "IGNORED",
  "DUPLICATE",
] as const);

export type RecurringWebhookProcessingState =
  (typeof RECURRING_WEBHOOK_PROCESSING_STATES)[number];

/**
 * A fingerprint already recorded in this state is a duplicate: the event is
 * acknowledged and no billing record, subscription change, or profile change
 * follows (criterion 9.7).
 */
export const SETTLED_WEBHOOK_PROCESSING_STATES = Object.freeze([
  "PROCESSED",
  "IGNORED",
  "DUPLICATE",
] as const);

export function isSettledWebhookProcessingState(value: unknown): boolean {
  return (
    typeof value === "string" &&
    (SETTLED_WEBHOOK_PROCESSING_STATES as readonly string[]).includes(value)
  );
}

/** Dispositions recorded on a recurring webhook receipt. */
export const RECURRING_WEBHOOK_DISPOSITIONS = Object.freeze([
  "CYCLE_CHARGED",
  "CYCLE_FAILED",
  "PROFILE_UPDATED",
  "DUPLICATE",
  "VERIFICATION_FAILED",
  "UNKNOWN_PROFILE",
] as const);

export type RecurringWebhookDisposition =
  (typeof RECURRING_WEBHOOK_DISPOSITIONS)[number];
