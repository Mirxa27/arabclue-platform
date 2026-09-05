/**
 * Counterpart fidelity — the pure checks behind the AI counterpart draft.
 *
 * Section splitting must reassemble byte-for-byte, because the translated
 * document is rebuilt by concatenation. The parity checks must catch exactly
 * the defects the side-by-side export makes visible: a heading, a table row, a
 * requirement ID or a number present on one side and absent on the other, and
 * a "translation" that never left the source script.
 */

import { describe, expect, test } from "bun:test";
import {
  checkCounterpartFidelity,
  checkTargetScript,
  chunkMarkdownText,
  COUNTERPART_RETRY_CODES,
  extractHeadings,
  extractIdentifiers,
  extractNumbers,
  extractTables,
  joinMarkdownSections,
  missingIdentifiers,
  missingNumbers,
  missingVerbatimPassages,
  needsRegeneration,
  normalizeDigits,
  protectVerbatimPassages,
  restoreVerbatimPassages,
  splitMarkdownSections,
  VERBATIM_PASSAGES,
} from "../ai/counterpart-fidelity";
import {
  describeCounterpartDiagnostic,
  parseCounterpartDiagnosticsJson,
} from "../counterpart-diagnostics";
import { LEGAL_DISCLAIMER, LEGAL_DISCLAIMER_AR } from "../procurement-rules";
import {
  HUMAN_APPROVAL_NOTICE,
  HUMAN_APPROVAL_NOTICE_AR,
} from "../agents/prompts";

const SOURCE_EN = `# Technical Proposal — Riyadh Data Platform

Prepared for Etimad tender ETM-2026-0042.

## 1. Executive Summary / الملخص التنفيذي

We deliver the platform in 3 phases over 18 months, meeting NCA-ECC-2-1-3 and ISO 27001 [S1].

### Coverage

- REQ-1 is covered in full.
- REQ-2 is covered with a 35% Saudization commitment.

## 4. Requirement Coverage Matrix / مصفوفة تغطية المتطلبات

| Req ID | Requirement | Response | Evidence | Status |
| --- | --- | --- | --- | --- |
| REQ-1 | Data residency in KSA | Riyadh region only | Approved Evidence One | COMPLIANT |
| REQ-2 | Saudization 35% | Committed | HR letter | PARTIAL |

## 13. Compliance Commitments / الالتزامات التنظيمية

${LEGAL_DISCLAIMER}

## 15. Financial Forms Structure / هيكل النماذج المالية

| Item | Unit | Qty | Unit Price | Total |
| --- | --- | --- | --- | --- |
| Platform licence | each | 1 | — | — |

## 18. Closing / الخاتمة

${HUMAN_APPROVAL_NOTICE}
`;

/* -------------------------------------------------------------------------- */
/* Sections                                                                   */
/* -------------------------------------------------------------------------- */

describe("splitMarkdownSections / joinMarkdownSections", () => {
  test("round-trips the document byte for byte", () => {
    // Arrange: preamble, five sections, trailing newline.
    // Act
    const sections = splitMarkdownSections(SOURCE_EN);
    // Assert
    expect(joinMarkdownSections(sections)).toBe(SOURCE_EN);
    expect(sections.length).toBe(6);
    expect(sections[0].heading).toBeNull();
    expect(sections[0].text.startsWith("# Technical Proposal")).toBe(true);
    expect(sections[1].heading).toBe("## 1. Executive Summary / الملخص التنفيذي");
    expect(sections[5].heading).toBe("## 18. Closing / الخاتمة");
  });

  test("section 0 is the preamble even when the document opens with a heading", () => {
    const md = "## 1. Only / فقط\nBody.";
    const sections = splitMarkdownSections(md);
    expect(sections.map((s) => s.heading)).toEqual([null, "## 1. Only / فقط"]);
    expect(sections[0].text).toBe("");
    expect(joinMarkdownSections(sections)).toBe(md);
  });

  test("does not split on ### sub-headings or on `## ` inside fenced code", () => {
    const md = [
      "## 1. A / أ",
      "### 1.1 Sub",
      "```",
      "## not a heading",
      "```",
      "## 2. B / ب",
      "text",
    ].join("\n");
    const sections = splitMarkdownSections(md);
    expect(sections.map((s) => s.heading)).toEqual([null, "## 1. A / أ", "## 2. B / ب"]);
    expect(joinMarkdownSections(sections)).toBe(md);
  });

  test("round-trips documents without a trailing newline and with CRLF endings", () => {
    for (const md of ["Intro\n## 1. X / س\nlast line", "Intro\r\n## 1. X / س\r\nbody\r\n", "", "\n\n"]) {
      expect(joinMarkdownSections(splitMarkdownSections(md))).toBe(md);
    }
  });
});

describe("chunkMarkdownText", () => {
  test("returns the text whole when it fits", () => {
    expect(chunkMarkdownText("short", 100)).toEqual(["short"]);
  });

  test("cuts at blank lines outside fences and concatenates back to the input", () => {
    // Arrange: five paragraphs of ~60 chars, a fenced block with a blank line inside.
    const paragraph = "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do.";
    const md = [
      paragraph,
      "",
      paragraph,
      "",
      "```",
      "code line",
      "",
      "more code",
      "```",
      "",
      paragraph,
      "",
      paragraph,
    ].join("\n");
    // Act
    const chunks = chunkMarkdownText(md, 120);
    // Assert
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(md);
    // No chunk boundary falls inside the fence: every chunk has balanced fences.
    for (const chunk of chunks) {
      expect((chunk.match(/^```/gm) ?? []).length % 2).toBe(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Structure extraction                                                       */
/* -------------------------------------------------------------------------- */

describe("extractHeadings / extractTables", () => {
  test("lists headings with levels, skipping fenced code", () => {
    const headings = extractHeadings(SOURCE_EN);
    expect(headings[0]).toEqual({ level: 1, text: "Technical Proposal — Riyadh Data Platform" });
    expect(headings.map((h) => h.level)).toEqual([1, 2, 3, 2, 2, 2, 2]);
    expect(extractHeadings("```\n## fenced\n```\n## real")).toEqual([{ level: 2, text: "real" }]);
  });

  test("counts table rows (separator included) and columns", () => {
    const tables = extractTables(SOURCE_EN);
    expect(tables).toEqual([
      { rows: 4, columns: 5 },
      { rows: 3, columns: 5 },
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Tokens                                                                     */
/* -------------------------------------------------------------------------- */

describe("identifiers", () => {
  test("recognises requirement, control and standard identifiers once each", () => {
    const ids = extractIdentifiers(
      "REQ-12 and REQ-12 again; R-07, C-3, NCA-ECC-2-1-3, ISO 27001, ISO/IEC 27001:2022, T-4.2. Not: 2026-09-05, Q1."
    );
    expect(ids).toEqual([
      "REQ-12",
      "R-07",
      "C-3",
      "NCA-ECC-2-1-3",
      "T-4.2",
      "ISO 27001",
      "ISO/IEC 27001:2022",
    ]);
  });

  test("reports identifiers the target lacks, tolerating spacing differences", () => {
    const source = "Covers REQ-4, REQ-9 and ISO 27001 under NCA-ECC-2-1-3.";
    const target = "يغطي REQ-4 وISO27001 بموجب NCA-ECC-2-1-3.";
    expect(missingIdentifiers(source, target)).toEqual(["REQ-9"]);
    expect(missingIdentifiers(source, source)).toEqual([]);
  });
});

describe("numbers", () => {
  test("normalises Arabic-Indic digits and separators", () => {
    expect(normalizeDigits("٢٫٥٪ من ١٬٠٠٠ و۱۸")).toBe("2.5% من 1,000 و18");
  });

  test("extracts integers, decimals and grouped numbers once each", () => {
    expect(extractNumbers("18 months, 35% and 35%, 2.5 days, 1,000 SAR, ٢٠٣٠")).toEqual([
      "18",
      "35",
      "2.5",
      "1,000",
      "2030",
    ]);
  });

  test("reports numbers the target dropped, accepting Arabic-Indic digits and bare grouping", () => {
    const source = "3 phases over 18 months at 35% with 1,000 users.";
    expect(missingNumbers(source, "٣ مراحل خلال ١٨ شهراً بنسبة ٣٥٪ مع 1000 مستخدم")).toEqual([]);
    expect(missingNumbers(source, "ثلاث مراحل خلال 18 شهراً بنسبة 35%")).toEqual(["3", "1,000"]);
  });

  test("does not report the digits of a missing identifier as a missing number", () => {
    const source = "REQ-12 requires 18 months.";
    const target = "يتطلب 18 شهراً.";
    expect(missingIdentifiers(source, target)).toEqual(["REQ-12"]);
    expect(missingNumbers(source, target)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Verbatim passages                                                          */
/* -------------------------------------------------------------------------- */

describe("verbatim passages", () => {
  test("the legal disclaimer and the human-approval notice are swapped, never translated", () => {
    // Arrange
    const source = `Intro.\n\n${LEGAL_DISCLAIMER}\n\n${HUMAN_APPROVAL_NOTICE}\n`;
    // Act
    const protectedText = protectVerbatimPassages(source, "en");
    const restored = restoreVerbatimPassages(protectedText, "ar");
    // Assert: the model never sees the sentence, the writer gets the approved Arabic one.
    expect(protectedText).not.toContain(LEGAL_DISCLAIMER);
    expect(protectedText).toContain("[[ARABCLUE_LEGAL_DISCLAIMER]]");
    expect(protectedText).toContain("[[ARABCLUE_HUMAN_APPROVAL_NOTICE]]");
    expect(restored).toBe(`Intro.\n\n${LEGAL_DISCLAIMER_AR}\n\n${HUMAN_APPROVAL_NOTICE_AR}\n`);
  });

  test("swaps in the other direction and repairs a marker the model spaced differently", () => {
    expect(restoreVerbatimPassages(protectVerbatimPassages(LEGAL_DISCLAIMER_AR, "ar"), "en")).toBe(
      LEGAL_DISCLAIMER
    );
    expect(restoreVerbatimPassages("[[ ARABCLUE LEGAL-DISCLAIMER ]]", "ar")).toBe(LEGAL_DISCLAIMER_AR);
  });

  test("a passage the model copied untranslated is swapped to the approved counterpart", () => {
    expect(restoreVerbatimPassages(`x ${LEGAL_DISCLAIMER} y`, "ar")).toBe(`x ${LEGAL_DISCLAIMER_AR} y`);
  });

  test("a free translation of the disclaimer is reported as a missing passage", () => {
    const source = `${LEGAL_DISCLAIMER}`;
    expect(missingVerbatimPassages(source, "مصفوفات الامتثال ليست استشارة قانونية.", "ar")).toEqual([
      "legal_disclaimer",
    ]);
    expect(missingVerbatimPassages(source, LEGAL_DISCLAIMER_AR, "ar")).toEqual([]);
    // Anti-vacuous: both passages are registered.
    expect(VERBATIM_PASSAGES.map((p) => p.name)).toEqual(["legal_disclaimer", "human_approval_notice"]);
  });
});

/* -------------------------------------------------------------------------- */
/* checkCounterpartFidelity                                                   */
/* -------------------------------------------------------------------------- */

describe("checkCounterpartFidelity", () => {
  const source = [
    "## 4. Matrix / المصفوفة",
    "### Notes",
    "Covers REQ-1 and REQ-2 over 18 months.",
    "| A | B |",
    "| --- | --- |",
    "| REQ-1 | x |",
    "| REQ-2 | y |",
  ].join("\n");
  const faithful = [
    "## 4. Matrix / المصفوفة",
    "### ملاحظات",
    "يغطي REQ-1 وREQ-2 خلال 18 شهراً.",
    "| أ | ب |",
    "| --- | --- |",
    "| REQ-1 | س |",
    "| REQ-2 | ص |",
  ].join("\n");

  test("a faithful translation has no findings", () => {
    expect(checkCounterpartFidelity(source, faithful, { targetLocale: "ar", section: 4 })).toEqual([]);
  });

  test("heading count and level parity", () => {
    const fewer = faithful.replace("### ملاحظات\n", "");
    expect(checkCounterpartFidelity(source, fewer, { targetLocale: "ar", section: 4 })).toContainEqual({
      code: "heading_count_mismatch",
      section: 4,
      expected: 2,
      actual: 1,
    });
    const wrongLevel = faithful.replace("### ملاحظات", "#### ملاحظات");
    expect(checkCounterpartFidelity(source, wrongLevel, { targetLocale: "ar", section: 4 })).toContainEqual({
      code: "heading_level_mismatch",
      section: 4,
    });
  });

  test("table row and column parity, per table", () => {
    const droppedRow = faithful.replace("\n| REQ-2 | ص |", "").replace(" وREQ-2", "");
    const rows = checkCounterpartFidelity(source, droppedRow, { targetLocale: "ar", section: 4 });
    expect(rows).toContainEqual({
      code: "table_rows_mismatch",
      section: 4,
      table: 1,
      expected: 4,
      actual: 3,
    });
    // The dropped row carried the section's only remaining REQ-2, and that is reported too.
    expect(rows).toContainEqual({ code: "missing_identifiers", section: 4, items: ["REQ-2"] });

    const droppedColumn = faithful.replace("| أ | ب |", "| أ |");
    expect(checkCounterpartFidelity(source, droppedColumn, { targetLocale: "ar", section: 4 })).toContainEqual({
      code: "table_columns_mismatch",
      section: 4,
      table: 1,
      expected: 2,
      actual: 1,
    });

    const noTable = faithful.split("\n").slice(0, 3).join("\n");
    expect(checkCounterpartFidelity(source, noTable, { targetLocale: "ar", section: 4 })).toContainEqual({
      code: "table_count_mismatch",
      section: 4,
      expected: 1,
      actual: 0,
    });
  });

  test("missing identifiers and numbers are listed", () => {
    const target = faithful.replace("REQ-2 خلال 18", "REQ-2 خلال ثمانية عشر").replace("وREQ-2", "");
    const findings = checkCounterpartFidelity(source, target, { targetLocale: "ar", section: 4 });
    // REQ-2 is still in the table, so only the number is gone.
    expect(findings).toEqual([{ code: "missing_numbers", section: 4, items: ["18"] }]);
  });

  test("document scope adds the script checks; section scope does not", () => {
    // The source returned untouched as its own "Arabic translation": every
    // structural check passes, only the script check can say it never happened.
    const untouched = source;
    const doc = checkCounterpartFidelity(source, untouched, { targetLocale: "ar" });
    expect(doc).toEqual([{ code: "target_script_dominated", section: null }]);
    const sectionScoped = checkCounterpartFidelity(source, untouched, { targetLocale: "ar", section: 4 });
    expect(sectionScoped).toEqual([]);

    // An Arabic target with no Arabic letters at all.
    const latinOnly = source.replace(" / المصفوفة", "");
    expect(checkCounterpartFidelity(source, latinOnly, { targetLocale: "ar" })).toContainEqual({
      code: "target_script_missing",
      section: null,
    });
  });
});

describe("checkTargetScript", () => {
  test("an English target written mostly in Arabic is flagged as dominated", () => {
    const target = "## 1. Summary / الملخص\nهذا النص ما زال بالعربية بالكامل ولم تتم ترجمته إلى الإنجليزية.";
    expect(checkTargetScript(target, "en", "## 1. Summary / الملخص\nEnglish source.")).toEqual([
      { code: "target_script_dominated", section: null },
    ]);
  });

  test("an English target without Latin letters is flagged as missing", () => {
    expect(checkTargetScript("١٢٣ ٪", "en", "source")).toEqual([
      { code: "target_script_missing", section: null },
    ]);
  });

  test("a translated Arabic target passes even with Latin standard names", () => {
    const target = "## 1. Summary / الملخص\nنلتزم بمتطلبات NCA وPDPL وISO 27001 عبر ثلاث مراحل تنفيذية متكاملة.";
    expect(checkTargetScript(target, "ar", "English source text.")).toEqual([]);
  });
});

describe("needsRegeneration", () => {
  test("identifier and table findings earn a retry; numbers and prose do not", () => {
    expect(needsRegeneration([{ code: "missing_identifiers", section: 1, items: ["REQ-1"] }])).toBe(true);
    expect(needsRegeneration([{ code: "table_rows_mismatch", section: 1, table: 1, expected: 3, actual: 2 }])).toBe(true);
    expect(needsRegeneration([{ code: "missing_numbers", section: 1, items: ["18"] }])).toBe(false);
    expect(needsRegeneration([])).toBe(false);
    expect(COUNTERPART_RETRY_CODES).toContain("missing_identifiers");
    expect(COUNTERPART_RETRY_CODES).not.toContain("missing_numbers");
  });
});

/* -------------------------------------------------------------------------- */
/* Diagnostics text and persistence                                           */
/* -------------------------------------------------------------------------- */

describe("counterpart diagnostics record", () => {
  test("describes a finding bilingually with its section", () => {
    const d = { code: "missing_identifiers" as const, section: 4, items: ["REQ-4", "REQ-9"] };
    expect(describeCounterpartDiagnostic(d, "en")).toBe("Section 4: 2 identifiers missing: REQ-4, REQ-9");
    expect(describeCounterpartDiagnostic(d, "ar")).toBe("القسم 4: 2 معرّفات مفقودة: REQ-4، REQ-9");
    expect(describeCounterpartDiagnostic({ code: "target_script_dominated", section: null }, "en")).toBe(
      "Most of the text is still in the source language"
    );
  });

  test("parses the persisted record and drops what it does not recognise", () => {
    const raw = JSON.stringify({
      provider: "openai",
      model: "gpt-test",
      tokensUsed: 1234,
      sections: 18,
      diagnostics: [
        { code: "table_rows_mismatch", section: 4, table: 1, expected: 5, actual: 4 },
        { code: "not_a_code", section: 1 },
        "garbage",
      ],
    });
    expect(parseCounterpartDiagnosticsJson(raw)).toEqual({
      provider: "openai",
      model: "gpt-test",
      tokensUsed: 1234,
      sections: 18,
      diagnostics: [{ code: "table_rows_mismatch", section: 4, table: 1, expected: 5, actual: 4 }],
    });
    expect(parseCounterpartDiagnosticsJson(null)).toBeNull();
    expect(parseCounterpartDiagnosticsJson("{not json")).toBeNull();
    expect(parseCounterpartDiagnosticsJson('{"diagnostics": "no"}')).toBeNull();
  });
});
