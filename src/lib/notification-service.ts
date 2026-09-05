/**
 * Transactional Notification Service (Req 17)
 *
 * Delivers at-most-once notifications via InAppNotification + optional email.
 * Uses NotificationDelivery for idempotent dedup by eventId + recipientId + channel.
 *
 * Key behaviors:
 * - Check NotificationDelivery before creating records (skip if already delivered)
 * - Create InAppNotification for each recipient
 * - Send email via sendEmail when configured
 * - Record delivery status: SENT, FAILED, SKIPPED
 * - Use i18n tr() for locale-specific subject/body
 * - Never include monetary amounts, bid values, or document content in body
 */

import type { NotificationDelivery, PrismaClient } from "@prisma/client";
import { db } from "./db";
import { isEmailConfigured, sendEmail } from "./email";
import { tr } from "./i18n";
import { getPathForView } from "./dashboard-routes";
import { addUtcMilliseconds } from "./time";
import type { Locale } from "./types";

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotificationType =
  | "REVIEW_REQUESTED"
  | "REVIEW_DECISION"
  | "SUBSCRIPTION_PAST_DUE"
  | "SUBSCRIPTION_FAILED"
  | "TRIAL_ENDING"
  | "DEADLINE_REMINDER"
  | "DRAFT_IDLE"
  | "AGENT_RUN_COMPLETED"
  | "AGENT_RUN_FAILED";

export type NotificationRecipient = {
  userId: string;
  email: string;
  locale: Locale;
};

export type SendTransactionalNotificationInput = {
  /** Unique event identifier for dedup (e.g., `proposal_submit_${proposalId}`) */
  eventId: string;
  /** Recipients with their locale preference */
  recipients: NotificationRecipient[];
  /** Notification type for template selection */
  type: NotificationType;
  /** i18n key for subject (e.g., "notification_review_requested_subject") */
  subjectKey: string;
  /** i18n key for body template (e.g., "notification_review_requested_body") */
  bodyKey: string;
  /** Optional interpolation values for the body (exclude monetary amounts) */
  bodyParams?: Record<string, string>;
  /** Canonical app path (e.g., getPathForView("reviews")) */
  href?: string;
  /** Workspace ID for InAppNotification */
  workspaceId: string;
};

export type DeliveryResult = {
  recipientId: string;
  channel: "in_app" | "email";
  /**
   * PENDING means the row sits in the outbox for the notification-dispatch
   * cron: the inline provider attempt did not succeed (or was disabled).
   */
  status: "SENT" | "FAILED" | "SKIPPED" | "PENDING";
  reason?: string;
  notificationId?: string;
  emailId?: string;
};

export type SendTransactionalNotificationOptions = Readonly<{
  /**
   * Attempt one immediate provider send right after the outbox row commits
   * (default true). The cron only sweeps once a day, so without this a queued
   * email waits up to 24 hours. Disabled by tests that exercise the cron path.
   */
  inlineEmailDispatch?: boolean;
  /** Provider send; the production sender is used when omitted. */
  send?: typeof sendEmail;
  /** Outbox persistence; the shared Prisma client is used when omitted. */
  client?: NotificationOutboxClient;
  /** Commit instant for deadlines and claims; the system clock when omitted. */
  now?: Date;
}>;

export type SendTransactionalNotificationResult = {
  eventId: string;
  totalRecipients: number;
  deliveries: DeliveryResult[];
};

// ─── Template Composition ────────────────────────────────────────────────────

/**
 * Interpolate simple {{key}} placeholders in a translated string.
 * Excludes monetary amounts, bid values, and document content by design.
 */
export function interpolate(
  template: string,
  params: Record<string, string>
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => params[key] ?? `{{${key}}}`
  );
}

/**
 * Compose notification content for a given locale.
 */
export function composeContent(
  subjectKey: string,
  bodyKey: string,
  locale: Locale,
  params?: Record<string, string>
): { subject: string; bodyEn: string; bodyAr: string; titleEn: string; titleAr: string } {
  const subject = interpolate(tr(subjectKey, locale), params ?? {});
  const bodyEn = interpolate(tr(bodyKey, "en"), params ?? {});
  const bodyAr = interpolate(tr(bodyKey, "ar"), params ?? {});
  // Subjects may name the project; the in-app title is the same sentence.
  const titleEn = interpolate(tr(subjectKey, "en"), params ?? {});
  const titleAr = interpolate(tr(subjectKey, "ar"), params ?? {});

  return { subject, bodyEn, bodyAr, titleEn, titleAr };
}

export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Format body for HTML email (simple paragraph wrapper).
 */
export function formatEmailHtml(body: string, href?: string): string {
  const link = href
    ? `<p style="margin-top:16px;"><a href="${escapeHtml(href)}" style="color:#0EA5E9;text-decoration:underline;">عرض في التطبيق / View in App</a></p>`
    : "";
  return `<!DOCTYPE html>
<html dir="auto" lang="ar">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:'IBM Plex Sans Arabic',Arial,sans-serif;font-size:14px;line-height:1.6;color:#1E3A8A;padding:20px;">
<p>${escapeHtml(body)}</p>
${link}
</body>
</html>`;
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Send a transactional notification to multiple recipients.
 * Creates InAppNotification + optional email delivery with at-most-once semantics.
 */
export async function sendTransactionalNotification(
  input: SendTransactionalNotificationInput,
  options: SendTransactionalNotificationOptions = {}
): Promise<SendTransactionalNotificationResult> {
  const deliveries: DeliveryResult[] = [];
  const emailConfigured = isEmailConfigured();
  const outboxClient: NotificationOutboxClient = options.client ?? db;

  for (const recipient of input.recipients) {
    // Check for existing in_app delivery
    const existingInApp = await db.notificationDelivery.findUnique({
      where: {
        eventId_recipientId_channel: {
          eventId: input.eventId,
          recipientId: recipient.userId,
          channel: "in_app",
        },
      },
    });

    if (existingInApp) {
      deliveries.push({
        recipientId: recipient.userId,
        channel: "in_app",
        status: "SKIPPED",
        reason: "ALREADY_DELIVERED",
      });
    } else {
      // Compose content for this recipient's locale
      const content = composeContent(
        input.subjectKey,
        input.bodyKey,
        recipient.locale,
        input.bodyParams
      );

      try {
        // Create InAppNotification
        const notification = await db.inAppNotification.create({
          data: {
            workspaceId: input.workspaceId,
            userId: recipient.userId,
            type: input.type,
            titleEn: content.titleEn,
            titleAr: content.titleAr,
            bodyEn: content.bodyEn,
            bodyAr: content.bodyAr,
            href: input.href ?? null,
            eventId: input.eventId,
            isRead: false,
          },
        });

        // Record successful in_app delivery
        await db.notificationDelivery.create({
          data: {
            eventId: input.eventId,
            recipientId: recipient.userId,
            channel: "in_app",
            status: "SENT",
          },
        });

        deliveries.push({
          recipientId: recipient.userId,
          channel: "in_app",
          status: "SENT",
          notificationId: notification.id,
        });
      } catch (err) {
        // Record failed in_app delivery
        await db.notificationDelivery.upsert({
          where: {
            eventId_recipientId_channel: {
              eventId: input.eventId,
              recipientId: recipient.userId,
              channel: "in_app",
            },
          },
          create: {
            eventId: input.eventId,
            recipientId: recipient.userId,
            channel: "in_app",
            status: "FAILED",
            errorMessage: err instanceof Error ? err.message : "unknown",
          },
          update: {
            status: "FAILED",
            errorMessage: err instanceof Error ? err.message : "unknown",
          },
        });

        deliveries.push({
          recipientId: recipient.userId,
          channel: "in_app",
          status: "FAILED",
          reason: err instanceof Error ? err.message : "unknown",
        });
      }
    }

    // Check for existing email delivery
    const existingEmail = await db.notificationDelivery.findUnique({
      where: {
        eventId_recipientId_channel: {
          eventId: input.eventId,
          recipientId: recipient.userId,
          channel: "email",
        },
      },
    });

    if (existingEmail) {
      deliveries.push({
        recipientId: recipient.userId,
        channel: "email",
        status: "SKIPPED",
        reason: "ALREADY_DELIVERED",
      });
    } else if (!emailConfigured) {
      // Email not configured — record SKIPPED status immediately; no dispatch needed.
      await db.notificationDelivery.create({
        data: {
          eventId: input.eventId,
          recipientId: recipient.userId,
          channel: "email",
          status: "SKIPPED",
          workspaceId: input.workspaceId,
          recipientEmail: recipient.email,
          recipientLocale: recipient.locale,
          errorMessage: "EMAIL_UNCONFIGURED",
        },
      });

      deliveries.push({
        recipientId: recipient.userId,
        channel: "email",
        status: "SKIPPED",
        reason: "EMAIL_UNCONFIGURED",
      });
    } else {
      // Commit a PENDING outbox row first, so a crash mid-send loses nothing;
      // then try the provider once, inline. Whatever the inline attempt leaves
      // PENDING is swept by /api/cron/notification-dispatch (daily) until the
      // 26-hour deadline or the third attempt.
      const now = options.now ?? new Date();
      const row = await outboxClient.notificationDelivery.create({
        data: buildOutboxRowData(input, recipient, now),
      });

      if (options.inlineEmailDispatch === false) {
        deliveries.push({
          recipientId: recipient.userId,
          channel: "email",
          status: "PENDING",
          reason: "QUEUED_FOR_DISPATCH",
        });
      } else {
        const inline = await attemptInlineEmailDispatch(row, {
          client: outboxClient,
          send: options.send ?? sendEmail,
          now,
          workerId: `inline-${row.id}`,
        });
        deliveries.push(inlineDeliveryResult(recipient.userId, inline));
      }
    }
  }

  return {
    eventId: input.eventId,
    totalRecipients: input.recipients.length,
    deliveries,
  };
}

// ─── Recipient Resolution Helpers ────────────────────────────────────────────

export type GetNotificationRecipientsContext = {
  workspaceId: string;
  proposalId?: string;
  projectId?: string;
  userId?: string;
};

/**
 * Resolve notification recipients based on notification type and context.
 */
export async function getNotificationRecipients(
  type: NotificationType,
  context: GetNotificationRecipientsContext
): Promise<NotificationRecipient[]> {
  switch (type) {
    case "REVIEW_REQUESTED":
      return getReviewRequestedRecipients(context);
    case "REVIEW_DECISION":
      return getReviewDecisionRecipients(context);
    case "SUBSCRIPTION_PAST_DUE":
    case "SUBSCRIPTION_FAILED":
    case "TRIAL_ENDING":
      return getSubscriptionAlertRecipients(context);
    case "DEADLINE_REMINDER":
      return getWorkspaceMemberRecipients(context);
    case "AGENT_RUN_COMPLETED":
    case "AGENT_RUN_FAILED":
      return getRunInitiatorRecipient(context);
    default:
      return [];
  }
}

/** Every active member of the workspace — a submission deadline is everyone's. */
async function getWorkspaceMemberRecipients(
  context: GetNotificationRecipientsContext
): Promise<NotificationRecipient[]> {
  const members = await db.workspaceMember.findMany({
    where: { workspaceId: context.workspaceId },
    include: {
      user: { select: { id: true, email: true, locale: true, active: true } },
    },
  });
  return members
    .filter((m) => m.user.active)
    .map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      locale: (m.user.locale as Locale) || "ar",
    }));
}

/** The member who started the run — the one who may have walked away from it. */
async function getRunInitiatorRecipient(
  context: GetNotificationRecipientsContext
): Promise<NotificationRecipient[]> {
  if (!context.userId) return [];
  const user = await db.user.findUnique({
    where: { id: context.userId },
    select: { id: true, email: true, locale: true },
  });
  if (!user) return [];
  return [{ userId: user.id, email: user.email, locale: (user.locale as Locale) || "ar" }];
}

type AgentRunNotificationInput = {
  workspaceId: string;
  userId: string;
  runId: string;
  projectId: string;
  projectTitle: string;
};

/** The proposal and contract drafts are ready for the initiator's review. */
export async function notifyAgentRunCompleted(
  opts: AgentRunNotificationInput
): Promise<SendTransactionalNotificationResult> {
  const eventId = `agent_run_completed_${opts.runId}`;
  const recipients = await getNotificationRecipients("AGENT_RUN_COMPLETED", {
    workspaceId: opts.workspaceId,
    userId: opts.userId,
  });
  if (recipients.length === 0) return { eventId, totalRecipients: 0, deliveries: [] };
  return sendTransactionalNotification({
    eventId,
    recipients,
    type: "AGENT_RUN_COMPLETED",
    subjectKey: "notification_agent_run_completed_subject",
    bodyKey: "notification_agent_run_completed_body",
    bodyParams: { projectTitle: opts.projectTitle },
    href: getPathForView("proposals", opts.projectId),
    workspaceId: opts.workspaceId,
  });
}

/** The run ended without a proposal; the agents page carries the classified reason. */
export async function notifyAgentRunFailed(
  opts: AgentRunNotificationInput
): Promise<SendTransactionalNotificationResult> {
  const eventId = `agent_run_failed_${opts.runId}`;
  const recipients = await getNotificationRecipients("AGENT_RUN_FAILED", {
    workspaceId: opts.workspaceId,
    userId: opts.userId,
  });
  if (recipients.length === 0) return { eventId, totalRecipients: 0, deliveries: [] };
  return sendTransactionalNotification({
    eventId,
    recipients,
    type: "AGENT_RUN_FAILED",
    subjectKey: "notification_agent_run_failed_subject",
    bodyKey: "notification_agent_run_failed_body",
    bodyParams: { projectTitle: opts.projectTitle },
    href: getPathForView("agents", opts.projectId),
    workspaceId: opts.workspaceId,
  });
}

/**
 * Get reviewers from ApprovalPolicy for a workspace.
 */
async function getReviewRequestedRecipients(
  context: GetNotificationRecipientsContext
): Promise<NotificationRecipient[]> {
  const policy = await db.approvalPolicy.findUnique({
    where: { workspaceId: context.workspaceId },
    include: {
      steps: {
        include: {
          reviewer: {
            select: { id: true, email: true, locale: true },
          },
        },
      },
    },
  });

  if (!policy) return [];

  // Dedupe reviewers (same user might be on multiple steps)
  const seen = new Set<string>();
  const recipients: NotificationRecipient[] = [];

  for (const step of policy.steps) {
    if (!seen.has(step.reviewer.id)) {
      seen.add(step.reviewer.id);
      recipients.push({
        userId: step.reviewer.id,
        email: step.reviewer.email,
        locale: (step.reviewer.locale as Locale) || "ar",
      });
    }
  }

  return recipients;
}

/**
 * Get the proposal author to notify about review decisions.
 */
async function getReviewDecisionRecipients(
  context: GetNotificationRecipientsContext
): Promise<NotificationRecipient[]> {
  if (!context.proposalId) return [];

  const proposal = await db.generatedProposal.findUnique({
    where: { id: context.proposalId },
    include: {
      createdBy: {
        select: { id: true, email: true, locale: true },
      },
    },
  });

  if (!proposal) return [];

  return [
    {
      userId: proposal.createdBy.id,
      email: proposal.createdBy.email,
      locale: (proposal.createdBy.locale as Locale) || "ar",
    },
  ];
}

/**
 * Get workspace OWNER and ADMIN members for subscription alerts.
 */
async function getSubscriptionAlertRecipients(
  context: GetNotificationRecipientsContext
): Promise<NotificationRecipient[]> {
  const members = await db.workspaceMember.findMany({
    where: {
      workspaceId: context.workspaceId,
      role: { in: ["OWNER", "ADMIN"] },
    },
    include: {
      user: {
        select: { id: true, email: true, locale: true, active: true },
      },
    },
  });

  return members
    .filter((m) => m.user.active)
    .map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      locale: (m.user.locale as Locale) || "ar",
    }));
}

// ─── Convenience Wrappers for Specific Events ────────────────────────────────

/**
 * Notify reviewers when a proposal is submitted for review.
 */
export async function notifyReviewRequested(opts: {
  proposalId: string;
  proposalTitle: string;
  projectTitle: string;
  workspaceId: string;
}): Promise<SendTransactionalNotificationResult> {
  const recipients = await getNotificationRecipients("REVIEW_REQUESTED", {
    workspaceId: opts.workspaceId,
  });

  if (recipients.length === 0) {
    return {
      eventId: `proposal_review_requested_${opts.proposalId}`,
      totalRecipients: 0,
      deliveries: [],
    };
  }

  return sendTransactionalNotification({
    eventId: `proposal_review_requested_${opts.proposalId}`,
    recipients,
    type: "REVIEW_REQUESTED",
    subjectKey: "notification_review_requested_subject",
    bodyKey: "notification_review_requested_body",
    bodyParams: {
      proposalTitle: opts.proposalTitle,
      projectTitle: opts.projectTitle,
    },
    href: getPathForView("reviews"),
    workspaceId: opts.workspaceId,
  });
}

// ─── Dedup keys ──────────────────────────────────────────────────────────────
//
// An eventId is the at-most-once key of NotificationDelivery. These used to
// append crypto.randomUUID(), which made every call a fresh event and so let a
// retried request or a replayed webhook notify the same person twice. Each key
// now names the state that changed, so a repeat of the same transition is the
// SKIPPED/ALREADY_DELIVERED no-op the table was designed for.

/** One notice per review decision; per proposal and outcome when the review id is unknown. */
export function reviewDecisionEventId(opts: {
  proposalId: string;
  decision: "APPROVED" | "REJECTED";
  reviewId?: string | null;
}): string {
  return opts.reviewId
    ? `proposal_review_decision_${opts.reviewId}`
    : `proposal_review_decision_${opts.proposalId}_${opts.decision}`;
}

/** UTC calendar day, the coarsest state a subscription alert is keyed on. */
function utcDayStamp(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * One notice per subscription state transition. `stateRef` names the failed
 * attempt or the billing period that turned past due; without one, the alert
 * is keyed to the UTC day so a retry loop cannot page an owner every minute.
 */
export function subscriptionAlertEventId(opts: {
  kind: "past_due" | "failed";
  subscriptionId: string;
  stateRef?: string | null;
  now?: Date;
}): string {
  const ref = opts.stateRef?.trim() || utcDayStamp(opts.now ?? new Date());
  return `subscription_${opts.kind}_${opts.subscriptionId}_${ref}`;
}

/**
 * Notify the proposal author when a review decision is recorded.
 */
export async function notifyReviewDecision(opts: {
  proposalId: string;
  proposalTitle: string;
  decision: "APPROVED" | "REJECTED";
  workspaceId: string;
  /** The decided ProposalReview row; keys the notice to that one decision. */
  reviewId?: string | null;
}): Promise<SendTransactionalNotificationResult> {
  const eventId = reviewDecisionEventId(opts);
  const recipients = await getNotificationRecipients("REVIEW_DECISION", {
    workspaceId: opts.workspaceId,
    proposalId: opts.proposalId,
  });

  if (recipients.length === 0) {
    return { eventId, totalRecipients: 0, deliveries: [] };
  }

  return sendTransactionalNotification({
    eventId,
    recipients,
    type: "REVIEW_DECISION",
    subjectKey: "notification_review_decision_subject",
    bodyKey: "notification_review_decision_body",
    bodyParams: {
      proposalTitle: opts.proposalTitle,
      decision: opts.decision === "APPROVED" ? "✓" : "✗",
    },
    href: getPathForView("proposals"),
    workspaceId: opts.workspaceId,
  });
}

/**
 * Notify workspace OWNER/ADMIN when subscription status changes to PAST_DUE.
 */
export async function notifySubscriptionPastDue(opts: {
  subscriptionId: string;
  workspaceId: string;
  userId: string;
  /** The billing period that turned past due (e.g. its currentPeriodEnd). */
  stateRef?: string | null;
}): Promise<SendTransactionalNotificationResult> {
  const eventId = subscriptionAlertEventId({ kind: "past_due", ...opts });
  const recipients = await getNotificationRecipients("SUBSCRIPTION_PAST_DUE", {
    workspaceId: opts.workspaceId,
  });

  if (recipients.length === 0) {
    return { eventId, totalRecipients: 0, deliveries: [] };
  }

  return sendTransactionalNotification({
    eventId,
    recipients,
    type: "SUBSCRIPTION_PAST_DUE",
    subjectKey: "notification_subscription_past_due_subject",
    bodyKey: "notification_subscription_past_due_body",
    href: getPathForView("billing"),
    workspaceId: opts.workspaceId,
  });
}

/**
 * Notify workspace OWNER/ADMIN when subscription payment fails.
 */
export async function notifySubscriptionFailed(opts: {
  subscriptionId: string;
  workspaceId: string;
  userId: string;
  reason?: string;
  /** The failed payment attempt or invoice; keys the notice to that failure. */
  stateRef?: string | null;
}): Promise<SendTransactionalNotificationResult> {
  const eventId = subscriptionAlertEventId({ kind: "failed", ...opts });
  const recipients = await getNotificationRecipients("SUBSCRIPTION_FAILED", {
    workspaceId: opts.workspaceId,
  });

  if (recipients.length === 0) {
    return { eventId, totalRecipients: 0, deliveries: [] };
  }

  return sendTransactionalNotification({
    eventId,
    recipients,
    type: "SUBSCRIPTION_FAILED",
    subjectKey: "notification_subscription_past_due_subject",
    bodyKey: "notification_subscription_past_due_body",
    href: getPathForView("billing"),
    workspaceId: opts.workspaceId,
  });
}

// ─── Outbox dispatcher ───────────────────────────────────────────────────────

/** Max provider attempts per delivery row (requirement 17.5). */
export const NOTIFICATION_MAX_ATTEMPTS = 3;

/** Claim lease so concurrent dispatchers do not double-send. */
export const NOTIFICATION_CLAIM_LEASE_MS = 60_000;

/** Provider send timeout (requirement 17.5). */
export const NOTIFICATION_PROVIDER_TIMEOUT_MS = 10_000;

/**
 * How long a queued email stays deliverable.
 *
 * The dispatch cron runs once a day — a Vercel Hobby plan rejects anything more
 * frequent — so the deadline has to outlive a full day plus scheduling jitter.
 * The earlier 30-minute deadline expired long before the cron ever looked, so
 * almost every queued email sat PENDING forever.
 */
export const NOTIFICATION_DELIVERY_DEADLINE_MS = 26 * 60 * 60 * 1000;

/** Wall-clock budget of one sweep; keeps the cron under its 60-second maxDuration. */
export const NOTIFICATION_DISPATCH_BUDGET_MS = 45_000;

/** Retry backoff after attempt 1 and 2; the daily sweep sends whatever is due. */
const RETRY_BACKOFF_MS = [60_000, 5 * 60_000] as const;

/**
 * The slice of the Prisma client the outbox touches. Injected by tests so the
 * claim/send/record cycle runs against an in-memory fake, never a database.
 */
export type NotificationOutboxClient = Pick<PrismaClient, "notificationDelivery">;

export type DispatchPendingNotificationsResult = {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
  retried: number;
  /** PENDING rows past their deliveryDeadlineAt, closed as FAILED without a send. */
  expired: number;
  /** True when the sweep stopped early to stay inside its wall-clock budget. */
  budgetExhausted: boolean;
  errors: string[];
};

type OutboxPayload = {
  subjectKey?: string;
  bodyKey?: string;
  bodyParams?: Record<string, string>;
  href?: string | null;
};

/**
 * The PENDING outbox row for one recipient. Exported so a test can build the
 * exact row the dispatcher will later claim.
 */
export function buildOutboxRowData(
  input: SendTransactionalNotificationInput,
  recipient: NotificationRecipient,
  now: Date
) {
  return {
    eventId: input.eventId,
    recipientId: recipient.userId,
    channel: "email",
    status: "PENDING",
    workspaceId: input.workspaceId,
    recipientEmail: recipient.email,
    recipientLocale: recipient.locale,
    templateKey: input.subjectKey,
    payloadJson: {
      subjectKey: input.subjectKey,
      bodyKey: input.bodyKey,
      bodyParams: input.bodyParams ?? {},
      href: input.href ?? null,
    },
    deliveryDeadlineAt: addUtcMilliseconds(now, NOTIFICATION_DELIVERY_DEADLINE_MS),
    nextAttemptAt: now,
  };
}

function parseOutboxPayload(value: unknown): OutboxPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const bodyParams =
    record.bodyParams &&
    typeof record.bodyParams === "object" &&
    !Array.isArray(record.bodyParams)
      ? Object.fromEntries(
          Object.entries(record.bodyParams as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string"
          )
        )
      : {};
  return {
    subjectKey:
      typeof record.subjectKey === "string" ? record.subjectKey : undefined,
    bodyKey: typeof record.bodyKey === "string" ? record.bodyKey : undefined,
    bodyParams,
    href: typeof record.href === "string" ? record.href : null,
  };
}

type OutboxDispatchDependencies = Readonly<{
  client: NotificationOutboxClient;
  send: typeof sendEmail;
  now: Date;
  workerId: string;
}>;

export type OutboxDispatchOutcome =
  | { outcome: "not_claimed" }
  | { outcome: "expired" }
  | { outcome: "sent"; providerMessageId: string }
  | { outcome: "skipped"; reason: string }
  | { outcome: "retried"; error: string }
  | { outcome: "failed"; error: string };

/**
 * One claim → send → record cycle for a single outbox row. Shared by the
 * inline attempt made right after the row commits and by the cron sweep, so
 * both paths honour the same lease, attempt cap, and deadline.
 */
async function dispatchOutboxRow(
  row: NotificationDelivery,
  deps: OutboxDispatchDependencies
): Promise<OutboxDispatchOutcome> {
  const { client, now } = deps;
  const deliveries = client.notificationDelivery;

  // Past the deadline: close the row instead of leaving it PENDING forever.
  // No claim is needed — a concurrent close writes the same terminal state.
  if (
    row.deliveryDeadlineAt !== null &&
    row.deliveryDeadlineAt.getTime() <= now.getTime()
  ) {
    await deliveries.update({
      where: { id: row.id },
      data: {
        status: "FAILED",
        errorCode: "DELIVERY_DEADLINE_EXCEEDED",
        errorMessage: `Not delivered within ${NOTIFICATION_DELIVERY_DEADLINE_MS / 3_600_000} hours`,
        failedAt: now,
        nextAttemptAt: null,
        claimedAt: null,
        claimExpiresAt: null,
        claimedBy: null,
      },
    });
    return { outcome: "expired" };
  }

  const claimExpiresAt = new Date(now.getTime() + NOTIFICATION_CLAIM_LEASE_MS);
  const claimed = await deliveries.updateMany({
    where: {
      id: row.id,
      status: "PENDING",
      attemptCount: row.attemptCount,
      OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lte: now } }],
    },
    data: {
      claimedAt: now,
      claimExpiresAt,
      claimedBy: deps.workerId,
      firstAttemptAt: row.firstAttemptAt ?? now,
      lastAttemptAt: now,
      attemptCount: { increment: 1 },
    },
  });
  if (claimed.count !== 1) return { outcome: "not_claimed" };

  const attemptNumber = row.attemptCount + 1;
  const payload = parseOutboxPayload(row.payloadJson);
  const subjectKey = payload.subjectKey ?? row.templateKey;
  const bodyKey = payload.bodyKey;
  const locale = (row.recipientLocale as Locale) || "ar";

  if (!row.recipientEmail || !subjectKey || !bodyKey) {
    await deliveries.update({
      where: { id: row.id },
      data: {
        status: "FAILED",
        errorCode: "OUTBOX_PAYLOAD_INVALID",
        errorMessage: "Missing recipient email or template keys",
        failedAt: now,
        claimedAt: null,
        claimExpiresAt: null,
        claimedBy: null,
      },
    });
    return { outcome: "failed", error: "OUTBOX_PAYLOAD_INVALID" };
  }

  const content = composeContent(subjectKey, bodyKey, locale, payload.bodyParams);
  const subject = content.subject.slice(0, 150);
  const body = locale === "ar" ? content.bodyAr : content.bodyEn;
  const html = formatEmailHtml(body, payload.href ?? undefined);

  let sendResult: Awaited<ReturnType<typeof sendEmail>>;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    sendResult = await Promise.race([
      deps.send({ to: row.recipientEmail, subject, html, text: body }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("NOTIFICATION_PROVIDER_TIMEOUT")),
          NOTIFICATION_PROVIDER_TIMEOUT_MS
        );
      }),
    ]);
  } catch (err) {
    sendResult = {
      ok: false,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  // Every timestamp below comes from the injected clock, so a deterministic
  // test and a real sweep record the same transitions.
  if (sendResult.ok) {
    await deliveries.update({
      where: { id: row.id },
      data: {
        status: "SENT",
        providerMessageId: sendResult.id,
        deliveredAt: now,
        errorCode: null,
        errorMessage: null,
        claimedAt: null,
        claimExpiresAt: null,
        claimedBy: null,
        nextAttemptAt: null,
      },
    });
    return { outcome: "sent", providerMessageId: sendResult.id };
  }

  if ("skipped" in sendResult && sendResult.skipped) {
    await deliveries.update({
      where: { id: row.id },
      data: {
        status: "SKIPPED",
        errorCode: "EMAIL_UNCONFIGURED",
        errorMessage: sendResult.reason,
        failedAt: now,
        claimedAt: null,
        claimExpiresAt: null,
        claimedBy: null,
      },
    });
    return { outcome: "skipped", reason: sendResult.reason };
  }

  const terminal =
    attemptNumber >= NOTIFICATION_MAX_ATTEMPTS ||
    (row.deliveryDeadlineAt !== null &&
      row.deliveryDeadlineAt.getTime() <= now.getTime());
  const backoff =
    RETRY_BACKOFF_MS[Math.min(attemptNumber - 1, RETRY_BACKOFF_MS.length - 1)] ??
    RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]!;

  await deliveries.update({
    where: { id: row.id },
    data: {
      status: terminal ? "FAILED" : "PENDING",
      errorCode: "EMAIL_SEND_FAILED",
      errorMessage: sendResult.error,
      failedAt: terminal ? now : null,
      nextAttemptAt: terminal ? null : new Date(now.getTime() + backoff),
      claimedAt: null,
      claimExpiresAt: null,
      claimedBy: null,
    },
  });
  return terminal
    ? { outcome: "failed", error: sendResult.error }
    : { outcome: "retried", error: sendResult.error };
}

/**
 * The single inline provider attempt made right after an outbox row commits.
 * Bounded by the 10-second provider timeout and never throws: any failure
 * leaves the row PENDING for the cron sweep, so the caller's own response is
 * unaffected either way.
 */
export async function attemptInlineEmailDispatch(
  row: NotificationDelivery,
  deps: OutboxDispatchDependencies
): Promise<OutboxDispatchOutcome> {
  try {
    return await dispatchOutboxRow(row, deps);
  } catch (err) {
    console.error(
      "[notification-service] inline dispatch failed; row stays queued",
      {
        rowId: row.id,
        errorName: err instanceof Error ? err.name : typeof err,
      }
    );
    return {
      outcome: "retried",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function inlineDeliveryResult(
  recipientId: string,
  inline: OutboxDispatchOutcome
): DeliveryResult {
  switch (inline.outcome) {
    case "sent":
      return {
        recipientId,
        channel: "email",
        status: "SENT",
        emailId: inline.providerMessageId,
      };
    case "skipped":
      return {
        recipientId,
        channel: "email",
        status: "SKIPPED",
        reason: "EMAIL_UNCONFIGURED",
      };
    case "failed":
      return {
        recipientId,
        channel: "email",
        status: "FAILED",
        reason: inline.error,
      };
    case "expired":
      return {
        recipientId,
        channel: "email",
        status: "FAILED",
        reason: "DELIVERY_DEADLINE_EXCEEDED",
      };
    default:
      return {
        recipientId,
        channel: "email",
        status: "PENDING",
        reason: "QUEUED_FOR_DISPATCH",
      };
  }
}

/**
 * Claim PENDING/retryable email outbox rows and send them.
 * Uses conditional claim leases (skip-locked style) so multiple dispatchers do
 * not double-deliver. Terminal after three attempts or once the 26-hour
 * deliveryDeadlineAt has passed (requirements 17.4–17.6). Stops claiming new
 * rows once the wall-clock budget is spent; the rest wait for the next sweep.
 */
export async function dispatchPendingNotificationEmails(options?: {
  readonly batchSize?: number;
  readonly workerId?: string;
  readonly now?: Date;
  readonly send?: typeof sendEmail;
  readonly client?: NotificationOutboxClient;
  readonly budgetMs?: number;
  /** Whether a transport exists; read from the environment when omitted. */
  readonly emailConfigured?: boolean;
}): Promise<DispatchPendingNotificationsResult> {
  const batchSize = Math.min(Math.max(options?.batchSize ?? 25, 1), 100);
  const workerId = options?.workerId ?? `cron-${crypto.randomUUID()}`;
  const now = options?.now ?? new Date();
  const send = options?.send ?? sendEmail;
  const client: NotificationOutboxClient = options?.client ?? db;
  const budgetMs = options?.budgetMs ?? NOTIFICATION_DISPATCH_BUDGET_MS;
  const emailConfigured = options?.emailConfigured ?? isEmailConfigured();
  const startedAtMs = Date.now();
  const result: DispatchPendingNotificationsResult = {
    claimed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    retried: 0,
    expired: 0,
    budgetExhausted: false,
    errors: [],
  };

  if (!emailConfigured) {
    // Mark due PENDING rows SKIPPED without a network call when no transport
    // is configured. An operator reads errorMessage directly, so it names both
    // transports rather than only the one that used to exist.
    const unconfigured = await client.notificationDelivery.updateMany({
      where: {
        channel: "email",
        status: "PENDING",
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      data: {
        status: "SKIPPED",
        errorCode: "EMAIL_UNCONFIGURED",
        errorMessage:
          "No email transport configured (set RESEND_API_KEY, or SMTP_HOST + SMTP_USER + SMTP_PASSWORD)",
        lastAttemptAt: now,
        failedAt: now,
      },
    });
    result.skipped = unconfigured.count;
    return result;
  }

  // Rows past their deadline are selected too: the dispatcher closes them as
  // FAILED so the outbox cannot accumulate PENDING rows nothing will ever send.
  const candidates = await client.notificationDelivery.findMany({
    where: {
      channel: "email",
      status: "PENDING",
      attemptCount: { lt: NOTIFICATION_MAX_ATTEMPTS },
      AND: [
        { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        { OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lte: now } }] },
      ],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: batchSize,
  });

  for (const row of candidates) {
    if (Date.now() - startedAtMs >= budgetMs) {
      result.budgetExhausted = true;
      break;
    }

    const outcome = await dispatchOutboxRow(row, { client, send, now, workerId });
    switch (outcome.outcome) {
      case "not_claimed":
        break;
      case "expired":
        result.expired += 1;
        break;
      case "sent":
        result.claimed += 1;
        result.sent += 1;
        break;
      case "skipped":
        result.claimed += 1;
        result.skipped += 1;
        break;
      case "retried":
        result.claimed += 1;
        result.retried += 1;
        result.errors.push(`${row.id}: ${outcome.error}`);
        break;
      case "failed":
        result.claimed += 1;
        result.failed += 1;
        result.errors.push(`${row.id}: ${outcome.error}`);
        break;
    }
  }

  return result;
}
