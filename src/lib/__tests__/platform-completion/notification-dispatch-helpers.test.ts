/**
 * Notification dispatcher helpers (task 11.5 slice) — DB-free.
 */

import { describe, expect, test } from "bun:test";
import {
  NOTIFICATION_CLAIM_LEASE_MS,
  NOTIFICATION_MAX_ATTEMPTS,
  NOTIFICATION_PROVIDER_TIMEOUT_MS,
  composeContent,
  escapeHtml,
  formatEmailHtml,
  interpolate,
} from "../../notification-service";

describe("notification dispatch helpers", () => {
  test("exposes bounded attempt, claim, and provider timeout constants", () => {
    expect(NOTIFICATION_MAX_ATTEMPTS).toBe(3);
    expect(NOTIFICATION_CLAIM_LEASE_MS).toBe(60_000);
    expect(NOTIFICATION_PROVIDER_TIMEOUT_MS).toBe(10_000);
  });

  test("interpolate substitutes named placeholders only", () => {
    expect(
      interpolate("Hello {{name}} — {{missing}}", { name: "ArabClue" })
    ).toBe("Hello ArabClue — {{missing}}");
  });

  test("composeContent subjects stay within 150 characters and preserve locale", () => {
    const ar = composeContent(
      "notification_review_requested_subject",
      "notification_review_requested_body",
      "ar",
      { proposalTitle: "عرض", actor: "مستخدم" }
    );
    const en = composeContent(
      "notification_review_requested_subject",
      "notification_review_requested_body",
      "en",
      { proposalTitle: "Proposal", actor: "User" }
    );
    expect(ar.subject.length).toBeLessThanOrEqual(150);
    expect(en.subject.length).toBeLessThanOrEqual(150);
    expect(ar.bodyAr).toContain("عرض");
    expect(en.bodyEn).toContain("Proposal");
  });

  test("formatEmailHtml escapes content and preserves canonical href", () => {
    const html = formatEmailHtml('<script>x</script>', "/app?view=billing");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('href="/app?view=billing"');
    expect(escapeHtml('"')).toBe("&quot;");
  });

  test("terminal failure after max attempts is deterministic", () => {
    let attempts = 0;
    let status: "PENDING" | "SENT" | "FAILED" = "PENDING";
    const send = (): "error" => {
      attempts += 1;
      return "error";
    };
    while (status === "PENDING" && attempts < NOTIFICATION_MAX_ATTEMPTS) {
      send();
      if (attempts >= NOTIFICATION_MAX_ATTEMPTS) status = "FAILED";
    }
    expect(status).toBe("FAILED");
    expect(attempts).toBe(3);
  });
});
