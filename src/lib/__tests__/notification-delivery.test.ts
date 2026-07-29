/**
 * Notification after-commit delivery dispatcher — end-to-end logic tests.
 *
 * Verifies the outbox pattern: sendTransactionalNotification writes PENDING
 * email rows after the in-app delivery, the cron dispatcher claims and sends
 * them, retry logic applies bounded exponential backoff, and status
 * transitions are PENDING → SENT / PENDING → FAILED (after max retries).
 * Idempotency: already-sent rows are never re-delivered.
 *
 * DB and Resend are mocked so no network or shared database is touched.
 */

import { describe, expect, test, mock, beforeEach } from "bun:test";

// ─── Mock state ─────────────────────────────────────────────────────────────

type DeliveryRow = {
  id: string;
  workspaceId: string | null;
  eventId: string;
  recipientId: string;
  channel: string;
  status: string;
  recipientEmail: string | null;
  recipientLocale: string | null;
  templateKey: string | null;
  payloadJson: unknown;
  attemptCount: number;
  nextAttemptAt: Date | null;
  firstAttemptAt: Date | null;
  lastAttemptAt: Date | null;
  claimedAt: Date | null;
  claimExpiresAt: Date | null;
  claimedBy: string | null;
  deliveryDeadlineAt: Date | null;
  providerMessageId: string | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type InAppRow = {
  id: string;
  workspaceId: string;
  userId: string;
  type: string;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  href: string | null;
  eventId: string | null;
  isRead: boolean;
  createdAt: Date;
};

let deliveryRows: DeliveryRow[] = [];
let inAppRows: InAppRow[] = [];
let emailConfigured = true;
let sendCalls = 0;
let sendBehavior: "ok" | "fail" | "skip" = "ok";

function resetState() {
  deliveryRows = [];
  inAppRows = [];
  emailConfigured = true;
  sendCalls = 0;
  sendBehavior = "ok";
}

function findDelivery(
  eventId: string,
  recipientId: string,
  channel: string
): DeliveryRow | undefined {
  return deliveryRows.find(
    (r) => r.eventId === eventId && r.recipientId === recipientId && r.channel === channel
  );
}

// ─── Mock modules ────────────────────────────────────────────────────────────

mock.module("../db", () => ({
  db: {
    notificationDelivery: {
      findUnique: mock(({ where }: { where: Record<string, unknown> }) => {
        const key = where.eventId_recipientId_channel as
          | { eventId: string; recipientId: string; channel: string }
          | undefined;
        if (!key) return Promise.resolve(null);
        return Promise.resolve(findDelivery(key.eventId, key.recipientId, key.channel) ?? null);
      }),
      findMany: mock(({ where }: { where: Record<string, unknown> }) => {
        const channel = where.channel as string | undefined;
        const status = where.status as string | undefined;
        const maxAttempts = 3;
        // Return shallow copies so in-place mutations by updateMany don't
        // affect the snapshot the dispatcher holds (matching real Prisma).
        const matched = deliveryRows
          .filter(
            (r) =>
              (!channel || r.channel === channel) &&
              (!status || r.status === status) &&
              r.attemptCount < maxAttempts
          )
          .map((r) => ({ ...r }));
        return Promise.resolve(matched);
      }),
      create: mock(({ data }: { data: Record<string, unknown> }) => {
        const row: DeliveryRow = {
          id: `nd-${deliveryRows.length + 1}`,
          workspaceId: (data.workspaceId as string) ?? null,
          eventId: data.eventId as string,
          recipientId: data.recipientId as string,
          channel: (data.channel as string) ?? "email",
          status: (data.status as string) ?? "PENDING",
          recipientEmail: (data.recipientEmail as string) ?? null,
          recipientLocale: (data.recipientLocale as string) ?? null,
          templateKey: (data.templateKey as string) ?? null,
          payloadJson: data.payloadJson ?? null,
          attemptCount: 0,
          nextAttemptAt: (data.nextAttemptAt as Date) ?? null,
          firstAttemptAt: null,
          lastAttemptAt: null,
          claimedAt: null,
          claimExpiresAt: null,
          claimedBy: null,
          deliveryDeadlineAt: (data.deliveryDeadlineAt as Date) ?? null,
          providerMessageId: null,
          deliveredAt: null,
          failedAt: null,
          errorCode: null,
          errorMessage: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        deliveryRows.push(row);
        return Promise.resolve(row);
      }),
      upsert: mock(({ where, create }: { where: Record<string, unknown>; create: Record<string, unknown> }) => {
        const key = where.eventId_recipientId_channel as
          | { eventId: string; recipientId: string; channel: string }
          | undefined;
        let row: DeliveryRow | undefined;
        if (key) {
          row = findDelivery(key.eventId, key.recipientId, key.channel);
        }
        if (!row) {
          row = {
            id: `nd-${deliveryRows.length + 1}`,
            workspaceId: null,
            eventId: create.eventId as string,
            recipientId: create.recipientId as string,
            channel: (create.channel as string) ?? "email",
            status: (create.status as string) ?? "PENDING",
            recipientEmail: null,
            recipientLocale: null,
            templateKey: null,
            payloadJson: null,
            attemptCount: 0,
            nextAttemptAt: null,
            firstAttemptAt: null,
            lastAttemptAt: null,
            claimedAt: null,
            claimExpiresAt: null,
            claimedBy: null,
            deliveryDeadlineAt: null,
            providerMessageId: null,
            deliveredAt: null,
            failedAt: null,
            errorCode: null,
            errorMessage: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          deliveryRows.push(row);
        }
        return Promise.resolve(row);
      }),
      update: mock(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = deliveryRows.find((r) => r.id === where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, data, { updatedAt: new Date() });
        return Promise.resolve(row);
      }),
      updateMany: mock(({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        // For claim: where.id + status + attemptCount
        const id = where.id as string | undefined;
        let count = 0;
        for (const row of deliveryRows) {
          if (id && row.id !== id) continue;
          if (where.status && row.status !== where.status) continue;
          // Handle Prisma { increment: N } syntax
          for (const [k, v] of Object.entries(data)) {
            if (v && typeof v === "object" && "increment" in v) {
              (row as any)[k] = ((row as any)[k] ?? 0) + (v as any).increment;
            } else {
              (row as any)[k] = v;
            }
          }
          row.updatedAt = new Date();
          count++;
        }
        return Promise.resolve({ count });
      }),
    },
    inAppNotification: {
      create: mock(({ data }: { data: Record<string, unknown> }) => {
        const row: InAppRow = {
          id: `inapp-${inAppRows.length + 1}`,
          workspaceId: data.workspaceId as string,
          userId: data.userId as string,
          type: data.type as string,
          titleEn: data.titleEn as string,
          titleAr: data.titleAr as string,
          bodyEn: data.bodyEn as string,
          bodyAr: data.bodyAr as string,
          href: (data.href as string) ?? null,
          eventId: (data.eventId as string) ?? null,
          isRead: false,
          createdAt: new Date(),
        };
        inAppRows.push(row);
        return Promise.resolve(row);
      }),
    },
  },
}));

mock.module("../email", () => ({
  isEmailConfigured: () => emailConfigured,
  sendEmail: mock(() => {
    sendCalls += 1;
    if (sendBehavior === "ok") {
      return Promise.resolve({ ok: true, id: `re-${sendCalls}`, provider: "resend" });
    }
    if (sendBehavior === "skip") {
      return Promise.resolve({ ok: false, skipped: true, reason: "RESEND_API_KEY not configured" });
    }
    return Promise.resolve({ ok: false, skipped: false, error: "SMTP_TIMEOUT" });
  }),
}));

// Import after mocks are registered
const {
  sendTransactionalNotification,
  dispatchPendingNotificationEmails,
  NOTIFICATION_MAX_ATTEMPTS,
} = await import("../notification-service");

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("notification after-commit delivery dispatcher", () => {
  beforeEach(() => {
    resetState();
  });

  test("after-commit scheduling: in-app SENT synchronously, email queued as PENDING", async () => {
    emailConfigured = true;
    const result = await sendTransactionalNotification({
      eventId: "evt-001",
      recipients: [
        { userId: "u1", email: "u1@example.com", locale: "ar" },
      ],
      type: "REVIEW_REQUESTED",
      subjectKey: "notification_review_requested_subject",
      bodyKey: "notification_review_requested_body",
      bodyParams: { proposalTitle: "P1", projectTitle: "T1" },
      href: "/app?view=reviews",
      workspaceId: "ws1",
    });

    // In-app should be SENT immediately
    const inAppDelivery = findDelivery("evt-001", "u1", "in_app");
    expect(inAppDelivery).toBeDefined();
    expect(inAppDelivery!.status).toBe("SENT");

    // Email should be PENDING (queued for async dispatch)
    const emailDelivery = findDelivery("evt-001", "u1", "email");
    expect(emailDelivery).toBeDefined();
    expect(emailDelivery!.status).toBe("PENDING");
    expect(emailDelivery!.recipientEmail).toBe("u1@example.com");
    expect(emailDelivery!.deliveryDeadlineAt).not.toBeNull();
    expect(emailDelivery!.nextAttemptAt).not.toBeNull();

    // The DeliveryResult for email should be PENDING
    const emailResult = result.deliveries.find((d) => d.channel === "email");
    expect(emailResult?.status).toBe("PENDING");
    expect(emailResult?.reason).toBe("QUEUED_FOR_DISPATCH");
  });

  test("cron dispatch loop: PENDING email is claimed and sent (PENDING → SENT)", async () => {
    emailConfigured = true;
    sendBehavior = "ok";

    await sendTransactionalNotification({
      eventId: "evt-002",
      recipients: [{ userId: "u2", email: "u2@example.com", locale: "en" }],
      type: "REVIEW_DECISION",
      subjectKey: "notification_review_decision_subject",
      bodyKey: "notification_review_decision_body",
      workspaceId: "ws2",
    });

    expect(sendCalls).toBe(0); // No send during scheduling

    const summary = await dispatchPendingNotificationEmails({
      now: new Date(),
      send: async () => {
        sendCalls += 1;
        return { ok: true, id: `re-${sendCalls}`, provider: "resend" };
      },
    });

    expect(summary.claimed).toBe(1);
    expect(summary.sent).toBe(1);
    expect(summary.failed).toBe(0);

    const emailDelivery = findDelivery("evt-002", "u2", "email");
    expect(emailDelivery!.status).toBe("SENT");
    expect(emailDelivery!.deliveredAt).not.toBeNull();
    expect(emailDelivery!.providerMessageId).not.toBeNull();
  });

  test("retry logic: failed send retries with backoff, then terminal FAILED after max attempts", async () => {
    emailConfigured = true;
    sendBehavior = "fail";

    await sendTransactionalNotification({
      eventId: "evt-003",
      recipients: [{ userId: "u3", email: "u3@example.com", locale: "ar" }],
      type: "SUBSCRIPTION_FAILED",
      subjectKey: "notification_subscription_past_due_subject",
      bodyKey: "notification_subscription_past_due_body",
      workspaceId: "ws3",
    });

    // Attempt 1
    let summary = await dispatchPendingNotificationEmails({
      now: new Date(),
      send: async () => ({ ok: false, skipped: false, error: "SMTP_TIMEOUT" }),
    });
    expect(summary.claimed).toBe(1);
    expect(summary.retried).toBe(1);
    expect(summary.failed).toBe(0);

    let row = findDelivery("evt-003", "u3", "email")!;
    expect(row.status).toBe("PENDING");
    expect(row.attemptCount).toBe(1);
    expect(row.nextAttemptAt).not.toBeNull();

    // Attempt 2 — advance past the 60s backoff window
    summary = await dispatchPendingNotificationEmails({
      now: new Date(Date.now() + 120_000),
      send: async () => ({ ok: false, skipped: false, error: "SMTP_TIMEOUT" }),
    });
    expect(summary.retried).toBe(1);
    expect(summary.failed).toBe(0);

    row = findDelivery("evt-003", "u3", "email")!;
    expect(row.status).toBe("PENDING");
    expect(row.attemptCount).toBe(2);

    // Attempt 3 — terminal failure (advance past 5min backoff)
    summary = await dispatchPendingNotificationEmails({
      now: new Date(Date.now() + 600_000),
      send: async () => ({ ok: false, skipped: false, error: "SMTP_TIMEOUT" }),
    });
    expect(summary.failed).toBe(1);

    row = findDelivery("evt-003", "u3", "email")!;
    expect(row.status).toBe("FAILED");
    expect(row.attemptCount).toBe(3);
    expect(row.failedAt).not.toBeNull();
    expect(row.errorCode).toBe("EMAIL_SEND_FAILED");
  });

  test("idempotency: already-SENT email is not re-delivered by cron", async () => {
    emailConfigured = true;

    await sendTransactionalNotification({
      eventId: "evt-004",
      recipients: [{ userId: "u4", email: "u4@example.com", locale: "ar" }],
      type: "REVIEW_REQUESTED",
      subjectKey: "notification_review_requested_subject",
      bodyKey: "notification_review_requested_body",
      workspaceId: "ws4",
    });

    // First dispatch sends it
    const first = await dispatchPendingNotificationEmails({
      now: new Date(),
      send: async () => ({ ok: true, id: "re-1", provider: "resend" }),
    });
    expect(first.sent).toBe(1);

    // Second dispatch should find nothing to claim
    const second = await dispatchPendingNotificationEmails({
      now: new Date(),
      send: async () => ({ ok: true, id: "re-2", provider: "resend" }),
    });
    expect(second.claimed).toBe(0);
    expect(second.sent).toBe(0);
  });

  test("idempotency: re-calling sendTransactionalNotification skips already-delivered", async () => {
    emailConfigured = true;

    const input = {
      eventId: "evt-005",
      recipients: [{ userId: "u5", email: "u5@example.com", locale: "ar" }],
      type: "REVIEW_REQUESTED" as const,
      subjectKey: "notification_review_requested_subject",
      bodyKey: "notification_review_requested_body",
      workspaceId: "ws5",
    };

    const first = await sendTransactionalNotification(input);
    const inAppFirst = first.deliveries.find((d) => d.channel === "in_app");
    expect(inAppFirst?.status).toBe("SENT");

    // Second call with same eventId should skip
    const second = await sendTransactionalNotification(input);
    const inAppSecond = second.deliveries.find((d) => d.channel === "in_app");
    expect(inAppSecond?.status).toBe("SKIPPED");
    expect(inAppSecond?.reason).toBe("ALREADY_DELIVERED");
  });

  test("email unconfigured: email delivery is SKIPPED immediately, no cron dispatch needed", async () => {
    emailConfigured = false;

    const result = await sendTransactionalNotification({
      eventId: "evt-006",
      recipients: [{ userId: "u6", email: "u6@example.com", locale: "ar" }],
      type: "REVIEW_REQUESTED",
      subjectKey: "notification_review_requested_subject",
      bodyKey: "notification_review_requested_body",
      workspaceId: "ws6",
    });

    const emailResult = result.deliveries.find((d) => d.channel === "email");
    expect(emailResult?.status).toBe("SKIPPED");
    expect(emailResult?.reason).toBe("EMAIL_UNCONFIGURED");

    const emailDelivery = findDelivery("evt-006", "u6", "email");
    expect(emailDelivery!.status).toBe("SKIPPED");
  });

  test("cron marks PENDING rows SKIPPED when email becomes unconfigured", async () => {
    emailConfigured = true;

    await sendTransactionalNotification({
      eventId: "evt-007",
      recipients: [{ userId: "u7", email: "u7@example.com", locale: "ar" }],
      type: "REVIEW_REQUESTED",
      subjectKey: "notification_review_requested_subject",
      bodyKey: "notification_review_requested_body",
      workspaceId: "ws7",
    });

    // Now email becomes unconfigured
    emailConfigured = false;
    const summary = await dispatchPendingNotificationEmails({
      now: new Date(),
    });

    expect(summary.skipped).toBe(1);
    const row = findDelivery("evt-007", "u7", "email")!;
    expect(row.status).toBe("SKIPPED");
    expect(row.errorCode).toBe("EMAIL_UNCONFIGURED");
  });

  test("status transitions: PENDING → SENT on success", async () => {
    emailConfigured = true;

    await sendTransactionalNotification({
      eventId: "evt-008",
      recipients: [{ userId: "u8", email: "u8@example.com", locale: "en" }],
      type: "REVIEW_REQUESTED",
      subjectKey: "notification_review_requested_subject",
      bodyKey: "notification_review_requested_body",
      workspaceId: "ws8",
    });

    const before = findDelivery("evt-008", "u8", "email")!;
    expect(before.status).toBe("PENDING");

    await dispatchPendingNotificationEmails({
      now: new Date(),
      send: async () => ({ ok: true, id: "re-1", provider: "resend" }),
    });

    const after = findDelivery("evt-008", "u8", "email")!;
    expect(after.status).toBe("SENT");
  });

  test("status transitions: PENDING → FAILED after max retries", async () => {
    emailConfigured = true;

    await sendTransactionalNotification({
      eventId: "evt-009",
      recipients: [{ userId: "u9", email: "u9@example.com", locale: "ar" }],
      type: "REVIEW_REQUESTED",
      subjectKey: "notification_review_requested_subject",
      bodyKey: "notification_review_requested_body",
      workspaceId: "ws9",
    });

    for (let i = 0; i < NOTIFICATION_MAX_ATTEMPTS; i++) {
      await dispatchPendingNotificationEmails({
        now: new Date(Date.now() + (i + 1) * 600_000),
        send: async () => ({ ok: false, skipped: false, error: "FAIL" }),
      });
    }

    const row = findDelivery("evt-009", "u9", "email")!;
    expect(row.status).toBe("FAILED");
    expect(row.attemptCount).toBe(NOTIFICATION_MAX_ATTEMPTS);
  });

  test("claim lease prevents concurrent double-send", async () => {
    emailConfigured = true;

    await sendTransactionalNotification({
      eventId: "evt-010",
      recipients: [{ userId: "u10", email: "u10@example.com", locale: "ar" }],
      type: "REVIEW_REQUESTED",
      subjectKey: "notification_review_requested_subject",
      bodyKey: "notification_review_requested_body",
      workspaceId: "ws10",
    });

    const now = new Date();
    // First worker claims
    const s1 = await dispatchPendingNotificationEmails({
      now,
      workerId: "w1",
      send: async () => ({ ok: true, id: "re-1", provider: "resend" }),
    });
    expect(s1.sent).toBe(1);

    // Second worker should find nothing (row is SENT)
    const s2 = await dispatchPendingNotificationEmails({
      now,
      workerId: "w2",
      send: async () => ({ ok: true, id: "re-2", provider: "resend" }),
    });
    expect(s2.claimed).toBe(0);
    expect(s2.sent).toBe(0);
  });

  test("provider timeout is caught and treated as retryable failure", async () => {
    emailConfigured = true;

    await sendTransactionalNotification({
      eventId: "evt-011",
      recipients: [{ userId: "u11", email: "u11@example.com", locale: "ar" }],
      type: "REVIEW_REQUESTED",
      subjectKey: "notification_review_requested_subject",
      bodyKey: "notification_review_requested_body",
      workspaceId: "ws11",
    });

    const summary = await dispatchPendingNotificationEmails({
      now: new Date(),
      send: async () => {
        throw new Error("NOTIFICATION_PROVIDER_TIMEOUT");
      },
    });

    expect(summary.retried).toBe(1);
    const row = findDelivery("evt-011", "u11", "email")!;
    expect(row.status).toBe("PENDING");
    expect(row.attemptCount).toBe(1);
    expect(row.errorCode).toBe("EMAIL_SEND_FAILED");
  });

  test("multiple recipients: each gets its own in-app and email delivery row", async () => {
    emailConfigured = true;

    await sendTransactionalNotification({
      eventId: "evt-012",
      recipients: [
        { userId: "uA", email: "a@example.com", locale: "ar" },
        { userId: "uB", email: "b@example.com", locale: "en" },
        { userId: "uC", email: "c@example.com", locale: "ar" },
      ],
      type: "REVIEW_REQUESTED",
      subjectKey: "notification_review_requested_subject",
      bodyKey: "notification_review_requested_body",
      workspaceId: "ws12",
    });

    expect(findDelivery("evt-012", "uA", "in_app")).toBeDefined();
    expect(findDelivery("evt-012", "uB", "in_app")).toBeDefined();
    expect(findDelivery("evt-012", "uC", "in_app")).toBeDefined();
    expect(findDelivery("evt-012", "uA", "email")!.status).toBe("PENDING");
    expect(findDelivery("evt-012", "uB", "email")!.status).toBe("PENDING");
    expect(findDelivery("evt-012", "uC", "email")!.status).toBe("PENDING");

    const summary = await dispatchPendingNotificationEmails({
      now: new Date(),
      send: async () => ({ ok: true, id: "re-x", provider: "resend" }),
    });
    expect(summary.sent).toBe(3);
  });
});
