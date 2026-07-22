import { describe, expect, test } from "bun:test";
import crypto from "crypto";
import { billingCheckoutSchema, workspaceSwitchSchema } from "../validation";
import { verifyWebhookSignature } from "../myfatoorah";

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

describe("MyFatoorah webhook signature", () => {
  test("accepts matching HMAC in development when secret set", async () => {
    const secret = "test-webhook-secret";
    process.env.MYFATOORAH_WEBHOOK_SECRET = secret;
    const body = JSON.stringify({
      Event: "TransactionsStatusChanged",
      Data: { InvoiceStatus: "Paid", InvoiceId: 123 },
    });
    const sig = crypto.createHmac("sha256", secret).update(body).digest("base64");
    await expect(verifyWebhookSignature(body, sig)).resolves.toBe(true);
    await expect(verifyWebhookSignature(body, "bad")).resolves.toBe(false);
    delete process.env.MYFATOORAH_WEBHOOK_SECRET;
  });
});
