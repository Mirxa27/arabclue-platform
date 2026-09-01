import { describe, expect, test } from "bun:test";
import { resolveFailureStatus } from "@/lib/api-failure";
import { COMPLETION_ERROR_CONTRACTS } from "@/lib/i18n";

/**
 * A limiter outage is not a bad request.
 *
 * `AI_RATE_LIMIT_UNAVAILABLE` carries an explicit 503 with a comment saying
 * exactly why: the `_RATE_LIMITED` suffix rule never sees an `_UNAVAILABLE`
 * code, the caller is inside their budget, and nothing was written. Two more
 * codes in the same family were registered afterwards without that entry
 * (`INVITATION_RATE_LIMIT_UNAVAILABLE`, `CONTRACT_DRAFT_RATE_LIMIT_UNAVAILABLE`)
 * and fall through to the 400 default — the server is down and the client is
 * told it sent a malformed request, so it will not retry.
 *
 * Every call site today passes an explicit status, which is the only reason
 * this is invisible. That is the trap: correct only when remembered. The whole
 * point of the suffix families is that a newly registered code cannot silently
 * answer 400, so the family has to cover this shape rather than three names.
 */
const OUTAGE_CODES = Object.keys(COMPLETION_ERROR_CONTRACTS).filter((code) =>
  code.endsWith("_RATE_LIMIT_UNAVAILABLE"),
);

describe("outage codes resolve to 503 without being told", () => {
  test("every registered rate-limiter outage code is 503", () => {
    // Anti-vacuous: an empty list would pass the loop, and this is the exact
    // drift the rule exists to stop — three codes today, more tomorrow.
    expect(OUTAGE_CODES.length).toBeGreaterThanOrEqual(3);
    for (const code of OUTAGE_CODES) {
      expect(resolveFailureStatus(code), code).toBe(503);
    }
  });

  test("a renderer that is not installed is 503, not 400", () => {
    // Chromium missing is a server capability gap. The request was fine.
    expect(resolveFailureStatus("PDF_UNAVAILABLE")).toBe(503);
  });

  test("the rule is narrow enough to leave the rest alone", () => {
    // `_UNAVAILABLE` on its own is not an outage: ROUTE_PROJECT_UNAVAILABLE is
    // a navigation notice about one missing project, and blanket-503ing that
    // shape would make a wrong id read as a server failure. Only the
    // rate-limiter family is claimed here.
    expect(resolveFailureStatus("AI_RATE_LIMITED")).toBe(429);
    expect(resolveFailureStatus("SOMETHING_UNAVAILABLE")).toBe(400);
    expect(resolveFailureStatus("SOMETHING_UNREGISTERED")).toBe(400);
  });
});
