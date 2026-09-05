import { NextRequest, NextResponse } from "next/server";
import { redactSensitiveText } from "@/lib/api-failure";
import { authorizeCron } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { getPathForView } from "@/lib/dashboard-routes";
import {
  sendTransactionalNotification,
  type NotificationRecipient,
} from "@/lib/notification-service";
import type { Locale } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Reminders go out when a deadline first comes within 7, 3, and 1 day(s). */
export const DEADLINE_REMINDER_THRESHOLDS_DAYS = [7, 3, 1] as const;

/** Wall-clock budget; the rest of the batch waits for tomorrow's run. */
const DEADLINE_REMINDER_BUDGET_MS = 45_000;

const PROJECT_BATCH = 200;

/** Whole days until the deadline, rounded up so "1 day" means tomorrow. */
export function daysUntil(deadline: Date, now: Date): number {
  return Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS);
}

/**
 * The reminder tier a deadline falls in today, or null when it is more than
 * seven days away or already past. Each tier is sent once per deadline, so a
 * project gets at most three reminders however many daily runs see it.
 */
export function reminderThreshold(daysLeft: number): 7 | 3 | 1 | null {
  if (daysLeft <= 0) return null;
  for (const threshold of [...DEADLINE_REMINDER_THRESHOLDS_DAYS].reverse()) {
    if (daysLeft <= threshold) return threshold;
  }
  return null;
}

/** Dedup key: one reminder per project, deadline day, and tier. */
export function reminderResourceId(
  projectId: string,
  deadline: Date,
  threshold: number
): string {
  return `${projectId}:${deadline.toISOString().slice(0, 10)}:${threshold}d`;
}

/** A draft nobody touched for this long gets one nudge per idle stretch. */
export const IDLE_DRAFT_DAYS = 7;
const IDLE_DRAFT_BATCH = 200;
const UNFINISHED_PROPOSAL_STATUSES = ["DRAFT", "GENERATED"] as const;

/** Whole idle days, floored: 7 means "a week without an edit". */
export function idleDays(updatedAt: Date, now: Date): number {
  return Math.floor((now.getTime() - updatedAt.getTime()) / DAY_MS);
}

/**
 * Dedup key: one nudge per proposal per idle stretch. An edit moves updatedAt
 * and so opens a new stretch; a draft left alone forever is nudged once.
 */
export function idleDraftResourceId(proposalId: string, updatedAt: Date): string {
  return `${proposalId}:${updatedAt.toISOString().slice(0, 10)}`;
}

/**
 * Second phase of the daily run, sharing its budget: drafts nobody edited for
 * IDLE_DRAFT_DAYS get one nudge to the person who created them. Folded in
 * here rather than a sixth cron entry.
 */
async function nudgeIdleDrafts(input: {
  now: Date;
  startedAt: number;
  budgetMs: number;
}): Promise<{
  scanned: number;
  notified: number;
  skipped: number;
  budgetExhausted: boolean;
  errors: string[];
}> {
  const out = { scanned: 0, notified: 0, skipped: 0, budgetExhausted: false, errors: [] as string[] };
  const idleBefore = new Date(input.now.getTime() - IDLE_DRAFT_DAYS * DAY_MS);

  const drafts = await db.generatedProposal.findMany({
    where: {
      status: { in: [...UNFINISHED_PROPOSAL_STATUSES] },
      updatedAt: { lt: idleBefore },
      project: { status: { notIn: ["SUBMITTED", "ARCHIVED"] } },
    },
    select: {
      id: true,
      workspaceId: true,
      projectId: true,
      title: true,
      titleAr: true,
      updatedAt: true,
      createdById: true,
    },
    orderBy: { updatedAt: "asc" },
    take: IDLE_DRAFT_BATCH,
  });
  out.scanned = drafts.length;
  if (drafts.length === 0) return out;

  const [logged, creators] = await Promise.all([
    db.expiryNotificationLog.findMany({
      where: {
        kind: "DRAFT_IDLE",
        channel: "notification",
        resourceId: { in: drafts.map((d) => idleDraftResourceId(d.id, d.updatedAt)) },
      },
      select: { workspaceId: true, resourceId: true },
    }),
    db.user.findMany({
      where: { id: { in: [...new Set(drafts.map((d) => d.createdById))] } },
      select: { id: true, email: true, locale: true, active: true },
    }),
  ]);
  const loggedKeys = new Set(logged.map((l) => `${l.workspaceId}:${l.resourceId}`));
  const creatorById = new Map(creators.map((u) => [u.id, u]));

  for (const draft of drafts) {
    if (Date.now() - input.startedAt >= input.budgetMs) {
      out.budgetExhausted = true;
      break;
    }
    const resourceId = idleDraftResourceId(draft.id, draft.updatedAt);
    const creator = creatorById.get(draft.createdById);
    if (loggedKeys.has(`${draft.workspaceId}:${resourceId}`) || !creator?.active) {
      out.skipped += 1;
      continue;
    }
    try {
      const days = idleDays(draft.updatedAt, input.now);
      const result = await sendTransactionalNotification({
        eventId: `draft_idle_${resourceId}`,
        recipients: [
          {
            userId: creator.id,
            email: creator.email,
            locale: (creator.locale as Locale) || "ar",
          },
        ],
        type: "DRAFT_IDLE",
        subjectKey: "notification_draft_idle_subject",
        bodyKey: "notification_draft_idle_body",
        bodyParams: {
          projectTitle: draft.titleAr || draft.title,
          days: String(days),
        },
        href: getPathForView("proposals", draft.projectId),
        workspaceId: draft.workspaceId,
      });
      await db.expiryNotificationLog.create({
        data: {
          workspaceId: draft.workspaceId,
          kind: "DRAFT_IDLE",
          resourceId,
          channel: "notification",
          metaJson: JSON.stringify({
            idleDays: days,
            deliveries: result.deliveries.map((d) => `${d.channel}:${d.status}`),
          }),
        },
      });
      out.notified += 1;
    } catch (err) {
      out.errors.push(
        `proposal ${draft.id}: ${redactSensitiveText(
          err instanceof Error ? err.message : String(err)
        )}`
      );
    }
  }
  return out;
}

/**
 * POST /api/cron/deadline-reminders
 *
 * Daily. For every open tender project whose submissionDeadline is within the
 * next seven days, notify the workspace's active members (in-app, plus email
 * when configured) at the 7/3/1-day marks. Deduped through ExpiryNotificationLog
 * exactly like certificate and subscription expiry. Protected by CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const startedAt = Date.now();
  const now = new Date();
  const horizon = new Date(now.getTime() + 7 * DAY_MS);

  let scanned = 0;
  let notified = 0;
  let skipped = 0;
  let budgetExhausted = false;
  const errors: string[] = [];

  try {
    const projects = await db.tenderProject.findMany({
      where: {
        submissionDeadline: { gt: now, lte: horizon },
        status: { notIn: ["SUBMITTED", "ARCHIVED"] },
      },
      select: {
        id: true,
        workspaceId: true,
        title: true,
        titleAr: true,
        submissionDeadline: true,
      },
      orderBy: { submissionDeadline: "asc" },
      take: PROJECT_BATCH,
    });

    const candidates = projects.flatMap((project) => {
      if (!project.submissionDeadline) return [];
      const daysLeft = daysUntil(project.submissionDeadline, now);
      const threshold = reminderThreshold(daysLeft);
      if (threshold === null) return [];
      return [
        {
          project,
          deadline: project.submissionDeadline,
          daysLeft,
          threshold,
          resourceId: reminderResourceId(
            project.id,
            project.submissionDeadline,
            threshold
          ),
        },
      ];
    });
    scanned = candidates.length;

    // One log query and one member query for the whole batch — not one each.
    const [logged, members] = await Promise.all([
      db.expiryNotificationLog.findMany({
        where: {
          kind: "DEADLINE_REMINDER",
          channel: "notification",
          resourceId: { in: candidates.map((c) => c.resourceId) },
        },
        select: { workspaceId: true, resourceId: true },
      }),
      db.workspaceMember.findMany({
        where: {
          workspaceId: { in: [...new Set(candidates.map((c) => c.project.workspaceId))] },
        },
        include: {
          user: { select: { id: true, email: true, locale: true, active: true } },
        },
      }),
    ]);
    const loggedKeys = new Set(logged.map((l) => `${l.workspaceId}:${l.resourceId}`));
    const recipientsByWorkspace = new Map<string, NotificationRecipient[]>();
    for (const member of members) {
      if (!member.user.active) continue;
      const list = recipientsByWorkspace.get(member.workspaceId) ?? [];
      list.push({
        userId: member.user.id,
        email: member.user.email,
        locale: (member.user.locale as Locale) || "ar",
      });
      recipientsByWorkspace.set(member.workspaceId, list);
    }

    for (const candidate of candidates) {
      if (Date.now() - startedAt >= DEADLINE_REMINDER_BUDGET_MS) {
        budgetExhausted = true;
        break;
      }
      const { project } = candidate;
      if (loggedKeys.has(`${project.workspaceId}:${candidate.resourceId}`)) {
        skipped += 1;
        continue;
      }
      const recipients = recipientsByWorkspace.get(project.workspaceId) ?? [];
      if (recipients.length === 0) {
        skipped += 1;
        continue;
      }

      try {
        const result = await sendTransactionalNotification({
          eventId: `deadline_reminder_${candidate.resourceId}`,
          recipients,
          type: "DEADLINE_REMINDER",
          subjectKey: "notification_deadline_reminder_subject",
          bodyKey: "notification_deadline_reminder_body",
          bodyParams: {
            projectTitle: project.titleAr || project.title,
            days: String(candidate.daysLeft),
            deadline: candidate.deadline.toISOString().slice(0, 10),
          },
          href: getPathForView("proposals", project.id),
          workspaceId: project.workspaceId,
        });
        await db.expiryNotificationLog.create({
          data: {
            workspaceId: project.workspaceId,
            kind: "DEADLINE_REMINDER",
            resourceId: candidate.resourceId,
            channel: "notification",
            metaJson: JSON.stringify({
              threshold: candidate.threshold,
              daysLeft: candidate.daysLeft,
              recipients: recipients.length,
              deliveries: result.deliveries.map((d) => `${d.channel}:${d.status}`),
            }),
          },
        });
        notified += 1;
      } catch (err) {
        errors.push(
          `project ${project.id}: ${redactSensitiveText(
            err instanceof Error ? err.message : String(err)
          )}`
        );
      }
    }
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: redactSensitiveText(err instanceof Error ? err.message : String(err)),
        time: new Date().toISOString(),
      },
      { status: 500 }
    );
  }

  // Idle drafts share whatever budget the deadlines left.
  let idleDrafts: Awaited<ReturnType<typeof nudgeIdleDrafts>> | null = null;
  if (!budgetExhausted) {
    try {
      idleDrafts = await nudgeIdleDrafts({
        now,
        startedAt,
        budgetMs: DEADLINE_REMINDER_BUDGET_MS,
      });
      errors.push(...idleDrafts.errors);
      budgetExhausted = idleDrafts.budgetExhausted;
    } catch (err) {
      errors.push(
        `idle drafts: ${redactSensitiveText(err instanceof Error ? err.message : String(err))}`
      );
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    scanned,
    notified,
    skipped,
    budgetExhausted,
    idleDrafts: idleDrafts
      ? { scanned: idleDrafts.scanned, notified: idleDrafts.notified, skipped: idleDrafts.skipped }
      : null,
    errors,
    time: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
