import { describe, expect, test } from "bun:test";
import { resolveFailureStatus } from "@/lib/api-failure";
import { QUOTA_FAILURE_CODES } from "@/lib/quotas";

/**
 * An exhausted allowance answers 402, whichever handler catches it.
 *
 * There are two ways a `QuotaExceededError` becomes a response, and they pick
 * the status differently:
 *
 *   - `toErrorResponse` (api-controller.ts:107-116) hardcodes 402.
 *   - `jsonApiFailure(quotaFailureCode(err))` resolves it from the code, which
 *     means the code must be registered in `EXPLICIT_FAILURE_STATUS` —
 *     `resolveFailureStatus`'s suffix rules match none of the quota codes, so
 *     an unregistered one silently falls through to 400.
 *
 * Three routes use the second form: `platform-agent/extension/ingest`,
 * `platform-agent/missions/[id]/attachments`, and
 * `platform-agent/missions/[id]/autopilot`. A 400 there reads as "your request
 * was malformed" — a client cannot tell it apart from a validation failure, so
 * it retries the same request instead of surfacing the upgrade prompt that a
 * 402 triggers.
 *
 * Driven off `QUOTA_FAILURE_CODES` rather than a hand-copied list, so a sixth
 * quota kind added to the map is covered without anyone remembering this file.
 */
describe("every quota failure code resolves to 402", () => {
  const entries = Object.entries(QUOTA_FAILURE_CODES);

  test("the map still has every quota kind in it", () => {
    // Without this, narrowing the map turns the loop below into zero
    // assertions, which looks exactly like the check passing.
    expect(entries.map(([kind]) => kind).sort()).toEqual([
      "DOCUMENTS",
      "INACTIVE",
      "PROPOSALS",
      "STORAGE",
      "TOKENS",
    ]);
  });

  for (const [kind, code] of entries) {
    test(`${kind} -> ${code} is payment-required, not a client fault`, () => {
      expect(resolveFailureStatus(code)).toBe(402);
    });
  }
});
