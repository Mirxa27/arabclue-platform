import { describe, expect, test } from "bun:test";
import crypto from "crypto";
import { billingCheckoutSchema, workspaceSwitchSchema } from "../validation";
import {
  verifyWebhookSignature,
  buildWebhookV2CanonicalString,
  signWebhookV2Canonical,
  resolveMyFatoorahBaseUrl,
  amountsMatch,
  webhookEventFingerprint,
  MYFATOORAH_ALLOWED_BASE_URLS,
} from "../myfatoorah";

describe("billing validation", () => {
  test("checkout requires planId and cycle", () => {
    const ok = billingCheckoutSchema.safeParse({
      planId: "plan_1",
      billingCycle: "MONTHLY",
    });
    expect(ok.success).toBe(true);

    const bad = billingCheckoutSchema.safeParse({
      planId: "",
      billingCycle: "WEEKLY",
    });
    expect(bad.success).toBe(false);
  });

  test("workspace switch requires workspaceId", () => {
    expect(
      workspaceSwitchSchema.safeParse({ workspaceId: "ws_1" }).success
    ).toBe(true);
    expect(workspaceSwitchSchema.safeParse({}).success).toBe(false);
  });
});

describe("MyFatoorah URL allowlist", () => {
  test("accepts official endpoints and aliases", () => {
    expect(resolveMyFatoorahBaseUrl("sandbox")).toBe(
      "https://apitest.myfatoorah.com"
    );
    expect(resolveMyFatoorahBaseUrl("production_sa")).toBe(
      "https://api-sa.myfatoorah.com"
    );
    expect(resolveMyFatoorahBaseUrl("https://api-sa.myfatoorah.com")).toBe(
      "https://api-sa.myfatoorah.com"
    );
    for (const u of MYFATOORAH_ALLOWED_BASE_URLS) {
      expect(resolveMyFatoorahBaseUrl(u)).toBe(u);
    }
  });

  test("rejects arbitrary URLs (SSRF guard)", () => {
    expect(() =>
      resolveMyFatoorahBaseUrl("https://evil.example.com")
    ).toThrow(/official MyFatoorah/);
  });
});

describe("MyFatoorah Webhook V2 signature", () => {
  test("verifies canonical field HMAC (PAYMENT_STATUS_CHANGED)", async () => {
    const secret = "test-webhook-secret";
    process.env.MYFATOORAH_WEBHOOK_SECRET = secret;
    const data = {
      Invoice: {
        Id: "6409988",
        Status: "PAID",
        ExternalIdentifier: "asdqwd-f13sdf-fasjkz",
      },
      Transaction: {
        Status: "SUCCESS",
        PaymentId: "07076409988323998875",
      },
    };
    const canonical = buildWebhookV2CanonicalString(
      "PAYMENT_STATUS_CHANGED",
      data
    );
    expect(canonical).toBe(
      "Invoice.Id=6409988,Invoice.Status=PAID,Transaction.Status=SUCCESS,Transaction.PaymentId=07076409988323998875,Invoice.ExternalIdentifier=asdqwd-f13sdf-fasjkz"
    );
    const sig = signWebhookV2Canonical(canonical, secret);
    const body = JSON.stringify({
      Event: { Code: 1, Name: "PAYMENT_STATUS_CHANGED", Reference: "WH-1" },
      Data: data,
    });
    await expect(verifyWebhookSignature(body, sig)).resolves.toBe(true);
    await expect(verifyWebhookSignature(body, "bad")).resolves.toBe(false);
    // Raw-body HMAC must NOT validate V2 events
    const rawSig = crypto.createHmac("sha256", secret).update(body).digest("base64");
    await expect(verifyWebhookSignature(body, rawSig)).resolves.toBe(false);
    delete process.env.MYFATOORAH_WEBHOOK_SECRET;
  });

  test("legacy V1 raw-body HMAC still accepted when Event.Name absent", async () => {
    const secret = "legacy-secret";
    process.env.MYFATOORAH_WEBHOOK_SECRET = secret;
    const body = JSON.stringify({
      EventType: "TransactionsStatusChanged",
      Data: { InvoiceStatus: "Paid", InvoiceId: 123 },
    });
    const sig = crypto.createHmac("sha256", secret).update(body).digest("base64");
    await expect(verifyWebhookSignature(body, sig)).resolves.toBe(true);
    delete process.env.MYFATOORAH_WEBHOOK_SECRET;
  });

  test("fingerprint is stable for idempotency", () => {
    const body = {
      Event: { Name: "PAYMENT_STATUS_CHANGED", Reference: "WH-9" },
      Data: {
        Invoice: { Id: "1", Status: "PAID", ExternalIdentifier: "ref" },
        Transaction: { Status: "SUCCESS", PaymentId: "p1" },
      },
    };
    const a = webhookEventFingerprint(body, "sig");
    const b = webhookEventFingerprint(body, "sig");
    expect(a).toBe(b);
    expect(webhookEventFingerprint(body, "other")).not.toBe(a);
  });
});

describe("payment amount verification", () => {
  test("accepts matching SAR amounts within tolerance", () => {
    expect(
      amountsMatch({
        expectedSar: 100,
        paidSar: 100,
        expectedCurrency: "SAR",
        paidCurrency: "SAR",
      })
    ).toBe(true);
    expect(
      amountsMatch({
        expectedSar: 100,
        paidSar: 99.5,
        expectedCurrency: "SAR",
        paidCurrency: "SAR",
      })
    ).toBe(false);
    expect(
      amountsMatch({
        expectedSar: 100,
        paidSar: 100,
        expectedCurrency: "SAR",
        paidCurrency: "USD",
      })
    ).toBe(false);
  });
});
