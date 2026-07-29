/**
 * Feature: platform-completion, Property 23: Notification bodies are minimized
 */

import { describe, expect, test } from "bun:test";
import { composeContent } from "../../notification-service";

const FORBIDDEN_FIELD_PATTERNS = [
  /amount/i,
  /currency/i,
  /price/i,
  /invoice/i,
  /documentBody/i,
  /attachment/i,
  /markdown/i,
  /htmlContent/i,
  /commercial/i,
];

describe("Feature: platform-completion, Property 23: Notification bodies are minimized", () => {
  test("composed subjects/bodies exclude commercial and document fields across 100+ cases", () => {
    let cases = 0;
    const templates = [
      {
        subjectKey: "notification_review_requested_subject",
        bodyKey: "notification_review_requested_body",
        params: (seed: number) => ({
          proposalTitle: `Proposal ${seed}`,
          actor: `User ${seed % 11}`,
        }),
      },
      {
        subjectKey: "notification_review_decision_subject",
        bodyKey: "notification_review_decision_body",
        params: (seed: number) => ({
          proposalTitle: `Proposal ${seed}`,
          decision: seed % 2 === 0 ? "✓" : "✗",
        }),
      },
      {
        subjectKey: "notification_subscription_past_due_subject",
        bodyKey: "notification_subscription_past_due_body",
        params: () => ({}),
      },
    ] as const;

    for (let seed = 0; seed < 120; seed++) {
      const template = templates[seed % templates.length]!;
      const locale = seed % 2 === 0 ? "ar" : "en";
      const content = composeContent(
        template.subjectKey,
        template.bodyKey,
        locale,
        template.params(seed)
      );

      expect(content.subject.trim().length).toBeGreaterThan(0);
      expect(content.subject.length).toBeLessThanOrEqual(150);
      expect(content.bodyEn.trim().length).toBeGreaterThan(0);
      expect(content.bodyAr.trim().length).toBeGreaterThan(0);

      const blob = JSON.stringify(content);
      for (const pattern of FORBIDDEN_FIELD_PATTERNS) {
        expect(pattern.test(blob)).toBe(false);
      }

      // Payload must not carry raw commercial literals even if callers attempt them.
      const polluted = composeContent(
        template.subjectKey,
        template.bodyKey,
        locale,
        {
          ...template.params(seed),
          amount: "999.00",
          currency: "SAR",
          documentBody: "SECRET",
        }
      );
      expect(polluted.bodyEn).not.toContain("999.00");
      expect(polluted.bodyAr).not.toContain("999.00");
      expect(polluted.subject).not.toContain("SECRET");
      expect(polluted.bodyEn).not.toContain("SECRET");

      cases += 1;
    }
    expect(cases).toBeGreaterThanOrEqual(100);
  });
});
