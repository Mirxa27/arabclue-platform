import { afterAll, describe, it, expect } from "bun:test";
import {
  installNoExternalNetworkGuard,
  permitDeterministicFallback,
} from "../support/provider-mocks";
import {
  matchVendors,
  predictVendorSuccess,
  matchVendorsWithPrediction,
} from "../../ai/vendor-matching-engine";
import type { IngestionEntities } from "../../types";

const guard = installNoExternalNetworkGuard();
// Every assertion below is about what the deterministic branch produces, so
// this file is one of the few that asks for the fallback the default refuses.
const restoreRealAiOnly = permitDeterministicFallback();

afterAll(() => {
  guard();
  restoreRealAiOnly();
});

const mockEntities: IngestionEntities = {
  scope: "IT infrastructure implementation",
  evaluation: { technical: 70, financial: 30 },
  sla: { perWeek: 2, maxPercent: 10 },
  milestones: [{ name: "Phase 1", weeks: 4 }],
  evidence: [],
  requirements: [{ text: "Provide IT services" }],
};

const mockVendors = [
  {
    vendorId: "v-1",
    vendorName: "TechCorp",
    vendorNameAr: "تك كورب",
    workspace: { crNumber: "1010101010", vatNumber: "300010101000003" },
    certificates: [
      { certType: "CR", approved: true },
      { certType: "ZATCA_VAT", approved: true },
      { certType: "GOSI", approved: true },
    ],
    historicalProposals: 10,
    historicalWins: 6,
    pastProjectTags: ["IT", "infrastructure", "cloud"],
  },
  {
    vendorId: "v-2",
    vendorName: "ServicesCo",
    vendorNameAr: "سيرفيسز كو",
    workspace: { crNumber: "2020202020", vatNumber: null },
    certificates: [{ certType: "CR", approved: true }],
    historicalProposals: 5,
    historicalWins: 1,
    pastProjectTags: ["consulting"],
  },
];

describe("vendor-matching-engine", () => {
  describe("deterministic vendor matching", () => {
    it("matches vendors to tender requirements", async () => {
      const scores = await matchVendors({
        tenderRequirements: [
          "Provide IT infrastructure services",
          "Implement cloud solutions",
          "Maintain NCA compliance",
        ],
        entities: mockEntities,
        vendors: mockVendors,
        locale: "en",
        workspaceId: "ws-1",
      });

      expect(scores.length).toBe(2);
      for (const s of scores) {
        expect(s.vendorId).toBeTruthy();
        expect(s.matchScore).toBeGreaterThanOrEqual(0);
        expect(s.matchScore).toBeLessThanOrEqual(100);
        expect(s.confidence).toBeGreaterThan(0);
        expect(s.provenance.source).toBe("DETERMINISTIC_FALLBACK");
      }
    });

    it("vendor with matching tags scores higher", async () => {
      const scores = await matchVendors({
        tenderRequirements: ["IT infrastructure", "cloud services"],
        entities: mockEntities,
        vendors: mockVendors,
        locale: "en",
        workspaceId: "ws-1",
      });

      const techCorp = scores.find((s) => s.vendorId === "v-1");
      const servicesCo = scores.find((s) => s.vendorId === "v-2");

      expect(techCorp!.matchScore).toBeGreaterThanOrEqual(servicesCo!.matchScore);
    });
  });

  describe("success prediction", () => {
    it("predicts win probability with factors", async () => {
      const matchScores = await matchVendors({
        tenderRequirements: ["IT services"],
        entities: mockEntities,
        vendors: mockVendors,
        locale: "en",
        workspaceId: "ws-1",
      });

      const predictions = await predictVendorSuccess(
        {
          tenderRequirements: ["IT services"],
          entities: mockEntities,
          vendors: mockVendors,
          locale: "en",
          workspaceId: "ws-1",
        },
        matchScores
      );

      expect(predictions.length).toBe(2);
      for (const p of predictions) {
        expect(p.winProbability).toBeGreaterThanOrEqual(0);
        expect(p.winProbability).toBeLessThanOrEqual(100);
        expect(p.confidence).toBeGreaterThan(0);
        expect(p.factors.length).toBeGreaterThan(0);
      }
    });

    it("vendor with better history has higher probability", async () => {
      const matchScores = await matchVendors({
        tenderRequirements: ["IT services"],
        entities: mockEntities,
        vendors: mockVendors,
        locale: "en",
        workspaceId: "ws-1",
      });

      const predictions = await predictVendorSuccess(
        {
          tenderRequirements: ["IT services"],
          entities: mockEntities,
          vendors: mockVendors,
          locale: "en",
          workspaceId: "ws-1",
        },
        matchScores
      );

      const techCorp = predictions.find((p) => p.vendorId === "v-1");
      const servicesCo = predictions.find((p) => p.vendorId === "v-2");

      // TechCorp has 60% win rate vs ServicesCo's 20%
      expect(techCorp!.winProbability).toBeGreaterThanOrEqual(
        servicesCo!.winProbability
      );
    });
  });

  describe("full matching orchestration", () => {
    it("produces complete matching result with reports", async () => {
      const result = await matchVendorsWithPrediction({
        tenderRequirements: ["IT infrastructure", "cloud services"],
        entities: mockEntities,
        vendors: mockVendors,
        locale: "en",
        workspaceId: "ws-1",
      });

      expect(result.profiles.length).toBe(2);
      expect(result.matchScores.length).toBe(2);
      expect(result.successPredictions.length).toBe(2);
      expect(result.reportEn).toContain("Vendor Matching Report");
      expect(result.reportAr).toContain("تقرير مطابقة الموردين");
      expect(result.provenance).toBeDefined();
    });
  });

  describe("vendor capability profiling", () => {
    it("profiles include qualification gaps", async () => {
      const result = await matchVendorsWithPrediction({
        tenderRequirements: ["IT services"],
        entities: mockEntities,
        vendors: [mockVendors[1]], // ServicesCo with only CR
        locale: "en",
        workspaceId: "ws-1",
      });

      const profile = result.profiles[0];
      expect(profile.capabilities.length).toBeGreaterThan(0);
      expect(profile.qualificationGaps.length).toBeGreaterThan(0);
      expect(profile.overallReadiness).toBeLessThan(100);
    });

    it("fully qualified vendor has fewer gaps", async () => {
      const result = await matchVendorsWithPrediction({
        tenderRequirements: ["IT services"],
        entities: mockEntities,
        vendors: [mockVendors[0]], // TechCorp with CR, VAT, GOSI
        locale: "en",
        workspaceId: "ws-1",
      });

      const profile = result.profiles[0];
      const gaps = profile.qualificationGaps.filter(
        (g) => g.reason === "missing"
      );
      expect(gaps.length).toBeLessThan(profile.capabilities.length);
    });
  });

  describe("gap recommendations", () => {
    it("provides bilingual gap recommendations", async () => {
      const result = await matchVendorsWithPrediction({
        tenderRequirements: ["IT infrastructure", "cloud", "security"],
        entities: mockEntities,
        vendors: mockVendors,
        locale: "en",
        workspaceId: "ws-1",
      });

      for (const score of result.matchScores) {
        for (const rec of score.gapRecommendations) {
          expect(rec.recommendationEn).toBeTruthy();
          expect(rec.recommendationAr).toBeTruthy();
          expect(["HIGH", "MEDIUM", "LOW"]).toContain(rec.priority);
        }
      }
    });
  });

  describe("no fabricated vendor data", () => {
    it("uses only provided vendor data", async () => {
      const minimalVendor = {
        vendorId: "v-min",
        vendorName: "Minimal",
        vendorNameAr: "أدنى",
        workspace: {},
        certificates: [],
      };

      const result = await matchVendorsWithPrediction({
        tenderRequirements: ["IT services"],
        entities: mockEntities,
        vendors: [minimalVendor],
        locale: "en",
        workspaceId: "ws-1",
      });

      const profile = result.profiles[0];
      expect(profile.vendorId).toBe("v-min");
      expect(profile.overallReadiness).toBeLessThanOrEqual(50);
    });
  });
});
