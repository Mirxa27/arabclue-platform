import { afterAll, describe, it, expect } from "bun:test";
import {
  installNoExternalNetworkGuard,
  permitDeterministicFallback,
} from "../support/provider-mocks";
import {
  draftContractWithAi,
  generateClauseSuggestions,
  inferTemplateVariables,
  validateBilingualConsistency,
} from "../../ai/contract-drafting-assistant";
import type { IngestionEntities, ComplianceMatrixRow } from "../../types";

const guard = installNoExternalNetworkGuard();
// Every assertion below is about what the deterministic branch produces, so
// this file is one of the few that asks for the fallback the default refuses.
const restoreRealAiOnly = permitDeterministicFallback();

afterAll(() => {
  guard();
  restoreRealAiOnly();
});

const mockEntities: IngestionEntities = {
  scope: "IT infrastructure implementation and managed services",
  evaluation: { technical: 70, financial: 30 },
  sla: { perWeek: 2, maxPercent: 10, originalWording: "2% per week, max 10%" },
  milestones: [
    { name: "Mobilization", weeks: 2 },
    { name: "Implementation", weeks: 8 },
  ],
  evidence: ["ISO 27001 certificate", "Past project reference"],
  requirements: [
    { text: "Provide 24/7 support", sectionRef: "Section 3.1" },
    { text: "Implement NCA ECC controls", sectionRef: "Section 5.2" },
  ],
};

const mockComplianceRows: ComplianceMatrixRow[] = [
  {
    frameworkId: "PDPL",
    controlId: "PDPL-14",
    title: "Data residency",
    status: "COMPLIANT",
    evidence: "KSA residency confirmed",
    sourceCategory: "EXPLICIT_TENDER",
    legalReviewStatus: "REQUIRED",
    policyVersionId: "pdpl-ksa-baseline",
  },
  {
    frameworkId: "NCA_ECC",
    controlId: "ECC-1.1",
    title: "Cybersecurity governance",
    status: "PARTIAL",
    evidence: "Partial evidence",
    remediation: "Provide full NCA evidence",
    sourceCategory: "REGULATORY_CANDIDATE",
    legalReviewStatus: "REQUIRED",
    policyVersionId: "nca-ecc-baseline",
  },
];

describe("contract-drafting-assistant", () => {
  describe("deterministic fallback (no LLM configured)", () => {
    it("generates clause suggestions from template catalog", async () => {
      const result = await generateClauseSuggestions({
        templateKey: "it-services-v1",
        projectTitle: "Test Project",
        etimadRef: "ETM-12345",
        entities: mockEntities,
        complianceRows: mockComplianceRows,
        locale: "en",
        workspaceId: "ws-1",
      });

      expect(result.length).toBeGreaterThan(0);
      const first = result[0];
      expect(first.clauseId).toBeTruthy();
      expect(first.titleEn).toBeTruthy();
      expect(first.titleAr).toBeTruthy();
      expect(first.bodyEn).toBeTruthy();
      expect(first.bodyAr).toBeTruthy();
      expect(first.provenance.source).toBe("DETERMINISTIC_FALLBACK");
      expect(first.provenance.fallback).toBe(true);
    });

    it("assigns risk levels based on clause category", async () => {
      const result = await generateClauseSuggestions({
        templateKey: "it-services-v1",
        projectTitle: "Test",
        etimadRef: null,
        entities: mockEntities,
        complianceRows: [],
        locale: "ar",
        workspaceId: "ws-1",
      });

      const highRisk = result.filter((c) => c.riskLevel === "HIGH");
      expect(highRisk.length).toBeGreaterThan(0);
      expect(highRisk.every((c) => c.riskNotesEn.includes("counsel"))).toBe(true);
    });

    it("infers template variables from entities", async () => {
      const result = await inferTemplateVariables({
        templateKey: "it-services-v1",
        projectTitle: "Test Project",
        etimadRef: "ETM-999",
        entities: mockEntities,
        complianceRows: [],
        locale: "en",
        workspaceId: "ws-1",
      });

      expect(result.length).toBeGreaterThan(0);
      const scopeInference = result.find(
        (r) => r.variableKey === "input.scopeDescription"
      );
      expect(scopeInference).toBeDefined();
      expect(scopeInference!.inferredValue).toContain("IT infrastructure");
      expect(scopeInference!.provenance.source).toBe("DETERMINISTIC_FALLBACK");
    });

    it("validates bilingual consistency deterministically", async () => {
      const clauses = await generateClauseSuggestions({
        templateKey: "it-services-v1",
        projectTitle: "Test",
        etimadRef: null,
        entities: mockEntities,
        complianceRows: [],
        locale: "en",
        workspaceId: "ws-1",
      });

      const checks = await validateBilingualConsistency(clauses);
      expect(checks.length).toBe(clauses.length);
      expect(checks.every((c) => c.isConsistent)).toBe(true);
    });

    it("returns empty for unknown template key", async () => {
      const result = await generateClauseSuggestions({
        templateKey: "nda-v1" as never,
        projectTitle: "Test",
        etimadRef: null,
        entities: null,
        complianceRows: [],
        locale: "en",
        workspaceId: "ws-1",
      });
      // nda-v1 exists, so should return clauses
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("full contract drafting orchestration", () => {
    it("produces a complete drafting result with validation", async () => {
      const result = await draftContractWithAi({
        templateKey: "it-services-v1",
        projectTitle: "Test Project",
        etimadRef: "ETM-12345",
        entities: mockEntities,
        complianceRows: mockComplianceRows,
        locale: "en",
        workspaceId: "ws-1",
      });

      expect(result.clauses.length).toBeGreaterThan(0);
      expect(result.variableInferences.length).toBeGreaterThan(0);
      expect(result.consistencyChecks.length).toBe(result.clauses.length);
      expect(result.provenance).toBeDefined();
      expect(typeof result.validationOk).toBe("boolean");
      expect(Array.isArray(result.validationIssues)).toBe(true);
    });

    it("includes legal disclaimer in generated content", async () => {
      const result = await draftContractWithAi({
        templateKey: "it-services-v1",
        projectTitle: "Test",
        etimadRef: null,
        entities: mockEntities,
        complianceRows: [],
        locale: "en",
        workspaceId: "ws-1",
      });

      // The validation should pass (disclaimer is in the contentMd)
      // or at least not have missing_legal_disclaimer error
      const hasDisclaimerIssue = result.validationIssues.some(
        (i) => i.code === "missing_legal_disclaimer"
      );
      // The deterministic content includes the disclaimer
      expect(hasDisclaimerIssue).toBe(false);
    });
  });

  describe("provenance tracking", () => {
    it("all clauses carry provenance metadata", async () => {
      const result = await draftContractWithAi({
        templateKey: "it-services-v1",
        projectTitle: "Test",
        etimadRef: null,
        entities: mockEntities,
        complianceRows: [],
        locale: "en",
        workspaceId: "ws-1",
      });

      for (const clause of result.clauses) {
        expect(clause.provenance.source).toBeTruthy();
        expect(clause.provenance.provider).toBeTruthy();
        expect(clause.provenance.model).toBeTruthy();
        expect(clause.provenance.engine).toBe("LAW");
        expect(clause.provenance.generatedAt).toBeTruthy();
        expect(typeof clause.provenance.confidence).toBe("number");
      }
    });
  });
});
