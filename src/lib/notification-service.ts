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

import { db } from "./db";
import { isEmailConfigured, sendEmail } from "./email";
import { tr } from "./i18n";
import { getPathForView } from "./dashboard-routes";
import { utcDeadline } from "./time";
import type { Locale } from "./types";

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotificationType =
  | "REVIEW_REQUESTED"
  | "REVIEW_DECISION"
  | "SUBSCRIPTION_PAST_DUE"
  | "SUBSCRIPTION_FAILED"
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
  /** Link to relevant app view (e.g., "/app?view=reviews") */
  href?: string;
  /** Workspace ID for InAppNotification */
  workspaceId: string;
};

export type DeliveryResult = {
  recipientId: string;
  channel: "in_app" | "email";
  /** PENDING means queued for async dispatch by the notification-dispatch cron. */
  status: "SENT" | "FAILED" | "SKIPPED" | "PENDING";
  reason?: string;
  notificationId?: string;
  emailId?: string;
};

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
  input: SendTransactionalNotificationInput
): Promise<SendTransactionalNotificationResult> {
  const deliveries: DeliveryResult[] = [];
  const emailConfigured = isEmailConfigured();

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
      // Queue for async dispatch: write a PENDING outbox record.
      // The /api/cron/notification-dispatch cron claims these rows, sends with a
      // 10-second provider timeout, and retries up to 3 times within 30 minutes.
      const deadlineAt = utcDeadline(30 * 60 * 1000);
      await db.notificationDelivery.create({
        data: {
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
          deliveryDeadlineAt: deadlineAt,
          nextAttemptAt: new Date(),
        },
      });

      deliveries.push({
        recipientId: recipient.userId,
        channel: "email",
        status: "PENDING",
        reason: "QUEUED_FOR_DISPATCH",
      });
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
      return getSubscriptionAlertRecipients(context);
    case "AGENT_RUN_COMPLETED":
    case "AGENT_RUN_FAILED":
      return getRunInitiatorRecipient(context);
    default:
      return [];
  }
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
    href: "/app?view=reviews",
    workspaceId: opts.workspaceId,
  });
}

/**
 * Notify the proposal author when a review decision is recorded.
 */
export async function notifyReviewDecision(opts: {
  proposalId: string;
  proposalTitle: string;
  decision: "APPROVED" | "REJECTED";
  workspaceId: string;
}): Promise<SendTransactionalNotificationResult> {
  const recipients = await getNotificationRecipients("REVIEW_DECISION", {
    workspaceId: opts.workspaceId,
    proposalId: opts.proposalId,
  });

  if (recipients.length === 0) {
    return {
      eventId: `proposal_review_decision_${opts.proposalId}`,
      totalRecipients: 0,
      deliveries: [],
    };
  }

  return sendTransactionalNotification({
    eventId: `proposal_review_decision_${opts.proposalId}_${crypto.randomUUID()}`,
    recipients,
    type: "REVIEW_DECISION",
    subjectKey: "notification_review_decision_subject",
    bodyKey: "notification_review_decision_body",
    bodyParams: {
      proposalTitle: opts.proposalTitle,
      decision: opts.decision === "APPROVED" ? "✓" : "✗",
    },
    href: "/app?view=proposals",
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
}): Promise<SendTransactionalNotificationResult> {
  const recipients = await getNotificationRecipients("SUBSCRIPTION_PAST_DUE", {
    workspaceId: opts.workspaceId,
  });

  if (recipients.length === 0) {
    return {
      eventId: `subscription_past_due_${opts.subscriptionId}`,
      totalRecipients: 0,
      deliveries: [],
    };
  }

  return sendTransactionalNotification({
    eventId: `subscription_past_due_${opts.subscriptionId}_${crypto.randomUUID()}`,
    recipients,
    type: "SUBSCRIPTION_PAST_DUE",
    subjectKey: "notification_subscription_past_due_subject",
    bodyKey: "notification_subscription_past_due_body",
    href: "/app?view=billing",
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
}): Promise<SendTransactionalNotificationResult> {
  const recipients = await getNotificationRecipients("SUBSCRIPTION_FAILED", {
    workspaceId: opts.workspaceId,
  });

  if (recipients.length === 0) {
    return {
      eventId: `subscription_failed_${opts.subscriptionId}`,
      totalRecipients: 0,
      deliveries: [],
    };
  }

  return sendTransactionalNotification({
    eventId: `subscription_failed_${opts.subscriptionId}_${crypto.randomUUID()}`,
    recipients,
    type: "SUBSCRIPTION_FAILED",
    subjectKey: "notification_subscription_past_due_subject",
    bodyKey: "notification_subscription_past_due_body",
    href: "/app?view=billing",
    workspaceId: opts.workspaceId,
  });
}

// ─── Outbox dispatcher (cron) ────────────────────────────────────────────────

/** Max provider attempts per delivery row (requirement 17.5). */
export const NOTIFICATION_MAX_ATTEMPTS = 3;

/** Claim lease so concurrent cron instances do not double-send. */
export const NOTIFICATION_CLAIM_LEASE_MS = 60_000;

/** Provider send timeout (requirement 17.5). */
export const NOTIFICATION_PROVIDER_TIMEOUT_MS = 10_000;

/** Retry backoff steps after attempt 1 and 2 (within the 30-minute deadline). */
const RETRY_BACKOFF_MS = [60_000, 5 * 60_000] as const;

export type DispatchPendingNotificationsResult = {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
  retried: number;
  errors: string[];
};

type OutboxPayload = {
  subjectKey?: string;
  bodyKey?: string;
  bodyParams?: Record<string, string>;
  href?: string | null;
};

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

/**
 * Claim PENDING/retryable email outbox rows and send them via Resend.
 * Uses conditional claim leases (skip-locked style) so multiple cron instances
 * do not double-deliver. Terminal after three attempts or after the 30-minute
 * deliveryDeadlineAt (requirements 17.4–17.6).
 */
export async function dispatchPendingNotificationEmails(options?: {
  readonly batchSize?: number;
  readonly workerId?: string;
  readonly now?: Date;
  readonly send?: typeof sendEmail;
}): Promise<DispatchPendingNotificationsResult> {
  const batchSize = Math.min(Math.max(options?.batchSize ?? 25, 1), 100);
  const workerId = options?.workerId ?? `cron-${crypto.randomUUID()}`;
  const now = options?.now ?? new Date();
  const send = options?.send ?? sendEmail;
  const result: DispatchPendingNotificationsResult = {
    claimed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    retried: 0,
    errors: [],
  };

  if (!isEmailConfigured()) {
    // Mark due PENDING rows SKIPPED without a network call when no transport
    // is configured. An operator reads errorMessage directly, so it names both
    // transports rather than only the one that used to exist.
    const unconfigured = await db.notificationDelivery.updateMany({
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

  const candidates = await db.notificationDelivery.findMany({
    where: {
      channel: "email",
      status: "PENDING",
      attemptCount: { lt: NOTIFICATION_MAX_ATTEMPTS },
      AND: [
        { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        { OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lte: now } }] },
        {
          OR: [
            { deliveryDeadlineAt: null },
            { deliveryDeadlineAt: { gt: now } },
          ],
        },
      ],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: batchSize,
  });

  for (const row of candidates) {
    const claimExpiresAt = new Date(now.getTime() + NOTIFICATION_CLAIM_LEASE_MS);
    const claimed = await db.notificationDelivery.updateMany({
      where: {
        id: row.id,
        status: "PENDING",
        attemptCount: row.attemptCount,
        OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lte: now } }],
      },
      data: {
        claimedAt: now,
        claimExpiresAt,
        claimedBy: workerId,
        firstAttemptAt: row.firstAttemptAt ?? now,
        lastAttemptAt: now,
        attemptCount: { increment: 1 },
      },
    });

    if (claimed.count !== 1) continue;
    result.claimed += 1;

    const attemptNumber = row.attemptCount + 1;
    const payload = parseOutboxPayload(row.payloadJson);
    const subjectKey = payload.subjectKey ?? row.templateKey;
    const bodyKey = payload.bodyKey;
    const locale = (row.recipientLocale as Locale) || "ar";

    if (!row.recipientEmail || !subjectKey || !bodyKey) {
      await db.notificationDelivery.update({
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
      result.failed += 1;
      result.errors.push(`${row.id}: OUTBOX_PAYLOAD_INVALID`);
      continue;
    }

    const content = composeContent(
      subjectKey,
      bodyKey,
      locale,
      payload.bodyParams
    );
    const subject = content.subject.slice(0, 150);
    const body =
      locale === "ar" ? content.bodyAr : content.bodyEn;
    const html = formatEmailHtml(body, payload.href ?? undefined);

    let sendResult: Awaited<ReturnType<typeof sendEmail>>;
    try {
      sendResult = await Promise.race([
        send({
          to: row.recipientEmail,
          subject,
          html,
          text: body,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(
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
    }

    if (sendResult.ok) {
      await db.notificationDelivery.update({
        where: { id: row.id },
        data: {
          status: "SENT",
          providerMessageId: sendResult.id,
          deliveredAt: new Date(),
          errorCode: null,
          errorMessage: null,
          claimedAt: null,
          claimExpiresAt: null,
          claimedBy: null,
          nextAttemptAt: null,
        },
      });
      result.sent += 1;
      continue;
    }

    if ("skipped" in sendResult && sendResult.skipped) {
      await db.notificationDelivery.update({
        where: { id: row.id },
        data: {
          status: "SKIPPED",
          errorCode: "EMAIL_UNCONFIGURED",
          errorMessage: sendResult.reason,
          failedAt: new Date(),
          claimedAt: null,
          claimExpiresAt: null,
          claimedBy: null,
        },
      });
      result.skipped += 1;
      continue;
    }

    const terminal =
      attemptNumber >= NOTIFICATION_MAX_ATTEMPTS ||
      (row.deliveryDeadlineAt !== null &&
        row.deliveryDeadlineAt.getTime() <= Date.now());
    const backoff =
      RETRY_BACKOFF_MS[Math.min(attemptNumber - 1, RETRY_BACKOFF_MS.length - 1)] ??
      RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]!;
    const nextAttemptAt = new Date(Date.now() + backoff);

    await db.notificationDelivery.update({
      where: { id: row.id },
      data: {
        status: terminal ? "FAILED" : "PENDING",
        errorCode: "EMAIL_SEND_FAILED",
        errorMessage: sendResult.error,
        failedAt: terminal ? new Date() : null,
        nextAttemptAt: terminal ? null : nextAttemptAt,
        claimedAt: null,
        claimExpiresAt: null,
        claimedBy: null,
      },
    });

    if (terminal) {
      result.failed += 1;
    } else {
      result.retried += 1;
    }
    result.errors.push(`${row.id}: ${sendResult.error}`);
  }

  return result;
}
