/**
 * What a model's answer has to be before a generator will present it as
 * AI-generated. The rules are the same everywhere: an identifier the request
 * never contained is a fabrication and is dropped, a verdict without a
 * citation is not a verdict, and a shape that does not fit is a schema
 * rejection rather than an object with empty strings in it.
 *
 * These are the pure admission functions, fed model text directly; the
 * provider path around them is exercised in
 * `__tests-isolated/generator-schema-rejection.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { parseAiFindings, parseAiGaps, type ComplianceFinding } from "../../ai/compliance-analyzer";
import {
  parseAiClauses,
  parseAiConsistencyChecks,
  parseAiVariableInferences,
} from "../../ai/contract-drafting-assistant";
import {
  knownRequirementIds,
  parseAiScore,
  parseAiSuggestions,
} from "../../ai/proposal-optimizer";
import {
  parseAiMatchScores,
  parseAiPredictions,
  requirementIdsFor,
  type VendorInput,
} from "../../ai/vendor-matching-engine";
import { normalizeContractMarkdown, parseContractArticles } from "../../agents/law-contract";

const provenance: ComplianceFinding["provenance"] = {
  source: "DETERMINISTIC_FALLBACK",
  provider: "deterministic",
  model: "test",
  engine: "COMPLIANCE",
  generatedAt: "2026-01-01T00:00:00.000Z",
  confidence: 0.7,
  fallback: true,
};

function knownControl(controlId: string, over: Partial<ComplianceFinding> = {}): ComplianceFinding {
  return {
    controlId,
    frameworkId: "NCA_ECC1",
    status: "WARNING",
    evidenceEn: "baseline",
    evidenceAr: "الأساس",
    remediationEn: null,
    remediationAr: null,
    sourceCategory: "REGULATORY_CANDIDATE",
    policyVersionId: "nca-ecc-baseline",
    sourceRef: null,
    legalReviewStatus: "NOT_LEGAL_ADVICE",
    provenance,
    ...over,
  };
}

describe("compliance-analyzer admission", () => {
  const known = [knownControl("ECC-1.1"), knownControl("PDPL-14", { frameworkId: "PDPL", policyVersionId: "pdpl-ksa-baseline" })];

  test("a finding for a control the matrix never listed is dropped", () => {
    const answer = JSON.stringify({
      findings: [
        { controlId: "ECC-1.1", frameworkId: "NCA_ECC1", status: "WARNING", evidenceEn: "e", evidenceAr: "د" },
        { controlId: "ECC-9.9", frameworkId: "NCA_ECC1", status: "PASS", evidenceEn: "invented", evidenceAr: "مختلق", sourceRef: "§9" },
      ],
    });
    const parsed = parseAiFindings(answer, known);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("unreachable");
    expect(parsed.data.map((f) => f.controlId)).toEqual(["ECC-1.1"]);
  });

  test("PASS without a citation becomes WARNING with legal review required", () => {
    const answer = JSON.stringify({
      findings: [
        { controlId: "ECC-1.1", status: "PASS", evidenceEn: "looks fine", evidenceAr: "يبدو جيداً", sourceRef: null },
        { controlId: "PDPL-14", status: "FAIL", evidenceEn: "no residency clause", evidenceAr: "لا يوجد بند إقامة", sourceRef: "§4.2: data may be hosted abroad", legalReviewStatus: "REQUIRED" },
      ],
    });
    const parsed = parseAiFindings(answer, known);
    if (!parsed.ok) throw new Error("unreachable");
    const [uncited, cited] = parsed.data;
    expect(uncited.status).toBe("WARNING");
    expect(uncited.legalReviewStatus).toBe("REQUIRED");
    expect(uncited.sourceRef).toBeNull();
    expect(cited.status).toBe("FAIL");
    expect(cited.sourceRef).toBe("§4.2: data may be hosted abroad");
  });

  test("framework and registry entry come from the matrix row, not from the answer", () => {
    const answer = JSON.stringify({
      findings: [{ controlId: "PDPL-14", frameworkId: "MADE_UP", policyVersionId: "made-up", status: "WARNING", evidenceEn: "e", evidenceAr: "د" }],
    });
    const parsed = parseAiFindings(answer, known);
    if (!parsed.ok) throw new Error("unreachable");
    expect(parsed.data[0].frameworkId).toBe("PDPL");
    expect(parsed.data[0].policyVersionId).toBe("pdpl-ksa-baseline");
  });

  test("a mis-shaped answer is a rejection with the failing path, not an empty finding", () => {
    const parsed = parseAiFindings('{"findings": [{"controlId": "ECC-1.1", "status": "MAYBE"}]}', known);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("unreachable");
    expect(parsed.issues.join(" ")).toMatch(/findings\.0\./);
  });

  test("a gap that needs counsel is never CRITICAL, and unknown controls are dropped", () => {
    const answer = JSON.stringify({
      gaps: [
        { controlId: "PDPL-14", gapEn: "silent on transfers", gapAr: "لا يتناول النقل", severity: "CRITICAL", remediationEn: "r", remediationAr: "ع", legalReviewStatus: "REQUIRED" },
        { controlId: "NORA-XX9", gapEn: "x", gapAr: "س", severity: "MINOR", remediationEn: "r", remediationAr: "ع" },
      ],
    });
    const parsed = parseAiGaps(answer, known);
    if (!parsed.ok) throw new Error("unreachable");
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0].severity).toBe("MAJOR");
    expect(parsed.data[0].policyVersionId).toBe("pdpl-ksa-baseline");
  });
});

describe("contract-drafting-assistant admission", () => {
  const clause = (clauseId: string, over: Record<string, unknown> = {}) => ({
    clauseId,
    titleEn: "T",
    titleAr: "ع",
    bodyEn: "The Contractor shall…",
    bodyAr: "يلتزم المتعاقد بـ…",
    riskLevel: "LOW",
    riskNotesEn: "",
    riskNotesAr: "",
    sourceRef: `template:${clauseId}`,
    legalReviewStatus: "NOT_LEGAL_ADVICE",
    ...over,
  });

  test("only the template's clause ids and a bounded number of custom.* clauses are admitted", () => {
    const answer = JSON.stringify({
      clauses: [
        clause("clause.parties"),
        clause("clause.not-in-this-template"),
        clause("custom.escrow", { sourceRef: "tender:scope" }),
        clause("custom.step-in", { sourceRef: "tender:scope" }),
        clause("custom.exit", { sourceRef: "tender:scope" }),
        clause("custom.one-too-many", { sourceRef: "tender:scope" }),
        clause("Custom Clause With Spaces"),
      ],
    });
    const parsed = parseAiClauses(answer, "it-services-v1");
    if (!parsed.ok) throw new Error("unreachable");
    expect(parsed.data.map((c) => c.clauseId)).toEqual([
      "clause.parties",
      "custom.escrow",
      "custom.step-in",
      "custom.exit",
    ]);
    for (const custom of parsed.data.filter((c) => c.clauseId.startsWith("custom."))) {
      expect(custom.riskLevel).toBe("HIGH");
      expect(custom.legalReviewStatus).toBe("REQUIRED");
    }
  });

  test("an ungrounded clause is kept as HIGH risk with legal review, and HIGH always means review", () => {
    const answer = JSON.stringify({
      clauses: [
        clause("clause.liability", { sourceRef: null, riskLevel: "LOW" }),
        clause("clause.termination", { riskLevel: "HIGH", legalReviewStatus: "NOT_LEGAL_ADVICE" }),
      ],
    });
    const parsed = parseAiClauses(answer, "it-services-v1");
    if (!parsed.ok) throw new Error("unreachable");
    expect(parsed.data[0]).toMatchObject({ riskLevel: "HIGH", legalReviewStatus: "REQUIRED", sourceRef: null });
    expect(parsed.data[1]).toMatchObject({ riskLevel: "HIGH", legalReviewStatus: "REQUIRED" });
  });

  test("a clause missing one language body is dropped", () => {
    const answer = JSON.stringify({ clauses: [clause("clause.scope", { bodyAr: "  " })] });
    const parsed = parseAiClauses(answer, "it-services-v1");
    if (!parsed.ok) throw new Error("unreachable");
    expect(parsed.data).toEqual([]);
  });

  test("variable values bind only to keys the template defines", () => {
    const answer = JSON.stringify({
      inferences: [
        { variableKey: "input.scopeDescription", inferredValue: "Managed services", confidence: 1.7, source: "entities.scope" },
        { variableKey: "input.unitPrice", inferredValue: "12000", confidence: 0.9, source: "guess" },
        { variableKey: "input.termStartDate", inferredValue: "  ", confidence: 0.9, source: "entities" },
      ],
    });
    const parsed = parseAiVariableInferences(answer, "it-services-v1");
    if (!parsed.ok) throw new Error("unreachable");
    expect(parsed.data).toEqual([
      { variableKey: "input.scopeDescription", inferredValue: "Managed services", confidence: 1, source: "entities.scope" },
    ]);
  });

  test("consistency checks are admitted only for the clauses that were shown", () => {
    const answer = JSON.stringify({
      checks: [
        { clauseId: "clause.parties", isConsistent: true, discrepancyEn: "", discrepancyAr: "" },
        { clauseId: "clause.ghost", isConsistent: false, discrepancyEn: "x", discrepancyAr: "س" },
      ],
    });
    const parsed = parseAiConsistencyChecks(answer, ["clause.parties"]);
    if (!parsed.ok) throw new Error("unreachable");
    expect(parsed.data.map((c) => c.clauseId)).toEqual(["clause.parties"]);
  });
});

describe("proposal-optimizer admission", () => {
  const input = {
    contentMd: "## 4. Coverage\n| REQ-1 | support | COVERED |\nECC-1.1 is addressed.",
    complianceRows: [{ controlId: "PDPL-14" }],
    coverage: { missingEvidenceTasks: ["Provide evidence for REQ-7"] },
  };

  test("known requirement ids come from the document, the gaps, and the matrix", () => {
    const ids = knownRequirementIds(input);
    for (const id of ["REQ-1", "ECC-1.1", "PDPL-14", "REQ-7"]) expect(ids.has(id)).toBe(true);
    expect(ids.has("REQ-99")).toBe(false);
  });

  test("a suggestion citing a coined requirement id is dropped; null and known ids survive", () => {
    const answer = JSON.stringify({
      suggestions: [
        { sectionId: "4. Coverage", requirementId: "REQ-99", suggestionEn: "invented", suggestionAr: "مختلق", priority: "HIGH" },
        { sectionId: "4. Coverage", requirementId: "req-7", suggestionEn: "cite the evidence", suggestionAr: "استشهد بالدليل", priority: "HIGH" },
        { sectionId: "structure", requirementId: null, suggestionEn: "add headings", suggestionAr: "أضف عناوين", priority: "MEDIUM" },
        { sectionId: "structure", requirementId: null, suggestionEn: "", suggestionAr: "", priority: "LOW" },
      ],
    });
    const parsed = parseAiSuggestions(answer, knownRequirementIds(input));
    if (!parsed.ok) throw new Error("unreachable");
    expect(parsed.data.map((s) => s.requirementId)).toEqual(["req-7", null]);
  });

  test("scores are clamped and a non-numeric score is a rejection", () => {
    const ok = parseAiScore('{"overall": 140, "coverage": -5, "compliance": 50, "clarity": 50, "competitiveness": 50}');
    if (!ok.ok) throw new Error("unreachable");
    expect(ok.data.overall).toBe(100);
    expect(ok.data.coverage).toBe(0);
    expect(ok.data.breakdown).toEqual([]);
    expect(parseAiScore('{"overall": "high", "coverage": 1, "compliance": 1, "clarity": 1, "competitiveness": 1}').ok).toBe(false);
  });
});

describe("vendor-matching-engine admission", () => {
  const vendors: VendorInput[] = [
    { vendorId: "v-1", vendorName: "TechCorp", vendorNameAr: "تك كورب", workspace: {}, certificates: [] },
    { vendorId: "v-2", vendorName: "ServicesCo", vendorNameAr: "سيرفيسز كو", workspace: {}, certificates: [] },
  ];
  const requirementIds = requirementIdsFor(["IT services", "cloud"]);

  test("requirement ids are REQ-n in input order", () => {
    expect(requirementIds).toEqual(["REQ-1", "REQ-2"]);
  });

  test("a vendor the request never listed is dropped, and names come from the input", () => {
    const answer = JSON.stringify({
      matches: [
        { vendorId: "v-1", matchScore: 80, confidence: 0.8, matchedRequirements: ["REQ-1"], unmatchedRequirements: ["REQ-2"], gapRecommendations: [] },
        { vendorId: "v-fabricated", matchScore: 95, confidence: 0.9, matchedRequirements: ["REQ-1", "REQ-2"], unmatchedRequirements: [], gapRecommendations: [] },
      ],
    });
    const parsed = parseAiMatchScores(answer, vendors, requirementIds);
    if (!parsed.ok) throw new Error("unreachable");
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0]).toMatchObject({ vendorId: "v-1", vendorName: "TechCorp", vendorNameAr: "تك كورب" });
  });

  test("requirement ids the tender does not have are dropped from the lists and the recommendations", () => {
    const answer = JSON.stringify({
      matches: [
        {
          vendorId: "v-2",
          matchScore: 40,
          confidence: 0.4,
          matchedRequirements: ["REQ-1", "REQ-77"],
          unmatchedRequirements: ["REQ-2", "REQ-1", "cloud"],
          gapRecommendations: [
            { requirementId: "REQ-2", recommendationEn: "evidence a cloud project", recommendationAr: "أثبت مشروعاً سحابياً", priority: "HIGH" },
            { requirementId: "REQ-77", recommendationEn: "x", recommendationAr: "س", priority: "LOW" },
          ],
        },
      ],
    });
    const parsed = parseAiMatchScores(answer, vendors, requirementIds);
    if (!parsed.ok) throw new Error("unreachable");
    const [m] = parsed.data;
    expect(m.matchedRequirements).toEqual(["REQ-1"]);
    // A requirement cannot be both matched and unmatched; matched wins.
    expect(m.unmatchedRequirements).toEqual(["REQ-2"]);
    expect(m.gapRecommendations.map((g) => g.requirementId)).toEqual(["REQ-2"]);
  });

  test("predictions for unknown vendors are dropped and values clamped", () => {
    const answer = JSON.stringify({
      predictions: [
        { vendorId: "v-1", winProbability: 130, confidence: 2, factors: [{ factorEn: "match", factorAr: "تطابق", impact: "POSITIVE", weight: 0.5 }] },
        { vendorId: "nobody", winProbability: 50, confidence: 0.5, factors: [] },
      ],
    });
    const parsed = parseAiPredictions(answer, vendors);
    if (!parsed.ok) throw new Error("unreachable");
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0]).toMatchObject({ vendorId: "v-1", vendorName: "TechCorp", winProbability: 100, confidence: 1 });
  });
});

describe("law-contract markdown normalization", () => {
  test("a fenced draft with hyphenated headers and padded markers parses into articles", () => {
    const raw = [
      "```markdown",
      "# DRAFT CONTRACT | مسودة عقد",
      "",
      "### Article 1 - Parties | المادة 1 - الأطراف",
      ":::en  ",
      "English body.",
      ":::",
      ":::AR",
      "نص عربي.",
      ":::",
      "",
      "### Article 2 – Scope | المادة 2 – النطاق",
      ":::en",
      "Scope.",
      ":::",
      ":::ar",
      "النطاق.",
      ":::",
      "```",
    ].join("\n");

    // Anti-vacuous: the raw text is exactly what the parser used to reject.
    expect(parseContractArticles(raw)).toHaveLength(0);

    const normalized = normalizeContractMarkdown(raw);
    const articles = parseContractArticles(normalized);
    expect(articles.map((a) => a.titleEn)).toEqual(["Parties", "Scope"]);
    expect(articles[0].bodyAr).toBe("نص عربي.");
    expect(normalized.startsWith("# DRAFT CONTRACT")).toBe(true);
  });

  test("a well-formed draft passes through unchanged", () => {
    const md = "### Article 1 — Parties | المادة 1 — الأطراف\n:::en\nBody.\n:::\n:::ar\nنص.\n:::";
    expect(normalizeContractMarkdown(md)).toBe(md);
  });
});
