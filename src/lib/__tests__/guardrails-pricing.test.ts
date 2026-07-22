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
  });
});

describe("drafting leaves amount cells blank", () => {
  test("deterministic proposal uses em dash for prices", () => {
    const md = buildDeterministicProposal({
      projectTitle: "Test",
      etimadRef: null,
      tenderTypeName: "IT",
      entities: null,
      complianceRows: [],
      technical: {
        methodology: [],
        matchedProjects: [],
        solutionApproach: "Approach",
        vision2030Notes: "notes",
        ragContext: "none",
      },
      financial: {
        cashEquivalents: 1,
        accountsReceivable: 1,
        currentLiabilities: 1,
        quickLiquidityRatio: 2,
        qlrPasses: true,
        saudizationPercent: 40,
        boqItems: [{ item: "Build", unit: "LS", qty: 1, unitPrice: null, total: null }],
        localContentPreferenceApplied: 0.1,
        notes: ["n"],
      },
      brandTagline: "Arabclue",
      vision2030: "thriving-economy",
      locale: "en",
    });
    expect(md).toContain("| Build | LS | 1 | — | — |");
    expect(md).not.toContain("| Build | LS | 1 | 100 |");
  });
});
