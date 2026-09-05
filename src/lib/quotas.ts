import { db } from "./db";
import type { CompletionErrorCode } from "./i18n";
import { exportFormatAllowed, parsePlanFeatures } from "./plan-features";

export class QuotaExceededError extends Error {
  constructor(
    message: string,
    public code:
      | "DOCUMENTS"
      | "PROPOSALS"
      | "STORAGE"
      | "TOKENS"
      | "INACTIVE"
      | "TRIAL_ENDED"
      | "EXPORT_FORMAT"
  ) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

/** Exported so the status-contract guard can drive off the real map. */
export const QUOTA_FAILURE_CODES = {
  DOCUMENTS: "QUOTA_DOCUMENTS_EXCEEDED",
  PROPOSALS: "QUOTA_PROPOSALS_EXCEEDED",
  STORAGE: "QUOTA_STORAGE_EXCEEDED",
  TOKENS: "QUOTA_TOKENS_EXCEEDED",
  INACTIVE: "SUBSCRIPTION_INACTIVE",
  TRIAL_ENDED: "TRIAL_ENDED",
  EXPORT_FORMAT: "EXPORT_FORMAT_NOT_IN_PLAN",
} as const satisfies Readonly<
  Record<QuotaExceededError["code"], CompletionErrorCode>
>;

/** Where a 402 sends the reader: the canonical billing screen. */
export const QUOTA_UPGRADE_PATH = "/app/billing";

/**
 * Bilingual failure code for an exhausted allowance.
 *
 * `QuotaExceededError.message` is an internal English string; a route must
 * answer with this code so the reader learns which limit they hit in their own
 * language.
 */
export function quotaFailureCode(
  error: QuotaExceededError
): CompletionErrorCode {
  return QUOTA_FAILURE_CODES[error.code];
}

/* -------------------------------------------------------------------------- */
/* Entitlement state (pure)                                                   */
/* -------------------------------------------------------------------------- */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Plan seeded at signup; an unpaid row on it is a trial whatever its status says. */
const TRIAL_PLAN_NAME = "STARTER";

/** The subscription fields the entitlement rule reads. */
export type EntitlementSubscription = Readonly<{
  status: string;
  currentPeriodEnd: Date;
  trialEndsAt?: Date | null;
  plan?: Readonly<{ name: string }> | null;
  /**
   * Whether any payment ever settled for the subscription owner (a PAID
   * BillingRecord or PaymentCheckout). Needed only to classify legacy
   * `ACTIVE` Starter rows written before trials carried `trialEndsAt`.
   */
  hasPaid?: boolean;
}>;

export type EntitlementState =
  /** Entitled and not a trial: a paid plan, or a plan an admin assigned. */
  | Readonly<{ kind: "ACTIVE" }>
  | Readonly<{ kind: "TRIAL"; endsAt: Date; daysLeft: number }>
  | Readonly<{ kind: "TRIAL_ENDED"; endedAt: Date }>
  /** PENDING, PAST_DUE, CANCELLED, EXPIRED, or an unknown status. */
  | Readonly<{ kind: "INACTIVE" }>;

/**
 * Classifies a subscription row at read time.
 *
 * - `TRIALING` ends at `trialEndsAt` (or `currentPeriodEnd` when the row
 *   predates the column).
 * - A legacy `ACTIVE` Starter row that never paid is a trial too: it runs to
 *   `currentPeriodEnd` and ends there, instead of staying free forever.
 * - Every other `ACTIVE` row is entitled; every other status is not.
 */
export function resolveEntitlementState(
  sub: EntitlementSubscription | null | undefined,
  now: Date = new Date()
): EntitlementState {
  if (!sub) return { kind: "INACTIVE" };

  if (sub.status === "TRIALING") {
    return trialState(sub.trialEndsAt ?? sub.currentPeriodEnd, now);
  }

  if (sub.status !== "ACTIVE") return { kind: "INACTIVE" };

  const isUnpaidStarter =
    sub.plan?.name === TRIAL_PLAN_NAME && sub.hasPaid === false;
  if (isUnpaidStarter) {
    return trialState(sub.trialEndsAt ?? sub.currentPeriodEnd, now);
  }

  return { kind: "ACTIVE" };
}

function trialState(endsAt: Date, now: Date): EntitlementState {
  if (endsAt.getTime() <= now.getTime()) {
    return { kind: "TRIAL_ENDED", endedAt: endsAt };
  }
  return {
    kind: "TRIAL",
    endsAt,
    daysLeft: Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS),
  };
}

/** Whether the row's owner ever settled a payment, for the legacy Starter rule. */
export async function hasSettledPayment(userId: string): Promise<boolean> {
  const [records, checkouts] = await Promise.all([
    db.billingRecord.count({ where: { userId, status: "PAID" } }),
    db.paymentCheckout.count({ where: { userId, status: "PAID" } }),
  ]);
  return records > 0 || checkouts > 0;
}

/* -------------------------------------------------------------------------- */
/* Governing subscription                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Whose subscription binds a user: the OWNER of their active workspace when
 * they work inside someone else's, else their own. Mirrors `readSeatAllowance`
 * in invitation-service-prisma.ts so seats and quotas name the same plan.
 */
async function resolveGoverningUserIds(
  userId: string,
  activeWorkspaceId: string | null | undefined
): Promise<string[]> {
  if (!activeWorkspaceId) return [userId];
  const owner = await db.workspaceMember.findFirst({
    where: { workspaceId: activeWorkspaceId, role: "OWNER" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!owner || owner.userId === userId) return [userId];
  return [owner.userId, userId];
}

async function findGoverningSubscription(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, activeWorkspaceId: true },
  });
  const candidates = await resolveGoverningUserIds(
    userId,
    user?.activeWorkspaceId
  );
  for (const candidate of candidates) {
    const sub = await db.subscription.findUnique({
      where: { userId: candidate },
      include: { plan: true },
    });
    if (sub) return { user, sub };
  }
  return { user, sub: null };
}

/**
 * The subscription the billing screen should describe for `userId`: the
 * workspace owner's when the user works inside someone else's workspace, else
 * their own. `isOwnRow` is false for a teammate, who cannot buy for the
 * workspace (a purchase would create a row the quotas never read).
 */
export async function resolveGoverningSubscription(userId: string) {
  const { sub } = await findGoverningSubscription(userId);
  return {
    sub,
    isOwnRow: !sub || sub.userId === userId,
    governedByUserId: sub?.userId ?? userId,
  };
}

function isPlatformAdmin(user: { role: string } | null | undefined): boolean {
  return user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";
}

/* -------------------------------------------------------------------------- */
/* Gates                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Enforce subscription plan limits before a billable action.
 *
 * Contract: resolves the governing subscription (workspace owner's, else the
 * user's own), rejects a trial that has lapsed with `TRIAL_ENDED` and any other
 * non-entitled status with `INACTIVE`, then checks the one allowance named by
 * `kind`. For `"tokens"`, pass the tokens the call is about to spend as
 * `extra.tokens`; the gate throws `TOKENS` when `tokensUsed + extra.tokens`
 * would exceed `plan.maxTokensPerMonth` (a non-positive limit is unlimited).
 * Call it before the AI request; account for the actual spend afterwards with
 * `bumpUsage(userId, "tokens", n)`.
 *
 * @throws QuotaExceededError — map with `quotaFailureCode` to a bilingual 402.
 */
/**
 * The governing subscription once it has passed the status gate: a platform
 * admin with no row gets `null` (soft limits), everyone else either has an
 * entitled row or a thrown `INACTIVE` / `TRIAL_ENDED`.
 */
async function requireEntitledSubscription(userId: string) {
  const { user, sub } = await findGoverningSubscription(userId);

  // No subscription → allow with soft limits for bootstrap SUPER_ADMIN, else block
  if (!sub) {
    if (isPlatformAdmin(user)) return null;
    throw new QuotaExceededError(
      "No active subscription — contact your administrator",
      "INACTIVE"
    );
  }

  const state = resolveEntitlementState(
    {
      ...sub,
      // The legacy rule needs the payment history only for an ACTIVE Starter row.
      hasPaid:
        sub.status === "ACTIVE" && sub.plan.name === TRIAL_PLAN_NAME
          ? await hasSettledPayment(sub.userId)
          : true,
    },
    new Date()
  );
  if (state.kind === "TRIAL_ENDED") {
    // The bootstrap operator's own seeded Starter row is not a customer trial.
    if (!isPlatformAdmin(user)) {
      throw new QuotaExceededError("Free trial has ended", "TRIAL_ENDED");
    }
  } else if (state.kind === "INACTIVE") {
    throw new QuotaExceededError("Subscription is not active", "INACTIVE");
  }
  return sub;
}

/**
 * Plan feature gate for proposal downloads: Starter is PDF only, Pro adds the
 * office formats and the bid-package ZIP, DOCX stays Enterprise
 * (see plan-features.ts). Same governing subscription as the quotas.
 *
 * @throws QuotaExceededError("EXPORT_FORMAT") → 402 with the upgrade path.
 */
export async function assertExportFormatAllowed(
  userId: string,
  format: string
): Promise<void> {
  const sub = await requireEntitledSubscription(userId);
  if (!sub) return;
  if (!exportFormatAllowed(parsePlanFeatures(sub.plan.featuresJson), format)) {
    throw new QuotaExceededError(
      `Export format ${format} is not included in plan ${sub.plan.name}`,
      "EXPORT_FORMAT"
    );
  }
}

export async function assertWithinQuota(
  userId: string,
  kind: "document" | "proposal" | "storage" | "tokens",
  extra?: { bytes?: number; tokens?: number }
): Promise<void> {
  const sub = await requireEntitledSubscription(userId);
  if (!sub) return;

  const plan = sub.plan;
  if (kind === "document") {
    if (plan.maxDocuments > 0 && sub.documentsUsed >= plan.maxDocuments) {
      throw new QuotaExceededError(
        `Document quota exceeded (${sub.documentsUsed}/${plan.maxDocuments})`,
        "DOCUMENTS"
      );
    }
  }
  if (kind === "proposal") {
    if (plan.maxProposals > 0 && sub.proposalsUsed >= plan.maxProposals) {
      throw new QuotaExceededError(
        `Proposal quota exceeded (${sub.proposalsUsed}/${plan.maxProposals})`,
        "PROPOSALS"
      );
    }
  }
  // Storage quota: maxStorageGb → bytes. What binds is the accumulated total
  // plus the incoming file, so a workspace cannot stay under the cap forever by
  // uploading files that are each individually small enough.
  if (kind === "storage") {
    if (plan.maxStorageGb > 0) {
      const added = extra?.bytes ?? 0;
      const maxBytes = plan.maxStorageGb * 1024 * 1024 * 1024;
      // Clamped: the counter moves both ways (deletes credit bytes back), and a
      // drifted negative would otherwise read as free space above the plan.
      const used = Math.max(0, sub.storageUsedBytes ?? 0);
      if (used + added > maxBytes) {
        throw new QuotaExceededError(
          `Storage quota exceeded (${Math.round(used / 1024 / 1024)}MB / ${plan.maxStorageGb}GB)`,
          "STORAGE"
        );
      }
    }
  }
  // Tokens quota. Not consulted for uploads: a spent AI budget has nothing to do
  // with disk, and refusing a file upload with "AI usage limit reached" sends
  // the reader to buy the wrong thing.
  if (kind === "tokens") {
    if (plan.maxTokensPerMonth > 0) {
      const added = extra?.tokens ?? 0;
      if (sub.tokensUsed + added > plan.maxTokensPerMonth) {
        throw new QuotaExceededError(
          `Token quota exceeded (${sub.tokensUsed}/${plan.maxTokensPerMonth})`,
          "TOKENS"
        );
      }
    }
  }
}

/**
 * Account for consumed allowance after a billable action committed.
 *
 * Contract: adds `amount` (default 1) to the counter named by `kind` on the
 * governing subscription — the workspace owner's when the user works in
 * someone else's workspace, else their own. For `"tokens"`, pass the total
 * tokens the AI call actually consumed (prompt + completion); the counter is
 * `tokensUsed`, which `assertWithinQuota(userId, "tokens")` reads. Never
 * throws: a missing subscription or a failed write is ignored so the action
 * that already happened keeps its own response.
 */
export async function bumpUsage(
  userId: string,
  kind: "document" | "proposal" | "storage" | "tokens",
  amount = 1
) {
  let target = userId;
  try {
    target = (await findGoverningSubscription(userId)).sub?.userId ?? userId;
  } catch {
    // Owner lookup failed: charge the user's own row rather than nobody's.
  }
  try {
    if (kind === "document") {
      await db.subscription.updateMany({ where: { userId: target }, data: { documentsUsed: { increment: amount } } });
    } else if (kind === "proposal") {
      await db.subscription.updateMany({ where: { userId: target }, data: { proposalsUsed: { increment: amount } } });
    } else if (kind === "storage") {
      await db.subscription.updateMany({ where: { userId: target }, data: { storageUsedBytes: { increment: amount } } });
    } else if (kind === "tokens") {
      await db.subscription.updateMany({ where: { userId: target }, data: { tokensUsed: { increment: amount } } });
    }
  } catch {
    // ignore if no subscription
  }
}
