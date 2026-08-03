import { describe, it, expect } from "bun:test";
import { installNoExternalNetworkGuard } from "../support/provider-mocks";
import {
  scanCompliance,
  analyzeComplianceGaps,
  detectRegulatoryUpdates,
  generateComplianceScorecard,
} from "../../ai/compliance-analyzer";
import type { IngestionEntities } from "../../types";

const guard = installNoExternalNetworkGuard();

const mockEntities: IngestionEntities = {
  scope: "IT services with data residency requirements in KSA",
  evaluation: { technical: 70, financial: 30 },
  sla: { perWeek: 2, maxPercent: 10, originalWording: "2% per week" },
  milestones: [{ name: "Phase 1", weeks: 4 }],
  evidence: ["ISO 27001"],
  requirements: [{ text: "NCA ECC compliance required" }],
  localContentPreferencePercent: 15,
};

const sampleDocumentText = `
This proposal covers IT infrastructure implementation with KSA data residency.
NCA ECC controls are addressed. PDPL compliance is maintained.
Local content preference 15% per tender clause.
`;

describe("compliance-analyzer", () => {
  describe("deterministic compliance scanning", () => {
    it("scans document and returns findings", async () => {
      const findings = await scanCompliance({
        documentText: sampleDocumentText,
        documentType: "PROPOSAL",
        entities: mockEntities,
        tenderCategory: "SERVICES",
        locale: "en",
        workspaceId: "ws-1",
      });

      expect(findings.length).toBeGreaterThan(0);
      for (const f of findings) {
        expect(f.controlId).toBeTruthy();
        expect(f.frameworkId).toBeTruthy();
        expect(["PASS", "FAIL", "WARNING", "NOT_APPLICABLE"]).toContain(f.status);
        expect(f.evidenceEn).toBeTruthy();
        expect(f.provenance.source).toBe("DETERMINISTIC_FALLBACK");
      }
    });

    it("identifies PDPL residency when present", async () => {
      const findings = await scanCompliance({
        documentText: "Data must reside in KSA with cross-border transfer controls",
        documentType: "CONTRACT",
        entities: mockEntities,
        locale: "en",
        workspaceId: "ws-1",
      });

      const pdplFindings = findings.filter((f) => f.frameworkId === "PDPL");
      expect(pdplFindings.length).toBeGreaterThan(0);
    });
  });

  describe("gap analysis", () => {
    it("identifies compliance gaps", async () => {
      const gaps = await analyzeComplianceGaps({
        documentText: sampleDocumentText,
        documentType: "PROPOSAL",
        entities: mockEntities,
        tenderCategory: "SERVICES",
        locale: "en",
        workspaceId: "ws-1",
      });

      expect(Array.isArray(gaps)).toBe(true);
      for (const g of gaps) {
        expect(g.controlId).toBeTruthy();
        expect(g.frameworkId).toBeTruthy();
        expect(["CRITICAL", "MAJOR", "MINOR"]).toContain(g.severity);
        expect(g.gapEn).toBeTruthy();
        expect(g.remediationEn).toBeTruthy();
      }
    });
  });

  describe("regulatory update detection", () => {
    it("returns registry-based regulatory updates", async () => {
      const updates = await detectRegulatoryUpdates();

      expect(updates.length).toBeGreaterThan(0);
      for (const u of updates) {
        expect(u.policyId).toBeTruthy();
        expect(u.instrumentName).toBeTruthy();
        expect(u.instrumentNameAr).toBeTruthy();
        expect(u.reviewDate).toBeTruthy();
        expect(["NEW_VERSION", "AMENDMENT", "SUPERSESSION", "NO_CHANGE"]).toContain(
          u.updateType
        );
      }
    });
  });

  describe("compliance scorecard", () => {
    it("generates a complete scorecard", async () => {
      const scorecard = await generateComplianceScorecard({
        documentText: sampleDocumentText,
        documentType: "PROPOSAL",
        entities: mockEntities,
        tenderCategory: "SERVICES",
        locale: "en",
        workspaceId: "ws-1",
      });

      expect(scorecard.totalControls).toBeGreaterThan(0);
      expect(scorecard.passed + scorecard.failed + scorecard.warnings + scorecard.notApplicable).toBe(
        scorecard.totalControls
      );
      expect(scorecard.overallScore).toBeGreaterThanOrEqual(0);
      expect(scorecard.overallScore).toBeLessThanOrEqual(100);
      expect(scorecard.findings.length).toBe(scorecard.totalControls);
      expect(scorecard.reportEn).toContain("Compliance Scorecard");
      expect(scorecard.reportAr).toContain("بطاقة امتثال");
      expect(scorecard.provenance).toBeDefined();
    });

    it("includes legal disclaimer in reports", async () => {
      const scorecard = await generateComplianceScorecard({
        documentText: sampleDocumentText,
        documentType: "CONTRACT",
        entities: mockEntities,
        locale: "ar",
        workspaceId: "ws-1",
      });

      expect(scorecard.reportEn).toContain("not legal advice");
      expect(scorecard.reportAr).toContain("ليست استشارة قانونية");
    });
  });

  describe("evidence-backed compliance (no fabrication)", () => {
    it("never fabricates NORA principle IDs", async () => {
      const findings = await scanCompliance({
        documentText: "Standard IT proposal without NORA references",
        documentType: "PROPOSAL",
        entities: { ...mockEntities, noraPrinciplesFromTender: [] },
        locale: "en",
        workspaceId: "ws-1",
      });

      const noraFindings = findings.filter((f) => f.frameworkId === "NORA");
      for (const f of noraFindings) {
        // NORA findings should be NOT_APPLICABLE or WARNING, never PASS without evidence
        expect(f.status).not.toBe("PASS");
      }
    });
  });
});
