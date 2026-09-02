/**
 * The page a payer lands on after their money moved speaks their language.
 *
 * `billing/callback/page-client.tsx` localised the body text but kept its
 * three headings, its subtitle and its two buttons in English; an
 * Arabic-first payer read "Payment not completed" over an Arabic sentence.
 * The route behind it answered `ok: false` with machine tokens
 * (`payment_cancelled_or_failed`) that the page rendered verbatim; those are
 * registered bilingual failures now and the page reads `error` as `{ar, en}`.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const PAGE = readFileSync(join(REPO_ROOT, "src/app/billing/callback/page-client.tsx"), "utf8");
const ROUTE = readFileSync(join(REPO_ROOT, "src/app/api/billing/callback/route.ts"), "utf8");

describe("billing callback page", () => {
  test("no heading, subtitle or button is English-only", () => {
    for (const literal of [
      ">Confirming payment…<",
      ">Payment successful<",
      ">Payment not completed<",
      ">Open billing<",
      ">Back to billing<",
      "Verifying MyFatoorah invoice status\n",
    ]) {
      expect(PAGE.includes(literal), literal).toBe(false);
    }
    expect((PAGE.match(/locale === "ar"/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });

  test("the route answers with registered codes, not tokens", () => {
    for (const token of ["payment_cancelled_or_failed", "missing_payment_reference", "checkout_not_found"]) {
      expect(ROUTE.includes(`"${token}"`), token).toBe(false);
    }
    for (const code of ["PAYMENT_CANCELLED_OR_FAILED", "PAYMENT_REFERENCE_MISSING", "CHECKOUT_NOT_FOUND"]) {
      expect(ROUTE.includes(`apiFailure("${code}")`), code).toBe(true);
    }
  });
});
