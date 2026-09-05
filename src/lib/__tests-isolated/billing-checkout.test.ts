/**
 * Behavioral contract: `POST /api/billing/checkout` creates exactly one invoice.
 *
 * Historical bug: a recurring checkout created a one-time SendPayment invoice
 * (A), returned its URL, and then created the recurring profile whose own
 * initial invoice (B) carried the payment URL that was thrown away. The
 * customer paid A; B was never paid; the profile stayed DRAFT forever and
 * answered every later checkout with 409 RECURRING_PROFILE_EXISTS.
 *
 * Contract: recurring mode sends the customer to the recurring profile's
 * initial invoice and stores that invoice on the checkout; single mode sends
 * them to a one-time invoice; a recurring failure leaves no orphan invoice.
 */

import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;

const sendPaymentCalls: Row[] = [];
const startRecurringCalls: Row[] = [];
const checkoutUpdates: Row[] = [];
const billingRecordUpdates: Row[] = [];
const analyticsEvents: Row[] = [];
let recurringFailure: Error | null = null;
let existingSubscription: Row | null = { id: "sub-1" };

const PLAN = {
  id: "plan-pro",
  name: "PRO",
  priceMonthly: 999,
  priceYearly: 9990,
  currency: "SAR",
  isActive: true,
  isPublic: true,
};

function post(body: Row): NextRequest {
  return new NextRequest("http://localhost:3000/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

let routePost: typeof import("@/app/api/billing/checkout/route").POST;

beforeAll(async () => {
  mock.module("@/lib/db", () => ({
    db: {
      subscriptionPlan: { findFirst: mock(async () => PLAN) },
      billingRecord: {
        create: mock(async ({ data }: { data: Row }) => ({ id: "rec-1", ...data })),
        update: mock(async (args: Row) => {
          billingRecordUpdates.push(args);
          return { id: "rec-1" };
        }),
      },
      paymentCheckout: {
        create: mock(async ({ data }: { data: Row }) => ({ id: "chk-1", ...data })),
        update: mock(async (args: Row) => {
          checkoutUpdates.push(args);
          return { id: "chk-1" };
        }),
      },
      subscription: {
        findUnique: mock(async () => existingSubscription),
        create: mock(async () => ({ id: "sub-new" })),
      },
      auditLog: { create: mock(async ({ data }: { data: Row }) => data) },
    },
  }));

  // The real `withTenant` runs, so thrown ApiErrors reach the client through
  // the real bilingual mapper; only the session and tenant lookups are faked.
  const auth = await import("@/lib/auth");
  mock.module("@/lib/auth", () => ({
    ...auth,
    requireSession: mock(async () => ({
      user: {
        id: "user-1",
        email: "payer@example.test",
        name: "Payer",
        role: "OWNER",
        emailVerified: true,
        workspaceId: "ws-1",
      },
    })),
  }));

  const workspaceContext = await import("@/lib/workspace-context");
  mock.module("@/lib/workspace-context", () => ({
    ...workspaceContext,
    getTenantContext: mock(async () => ({
      workspace: { id: "ws-1" },
      brandProfile: null,
      userId: "user-1",
      membershipRole: "OWNER",
    })),
  }));

  mock.module("@/lib/ai-rate-limit", () => ({
    checkAiRateLimit: mock(async () => false),
  }));

  const myfatoorah = await import("@/lib/myfatoorah");
  mock.module("@/lib/myfatoorah", () => ({
    ...myfatoorah,
    appBaseUrl: () => "https://app.example.test",
    sendPayment: mock(async (input: Row) => {
      sendPaymentCalls.push(input);
      return {
        invoiceId: "INV-ONE-TIME",
        invoiceUrl: "https://pay.example.test/one-time",
        customerReference: input.customerReference,
      };
    }),
  }));

  const recurring = await import("@/lib/recurring-billing");
  mock.module("@/lib/recurring-billing", () => ({
    ...recurring,
    startRecurringProfile: mock(async (input: Row) => {
      startRecurringCalls.push(input);
      if (recurringFailure) throw recurringFailure;
      return {
        id: "profile-1",
        recurringId: "REC-1",
        status: "DRAFT",
        state: "DRAFT",
        initialInvoiceId: "INV-RECURRING-INITIAL",
        paymentUrl: "https://pay.example.test/recurring-initial",
      };
    }),
  }));

  const analytics = await import("@/lib/analytics-collector");
  mock.module("@/lib/analytics-collector", () => ({
    ...analytics,
    recordActivationAnalyticsEvent: mock(async (input: Row) => {
      analyticsEvents.push(input);
      return { outcome: "appended", eventKey: "k", reason: null };
    }),
  }));

  ({ POST: routePost } = await import("@/app/api/billing/checkout/route"));
});

beforeEach(() => {
  sendPaymentCalls.length = 0;
  startRecurringCalls.length = 0;
  checkoutUpdates.length = 0;
  billingRecordUpdates.length = 0;
  analyticsEvents.length = 0;
  recurringFailure = null;
  existingSubscription = { id: "sub-1" };
});

describe("POST /api/billing/checkout creates one invoice", () => {
  test("recurring mode pays the recurring profile's initial invoice and never a one-time one", async () => {
    // Act
    const res = await routePost(
      post({ planId: PLAN.id, billingCycle: "MONTHLY", billingMode: "recurring", locale: "en" })
    );
    const body = (await res.json()) as Row;

    // Assert: one provider invoice, and it is the recurring one.
    expect(res.status).toBe(200);
    expect(sendPaymentCalls).toHaveLength(0);
    expect(startRecurringCalls).toHaveLength(1);
    expect(startRecurringCalls[0]).toMatchObject({
      userId: "user-1",
      subscriptionId: "sub-1",
      planId: PLAN.id,
      interval: "MONTHLY",
      language: "EN",
    });
    expect(body.paymentUrl).toBe("https://pay.example.test/recurring-initial");
    expect(body.invoiceId).toBe("INV-RECURRING-INITIAL");
    expect(body.recurringProfileId).toBe("profile-1");

    // The checkout row names that invoice, so the webhook for it resolves here.
    expect(checkoutUpdates).toContainEqual({
      where: { id: "chk-1" },
      data: {
        invoiceId: "INV-RECURRING-INITIAL",
        paymentUrl: "https://pay.example.test/recurring-initial",
      },
    });
    expect(billingRecordUpdates).toContainEqual({
      where: { id: "rec-1" },
      data: { externalInvoiceId: "INV-RECURRING-INITIAL" },
    });
  });

  test("single mode sends a one-time invoice and sets up no profile", async () => {
    const res = await routePost(
      post({ planId: PLAN.id, billingCycle: "YEARLY", billingMode: "single" })
    );
    const body = (await res.json()) as Row;

    expect(res.status).toBe(200);
    expect(startRecurringCalls).toHaveLength(0);
    expect(sendPaymentCalls).toHaveLength(1);
    expect(body.paymentUrl).toBe("https://pay.example.test/one-time");
    expect(body.invoiceId).toBe("INV-ONE-TIME");
    expect(body.recurringProfileId).toBeNull();
    expect(checkoutUpdates).toContainEqual({
      where: { id: "chk-1" },
      data: { invoiceId: "INV-ONE-TIME", paymentUrl: "https://pay.example.test/one-time" },
    });
  });

  test("a recurring failure surfaces its stable code and leaves no orphan invoice", async () => {
    const { RecurringBillingError } = await import("@/lib/recurring-billing");
    recurringFailure = new RecurringBillingError(
      "Subscription already holds a draft recurring profile",
      "RECURRING_PROFILE_EXISTS",
      409
    );

    const res = await routePost(
      post({ planId: PLAN.id, billingCycle: "MONTHLY", billingMode: "recurring" })
    );
    const body = (await res.json()) as Row;

    expect(res.status).toBe(409);
    expect(body.code).toBe("RECURRING_PROFILE_EXISTS");
    // Nothing was created at the provider for the customer to pay by mistake.
    expect(sendPaymentCalls).toHaveLength(0);
    // The checkout is closed as failed rather than left pending forever.
    expect(checkoutUpdates).toContainEqual(
      expect.objectContaining({
        where: { id: "chk-1" },
        data: expect.objectContaining({ status: "FAILED" }),
      })
    );
  });

  test("a recurring profile without a payable invoice is refused, not half-created", async () => {
    const recurring = await import("@/lib/recurring-billing");
    (recurring.startRecurringProfile as unknown as ReturnType<typeof mock>).mockImplementationOnce(
      async () => ({
        id: "profile-2",
        recurringId: "REC-2",
        status: "DRAFT",
        state: "DRAFT",
        initialInvoiceId: null,
        paymentUrl: null,
      })
    );

    const res = await routePost(
      post({ planId: PLAN.id, billingCycle: "MONTHLY", billingMode: "recurring" })
    );
    const body = (await res.json()) as Row;

    expect(res.status).toBe(503);
    expect(body.code).toBe("RECURRING_UNAVAILABLE");
    expect(sendPaymentCalls).toHaveLength(0);
  });

  test("records checkout_started once, keyed to the checkout row", async () => {
    await routePost(
      post({ planId: PLAN.id, billingCycle: "MONTHLY", billingMode: "single", locale: "ar" })
    );

    expect(analyticsEvents).toHaveLength(1);
    expect(analyticsEvents[0]).toMatchObject({
      eventType: "checkout_started",
      entityId: "chk-1",
      mutationRef: "chk-1",
      metadata: {
        planId: PLAN.id,
        billingCycle: "MONTHLY",
        checkoutId: "chk-1",
        locale: "ar",
      },
    });
  });
});
