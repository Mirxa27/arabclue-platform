import { describe, expect, test } from "bun:test";
import {
  EMAIL_FAILURE_DETAIL_MAX,
  describeEmailFailure,
  isEmailConfigured,
  sendEmail,
} from "../email";

describe("describeEmailFailure", () => {
  test("carries the transport reason, the provider error, and nothing on success", () => {
    expect(
      describeEmailFailure({ ok: true, id: "abc", provider: "smtp" })
    ).toBeUndefined();
    expect(
      describeEmailFailure({ ok: false, skipped: true, reason: "no transport" })
    ).toBe("no transport");
    expect(
      describeEmailFailure({
        ok: false,
        skipped: false,
        error: "Invalid login: 535 Incorrect authentication data",
      })
    ).toBe("Invalid login: 535 Incorrect authentication data");
  });

  test("bounds the detail so a relay cannot write an unbounded audit row", () => {
    const detail = describeEmailFailure({
      ok: false,
      skipped: false,
      error: "x".repeat(EMAIL_FAILURE_DETAIL_MAX + 500),
    });
    expect(detail).toHaveLength(EMAIL_FAILURE_DETAIL_MAX);
  });
});

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
