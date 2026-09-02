/**
 * Behavioral contract: the redirect-confirmation endpoint the billing
 * callback page fetches (`GET /api/billing/callback`).
 *
 * Historical bug: the route file did not exist at all — the client page
 * fetched a 404 and every paying user saw "Payment not completed" until the
 * webhook or the daily reconcile cron caught up.
 *
 * Contract: authenticated user → resolve THEIR checkout by customerReference
 * (`ref`) or paymentId → verify with the gateway via `fulfillCheckout`
 * (never trust the redirect alone) → `{ ok: true }` or `{ ok: false, error }`.
 * Another user's checkout or an unknown reference must not leak state and
 * must not trigger a gateway inquiry.
 */

import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

type CheckoutRow = {
  id: string;
  userId: string;
  customerReference: string;
  paymentId: string | null;
};

const checkoutRows: CheckoutRow[] = [];
const fulfillCalls: Array<Record<string, unknown>> = [];
const auditRows: Array<Record<string, unknown>> = [];
let fulfillResult: { ok: boolean; checkoutId?: string; error?: string } = {
  ok: true,
  checkoutId: "chk-1",
};

function makeCallbackRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/billing/callback${query}`, {
    method: "GET",
  });
}

let routeGet: typeof import("@/app/api/billing/callback/route").GET;

beforeAll(async () => {
  mock.module("@/lib/db", () => ({
    db: {
      paymentCheckout: {
        findUnique: mock(
          async ({ where }: { where: { customerReference?: string } }) =>
            checkoutRows.find(
              (row) => row.customerReference === where.customerReference
            ) ?? null
        ),
        findFirst: mock(
          async ({ where }: { where: { paymentId?: string } }) =>
            checkoutRows.find((row) => row.paymentId === where.paymentId) ??
            null
        ),
      },
      auditLog: {
        create: mock(async ({ data }: { data: Record<string, unknown> }) => {
          auditRows.push(data);
          return data;
        }),
      },
    },
  }));

  const apiController = await import("@/lib/api-controller");
  mock.module("@/lib/api-controller", () => ({
    ...apiController,
    withTenant: async (
      _mode: unknown,
      fn: (ctx: {
        session: { user: { id: string; emailVerified: boolean } };
        workspace: { id: string };
        membershipRole: string;
      }) => Promise<Response>
    ) =>
      fn({
        session: { user: { id: "user-1", emailVerified: true } },
        workspace: { id: "ws-1" },
        membershipRole: "OWNER",
      }),
  }));

  mock.module("@/lib/ai-rate-limit", () => ({
    checkAiRateLimit: mock(async () => false),
  }));

  mock.module("@/lib/billing", () => ({
    fulfillCheckout: mock(async (opts: Record<string, unknown>) => {
      fulfillCalls.push(opts);
      return fulfillResult;
    }),
  }));

  ({ GET: routeGet } = await import("@/app/api/billing/callback/route"));
});

beforeEach(() => {
  checkoutRows.length = 0;
  fulfillCalls.length = 0;
  auditRows.length = 0;
  fulfillResult = { ok: true, checkoutId: "chk-1" };
});

describe("billing callback confirmation contract", () => {
  test("paid checkout owned by the caller returns ok:true and verifies via fulfillCheckout", async () => {
    checkoutRows.push({
      id: "chk-1",
      userId: "user-1",
      customerReference: "ref-1",
      paymentId: null,
    });

    const res = await routeGet(
      makeCallbackRequest("?ref=ref-1&paymentId=pay-1&status=success")
    );
    const body = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(fulfillCalls).toHaveLength(1);
    expect(fulfillCalls[0]).toEqual({ checkoutId: "chk-1", paymentId: "pay-1" });
  });

  test("unpaid checkout surfaces the gateway error without activating", async () => {
    checkoutRows.push({
      id: "chk-1",
      userId: "user-1",
      customerReference: "ref-1",
      paymentId: null,
    });
    fulfillResult = { ok: false, checkoutId: "chk-1", error: "Pending" };

    const res = await routeGet(makeCallbackRequest("?ref=ref-1"));
    const body = (await res.json()) as { ok: boolean; error?: string };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Pending");
  });

  test("another user's checkout is not fulfilled and does not leak state", async () => {
    checkoutRows.push({
      id: "chk-2",
      userId: "user-2",
      customerReference: "ref-2",
      paymentId: null,
    });

    const res = await routeGet(makeCallbackRequest("?ref=ref-2&paymentId=pay-2"));
    // The refusal is a registered bilingual failure now: the page reads `error`
    // as `{ar, en}` and callers compare `code` (register sweep 2026-09-02).
    const body = (await res.json()) as { ok: boolean; code?: string; error?: { ar: string; en: string } };

    expect(body.ok).toBe(false);
    expect(body.code).toBe("CHECKOUT_NOT_FOUND");
    expect(body.error?.ar).toBeTruthy();
    expect(fulfillCalls).toHaveLength(0);
  });

  // The uniform CHECKOUT_NOT_FOUND answer is what the caller sees; it must not
  // also make a cross-tenant probe invisible to the operator.
  test("reaching for another user's checkout is recorded as a WARN audit", async () => {
    checkoutRows.push({
      id: "chk-2",
      userId: "user-2",
      customerReference: "ref-2",
      paymentId: null,
    });

    await routeGet(makeCallbackRequest("?ref=ref-2"));

    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      userId: "user-1",
      action: "BILLING_CALLBACK",
      severity: "WARN",
      success: false,
    });
    expect(String(auditRows[0].details)).toContain("ref-2");
  });

  test("an unknown reference is not audited as a probe", async () => {
    await routeGet(makeCallbackRequest("?ref=never-existed"));

    expect(auditRows).toHaveLength(0);
  });

  // The one-time ErrorUrl is `/billing/callback?status=error` with no payment
  // reference at all, so "cancelled" has to be read off `status` before the
  // missing-reference branch or the user is told the wrong thing.
  test("a cancelled payment reports cancellation, not a missing reference", async () => {
    const res = await routeGet(makeCallbackRequest("?status=error"));
    const body = (await res.json()) as { ok: boolean; code?: string; error?: { ar: string; en: string } };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("PAYMENT_CANCELLED_OR_FAILED");
    expect(body.error?.en).toMatch(/cancelled/i);
    expect(fulfillCalls).toHaveLength(0);
  });

  test("status=error still verifies when the gateway returned a paymentId", async () => {
    checkoutRows.push({
      id: "chk-4",
      userId: "user-1",
      customerReference: "ref-4",
      paymentId: "pay-4",
    });
    fulfillResult = { ok: false, checkoutId: "chk-4", error: "Failed" };

    const res = await routeGet(
      makeCallbackRequest("?status=error&paymentId=pay-4")
    );
    const body = (await res.json()) as { ok: boolean; error?: string };

    expect(body.error).toBe("Failed");
    expect(fulfillCalls).toHaveLength(1);
  });

  test("missing ref and paymentId short-circuits without gateway calls", async () => {
    const res = await routeGet(makeCallbackRequest("?status=success"));
    const body = (await res.json()) as { ok: boolean; code?: string; error?: { ar: string; en: string } };

    expect(body.ok).toBe(false);
    expect(body.code).toBe("PAYMENT_REFERENCE_MISSING");
    expect(body.error?.ar).toBeTruthy();
    expect(fulfillCalls).toHaveLength(0);
  });

  test("falls back to paymentId lookup when ref is absent", async () => {
    checkoutRows.push({
      id: "chk-3",
      userId: "user-1",
      customerReference: "ref-3",
      paymentId: "pay-3",
    });

    const res = await routeGet(makeCallbackRequest("?paymentId=pay-3"));
    const body = (await res.json()) as { ok: boolean };

    expect(body.ok).toBe(true);
    expect(fulfillCalls[0]).toEqual({ checkoutId: "chk-3", paymentId: "pay-3" });
  });
});
