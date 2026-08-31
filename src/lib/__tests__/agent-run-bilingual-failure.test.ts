/**
 * `POST /api/agents/run` must fail in both locales, like every other route.
 *
 * Observed against production on 2026-08-31, signed in as a real account:
 *
 *   http=403
 *   {"error": "Complete account onboarding before generating proposals.
 *     Missing: legal, approvalChain, restrictions", "code":
 *     "ONBOARDING_INCOMPLETE", ...}
 *
 * `error` is a bare English string, not the `{ ar, en }` pair the shared
 * mapper emits. That matters more here than almost anywhere else:
 *
 *   1. This is the primary action of the product. An Arabic-first bidder in a
 *      Saudi procurement workflow hits this 403 the first time they ask for a
 *      proposal, and it is the single most-read failure in the app.
 *
 *   2. It is silently rendered as-is. `selectApiFailureMessage` accepts a
 *      plain-string `error` and returns it verbatim
 *      (api-failure-message.ts:76-78), so `apiErrorText(json, "ar")` in
 *      proposal-editor.tsx:574 hands the Arabic reader the English sentence.
 *      No fallback fires, because a non-empty string looks like a real answer.
 *
 *   3. Nothing was missing. `ONBOARDING_INCOMPLETE` has been registered with
 *      both locales at i18n.ts:1886 all along; the route just never asked for
 *      them.
 *
 * The dashboard's own caller hides this: agent-workflow.tsx:367-375 throws
 * away the server text and re-translates from `err.code` inline. So the bug is
 * invisible from the view most likely to be clicked, and lands on every other
 * consumer — the proposal editor's regenerate action, and anything driving the
 * REST API directly.
 *
 * Two of the three failures in this route are fixed by deletion: the outer
 * `catch` already calls `toErrorResponse`, which maps a registered `ApiError`
 * and special-cases `QuotaExceededError` into a bilingual 402 via
 * `quotaFailureCode` (api-controller.ts:107-115).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { apiFailure } from "../api-failure";
import { apiErrorText, selectApiFailureMessage } from "../api-failure-message";

const route = readFileSync(
  resolve(process.cwd(), "src/app/api/agents/run/route.ts"),
  "utf8"
);

/** The exact English sentence production returned, from `ApiError.message`. */
const LEAKED_EN =
  "Complete account onboarding before generating proposals. Missing: legal, approvalChain, restrictions";

/** What the registry renders: `${action}: ${reason}`, per locale. */
const ONBOARDING_AR =
  "تعذر تنفيذ طلب المساعد الذكي: أكمل إعداد الحساب قبل تشغيل الوكلاء";
const ONBOARDING_EN =
  "Unable to complete the AI assistant request: Complete account setup before running the agents";

describe("agents/run reports failures bilingually", () => {
  test("the registered code really does carry both locales", () => {
    // Anti-vacuous: if this code were unregistered, every assertion below
    // would be checking the generic internal-error sentence instead.
    const body = apiFailure("ONBOARDING_INCOMPLETE");
    expect(body.message.ar).toBe(ONBOARDING_AR);
    expect(body.message.en).toBe(ONBOARDING_EN);
    expect(body.code).toBe("ONBOARDING_INCOMPLETE");
  });

  test("an Arabic reader gets Arabic out of the mapped body", () => {
    // Real behaviour through the exact helper proposal-editor.tsx:574 calls.
    const body = apiFailure("ONBOARDING_INCOMPLETE");
    expect(apiErrorText(body, "ar")).toBe(ONBOARDING_AR);
    expect(apiErrorText(body, "en")).toBe(ONBOARDING_EN);
  });

  test("the 409 conflict code is registered in both locales too", () => {
    // AGENT_RUN_IN_PROGRESS had no registry entry at all — the route hand-wrote
    // the English sentence. Both 409 branches now spread this body.
    const body = apiFailure("AGENT_RUN_IN_PROGRESS");
    expect(body.message.ar).toContain("هناك تشغيل للوكلاء جارٍ بالفعل");
    expect(body.message.en).toContain("An agent run is already in progress");
    expect(apiErrorText(body, "ar")).not.toContain("agent run");
  });

  test("the shape production returned really did leak English to an Arabic reader", () => {
    // Documents the defect rather than asserting the fix: a plain-string
    // `error` is truthy, so no fallback fires and the locale is ignored.
    const legacy = { error: LEAKED_EN, code: "ONBOARDING_INCOMPLETE" };
    expect(selectApiFailureMessage(legacy, "ar")).toBe(LEAKED_EN);
    expect(apiErrorText(legacy, "ar")).toBe(LEAKED_EN);
  });

  test("the route never echoes a thrown message as the client-facing error", () => {
    // `e.message` is the developer-facing English string on ApiError and
    // QuotaExceededError. It must not reach a client.
    expect(route).not.toContain("error: e.message");
  });

  test("the route returns no bare English string as an error", () => {
    // A literal beats the mapper silently: it is truthy, so apiErrorText
    // returns it for every locale.
    const bareEnglish = [...route.matchAll(/\berror: "([^"]+)"/g)].map((m) => m[1]);
    expect(
      bareEnglish,
      `untranslated error literals: ${bareEnglish.join(", ")}`
    ).toEqual([]);
  });

  test("the onboarding branch still carries the fields the dashboard reads", () => {
    // agent-workflow.tsx:368 reads `err.missing` to name the incomplete steps,
    // so a fix that maps the body correctly but drops these is a regression.
    expect(route).toContain("missing:");
    expect(route).toContain("readyForProposals:");
  });

  test("the quota branch is delegated, not hand-rolled", () => {
    // toErrorResponse already maps QuotaExceededError to a bilingual 402.
    // Catching it locally to build a body is the thing that broke this route.
    expect(route).not.toContain("instanceof QuotaExceededError");
  });
});
