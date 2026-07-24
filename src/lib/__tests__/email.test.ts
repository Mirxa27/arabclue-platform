import { describe, expect, test } from "bun:test";
import { isEmailConfigured, sendEmail } from "../email";

describe("email degraded mode", () => {
  test("isEmailConfigured reflects RESEND_API_KEY", () => {
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    expect(isEmailConfigured()).toBe(false);
    process.env.RESEND_API_KEY = "re_test_key";
    expect(isEmailConfigured()).toBe(true);
    if (prev === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prev;
  });

  test("sendEmail skips without API key", async () => {
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const result = await sendEmail({
      to: "owner@example.com",
      subject: "Test",
      html: "<p>hi</p>",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.skipped).toBe(true);
    }
    if (prev === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prev;
  });
});
