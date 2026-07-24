import { db } from "@/lib/db";
import { withTenant, jsonOk } from "@/lib/api-controller";
import { computeOnboardingSteps } from "@/lib/onboarding";
import { onboardingNotificationId } from "@/lib/notification-ids";
import type { ApiNotification } from "@/lib/api-types";

export const dynamic = "force-dynamic";

export async function GET() {
  return withTenant("session", async ({ workspace, userId }) => {
    const now = new Date();
    const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const [certs, pendingReviews, onboarding] = await Promise.all([
      db.certificate.findMany({
        where: {
          workspaceId: workspace.id,
          expiresAt: { not: null, lte: in90 },
        },
        orderBy: { expiresAt: "asc" },
      }),
      db.proposalReview.findMany({
        where: {
          reviewerId: userId,
          status: "PENDING",
          proposal: { workspaceId: workspace.id },
        },
        include: { proposal: { select: { id: true, title: true } } },
        take: 20,
      }),
      computeOnboardingSteps(workspace.id),
    ]);

    const items: ApiNotification[] = [];

    for (const c of certs) {
      if (!c.expiresAt) continue;
      const days = Math.ceil(
        (c.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      );
      const severity =
        days < 0 ? "CRITICAL" : days <= (c.alertDays ?? 30) ? "WARN" : "INFO";
      items.push({
        id: `cert-${c.id}`,
        type: "CERT_EXPIRY",
        severity,
        title:
          days < 0
            ? `Certificate expired: ${c.name}`
            : `Certificate expires in ${days}d: ${c.name}`,
        titleAr:
          days < 0
            ? `شهادة منتهية: ${c.name}`
            : `شهادة تنتهي خلال ${days} يوم: ${c.name}`,
        body: `${c.certType}${c.number ? ` #${c.number}` : ""}`,
        bodyAr: `${c.certType}${c.number ? ` #${c.number}` : ""}`,
        href: "?view=account",
        createdAt: c.expiresAt.toISOString(),
      });
    }

    for (const r of pendingReviews) {
      items.push({
        id: `review-${r.id}`,
        type: "PENDING_REVIEW",
        severity: "WARN",
        title: `Review pending: ${r.proposal.title}`,
        titleAr: `مراجعة بانتظارك: ${r.proposal.title}`,
        body: `Step ${r.stepIndex + 1} (${r.stepRole})`,
        bodyAr: `الخطوة ${r.stepIndex + 1} (${r.stepRole})`,
        href: "?view=reviews",
        createdAt: r.createdAt.toISOString(),
      });
    }

    if (!onboarding.readyForProposals) {
      items.push({
        id: onboardingNotificationId(onboarding.missing),
        type: "ONBOARDING",
        severity: "WARN",
        title: "Complete account onboarding",
        titleAr: "أكمل إعداد الحساب",
        body: `Missing: ${onboarding.missing.join(", ")}`,
        bodyAr: `ناقص: ${onboarding.missing.join(", ")}`,
        href: "?view=account",
        createdAt: now.toISOString(),
      });
    }

    return jsonOk({ items, count: items.length });
  }, "notifications");
}
