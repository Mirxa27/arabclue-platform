import { db } from "@/lib/db";
import { withTenant, jsonOk } from "@/lib/api-controller";
import { readStoredOnboardingStatus } from "@/lib/onboarding";
import {
  normalizeNotificationHref,
  onboardingNotificationId,
} from "@/lib/notification-ids";
import { isPrismaMissingTable } from "@/lib/prisma-missing-table";
import { tr } from "@/lib/i18n";
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
    case "TRIAL_ENDING":
    case "DEADLINE_REMINDER":
      return "WARN";
    case "REVIEW_DECISION":
      return "INFO";
    default:
      return "INFO";
  }
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
      // Read, not recomputed: this endpoint is polled every minute and the
      // recompute is a dozen counts plus a write. GET /api/onboarding recomputes.
      readStoredOnboardingStatus(workspace.id),
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
          href: normalizeNotificationHref(row.href),
          createdAt: row.createdAt.toISOString(),
        });
      }
    } catch (err) {
      if (!isPrismaMissingTable(err)) throw err;
    }

    // Derived alerts below are composed from the dictionary in both locales so
    // the bell never shows a sentence that exists in one language only.
    for (const c of certs) {
      if (!c.expiresAt) continue;
      const days = Math.ceil(
        (c.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      );
      const severity =
        days < 0 ? "CRITICAL" : days <= (c.alertDays ?? 30) ? "WARN" : "INFO";
      const id = `cert-${c.id}`;
      if (dismissed.has(id)) continue;
      const titleKey =
        days < 0 ? "notification_cert_expired_title" : "notification_cert_expiring_title";
      const titleParams = { name: c.name, days: String(days) };
      const body = `${c.certType}${c.number ? ` #${c.number}` : ""}`;
      items.push({
        id,
        type: "CERT_EXPIRY",
        severity,
        title: tr(titleKey, "en", titleParams),
        titleAr: tr(titleKey, "ar", titleParams),
        body,
        bodyAr: body,
        href: "?view=account",
        createdAt: c.expiresAt.toISOString(),
      });
    }

    for (const r of pendingReviews) {
      const id = `review-${r.id}`;
      if (dismissed.has(id)) continue;
      const titleParams = { proposalTitle: r.proposal.title };
      const bodyParams = { step: String(r.stepIndex + 1), role: r.stepRole };
      items.push({
        id,
        type: "PENDING_REVIEW",
        severity: "WARN",
        title: tr("notification_review_pending_title", "en", titleParams),
        titleAr: tr("notification_review_pending_title", "ar", titleParams),
        body: tr("notification_review_pending_body", "en", bodyParams),
        bodyAr: tr("notification_review_pending_body", "ar", bodyParams),
        href: "?view=reviews",
        createdAt: r.createdAt.toISOString(),
      });
    }

    if (!onboarding.readyForProposals) {
      const id = onboardingNotificationId(onboarding.missing);
      if (!dismissed.has(id)) {
        const bodyParams = { missing: onboarding.missing.join(", ") };
        items.push({
          id,
          type: "ONBOARDING",
          severity: "WARN",
          title: tr("notification_onboarding_title", "en"),
          titleAr: tr("notification_onboarding_title", "ar"),
          body: tr("notification_onboarding_body", "en", bodyParams),
          bodyAr: tr("notification_onboarding_body", "ar", bodyParams),
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
