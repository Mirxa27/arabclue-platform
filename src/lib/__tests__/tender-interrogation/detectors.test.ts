import { describe, expect, test } from "bun:test";
import {
  detectDeterministicFindings,
  extractDateMentions,
  extractPercentMentions,
} from "@/lib/tender-interrogation/detectors";
import type { Finding, SourcePassage } from "@/lib/tender-interrogation/types";

let seq = 0;
function passage(text: string, over: Partial<SourcePassage> = {}): SourcePassage {
  seq += 1;
  return {
    id: `p${seq}`,
    documentId: over.documentId ?? "doc-rfp",
    documentName: over.documentName ?? "RFP.pdf",
    chunkIndex: over.chunkIndex ?? seq,
    text,
    pageRef: over.pageRef ?? String(seq),
    sectionHeading: over.sectionHeading ?? null,
    language: over.language ?? null,
  };
}

/** A healthy tender: one deadline, weights that total 100, capped penalty, scope, criteria, Etimad submission. */
const HEALTHY = [
  passage("نطاق العمل: تطوير منصة رقمية لإدارة الطلبات وتكاملها مع الأنظمة الحكومية.", { sectionHeading: "نطاق العمل" }),
  passage("آخر موعد لتقديم العروض هو 15/03/2026 عبر منصة اعتماد."),
  passage("معايير التقييم: الوزن الفني 70% والوزن المالي 30%."),
  passage("غرامة التأخير 1% أسبوعياً بحد أقصى 10% من قيمة العقد، وتُحسب خلال 30 يوم عمل من الإشعار."),
  passage("Annex 1 — Technical specifications. The system shall support Arabic and English interfaces.", { sectionHeading: "Annex 1" }),
];

function kinds(findings: readonly Finding[]): string[] {
  return findings.map((f) => `${f.kind}:${f.provenanceDetail.detectorId}`);
}

describe("date and percent extraction", () => {
  test("reads ISO, DMY, textual English, textual Arabic and Hijri dates", () => {
    const dates = extractDateMentions(
      "Bids close 2026-03-15; also 15/03/2026, 15 March 2026, ١٥ مارس ٢٠٢٦ and 25/09/1447هـ."
    );
    expect(dates.map((d) => d.key)).toEqual([
      "g:2026-03-15",
      "g:2026-03-15",
      "g:2026-03-15",
      "g:2026-03-15",
      "h:1447-09-25",
    ]);
  });

  test("reads percentages written with ASCII or Arabic digits and either percent sign", () => {
    expect(extractPercentMentions("70% and ٣٠٪ and 12.5 %").map((p) => p.value)).toEqual([70, 30, 12.5]);
  });
});

describe("deterministic detectors on a healthy tender", () => {
  test("raise nothing", () => {
    expect(detectDeterministicFindings(HEALTHY)).toEqual([]);
  });
});

describe("contradictions", () => {
  test("two different submission deadlines across two documents", () => {
    const findings = detectDeterministicFindings([
      ...HEALTHY,
      passage("The submission deadline for all bids is 20 March 2026 at 10:00.", {
        documentId: "doc-annex",
        documentName: "Annex-Instructions.docx",
      }),
    ]);
    const hit = findings.find((f) => f.provenanceDetail.detectorId === "deadline-conflict");
    expect(hit?.kind).toBe("CONTRADICTION");
    expect(hit?.severity).toBe("CRITICAL");
    expect(hit?.quotes).toHaveLength(2);
    expect(hit?.quotes.map((q) => q.documentName).sort()).toEqual(["Annex-Instructions.docx", "RFP.pdf"]);
    expect(hit?.questionAr).toContain("15/03/2026");
    expect(hit?.questionEn).toContain("20 March 2026");
  });

  test("the same deadline written twice is not a contradiction", () => {
    const findings = detectDeterministicFindings([
      ...HEALTHY,
      passage("Submission deadline: 2026-03-15 through the Etimad portal."),
    ]);
    expect(kinds(findings)).not.toContain("CONTRADICTION:deadline-conflict");
  });

  test("technical weights stated with two different values", () => {
    const findings = detectDeterministicFindings([
      ...HEALTHY,
      passage("The technical evaluation carries a weight of 60% of the total score."),
    ]);
    const hit = findings.find((f) => f.provenanceDetail.detectorId === "evaluation-weight-conflict");
    expect(hit?.kind).toBe("CONTRADICTION");
    expect(hit?.quotes.length).toBeGreaterThanOrEqual(2);
  });

  test("technical and financial weights that do not total 100", () => {
    const findings = detectDeterministicFindings([
      HEALTHY[0],
      HEALTHY[1],
      passage("Evaluation criteria: technical 70%, financial 40%."),
      HEALTHY[3],
    ]);
    const hit = findings.find((f) => f.provenanceDetail.detectorId === "evaluation-weight-sum");
    expect(hit?.kind).toBe("CONTRADICTION");
    expect(hit?.rationaleEn).toContain("110");
  });

  test("two different penalty caps", () => {
    const findings = detectDeterministicFindings([
      ...HEALTHY,
      passage("Liquidated damages shall not exceed a maximum of 20% of the contract value."),
    ]);
    const hit = findings.find((f) => f.provenanceDetail.detectorId === "penalty-cap-conflict");
    expect(hit?.kind).toBe("CONTRADICTION");
    expect(hit?.severity).toBe("MAJOR");
  });
});

describe("missing information", () => {
  test("a referenced annex that is defined nowhere", () => {
    const findings = detectDeterministicFindings([
      ...HEALTHY,
      passage("The bidder shall complete the forms in Annex 4 and المرفق رقم 7 and attach them."),
    ]);
    const hits = findings.filter((f) => f.provenanceDetail.detectorId === "dangling-reference");
    expect(hits.map((h) => h.provenanceDetail.key).sort()).toEqual(["annex-4", "annex-7"]);
    expect(hits[0].kind).toBe("MISSING_INFO");
  });

  test("a tender with no deadline, no criteria, no scope, no penalty and no submission channel", () => {
    const findings = detectDeterministicFindings([
      passage("The contractor shall deliver the platform and provide training to the entity's staff."),
    ]);
    const keys = findings
      .filter((f) => f.provenanceDetail.detectorId === "missing-mandatory")
      .map((f) => f.provenanceDetail.key)
      .sort();
    expect(keys).toEqual(["deadline", "evaluation", "scope", "sla", "submission"]);
    const deadline = findings.find((f) => f.provenanceDetail.key === "deadline");
    expect(deadline?.severity).toBe("CRITICAL");
    expect(deadline?.quotes).toEqual([]);
  });
});

describe("placeholders and ambiguities", () => {
  test("TBD, blanks and 'to be determined later' in Arabic", () => {
    const findings = detectDeterministicFindings([
      ...HEALTHY,
      passage("Warranty period: TBD. مدة الضمان: تحدد لاحقاً. Contract value ceiling: SAR ______."),
    ]);
    const hits = findings.filter((f) => f.kind === "PLACEHOLDER");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.every((h) => h.quotes.length >= 1)).toBe(true);
  });

  test("signature lines are not placeholders", () => {
    const findings = detectDeterministicFindings([
      ...HEALTHY,
      passage("Authorized signatory: ______________ Date: ____/____/______ Stamp: ______"),
    ]);
    expect(findings.filter((f) => f.kind === "PLACEHOLDER")).toEqual([]);
  });

  test("amounts in two currencies", () => {
    const findings = detectDeterministicFindings([
      ...HEALTHY,
      passage("The bid bond is SAR 500,000 while the performance bond is USD 150,000."),
    ]);
    const hit = findings.find((f) => f.provenanceDetail.detectorId === "currency-ambiguity");
    expect(hit?.kind).toBe("AMBIGUITY");
  });

  test("a day count with no working/calendar qualifier", () => {
    const findings = detectDeterministicFindings([
      ...HEALTHY,
      passage("The contractor shall respond to any change request within 10 days of notification."),
    ]);
    const hit = findings.find((f) => f.provenanceDetail.detectorId === "day-count-ambiguity");
    expect(hit?.kind).toBe("AMBIGUITY");
    expect(hit?.quotes[0].text).toContain("within 10 days");
  });

  test("qualified day counts are fine", () => {
    const findings = detectDeterministicFindings([
      ...HEALTHY,
      passage("The contractor shall respond within 10 working days; the entity replies خلال 5 أيام عمل."),
    ]);
    expect(kinds(findings)).not.toContain("AMBIGUITY:day-count-ambiguity");
  });
});

describe("risk clauses", () => {
  test("unlimited liability and termination without notice, in either language", () => {
    const findings = detectDeterministicFindings([
      ...HEALTHY,
      passage("The contractor bears unlimited liability for any loss. يحق للجهة إنهاء العقد في أي وقت دون إشعار مسبق."),
    ]);
    const hits = findings.filter((f) => f.kind === "RISK_CLAUSE");
    const keys = hits.map((h) => h.provenanceDetail.key).sort();
    expect(keys).toEqual(["liability-unlimited", "termination-no-notice"]);
    expect(hits.every((h) => h.severity === "MAJOR")).toBe(true);
  });

  test("a penalty with no cap anywhere in the tender", () => {
    const findings = detectDeterministicFindings([
      HEALTHY[0],
      HEALTHY[1],
      HEALTHY[2],
      passage("A delay penalty of 2% per week applies to late milestones."),
    ]);
    expect(findings.some((f) => f.provenanceDetail.key === "penalty-uncapped")).toBe(true);
  });
});

describe("finding shape", () => {
  test("every finding is bilingual, fingerprinted, and never names a price", () => {
    const findings = detectDeterministicFindings([
      passage("Deadline 2026-03-15. Deadline 2026-03-20. Technical 70%. Technical 60%. Warranty: TBD. Annex 9 applies. Unlimited liability. Within 10 days. SAR 1 and USD 2."),
    ]);
    expect(findings.length).toBeGreaterThan(4);
    for (const f of findings) {
      expect(f.titleAr).toMatch(/[؀-ۿ]/);
      expect(f.titleEn.length).toBeGreaterThan(3);
      expect(f.questionAr).toMatch(/[؀-ۿ]/);
      expect(f.questionEn.length).toBeGreaterThan(10);
      expect(f.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(f.provenance).toBe("DETERMINISTIC");
      expect(`${f.questionEn} ${f.rationaleEn}`).not.toMatch(/\b(discount|margin|markup)\b/i);
    }
    // Identity is stable across runs.
    expect(new Set(findings.map((f) => f.fingerprint)).size).toBe(findings.length);
  });
});
