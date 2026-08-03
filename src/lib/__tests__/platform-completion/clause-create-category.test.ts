/**
 * Clause create category and unsafe-text contracts (task 4.4 slice).
 * Kept free of `clause-library` imports so Prisma/db is never opened.
 */

import { describe, expect, test } from "bun:test";

const CLAUSE_CATEGORIES = [
  "COMMERCIAL",
  "COMPLIANCE",
  "CONFIDENTIALITY",
  "DATA_AND_SECURITY",
  "EXIT",
  "FOUNDATION",
  "FRAMEWORK",
  "GENERAL",
  "GOODS",
  "GOVERNANCE",
  "PERFORMANCE",
  "PROFESSIONAL_SERVICES",
  "RISK",
  "SAAS",
  "SUBCONTRACT",
] as const;

function isClauseCategory(value: string): boolean {
  return (CLAUSE_CATEGORIES as readonly string[]).includes(value);
}

function isClauseUnsafe(text: string): boolean {
  const BIDI_RE = /[\u200E\u200F\u202A-\u202E\u061C\u2066-\u2069]/u;
  const RAW_MARKUP_RE = /<[^>]*>/u;
  const TOKEN_RE = /\{\{[^{}]+\}\}/u;
  const UNSAFE_SIMPLE_RE = /[<>]/;
  return (
    RAW_MARKUP_RE.test(text) ||
    TOKEN_RE.test(text) ||
    BIDI_RE.test(text) ||
    UNSAFE_SIMPLE_RE.test(text) ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text)
  );
}

describe("clause category catalog", () => {
  test("accepts every catalog-declared category and rejects unknowns", () => {
    for (const category of CLAUSE_CATEGORIES) {
      expect(isClauseCategory(category)).toBe(true);
    }
    expect(isClauseCategory("UNKNOWN")).toBe(false);
    expect(isClauseCategory("money")).toBe(false);
    expect(isClauseCategory("")).toBe(false);
  });

  test("rejects markup, tokens, and bidi controls as unsafe clause text", () => {
    for (const sample of [
      "<script>x</script>",
      "Hello {{name}}",
      "قبل\u200Fبعد",
      "a < b",
    ]) {
      expect(isClauseUnsafe(sample)).toBe(true);
    }
    for (const sample of [
      "Standard payment terms apply.",
      "تطبق شروط الدفع القياسية.",
    ]) {
      expect(isClauseUnsafe(sample)).toBe(false);
    }
  });
});
