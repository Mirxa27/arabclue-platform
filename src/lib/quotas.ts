import { db } from "./db";

export class QuotaExceededError extends Error {
  constructor(
    message: string,
    public code: "DOCUMENTS" | "PROPOSALS" | "TOKENS" | "INACTIVE"
  ) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

/** Enforce subscription plan limits before billable actions */
export async function assertWithinQuota(
  userId: string,
  kind: "document" | "proposal"
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
}
