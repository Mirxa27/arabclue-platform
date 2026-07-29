import { db } from "@/lib/db";
import { withTenant, jsonOk } from "@/lib/api-controller";
import { computeOnboardingSteps } from "@/lib/onboarding";
import { onboardingNotificationId } from "@/lib/notification-ids";
import { isPrismaMissingTable } from "@/lib/prisma-missing-table";
import type { ApiNotification } from "@/lib/api-types";

export const dynamic = "force-dynamic";

function severityForTransactionalType(
  type: string
): ApiNotification["severity"] {
  switch (type) {
    case "SUBSCRIPTION_PAST_DUE":
    case "SUBSCRIPTION_FAILED":
      return "CRITICAL";
    case "REVIEW_REQUESTED":
      return "WARN";
    case "REVIEW_DECISION":
      return "INFO";
    default:
      return "INFO";
  }
}

function normalizeHref(href: string | null | undefined): string | undefined {
  if (!href) return undefined;
  if (href.startsWith("/app")) return href;
  if (href.startsWith("?view=")) return href;
  if (href.startsWith("/")) return href;
  return `?view=${href.replace(/^view=/, "")}`;
}

export async function GET() {
  return withTenant("session", async ({ workspace, userId }) => {
    const now = new Date();
    const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const [certs, pendingReviews, onboarding, dismissals] = await Promise.all([
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
      db.notificationDismissal.findMany({
        where: { userId },
        select: { notificationId: true },
      }),
    ]);

    const dismissed = new Set(dismissals.map((d) => d.notificationId));
    const items: ApiNotification[] = [];

    // Persisted transactional inbox (requirement 17.4 / 11.4). Soft-skip when
    // the platform-completion migration has not been applied yet so derived
    // cert/review/onboarding alerts remain available.
    try {
      const inbox = await db.inAppNotification.findMany({
        where: {
          workspaceId: workspace.id,
          userId,
          isRead: false,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      for (const row of inbox) {
        if (dismissed.has(row.id)) continue;
        const type = row.type as ApiNotification["type"];
        items.push({
          id: row.id,
          type:
            type === "REVIEW_REQUESTED" ||
            type === "REVIEW_DECISION" ||
            type === "SUBSCRIPTION_PAST_DUE" ||
            type === "SUBSCRIPTION_FAILED"
              ? type
              : "INFO",
          severity: severityForTransactionalType(row.type),
          title: row.titleEn,
          titleAr: row.titleAr,
          body: row.bodyEn,
          bodyAr: row.bodyAr,
          href: normalizeHref(row.href),
          createdAt: row.createdAt.toISOString(),
        });
      }
    } catch (err) {
      if (!isPrismaMissingTable(err)) throw err;
    }

    for (const c of certs) {
      if (!c.expiresAt) continue;
      const days = Math.ceil(
        (c.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      );
      const severity =
        days < 0 ? "CRITICAL" : days <= (c.alertDays ?? 30) ? "WARN" : "INFO";
      const id = `cert-${c.id}`;
      if (dismissed.has(id)) continue;
      items.push({
        id,
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
      const id = `review-${r.id}`;
      if (dismissed.has(id)) continue;
      items.push({
        id,
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
      const id = onboardingNotificationId(onboarding.missing);
      if (!dismissed.has(id)) {
        items.push({
          id,
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
    }

    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return jsonOk({ items, count: items.length });
  }, "notifications");
}
