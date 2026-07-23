import { describe, expect, test } from "bun:test";
import { dispatchOutboundWebhook } from "@/lib/outbound-webhook";

describe("outbound webhook", () => {
  test("skips when WEBHOOK_URL unset", async () => {
    const prev = process.env.WEBHOOK_URL;
    delete process.env.WEBHOOK_URL;
    const res = await dispatchOutboundWebhook({ event: "test.ping" });
    expect(res.ok).toBe(true);
    expect(res.skipped).toBe(true);
    if (prev !== undefined) process.env.WEBHOOK_URL = prev;
  });

  test("rejects non-http URLs", async () => {
    const prev = process.env.WEBHOOK_URL;
    process.env.WEBHOOK_URL = "ftp://example.com/hook";
    const res = await dispatchOutboundWebhook({ event: "test.ping" });
    expect(res.ok).toBe(false);
    if (prev !== undefined) process.env.WEBHOOK_URL = prev;
    else delete process.env.WEBHOOK_URL;
  });
});
