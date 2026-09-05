import { NextRequest, NextResponse } from "next/server";
import { redactSensitiveText } from "@/lib/api-failure";
import { db } from "@/lib/db";
import { authorizeCron } from "@/lib/cron-auth";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { getPathForView } from "@/lib/dashboard-routes";
import {
  sendTransactionalNotification,
  type NotificationRecipient,
} from "@/lib/notification-service";
import type { Locale } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Wall-clock budget; whatever is left waits for tomorrow's run. */
const EXPIRY_BUDGET_MS = 45_000;

/** A trial is nudged when it first comes within 7, 3, and 1 day(s) of its end. */
export const TRIAL_ENDING_THRESHOLDS_DAYS = [7, 3, 1] as const;

/** The tier a trial end falls in today, or null outside the last seven days. */
export function trialEndingThreshold(daysLeft: number): 7 | 3 | 1 | null {
  if (daysLeft <= 0) return null;
  for (const threshold of [...TRIAL_ENDING_THRESHOLDS_DAYS].reverse()) {
    if (daysLeft <= threshold) return threshold;
  }
  return null;
}

/**
 * POST /api/cron/expiry-notifications
 * Email workspace OWNERs/ADMINs about certificates and subscriptions nearing
 * expiry; nudge trials to choose a plan at 7/3/1 days before the trial ends.
 * Deduped via ExpiryNotificationLog. Skips email when no transport is set.
 */
export async function POST(req: NextRequest) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const startedAt = Date.now();
  const overBudget = () => Date.now() - startedAt >= EXPIRY_BUDGET_MS;
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * DAY_MS);
  const emailReady = isEmailConfigured();

  let certScanned = 0;
  let certEmailed = 0;
  let certSkipped = 0;
  let subScanned = 0;
  let subEmailed = 0;
  let subSkipped = 0;
  let trialScanned = 0;
  let trialNotified = 0;
  let trialSkipped = 0;
  let budgetExhausted = false;
  const errors: string[] = [];

  // Candidate selection pages forward instead of re-reading a fixed window.
  //
  // The previous form took the first 100 rows by expiry and de-duplicated each
  // one afterwards against ExpiryNotificationLog. Once 100 certificates in the
  // window had been notified, every later run fetched the same 100, skipped
  // them all, and never reached the 101st — which was therefore never notified
  // at all. Paging with a keyset cursor and stopping on an emit budget keeps
  // the run bounded while still making progress.
  const CERT_EMIT_BUDGET = 100;
  const CERT_PAGE_SIZE = 200;
  const CERT_MAX_PAGES = 25;

  type CertRow = Awaited<ReturnType<typeof db.certificate.findMany>>[number];
  const certs: CertRow[] = [];
  let certCursor: { expiresAt: Date; id: string } | null = null;

  for (let page = 0; page < CERT_MAX_PAGES; page += 1) {
    const batch: CertRow[] = await db.certificate.findMany({
      where: {
        expiresAt: { not: null, lte: in30 },
        revokedAt: null,
        ...(certCursor
          ? {
              OR: [
                { expiresAt: { gt: certCursor.expiresAt } },
                {
                  expiresAt: certCursor.expiresAt,
                  id: { gt: certCursor.id },
                },
              ],
            }
          : {}),
      },
      take: CERT_PAGE_SIZE,
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    });
    if (batch.length === 0) break;

    const last = batch[batch.length - 1];
    certCursor = last.expiresAt
      ? { expiresAt: last.expiresAt, id: last.id }
      : null;

    // One log query per page rather than one per certificate.
    const resourceIds = batch
      .filter((c) => c.expiresAt)
      .map((c) => `${c.id}:${c.expiresAt!.toISOString().slice(0, 10)}`);
    const logged = await db.expiryNotificationLog.findMany({
      where: {
        kind: "CERT_EXPIRY",
        channel: "email",
        resourceId: { in: resourceIds },
      },
      select: { workspaceId: true, resourceId: true },
    });
    const loggedKeys = new Set(
      logged.map((l) => `${l.workspaceId}:${l.resourceId}`)
    );

    for (const cert of batch) {
      if (!cert.expiresAt) continue;
      const resourceId = `${cert.id}:${cert.expiresAt.toISOString().slice(0, 10)}`;
      if (loggedKeys.has(`${cert.workspaceId}:${resourceId}`)) {
        certScanned += 1;
        certSkipped += 1;
        continue;
      }
      certs.push(cert);
      if (certs.length >= CERT_EMIT_BUDGET) break;
    }

    if (certs.length >= CERT_EMIT_BUDGET) break;
    if (!certCursor || batch.length < CERT_PAGE_SIZE) break;
  }

  // One member query for every workspace in the batch, not one per certificate.
  const certManagersByWorkspace = await managersByWorkspace(
    [...new Set(certs.map((c) => c.workspaceId))]
  );

  for (const cert of certs) {
    if (!cert.expiresAt) continue;
    if (overBudget()) {
      budgetExhausted = true;
      break;
    }
    certScanned += 1;
    const resourceId = `${cert.id}:${cert.expiresAt.toISOString().slice(0, 10)}`;

    const recipients = (certManagersByWorkspace.get(cert.workspaceId) ?? []).map(
      (m) => m.email
    );

    if (recipients.length === 0) {
      certSkipped += 1;
      continue;
    }

    const days = Math.ceil((cert.expiresAt.getTime() - now.getTime()) / DAY_MS);
    const subject =
      days < 0
        ? `[ArabClue] Certificate expired: ${cert.name}`
        : `[ArabClue] Certificate expires in ${days}d: ${cert.name}`;
    const html = `<p>Hello,</p>
<p>Certificate <strong>${escapeHtml(cert.name)}</strong> (${escapeHtml(cert.certType)})
${days < 0 ? "has expired" : `expires in ${days} day(s)`}
on <strong>${cert.expiresAt.toISOString().slice(0, 10)}</strong>.</p>
<p>Update it under Account → Certificates so proposals stay qualification-ready.</p>
<p>— ArabClue</p>`;

    const result = await sendEmail({ to: recipients, subject, html });
    if (result.ok || result.skipped) {
      await db.expiryNotificationLog.create({
        data: {
          workspaceId: cert.workspaceId,
          kind: "CERT_EXPIRY",
          resourceId,
          channel: "email",
          metaJson: JSON.stringify({
            emailed: result.ok,
            skipped: "skipped" in result ? result.skipped : false,
            recipients: recipients.length,
            emailReady,
          }),
        },
      });
      if (result.ok) certEmailed += 1;
      else certSkipped += 1;
    } else {
      errors.push(`cert ${cert.id}: ${result.error}`);
    }
  }

  // Paid subscriptions nearing the end of their period, and trials nearing
  // their end. A trial's end is trialEndsAt when set, else currentPeriodEnd.
  const subs = budgetExhausted
    ? []
    : await db.subscription.findMany({
        where: {
          OR: [
            {
              status: { in: ["ACTIVE", "PAST_DUE"] },
              currentPeriodEnd: { lte: in30 },
            },
            {
              status: "TRIALING",
              OR: [
                { trialEndsAt: { lte: in30 } },
                { trialEndsAt: null, currentPeriodEnd: { lte: in30 } },
              ],
            },
          ],
        },
        include: {
          user: { select: { email: true, name: true, active: true } },
          plan: { select: { name: true } },
        },
        take: 100,
        orderBy: { currentPeriodEnd: "asc" },
      });

  // Batched: one owner-membership query, one log query, one manager query for
  // the whole batch instead of two or three round trips per subscription.
  const ownerMemberships = await db.workspaceMember.findMany({
    where: { userId: { in: subs.map((s) => s.userId) }, role: "OWNER" },
    select: { userId: true, workspaceId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const workspaceByUser = new Map<string, string>();
  for (const m of ownerMemberships) {
    if (!workspaceByUser.has(m.userId)) workspaceByUser.set(m.userId, m.workspaceId);
  }
  const subPlans = subs.map((sub) => {
    const workspaceId = workspaceByUser.get(sub.userId) ?? sub.userId;
    if (sub.status === "TRIALING") {
      const endsAt = sub.trialEndsAt ?? sub.currentPeriodEnd;
      const daysLeft = Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS);
      const threshold = trialEndingThreshold(daysLeft);
      return {
        sub,
        workspaceId,
        kind: "TRIAL_ENDING" as const,
        channel: "notification",
        endsAt,
        daysLeft,
        threshold,
        resourceId: `${sub.id}:${endsAt.toISOString().slice(0, 10)}:${threshold ?? "none"}d`,
      };
    }
    return {
      sub,
      workspaceId,
      kind: "SUBSCRIPTION_EXPIRY" as const,
      channel: "email",
      endsAt: sub.currentPeriodEnd,
      daysLeft: Math.ceil((sub.currentPeriodEnd.getTime() - now.getTime()) / DAY_MS),
      threshold: null,
      resourceId: `${sub.id}:${sub.currentPeriodEnd.toISOString().slice(0, 10)}`,
    };
  });
  const [subLogged, trialManagersByWorkspace] = await Promise.all([
    db.expiryNotificationLog.findMany({
      where: {
        kind: { in: ["SUBSCRIPTION_EXPIRY", "TRIAL_ENDING"] },
        resourceId: { in: subPlans.map((p) => p.resourceId) },
      },
      select: { workspaceId: true, kind: true, resourceId: true, channel: true },
    }),
    managersByWorkspace(
      subPlans.filter((p) => p.kind === "TRIAL_ENDING").map((p) => p.workspaceId)
    ),
  ]);
  const subLoggedKeys = new Set(
    subLogged.map((l) => `${l.workspaceId}:${l.kind}:${l.resourceId}:${l.channel}`)
  );

  for (const plan of subPlans) {
    if (overBudget()) {
      budgetExhausted = true;
      break;
    }
    const { sub, workspaceId, resourceId } = plan;

    if (plan.kind === "TRIAL_ENDING") {
      trialScanned += 1;
      // Outside the 7/3/1-day tiers, or already nudged for this tier.
      if (
        plan.threshold === null ||
        subLoggedKeys.has(`${workspaceId}:TRIAL_ENDING:${resourceId}:notification`)
      ) {
        trialSkipped += 1;
        continue;
      }
      const recipients = trialManagersByWorkspace.get(workspaceId) ?? [];
      if (recipients.length === 0) {
        trialSkipped += 1;
        continue;
      }
      try {
        // Bilingual, in-app plus email, deduped by eventId as well: a trial
        // is not an expired subscription, so it gets its own words and a
        // link straight to the plan picker.
        const result = await sendTransactionalNotification({
          eventId: `trial_ending_${resourceId}`,
          recipients,
          type: "TRIAL_ENDING",
          subjectKey: "notification_trial_ending_subject",
          bodyKey: "notification_trial_ending_body",
          bodyParams: {
            days: String(plan.daysLeft),
            endsOn: plan.endsAt.toISOString().slice(0, 10),
          },
          href: getPathForView("billing"),
          workspaceId,
        });
        await db.expiryNotificationLog.create({
          data: {
            workspaceId,
            kind: "TRIAL_ENDING",
            resourceId,
            channel: "notification",
            metaJson: JSON.stringify({
              threshold: plan.threshold,
              daysLeft: plan.daysLeft,
              recipients: recipients.length,
              deliveries: result.deliveries.map((d) => `${d.channel}:${d.status}`),
              emailReady,
            }),
          },
        });
        trialNotified += 1;
      } catch (err) {
        errors.push(
          `trial ${sub.id}: ${redactSensitiveText(
            err instanceof Error ? err.message : String(err)
          )}`
        );
      }
      continue;
    }

    subScanned += 1;
    if (subLoggedKeys.has(`${workspaceId}:SUBSCRIPTION_EXPIRY:${resourceId}:email`)) {
      subSkipped += 1;
      continue;
    }

    if (!sub.user.active || !sub.user.email) {
      subSkipped += 1;
      continue;
    }

    const days = plan.daysLeft;
    const planName = sub.plan?.name ?? "plan";
    const subject =
      days < 0
        ? `[ArabClue] Subscription expired: ${planName}`
        : `[ArabClue] Subscription renews/expires in ${days}d: ${planName}`;
    const html = `<p>Hello ${escapeHtml(sub.user.name)},</p>
<p>Your <strong>${escapeHtml(planName)}</strong> subscription
${days < 0 ? "ended" : `ends`} on
<strong>${sub.currentPeriodEnd.toISOString().slice(0, 10)}</strong>
(status: ${escapeHtml(sub.status)}).</p>
<p>Review billing in the ArabClue app to avoid interruption.</p>
<p>— ArabClue</p>`;

    const result = await sendEmail({
      to: sub.user.email,
      subject,
      html,
    });
    if (result.ok || result.skipped) {
      await db.expiryNotificationLog.create({
        data: {
          workspaceId,
          kind: "SUBSCRIPTION_EXPIRY",
          resourceId,
          channel: "email",
          metaJson: JSON.stringify({
            emailed: result.ok,
            skipped: "skipped" in result ? result.skipped : false,
            emailReady,
          }),
        },
      });
      if (result.ok) subEmailed += 1;
      else subSkipped += 1;
    } else {
      errors.push(`sub ${sub.id}: ${result.error}`);
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    emailConfigured: emailReady,
    certificates: {
      scanned: certScanned,
      emailed: certEmailed,
      skipped: certSkipped,
    },
    subscriptions: {
      scanned: subScanned,
      emailed: subEmailed,
      skipped: subSkipped,
    },
    trials: {
      scanned: trialScanned,
      notified: trialNotified,
      skipped: trialSkipped,
    },
    budgetExhausted,
    errors,
    time: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}

/** Active OWNER/ADMIN members of each workspace, fetched in one query. */
async function managersByWorkspace(
  workspaceIds: readonly string[]
): Promise<Map<string, NotificationRecipient[]>> {
  const byWorkspace = new Map<string, NotificationRecipient[]>();
  const distinct = [...new Set(workspaceIds)];
  if (distinct.length === 0) return byWorkspace;
  const members = await db.workspaceMember.findMany({
    where: { workspaceId: { in: distinct }, role: { in: ["OWNER", "ADMIN"] } },
    include: {
      user: { select: { id: true, email: true, locale: true, active: true } },
    },
  });
  for (const member of members) {
    if (!member.user.active || !member.user.email) continue;
    const list = byWorkspace.get(member.workspaceId) ?? [];
    list.push({
      userId: member.user.id,
      email: member.user.email,
      locale: (member.user.locale as Locale) || "ar",
    });
    byWorkspace.set(member.workspaceId, list);
  }
  return byWorkspace;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
