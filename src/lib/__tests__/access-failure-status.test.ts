import { describe, expect, test } from "bun:test";
import { resolveFailureStatus } from "@/lib/api-failure";

/**
 * `UNAUTHORIZED` means 401 and `FORBIDDEN` means 403, without being told.
 *
 * `resolveFailureStatus` works off suffixes: `_FORBIDDEN` → 403, `_NOT_FOUND` →
 * 404, and so on (api-failure.ts:206-213). The bare codes match none of them —
 * `FORBIDDEN` does not end in `_FORBIDDEN` — so both fell through to the 400
 * default. Every call site happened to pass an explicit status, which is the
 * only reason nobody noticed; the first one that forgets ships "sign in to
 * continue" under a status that says the request was malformed, and the client
 * has no way to tell it apart from a validation failure or start a login.
 *
 * These two are the most-reached-for codes in the codebase, so the default has
 * to be the right one rather than a trap that is correct only when remembered.
 */
describe("bare access codes resolve to their own status", () => {
  test("UNAUTHORIZED is 401", () => {
    expect(resolveFailureStatus("UNAUTHORIZED")).toBe(401);
  });

  test("FORBIDDEN is 403", () => {
    expect(resolveFailureStatus("FORBIDDEN")).toBe(403);
  });

  test("the suffixed forms still resolve the same way", () => {
    // Anti-vacuous: these already passed via the suffix rules, so if the two
    // above start passing because the function was replaced by `() => 401`,
    // this is what catches it.
    expect(resolveFailureStatus("WORKSPACE_ROLE_FORBIDDEN")).toBe(403);
    expect(resolveFailureStatus("PROPOSAL_NOT_FOUND")).toBe(404);
    expect(resolveFailureStatus("SNAPSHOT_REVISION_CONFLICT")).toBe(409);
    expect(resolveFailureStatus("SOMETHING_UNREGISTERED")).toBe(400);
  });
});
