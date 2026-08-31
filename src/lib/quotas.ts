import { db } from "./db";
import type { CompletionErrorCode } from "./i18n";

export class QuotaExceededError extends Error {
  constructor(
    message: string,
    public code: "DOCUMENTS" | "PROPOSALS" | "STORAGE" | "TOKENS" | "INACTIVE"
  ) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

const QUOTA_FAILURE_CODES = {
  DOCUMENTS: "QUOTA_DOCUMENTS_EXCEEDED",
  PROPOSALS: "QUOTA_PROPOSALS_EXCEEDED",
  STORAGE: "QUOTA_STORAGE_EXCEEDED",
  TOKENS: "QUOTA_TOKENS_EXCEEDED",
  INACTIVE: "SUBSCRIPTION_INACTIVE",
} as const satisfies Readonly<
  Record<QuotaExceededError["code"], CompletionErrorCode>
>;

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

/** Enforce subscription plan limits before billable actions */
export async function assertWithinQuota(
  userId: string,
  kind: "document" | "proposal" | "storage" | "tokens",
  extra?: { bytes?: number; tokens?: number }
): Promise<void> {
  const sub = await db.subscription.findUnique({
    where: { userId },
    include: { plan: true },
  });

  // No subscription → allow with soft limits for bootstrap SUPER_ADMIN, else block
  if (!sub) {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (user?.role === "SUPER_ADMIN" || user?.role === "ADMIN") return;
    throw new QuotaExceededError(
      "No active subscription — contact your administrator",
      "INACTIVE"
    );
  }

  if (sub.status !== "ACTIVE" && sub.status !== "TRIALING") {
    throw new QuotaExceededError("Subscription is not active", "INACTIVE");
  }

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

export async function bumpUsage(userId: string, kind: "document" | "proposal" | "storage" | "tokens", amount = 1) {
  try {
    if (kind === "document") {
      await db.subscription.updateMany({ where: { userId }, data: { documentsUsed: { increment: amount } } });
    } else if (kind === "proposal") {
      await db.subscription.updateMany({ where: { userId }, data: { proposalsUsed: { increment: amount } } });
    } else if (kind === "storage") {
      await db.subscription.updateMany({ where: { userId }, data: { storageUsedBytes: { increment: amount } } });
    } else if (kind === "tokens") {
      await db.subscription.updateMany({ where: { userId }, data: { tokensUsed: { increment: amount } } });
    }
  } catch {
    // ignore if no subscription
  }
}
