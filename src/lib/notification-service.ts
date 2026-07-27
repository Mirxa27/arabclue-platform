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
import { isEmailConfigured } from "./email";
import { tr } from "./i18n";
import { utcDeadline } from "./time";
import type { Locale } from "./types";

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotificationType =
  | "REVIEW_REQUESTED"
  | "REVIEW_DECISION"
  | "SUBSCRIPTION_PAST_DUE"
  | "SUBSCRIPTION_FAILED";

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
  const titleEn = tr(subjectKey, "en");
  const titleAr = tr(subjectKey, "ar");

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
    default:
      return [];
  }
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
