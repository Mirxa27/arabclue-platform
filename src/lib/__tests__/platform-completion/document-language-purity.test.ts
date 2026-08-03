/**
 * Document-language purity (task 12.2 / Req 18.10).
 */

import { describe, expect, test } from "bun:test";
import {
  assessDocumentLanguagePurity,
  stripApprovedTechnicalTokens,
  validateProposalOutput,
} from "../../validation-gate";

describe("document language purity", () => {
  test("strips approved technical tokens without removing narrative script", () => {
    const stripped = stripApprovedTechnicalTokens(
      "النطاق يشمل NORA-1.2.3 بقيمة 10% و https://example.com"
    );
    expect(stripped).toContain("النطاق");
    expect(stripped).not.toContain("NORA");
    expect(stripped).not.toContain("example.com");
  });

  test("flags missing and invalid bilingual sections", () => {
    const findings = assessDocumentLanguagePurity([
      { key: "scope", arabic: "نطاق العمل المعتمد", english: "Approved scope" },
      { key: "empty-ar", arabic: "", english: "English only" },
      { key: "latin-ar", arabic: "Scope narrative", english: "Scope narrative" },
      { key: "arabic-en", arabic: "نطاق", english: "نطاق فقط" },
      {
        key: "tech-ok",
        arabic: "الالتزام بـ NORA-4.1 بنسبة 10%",
        english: "Compliance with NORA-4.1 at 10%",
      },
    ]);

    expect(
      findings.some(
        (f) =>
          f.section === "empty-ar" && f.code === "DOCUMENT_LANGUAGE_MISSING"
      )
    ).toBe(true);
    expect(
      findings.some(
        (f) =>
          f.section === "latin-ar" &&
          f.language === "ar" &&
          f.code === "DOCUMENT_LANGUAGE_INVALID"
      )
    ).toBe(true);
    expect(
      findings.some(
        (f) =>
          f.section === "arabic-en" &&
          f.language === "en" &&
          f.code === "DOCUMENT_LANGUAGE_INVALID"
      )
    ).toBe(true);
    expect(findings.some((f) => f.section === "scope")).toBe(false);
    expect(findings.some((f) => f.section === "tech-ok")).toBe(false);
  });

  test("validation gate blocks export when bilingual sections fail purity", () => {
    const report = validateProposalOutput({
      contentMd: "# Proposal\nSafe narrative without pricing language.",
      financial: null,
      entities: null,
      complianceRows: [],
      bilingualSections: [
        { key: "exec", arabic: "", english: "Executive summary" },
      ],
    });
    expect(report.blocking).toBe(true);
    expect(
      report.issues.some((i) => i.code === "DOCUMENT_LANGUAGE_MISSING")
    ).toBe(true);
  });
});
