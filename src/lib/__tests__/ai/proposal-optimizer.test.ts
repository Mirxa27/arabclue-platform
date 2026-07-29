import { afterAll, describe, expect, it } from "bun:test";
import { installNoExternalNetworkGuard } from "../support/provider-mocks";
import {
  scoreProposal,
  generateImprovementSuggestions,
  optimizeSection,
  estimateWinProbability,
  optimizeProposal,
} from "../../ai/proposal-optimizer";
import type { IngestionEntities, ComplianceMatrixRow } from "../../types";

const guard = installNoExternalNetworkGuard();

afterAll(() => {
  guard();
});

const mockEntities: IngestionEntities = {
  scope: "IT infrastructure implementation",
  evaluation: { technical: 70, financial: 30 },
  sla: { perWeek: 2, maxPercent: 10 },
  milestones: [{ name: "Phase 1", weeks: 4 }],
  evidence: ["ISO certificate"],
  requirements: [{ text: "Provide 24/7 support" }],
};

const mockComplianceRows: ComplianceMatrixRow[] = [
  {
    frameworkId: "PDPL",
    controlId: "PDPL-14",
    title: "Data residency",
    status: "COMPLIANT",
    evidence: "KSA residency",
    sourceCategory: "EXPLICIT_TENDER",
    legalReviewStatus: "REQUIRED",
    policyVersionId: "pdpl-ksa-baseline",
  },
  {
    frameworkId: "NCA_ECC",
    controlId: "ECC-1.1",
    title: "Cybersecurity",
    status: "PARTIAL",
    evidence: "Partial",
    remediation: "Provide evidence",
    sourceCategory: "REGULATORY_CANDIDATE",
    legalReviewStatus: "REQUIRED",
    policyVersionId: "nca-ecc-baseline",
  },
];

const sampleContentMd = `# Technical Proposal — Test Project

## 1. Executive Summary
This proposal covers IT infrastructure implementation.

| ID | Requirement | Status |
| --- | --- | --- |
| REQ-1 | 24/7 support | COVERED |

Compliance matrices and regulatory commentary are assisted drafting aids, not legal advice.
`;

describe("proposal-optimizer", () => {
  describe("deterministic scoring", () => {
    it("scores proposal with coverage, compliance, clarity, competitiveness", async () => {
      const score = await scoreProposal({
        contentMd: sampleContentMd,
        entities: mockEntities,
        complianceRows: mockComplianceRows,
        coverage: null,
        locale: "en",
        workspaceId: "ws-1",
      });

      expect(score.overall).toBeGreaterThanOrEqual(0);
      expect(score.overall).toBeLessThanOrEqual(100);
      expect(score.coverage).toBeGreaterThanOrEqual(0);
      expect(score.compliance).toBeGreaterThanOrEqual(0);
      expect(score.clarity).toBeGreaterThanOrEqual(0);
      expect(score.competitiveness).toBeGreaterThanOrEqual(0);
      expect(score.breakdown.length).toBe(4);
      expect(score.provenance.source).toBe("DETERMINISTIC_FALLBACK");
    });

    it("clarity score reflects document structure", async () => {
      const wellStructured = `## Section 1\n| Col | Val |\n| --- | --- |\n| A | B |\nREQ-1\nnot legal advice`;
      const poor = `just plain text without structure`;

      const goodScore = await scoreProposal({
        contentMd: wellStructured,
        entities: null,
        complianceRows: [],
        coverage: null,
        locale: "en",
        workspaceId: "ws-1",
      });

      const poorScore = await scoreProposal({
        contentMd: poor,
        entities: null,
        complianceRows: [],
        coverage: null,
        locale: "en",
        workspaceId: "ws-1",
      });

      expect(goodScore.clarity).toBeGreaterThan(poorScore.clarity);
    });
  });

  describe("improvement suggestions", () => {
    it("generates suggestions for compliance gaps", async () => {
      const suggestions = await generateImprovementSuggestions({
        contentMd: sampleContentMd,
        entities: mockEntities,
        complianceRows: mockComplianceRows,
        coverage: null,
        locale: "en",
        workspaceId: "ws-1",
      });

      expect(suggestions.length).toBeGreaterThan(0);
      const complianceSuggestion = suggestions.find(
        (s) => s.requirementId === "ECC-1.1"
      );
      expect(complianceSuggestion).toBeDefined();
      expect(complianceSuggestion!.suggestionEn).toBeTruthy();
      expect(complianceSuggestion!.suggestionAr).toBeTruthy();
    });

    it("suggests adding legal disclaimer when missing", async () => {
      const suggestions = await generateImprovementSuggestions({
        contentMd: "## Section\nNo disclaimer here",
        entities: null,
        complianceRows: [],
        coverage: null,
        locale: "en",
        workspaceId: "ws-1",
      });

      const disclaimerSuggestion = suggestions.find(
        (s) => s.suggestionEn.includes("legal disclaimer")
      );
      expect(disclaimerSuggestion).toBeDefined();
      expect(disclaimerSuggestion!.priority).toBe("HIGH");
    });
  });

  describe("section optimization", () => {
    it("optimizes a section deterministically", async () => {
      const result = await optimizeSection(
        "executive-summary",
        "Plain text without heading",
        {
          contentMd: sampleContentMd,
          entities: mockEntities,
          complianceRows: mockComplianceRows,
          coverage: null,
          locale: "en",
          workspaceId: "ws-1",
        }
      );

      expect(result.sectionId).toBe("executive-summary");
      expect(result.originalContent).toBe("Plain text without heading");
      expect(result.optimizedContent).toContain("##");
      expect(result.improvementsEn.length).toBeGreaterThan(0);
      expect(result.improvementsAr.length).toBeGreaterThan(0);
    });
  });

  describe("win probability estimation", () => {
    it("estimates probability with factors", async () => {
      const prediction = await estimateWinProbability({
        contentMd: sampleContentMd,
        entities: mockEntities,
        complianceRows: mockComplianceRows,
        coverage: null,
        locale: "en",
        workspaceId: "ws-1",
        historicalWinRate: 60,
      });

      expect(prediction.probability).toBeGreaterThanOrEqual(0);
      expect(prediction.probability).toBeLessThanOrEqual(100);
      expect(prediction.factors.length).toBeGreaterThan(0);
      expect(prediction.confidence).toBeGreaterThan(0);
    });

    it("incorporates historical win rate", async () => {
      const withHistory = await estimateWinProbability({
        contentMd: sampleContentMd,
        entities: mockEntities,
        complianceRows: mockComplianceRows,
        coverage: null,
        locale: "en",
        workspaceId: "ws-1",
        historicalWinRate: 80,
      });

      const withoutHistory = await estimateWinProbability({
        contentMd: sampleContentMd,
        entities: mockEntities,
        complianceRows: mockComplianceRows,
        coverage: null,
        locale: "en",
        workspaceId: "ws-1",
        historicalWinRate: null,
      });

      expect(withHistory.factors.length).toBeGreaterThan(withoutHistory.factors.length);
    });
  });

  describe("full optimization orchestration", () => {
    it("produces complete optimization result", async () => {
      const result = await optimizeProposal({
        contentMd: sampleContentMd,
        entities: mockEntities,
        complianceRows: mockComplianceRows,
        coverage: null,
        locale: "en",
        workspaceId: "ws-1",
      });

      expect(result.score).toBeDefined();
      expect(result.suggestions).toBeDefined();
      expect(result.sectionOptimizations).toBeDefined();
      expect(result.winProbability).toBeDefined();
      expect(result.provenance).toBeDefined();
    });
  });

  describe("no pricing suggestions (guardrail)", () => {
    it("never suggests pricing in improvement suggestions", async () => {
      const suggestions = await generateImprovementSuggestions({
        contentMd: sampleContentMd,
        entities: mockEntities,
        complianceRows: mockComplianceRows,
        coverage: null,
        locale: "en",
        workspaceId: "ws-1",
      });

      for (const s of suggestions) {
        expect(s.suggestionEn.toLowerCase()).not.toContain("price");
        expect(s.suggestionEn.toLowerCase()).not.toContain("discount");
        expect(s.suggestionEn.toLowerCase()).not.toContain("margin");
      }
    });
  });
});
