/**
 * The house style and glossary every secondary generator appends to its
 * system prompt. Two things are load-bearing: the size caps, because the
 * prompt budgets in `generator-prompt-sizes.test.ts` are computed against
 * them, and the filtering, because an unfiltered glossary on every call would
 * spend the budget on vocabulary the document never uses.
 */

import { describe, expect, test } from "bun:test";
import {
  GLOSSARY_BLOCK_MAX_CHARS,
  LATIN_KEPT_NAMES,
  STYLE_GUIDE_MAX_CHARS,
  TENDER_GLOSSARY,
  TENDER_STYLE_GUIDE,
  detectDominantLocale,
  formatArabicWeeks,
  glossaryBlock,
  glossaryEntriesFor,
  normalizeArabic,
  styleGuideFor,
} from "../../ai/style-guide";

const ARABIC_LETTER = /[\u0600-\u06FF]/;

describe("styleGuideFor", () => {
  test("each locale has a guide below the cap", () => {
    for (const locale of ["ar", "en"] as const) {
      const guide = styleGuideFor(locale);
      expect(guide).toBe(TENDER_STYLE_GUIDE[locale]);
      expect(guide.length).toBeGreaterThan(400);
      expect(guide.length).toBeLessThanOrEqual(STYLE_GUIDE_MAX_CHARS);
    }
  });

  test("the Arabic guide sets the register, the punctuation, the digits, the dates, and the orthography", () => {
    const guide = styleGuideFor("ar");
    expect(guide).toContain("Modern Standard Arabic");
    expect(guide).toContain("الفصحى");
    for (const mark of ["،", "؛", "؟"]) expect(guide).toContain(mark);
    expect(guide).toMatch(/Western digits/);
    expect(guide).toContain("YYYY-MM-DD");
    expect(guide).toMatch(/Hamza/);
    expect(guide).toMatch(/Taa marbuta/);
    expect(guide).toMatch(/passive/);
  });

  test("the English guide names its spelling convention and the serial comma", () => {
    const guide = styleGuideFor("en");
    expect(guide).toMatch(/American English/);
    expect(guide).toMatch(/Oxford \(serial\) comma/);
    expect(guide).toMatch(/no hype/i);
    expect(guide).toContain("YYYY-MM-DD");
  });

  test("both guides keep the same standards in Latin script", () => {
    for (const locale of ["ar", "en"] as const) {
      for (const name of LATIN_KEPT_NAMES) expect(styleGuideFor(locale)).toContain(name);
    }
    for (const name of ["NCA", "PDPL", "NORA", "ISO 27001", "Etimad", "QLR", "BoQ", "SLA"]) {
      expect(LATIN_KEPT_NAMES).toContain(name);
    }
  });

  test("neither guide carries pricing advice", () => {
    for (const locale of ["ar", "en"] as const) {
      expect(styleGuideFor(locale)).not.toMatch(/\b(?:discount|margin|markup)\b/i);
    }
  });
});

describe("TENDER_GLOSSARY", () => {
  test("covers the core Saudi procurement vocabulary", () => {
    expect(TENDER_GLOSSARY.length).toBeGreaterThanOrEqual(40);
    const en = TENDER_GLOSSARY.map((e) => e.en.toLowerCase());
    for (const term of [
      "tender documents",
      "procuring entity",
      "bill of quantities",
      "initial (bid) guarantee",
      "final (performance) guarantee",
      "local content",
      "delay penalty",
      "service level agreement",
      "government tenders and procurement law",
      "personal data protection law",
      "national cybersecurity authority",
      "essential cybersecurity controls",
      "digital government authority",
      "national overall reference architecture",
      "award",
      "clarification request",
      "annexes",
      "cover letter",
      "technical envelope",
      "financial envelope",
      "etimad platform",
    ]) {
      expect(en, term).toContain(term);
    }
    const ar = TENDER_GLOSSARY.map((e) => e.ar);
    for (const term of [
      "كراسة الشروط والمواصفات",
      "المنافسة",
      "جدول الكميات",
      "الضمان الابتدائي",
      "الضمان النهائي",
      "المحتوى المحلي",
      "غرامة التأخير",
      "نظام المنافسات والمشتريات الحكومية",
      "نظام حماية البيانات الشخصية",
      "الترسية",
    ]) {
      expect(ar, term).toContain(term);
    }
  });

  test("every entry has both languages, and each side is written in its own script", () => {
    for (const entry of TENDER_GLOSSARY) {
      expect(entry.ar.trim().length, entry.en).toBeGreaterThan(0);
      expect(entry.en.trim().length, entry.ar).toBeGreaterThan(0);
      expect(ARABIC_LETTER.test(entry.ar), `${entry.ar} is not Arabic`).toBe(true);
      expect(ARABIC_LETTER.test(entry.en), `${entry.en} contains Arabic`).toBe(false);
      if (entry.abbr) expect(ARABIC_LETTER.test(entry.abbr), entry.abbr).toBe(false);
    }
  });

  test("no two entries share a canonical term", () => {
    const ar = new Set<string>();
    const en = new Set<string>();
    for (const entry of TENDER_GLOSSARY) {
      expect(ar.has(entry.ar), entry.ar).toBe(false);
      expect(en.has(entry.en), entry.en).toBe(false);
      ar.add(entry.ar);
      en.add(entry.en);
    }
  });
});

describe("glossaryBlock", () => {
  test("the unfiltered block stays under the cap in both locales", () => {
    for (const locale of ["ar", "en"] as const) {
      const block = glossaryBlock(locale);
      expect(block.length).toBeGreaterThan(500);
      expect(block.length).toBeLessThanOrEqual(GLOSSARY_BLOCK_MAX_CHARS);
    }
  });

  test("a smaller budget is honoured and cannot exceed the hard cap", () => {
    expect(glossaryBlock("en", undefined, { maxChars: 600 }).length).toBeLessThanOrEqual(600);
    expect(glossaryBlock("en", undefined, { maxChars: 50_000 }).length).toBeLessThanOrEqual(
      GLOSSARY_BLOCK_MAX_CHARS
    );
  });

  test("the locale decides which language leads each line", () => {
    const ar = glossaryBlock("ar", "جدول الكميات");
    const en = glossaryBlock("en", "bill of quantities");
    expect(ar).toContain("- جدول الكميات = bill of quantities (BoQ)");
    expect(en).toContain("- bill of quantities (BoQ) = جدول الكميات");
  });

  test("with a document, only the terms that document uses are listed", () => {
    // Arrange: an English SLA passage and an Arabic guarantee passage.
    const doc =
      "The SLA fixes a 2% delay penalty per week. يُقدَّم الضمان الابتدائي مع العرض.";

    // Act
    const entries = glossaryEntriesFor(doc);
    const block = glossaryBlock("en", doc);

    // Assert: matched by abbreviation, by English term, and by Arabic term…
    const en = entries.map((e) => e.en);
    expect(en).toContain("service level agreement");
    expect(en).toContain("delay penalty");
    expect(en).toContain("initial (bid) guarantee");
    // …and nothing the passage never mentions.
    expect(en).not.toContain("force majeure");
    expect(en).not.toContain("cover letter");
    expect(block).toContain("delay penalty");
    expect(block).not.toContain("force majeure");
    expect(block.split("\n").length - 1).toBe(entries.length);
  });

  test("a list of strings is searched the same way as a document", () => {
    const entries = glossaryEntriesFor(["Nitaqat status", "QLR threshold 1.0"]);
    expect(entries.map((e) => e.en)).toEqual(
      expect.arrayContaining(["Saudization / Nitaqat", "quick liquidity ratio"])
    );
    expect(glossaryBlock("en", ["Nitaqat status"])).toContain("Nitaqat");
  });

  test("Arabic matching survives diacritics, Alef variants and Taa marbuta spellings", () => {
    expect(normalizeArabic("غَرَامَةُ التَّأْخِيرِ")).toBe(normalizeArabic("غرامه التاخير"));
    expect(glossaryEntriesFor("تُطبَّق غَرامةُ التَّأخيرِ الأسبوعية").map((e) => e.en)).toContain(
      "delay penalty"
    );
    expect(glossaryEntriesFor("إقامه البيانات داخل المملكة").map((e) => e.en)).toContain(
      "data residency"
    );
  });

  test("short Latin abbreviations match whole words only", () => {
    // "CR" must not be found inside "description", nor "IP" inside "ship".
    expect(glossaryEntriesFor("a description of the ship").map((e) => e.abbr)).not.toContain("CR");
    expect(glossaryEntriesFor("a description of the ship").map((e) => e.abbr)).not.toContain("IP");
    expect(glossaryEntriesFor("attach the CR and the VAT certificate").map((e) => e.abbr)).toEqual(
      expect.arrayContaining(["CR", "VAT"])
    );
  });

  test("a document with none of the terms yields an empty block, not a heading", () => {
    expect(glossaryBlock("ar", "lorem ipsum dolor sit amet")).toBe("");
  });
});

describe("formatArabicWeeks", () => {
  test("agrees the noun with the number", () => {
    expect(formatArabicWeeks(1)).toBe("أسبوع واحد");
    expect(formatArabicWeeks(2)).toBe("أسبوعان");
    expect(formatArabicWeeks(3)).toBe("3 أسابيع");
    expect(formatArabicWeeks(10)).toBe("10 أسابيع");
    expect(formatArabicWeeks(11)).toBe("11 أسبوعاً");
    expect(formatArabicWeeks(52)).toBe("52 أسبوعاً");
    expect(formatArabicWeeks(0)).toBe("0 أسابيع");
    expect(formatArabicWeeks(2.5)).toBe("2.5 أسبوع");
  });
});

describe("detectDominantLocale", () => {
  test("follows the majority script, and ties or Latin-only text read as English", () => {
    expect(detectDominantLocale("نطاق العمل والمخرجات المطلوبة")).toBe("ar");
    expect(detectDominantLocale("Scope of work and deliverables")).toBe("en");
    expect(detectDominantLocale("SLA وفق كراسة الشروط والمواصفات NCA ECC")).toBe("ar");
    expect(detectDominantLocale("")).toBe("en");
    expect(detectDominantLocale("1234 %%")).toBe("en");
  });
});
