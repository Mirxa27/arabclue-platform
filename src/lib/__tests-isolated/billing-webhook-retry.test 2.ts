/**
 * Behavioral contract: MyFatoorah recurring-charge webhooks stay retryable.
 *
 * When `handleRecurringChargeSuccess` / `handleRecurringChargeFailure` throw,
 * the route must mark the persisted event FAILED and answer 5xx so MyFatoorah
 * redelivers. The historical bug fell through to the acknowledge path,
 * marking the event PROCESSED and answering HTTP 200 — an unapplied charge was
 * then never retried while the customer had been billed.
 */

import { beforeAll, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

type EventRow = {
  id: string;
  eventFingerprint: string;
  processingStatus: string;
  disposition: string | null;
  errorMessage: string | null;
};

const eventRows: EventRow[] = [];
let failChargeSuccess = false;
let failChargeFailure = false;

function makeWebhookRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/billing/webhook", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function recurringPayload(status: string) {
  return {
    Event: { Name: "RECURRING_UPDATES", Code: 1, Reference: "ref-1" },
    Data: {
      Recurring: { Id: "rec-1", Status: status },
      Invoice: { Id: "inv-9", ExternalIdentifier: "workspace-1" },
      Transaction: { PaymentId: "pay-9", Status: "SUCCESS" },
    },
  };
}

let routePost: typeof import("@/app/api/billing/webhook/route").POST;

beforeAll(async () => {
  mock.module("@/lib/db", () => ({
    db: {
      paymentWebhookEvent: {
        findUnique: mock(async ({ where }: { where: { eventFingerprint: string } }) =>
          eventRows.find((row) => row.eventFingerprint === where.eventFingerprint) ??
            null
        ),
        create: mock(async ({ data }: { data: Record<string, unknown> }) => {
          const row: EventRow = {
            id: `evt-${eventRows.length + 1}`,
            eventFingerprint: String(data.eventFingerprint),
            processingStatus: "RECEIVED",
            disposition: null,
            errorMessage: null,
          };
          eventRows.push(row);
          return row;
        }),
        update: mock(async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<EventRow>;
        }) => {
          const row = eventRows.find((r) => r.id === where.id);
          if (!row) throw new Error("unknown webhook event row");
          if (data.processingStatus !== undefined)
            row.processingStatus = data.processingStatus;
          if (data.disposition !== undefined) row.disposition = data.disposition;
          if (data.errorMessage !== undefined) row.errorMessage = data.errorMessage;
          return row;
        }),
      },
    },
  }));

  const myfatoorah = await import("@/lib/myfatoorah");
  mock.module("@/lib/myfatoorah", () => ({
    ...myfatoorah,
    verifyWebhookSignature: mock(async () => true),
    webhookEventFingerprint: mock(
      (_payload: unknown, _signature: string | null) =>
        `fp-${eventRows.length + 1}`
    ),
  }));

  mock.module("@/lib/recurring-billing", () => ({
    handleRecurringChargeSuccess: mock(async () => {
      if (failChargeSuccess) throw new Error("billing row write failed");
    }),
    handleRecurringChargeFailure: mock(async () => {
      if (failChargeFailure) throw new Error("profile update failed");
    }),
  }));

  ({ POST: routePost } = await import("@/app/api/billing/webhook/route"));
});

describe("billing webhook recurring-charge retry contract", () => {
  test("successful charge applies and settles PROCESSED with HTTP 200", async () => {
    const res = await routePost(makeWebhookRequest(recurringPayload("PAID")));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; action: string };
    expect(body.ok).toBe(true);
    expect(body.action).toBe("charge_success");
    const row = eventRows[eventRows.length - 1]!;
    expect(row.processingStatus).toBe("PROCESSED");
    expect(row.disposition).toBe("recurring_charge_success");
  });

  test("failed charge-success handler stays FAILED and answers 500 for redelivery", async () => {
    failChargeSuccess = true;
    try {
      const res = await routePost(makeWebhookRequest(recurringPayload("PAID")));
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string; code?: string };
      expect(body.code).toBe("RECURRING_CHARGE_APPLY_FAILED");
      const row = eventRows[eventRows.length - 1]!;
      expect(row.processingStatus).toBe("FAILED");
      expect(row.errorMessage).toContain("billing row write failed");
    } finally {
      failChargeSuccess = false;
    }
  });

  test("failed charge-failure handler stays FAILED and answers 500 for redelivery", async () => {
    failChargeFailure = true;
    try {
      const res = await routePost(
        makeWebhookRequest(recurringPayload("FAILED"))
      );
      expect(res.status).toBe(500);
      const body = (await res.json()) as { code?: string };
      expect(body.code).toBe("RECURRING_CHARGE_FAILURE_NOT_RECORDED");
      const row = eventRows[eventRows.length - 1]!;
      expect(row.processingStatus).toBe("FAILED");
    } finally {
      failChargeFailure = false;
    }
  });

  test("recorded charge failure settles PROCESSED so the provider stops retrying", async () => {
    const res = await routePost(makeWebhookRequest(recurringPayload("FAILED")));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { action: string };
    expect(body.action).toBe("charge_failure");
    const row = eventRows[eventRows.length - 1]!;
    expect(row.processingStatus).toBe("PROCESSED");
    expect(row.disposition).toBe("recurring_charge_failure");
  });
});
