/**
 * The email outbox never delivered.
 *
 * A queued row carried a 30-minute deliveryDeadlineAt while the only dispatcher
 * was a daily cron whose candidate query required the deadline to be in the
 * future, so almost every email expired unclaimed and sat PENDING forever.
 * Two fixes, both asserted here against an in-memory outbox (no database):
 * one inline provider attempt right after the row commits, and a 26-hour
 * deadline so the daily sweep still finds the stragglers — plus a wall-clock
 * budget so the sweep never outlives its function.
 */

import { describe, expect, test } from "bun:test";
import type { NotificationDelivery } from "@prisma/client";
import {
  NOTIFICATION_DELIVERY_DEADLINE_MS,
  NOTIFICATION_MAX_ATTEMPTS,
  attemptInlineEmailDispatch,
  buildOutboxRowData,
  dispatchPendingNotificationEmails,
  reviewDecisionEventId,
  subscriptionAlertEventId,
  type NotificationOutboxClient,
  type SendTransactionalNotificationInput,
} from "../notification-service";
import { normalizeNotificationHref } from "../notification-ids";
import type { SendEmailResult } from "../email";

const HOUR_MS = 60 * 60 * 1000;
const COMMITTED_AT = new Date("2026-06-01T09:00:00.000Z");

const INPUT: SendTransactionalNotificationInput = {
  eventId: "proposal_review_requested_p1",
  recipients: [{ userId: "u1", email: "u1@example.com", locale: "ar" }],
  type: "REVIEW_REQUESTED",
  subjectKey: "notification_review_requested_subject",
  bodyKey: "notification_review_requested_body",
  bodyParams: { proposalTitle: "P1", projectTitle: "T1" },
  href: "/app/reviews",
  workspaceId: "ws1",
};

/* ------------------------------------------------------------------------ */
/* In-memory outbox that honours the where-clauses the dispatcher issues     */
/* ------------------------------------------------------------------------ */

type Row = NotificationDelivery;
type Where = Record<string, unknown>;

function matchesDate(value: Date | null, condition: unknown): boolean {
  if (condition === null) return value === null;
  if (condition instanceof Date) return value?.getTime() === condition.getTime();
  const c = condition as { lte?: Date; gt?: Date };
  if (value === null) return false;
  if (c.lte && value.getTime() > c.lte.getTime()) return false;
  if (c.gt && value.getTime() <= c.gt.getTime()) return false;
  return true;
}

function matches(row: Row, where: Where): boolean {
  for (const [key, condition] of Object.entries(where)) {
    if (key === "AND") {
      if (!(condition as Where[]).every((w) => matches(row, w))) return false;
    } else if (key === "OR") {
      if (!(condition as Where[]).some((w) => matches(row, w))) return false;
    } else if (key === "attemptCount") {
      const c = condition as number | { lt: number };
      if (typeof c === "number" ? row.attemptCount !== c : row.attemptCount >= c.lt) {
        return false;
      }
    } else if (
      key === "nextAttemptAt" ||
      key === "claimExpiresAt" ||
      key === "deliveryDeadlineAt"
    ) {
      if (!matchesDate(row[key], condition)) return false;
    } else if ((row as unknown as Record<string, unknown>)[key] !== condition) {
      return false;
    }
  }
  return true;
}

function applyData(row: Row, data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    const target = row as unknown as Record<string, unknown>;
    if (value && typeof value === "object" && "increment" in (value as object)) {
      target[key] = ((target[key] as number) ?? 0) + (value as { increment: number }).increment;
    } else {
      target[key] = value;
    }
  }
}

function createFakeOutbox() {
  const rows: Row[] = [];
  const client = {
    notificationDelivery: {
      async create({ data }: { data: Record<string, unknown> }) {
        const row = {
          id: `nd-${rows.length + 1}`,
          workspaceId: null,
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
          createdAt: COMMITTED_AT,
          updatedAt: COMMITTED_AT,
          ...data,
        } as Row;
        rows.push(row);
        return { ...row };
      },
      async findMany({ where, take }: { where: Where; take?: number }) {
        return rows.filter((r) => matches(r, where)).slice(0, take ?? rows.length).map((r) => ({ ...r }));
      },
      async updateMany({ where, data }: { where: Where; data: Record<string, unknown> }) {
        let count = 0;
        for (const row of rows) {
          if (!matches(row, where)) continue;
          applyData(row, data);
          count += 1;
        }
        return { count };
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const row = rows.find((r) => r.id === where.id);
        if (!row) throw new Error(`no row ${where.id}`);
        applyData(row, data);
        return { ...row };
      },
    },
  };
  return {
    rows,
    client: client as unknown as NotificationOutboxClient,
    row: (id: string) => rows.find((r) => r.id === id)!,
  };
}

function okSend(): Promise<SendEmailResult> {
  return Promise.resolve({ ok: true, id: "re-1", provider: "resend" });
}

async function queueRow(outbox: ReturnType<typeof createFakeOutbox>): Promise<Row> {
  return outbox.client.notificationDelivery.create({
    data: buildOutboxRowData(INPUT, INPUT.recipients[0]!, COMMITTED_AT),
  });
}

/* ------------------------------------------------------------------------ */

describe("outbox row deadline", () => {
  test("a queued row is deliverable for 26 hours, not 30 minutes", () => {
    const data = buildOutboxRowData(INPUT, INPUT.recipients[0]!, COMMITTED_AT);

    expect(NOTIFICATION_DELIVERY_DEADLINE_MS).toBe(26 * HOUR_MS);
    expect(data.deliveryDeadlineAt.getTime() - COMMITTED_AT.getTime()).toBe(26 * HOUR_MS);
    expect(data.status).toBe("PENDING");
    expect(data.nextAttemptAt).toEqual(COMMITTED_AT);
  });

  test("the daily sweep still finds and sends the row 20 hours later", async () => {
    // Arrange: the inline attempt never happened (queued only).
    const outbox = createFakeOutbox();
    const queued = await queueRow(outbox);
    let sends = 0;

    // Act: the cron runs the next morning, 20 hours after the commit.
    const summary = await dispatchPendingNotificationEmails({
      client: outbox.client,
      emailConfigured: true,
      now: new Date(COMMITTED_AT.getTime() + 20 * HOUR_MS),
      send: () => {
        sends += 1;
        return okSend();
      },
    });

    // Assert
    expect(summary).toMatchObject({ claimed: 1, sent: 1, expired: 0, budgetExhausted: false });
    expect(sends).toBe(1);
    expect(outbox.row(queued.id).status).toBe("SENT");
    expect(outbox.row(queued.id).providerMessageId).toBe("re-1");
  });

  test("a row past its deadline is closed as FAILED instead of lingering PENDING", async () => {
    const outbox = createFakeOutbox();
    const queued = await queueRow(outbox);
    let sends = 0;

    const summary = await dispatchPendingNotificationEmails({
      client: outbox.client,
      emailConfigured: true,
      now: new Date(COMMITTED_AT.getTime() + 27 * HOUR_MS),
      send: () => {
        sends += 1;
        return okSend();
      },
    });

    expect(sends).toBe(0);
    expect(summary.expired).toBe(1);
    expect(summary.sent).toBe(0);
    const row = outbox.row(queued.id);
    expect(row.status).toBe("FAILED");
    expect(row.errorCode).toBe("DELIVERY_DEADLINE_EXCEEDED");
  });
});

describe("inline dispatch right after commit", () => {
  test("marks the committed row SENT when the provider accepts", async () => {
    const outbox = createFakeOutbox();
    const queued = await queueRow(outbox);

    const outcome = await attemptInlineEmailDispatch(queued, {
      client: outbox.client,
      send: okSend,
      now: COMMITTED_AT,
      workerId: "inline-test",
    });

    expect(outcome).toEqual({ outcome: "sent", providerMessageId: "re-1" });
    const row = outbox.row(queued.id);
    expect(row.status).toBe("SENT");
    expect(row.attemptCount).toBe(1);
    expect(row.claimedBy).toBeNull();
    expect(row.nextAttemptAt).toBeNull();
  });

  test("a provider failure leaves the row queued for the sweep and never throws", async () => {
    const outbox = createFakeOutbox();
    const queued = await queueRow(outbox);

    const outcome = await attemptInlineEmailDispatch(queued, {
      client: outbox.client,
      send: () => Promise.reject(new Error("SMTP down")),
      now: COMMITTED_AT,
      workerId: "inline-test",
    });

    expect(outcome.outcome).toBe("retried");
    const row = outbox.row(queued.id);
    expect(row.status).toBe("PENDING");
    expect(row.attemptCount).toBe(1);
    expect(row.errorCode).toBe("EMAIL_SEND_FAILED");
    expect(row.nextAttemptAt).not.toBeNull();
    expect(row.attemptCount).toBeLessThan(NOTIFICATION_MAX_ATTEMPTS);
  });

  test("a persistence error during the inline attempt is swallowed, not thrown", async () => {
    const outbox = createFakeOutbox();
    const queued = await queueRow(outbox);
    const broken = {
      notificationDelivery: {
        ...outbox.client.notificationDelivery,
        updateMany: () => Promise.reject(new Error("connection reset")),
      },
    } as unknown as NotificationOutboxClient;

    const outcome = await attemptInlineEmailDispatch(queued, {
      client: broken,
      send: okSend,
      now: COMMITTED_AT,
      workerId: "inline-test",
    });

    expect(outcome.outcome).toBe("retried");
    expect(outbox.row(queued.id).status).toBe("PENDING");
  });
});

describe("sweep wall-clock budget", () => {
  test("stops claiming once the budget is spent so the cron ends inside maxDuration", async () => {
    const outbox = createFakeOutbox();
    await queueRow(outbox);
    await outbox.client.notificationDelivery.create({
      data: buildOutboxRowData(
        { ...INPUT, eventId: "other" },
        { userId: "u2", email: "u2@example.com", locale: "en" },
        COMMITTED_AT
      ),
    });

    const summary = await dispatchPendingNotificationEmails({
      client: outbox.client,
      emailConfigured: true,
      now: new Date(COMMITTED_AT.getTime() + HOUR_MS),
      send: okSend,
      budgetMs: 0,
    });

    expect(summary.budgetExhausted).toBe(true);
    expect(summary.claimed).toBe(0);
    expect(outbox.rows.every((r) => r.status === "PENDING")).toBe(true);
  });
});

describe("dedup keys name the state, not a random draw", () => {
  test("a review decision keys on the review, or on proposal + outcome", () => {
    const keyed = reviewDecisionEventId({ proposalId: "p1", decision: "APPROVED", reviewId: "r9" });
    expect(keyed).toBe("proposal_review_decision_r9");
    expect(reviewDecisionEventId({ proposalId: "p1", decision: "APPROVED", reviewId: "r9" })).toBe(keyed);

    const fallback = reviewDecisionEventId({ proposalId: "p1", decision: "REJECTED" });
    expect(fallback).toBe("proposal_review_decision_p1_REJECTED");
    expect(fallback).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  test("a subscription alert keys on the state reference, or on the UTC day", () => {
    const now = new Date("2026-06-01T23:59:00.000Z");
    expect(
      subscriptionAlertEventId({ kind: "failed", subscriptionId: "s1", stateRef: "attempt-7" })
    ).toBe("subscription_failed_s1_attempt-7");
    const daily = subscriptionAlertEventId({ kind: "past_due", subscriptionId: "s1", now });
    expect(daily).toBe("subscription_past_due_s1_2026-06-01");
    // The same transition on the same day is the same event.
    expect(subscriptionAlertEventId({ kind: "past_due", subscriptionId: "s1", now })).toBe(daily);
  });
});

describe("the bell receives a view marker for a canonical path", () => {
  test("canonical app paths, legacy view queries, and bare views all resolve", () => {
    expect(normalizeNotificationHref("/app/billing")).toBe("?view=billing");
    expect(normalizeNotificationHref("/app/reviews")).toBe("?view=reviews");
    expect(normalizeNotificationHref("/app?view=billing")).toBe("?view=billing");
    expect(normalizeNotificationHref("?view=account")).toBe("?view=account");
    expect(normalizeNotificationHref("account")).toBe("?view=account");
    expect(normalizeNotificationHref(null)).toBeUndefined();
  });
});
