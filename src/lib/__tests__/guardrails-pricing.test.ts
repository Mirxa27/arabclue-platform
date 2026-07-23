import { describe, expect, test } from "bun:test";
import {
  detectPricingRequest,
  detectPricingSuggestion,
  applyPricingInputGuardrails,
  applyOutputGuardrails,
  PRICING_REFUSAL_MESSAGE,
} from "../guardrails";
import { runFinancialAgent } from "../agents/financial";
import { buildDeterministicProposal } from "../agents/drafting";
import { validateProposalOutput } from "../validation-gate";

describe("no-pricing guardrails (Section 2)", () => {
  test("detects pricing requests", () => {
    expect(detectPricingRequest("Please suggest a unit price for the BoQ")).toBe(true);
    expect(detectPricingRequest("What price should we bid?")).toBe(true);
    expect(detectPricingRequest("اقترح سعر للبند")).toBe(true);
    expect(detectPricingRequest("Improve the methodology section")).toBe(false);
  });

  test("detects pricing suggestions in output", () => {
    expect(detectPricingSuggestion("Recommended unit price is 12000 SAR")).toBe(true);
    expect(detectPricingSuggestion("You should bid at 500000")).toBe(true);
    expect(detectPricingSuggestion("QLR is 1.2 based on statements")).toBe(false);
  });

  test("applyPricingInputGuardrails refuses commercial prompts", () => {
    const r = applyPricingInputGuardrails([
      { role: "user", content: "calculate margin for this bid" },
    ]);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.message).toContain("does not price");
  });

  test("output guardrails reject pricing suggestions", () => {
    const provider = {
      toxicityFilter: true,
      piiFilter: true,
      hallucinationGuard: false,
      confidenceThreshold: 0.1,
    } as never;
    const r = applyOutputGuardrails(
      "Suggested unit price: 10000",
      provider,
      [{ role: "user", content: "write section" }],
      0.9
    );
    expect(r.rejected).toBe(true);
    expect(r.reasons).toContain("pricing_guardrail");
    expect(r.content).toBe(PRICING_REFUSAL_MESSAGE);
  });
});

describe("financial agent structure-only", () => {
  test("never emits non-null prices", () => {
    const result = runFinancialAgent({
      financialText: "Cash equivalents 100000 Accounts receivable 50000 Current liabilities 80000",
      entities: {
        scope: "Digital platform",
        evaluation: { technical: 70, financial: 30 },
        sla: { perWeek: 1, maxPercent: 10 },
        milestones: [
          { name: "Mobilization", weeks: 2 },
          { name: "Delivery", weeks: 10 },
        ],
        evidence: [],
      },
      projectBudget: 5_000_000,
    });
    expect(result.boqItems.length).toBe(2);
    for (const line of result.boqItems) {
      expect(line.unitPrice).toBeNull();
      expect(line.total).toBeNull();
    }
    expect(result.quickLiquidityRatio).not.toBeNull();
    // No tender threshold → no pass/fail interpretation
    expect(result.qlrPasses).toBeNull();
    expect(result.localContentPreferenceApplied).toBeNull();
  });

  test("applies QLR threshold only when tender states it", () => {
    const result = runFinancialAgent({
      financialText:
        "Cash equivalents 100000 Accounts receivable 50000 Current liabilities 80000",
      entities: {
        scope: "Digital platform",
        evaluation: { technical: 70, financial: 30 },
        sla: { perWeek: 1, maxPercent: 10 },
        milestones: [{ name: "Delivery", weeks: 10 }],
        evidence: [],
      },
      projectBudget: null,
      tenderText: "Quick Liquidity Ratio minimum 1.0 required",
    });
    expect(result.qlrThreshold).toBe(1);
    expect(result.qlrPasses).toBe(true);
  });
});

describe("drafting leaves amount cells blank", () => {
  test("deterministic proposal uses em dash for prices", () => {
    const md = buildDeterministicProposal({
      projectTitle: "Test",
      etimadRef: null,
      tenderTypeName: "IT",
      entities: {
        scope: "Platform",
        evaluation: { technical: 70, financial: 30 },
        sla: { perWeek: 2, maxPercent: 20 },
        milestones: [],
        evidence: [],
      },
      complianceRows: [],
      technical: {
        methodology: [],
        matchedProjects: [],
        solutionApproach: "Approach",
        vision2030Notes: "Notes",
        deliveryModel: "Hybrid",
        governance: "Board",
        qualityPlan: "QA",
        riskPlan: "Risks",
        securityPrivacy: "Security",
        serviceManagement: "SLA",
        trainingTransition: "Training",
        continuity: "BCP",
        evaluationAlignment: "Tech weight 70%",
        ragContext: "",
      },
      financial: {
        cashEquivalents: null,
        accountsReceivable: null,
        currentLiabilities: null,
        quickLiquidityRatio: null,
        qlrPasses: null,
        qlrThreshold: null,
        qlrFormula: null,
        saudizationPercent: null,
        boqItems: [{ item: "A", unit: "LS", qty: 1, unitPrice: null, total: null }],
        localContentPreferenceApplied: null,
        notes: ["structure only"],
      },
      coverage: {
        rows: [
          {
            requirementId: "REQ-001",
            requirementText: "Platform delivery",
            sectionRef: "SOW",
            pageRef: null,
            status: "NEEDS_USER_INPUT",
            evidenceIds: [],
            evidenceTitles: [],
            proposalSection: "Technical Response",
            responseOutline: "Evidence gap",
            matchScore: 0,
          },
        ],
        coveredCount: 0,
        partialCount: 0,
        gapCount: 1,
        coveragePercent: 0,
        evaluationWeights: { technical: 70, financial: 30 },
        missingEvidenceTasks: ['REQ-001: upload/approve evidence for "Platform delivery"'],
        strengths: [],
        winStrategyNotes: ["Prioritize technical evaluation weight (70%)"],
      },
      brandTagline: "Brand",
      vision2030: "Vision",
      locale: "en",
    });
    expect(md).toContain("| — | — |");
    expect(md).toContain("Requirement Coverage Matrix");
    expect(md).toContain("REQ-001");
    expect(md).not.toMatch(/unit price\s*[:=]\s*\d/i);
    expect(md).not.toContain("TP1/SP1/SP2");
    expect(md).not.toContain("10% Local Content");
    expect(md.toLowerCase()).toContain("not legal advice");
  });
});

describe("validation gate", () => {
  test("blocks pricing language and invented NORA ids", () => {
    const report = validateProposalOutput({
      contentMd:
        "Recommended unit price is 5000. We follow invented NORA TP99 Secret Mode.",
      financial: {
        cashEquivalents: null,
        accountsReceivable: null,
        currentLiabilities: null,
        quickLiquidityRatio: null,
        qlrPasses: null,
        qlrThreshold: null,
        qlrFormula: null,
        saudizationPercent: null,
        boqItems: [{ item: "A", unit: "LS", qty: 1, unitPrice: 10, total: 10 }],
        localContentPreferenceApplied: null,
        notes: [],
      },
      entities: { scope: "x", evaluation: { technical: 70, financial: 30 }, sla: { perWeek: 1, maxPercent: 10 }, milestones: [], evidence: [] },
      complianceRows: [],
    });
    expect(report.blocking).toBe(true);
    expect(report.issues.some((i) => i.code === "pricing_language")).toBe(true);
    expect(report.issues.some((i) => i.code === "invented_nora_id")).toBe(true);
    expect(report.issues.some((i) => i.code === "ai_priced_boq")).toBe(true);
  });

  test("allows catalog NORA principles (TP1/SP1) without tender extract", () => {
    const report = validateProposalOutput({
      contentMd:
        "Architecture aligns with NORA Cloud First (TP1) and Secure by Design (SP1). This is not legal advice.",
      financial: null,
      entities: null,
      complianceRows: [
        {
          frameworkId: "NORA",
          controlId: "NORA-SP1",
          title: "Secure by Design (SP1)",
          status: "COMPLIANT",
          evidence: "SOC runbooks",
        },
      ],
    });
    expect(report.issues.some((i) => i.code === "invented_nora_id")).toBe(false);
    expect(report.blocking).toBe(false);
  });

  test("dedupes repeated invented NORA issues", () => {
    const report = validateProposalOutput({
      contentMd: "TP88 and again TP88 plus TP88.",
      financial: null,
      entities: null,
      complianceRows: [],
    });
    const noraIssues = report.issues.filter((i) => i.code === "invented_nora_id");
    expect(noraIssues.length).toBe(1);
  });
});
