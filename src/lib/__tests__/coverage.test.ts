import { describe, expect, test } from "bun:test";
import { buildCoveragePlan } from "../agents/coverage";
import { buildDeterministicProposal } from "../agents/drafting";
import { runTechnicalArchitect } from "../agents/technical";
import type { RagDocument } from "../rag";

const evidenceDocs: RagDocument[] = [
  {
    id: "past-1",
    title: "Government portal delivery",
    summary:
      "Delivered secure government digital portal with NCA controls and training",
    tags: "portal security nca training",
    embedding: null,
  },
  {
    id: "cert-1",
    title: "[Certificate:ISO27001] ISO 27001",
    summary: "Number: ISO-1 Issuer: Acme Expires: 2030-01-01",
    tags: "ISO27001",
    embedding: null,
  },
];

describe("requirement coverage planner", () => {
  test("maps requirements to evidence and records gaps", () => {
    const plan = buildCoveragePlan({
      entities: {
        scope: "Build secure government portal with training and SLA",
        evaluation: { technical: 70, financial: 30 },
        sla: { perWeek: 2, maxPercent: 20 },
        milestones: [{ name: "Go-live", weeks: 12 }],
        evidence: ["ISO 27001 certificate required"],
        requirements: [
          {
            text: "Deliver secure government portal with NCA controls",
            sectionRef: "3.1",
            pageRef: "12",
          },
          {
            text: "Provide administrator training and knowledge transfer",
            sectionRef: "4.2",
            pageRef: "18",
          },
          {
            text: "Unrelated quantum research laboratory accreditation",
            sectionRef: "9.9",
            pageRef: null,
          },
        ],
      },
      evidenceDocs,
      complianceRows: [
        {
          frameworkId: "NCA",
          controlId: "ECC-1",
          title: "Access control",
          status: "COMPLIANT",
          evidence: "Approved policy",
          remediation: null,
        },
        {
          frameworkId: "PDPL",
          controlId: "PDPL-2",
          title: "Consent",
          status: "EVIDENCE_MISSING",
          evidence: "",
          remediation: "Upload consent procedure",
        },
      ],
      locale: "en",
    });

    expect(plan.rows.length).toBe(3);
    expect(plan.evaluationWeights).toEqual({ technical: 70, financial: 30 });
    expect(plan.coveredCount + plan.partialCount + plan.gapCount).toBe(3);
    expect(plan.coveragePercent).toBeGreaterThanOrEqual(0);
    expect(plan.coveragePercent).toBeLessThanOrEqual(100);

    const portal = plan.rows.find((r) =>
      r.requirementText.toLowerCase().includes("portal")
    );
    expect(portal).toBeTruthy();
    expect(["COVERED", "PARTIAL"]).toContain(portal!.status);
    expect(portal!.evidenceTitles.length).toBeGreaterThan(0);
    expect(portal!.proposalSection).toBeTruthy();

    const gap = plan.rows.find((r) =>
      r.requirementText.toLowerCase().includes("quantum")
    );
    expect(gap).toBeTruthy();
    expect(["GAP", "NEEDS_USER_INPUT"]).toContain(gap!.status);
    expect(plan.missingEvidenceTasks.some((t) => t.includes("quantum"))).toBe(
      true
    );
    expect(plan.missingEvidenceTasks.some((t) => t.includes("PDPL-2"))).toBe(
      true
    );
    expect(plan.winStrategyNotes.join(" ")).toContain("70%");
    expect(plan.winStrategyNotes.join(" ").toLowerCase()).not.toMatch(
      /discount|margin|markup|bid price/
    );
  });
});

describe("technical architect package", () => {
  test("returns evaluator-aligned sections and experience classes", () => {
    const technical = runTechnicalArchitect({
      entities: {
        scope: "Digital transformation platform",
        evaluation: { technical: 75, financial: 25 },
        sla: { perWeek: 1, maxPercent: 10 },
        milestones: [{ name: "MVP", weeks: 8 }],
        evidence: [],
      },
      pastProjects: evidenceDocs,
      vision2030Alignment: "thriving-economy",
    });

    expect(technical.deliveryModel.length).toBeGreaterThan(20);
    expect(technical.governance.length).toBeGreaterThan(10);
    expect(technical.qualityPlan.length).toBeGreaterThan(10);
    expect(technical.riskPlan.length).toBeGreaterThan(10);
    expect(technical.securityPrivacy.length).toBeGreaterThan(10);
    expect(technical.serviceManagement.length).toBeGreaterThan(10);
    expect(technical.trainingTransition.length).toBeGreaterThan(10);
    expect(technical.continuity.length).toBeGreaterThan(10);
    expect(technical.evaluationAlignment).toContain("75%");
    for (const p of technical.matchedProjects) {
      expect(["exact", "analogous", "proposed"]).toContain(p.experienceClass);
    }
  });
});

describe("winning tender proposal structure", () => {
  test("deterministic proposal includes all 18 scorable sections without pricing", () => {
    const plan = buildCoveragePlan({
      entities: {
        scope: "Portal modernization",
        evaluation: { technical: 70, financial: 30 },
        sla: { perWeek: 2, maxPercent: 20 },
        milestones: [{ name: "Cutover", weeks: 6 }],
        evidence: ["Training plan"],
      },
      evidenceDocs,
      complianceRows: [],
      locale: "en",
    });
    const technical = runTechnicalArchitect({
      entities: {
        scope: "Portal modernization",
        evaluation: { technical: 70, financial: 30 },
        sla: { perWeek: 2, maxPercent: 20 },
        milestones: [{ name: "Cutover", weeks: 6 }],
        evidence: [],
      },
      pastProjects: evidenceDocs,
    });

    const md = buildDeterministicProposal({
      projectTitle: "Portal modernization",
      etimadRef: "ETM-99",
      tenderTypeName: "IT",
      entities: {
        scope: "Portal modernization",
        evaluation: { technical: 70, financial: 30 },
        sla: { perWeek: 2, maxPercent: 20 },
        milestones: [{ name: "Cutover", weeks: 6 }],
        evidence: [],
      },
      complianceRows: [],
      technical: { ...technical, ragContext: technical.ragContext },
      financial: {
        cashEquivalents: null,
        accountsReceivable: null,
        currentLiabilities: null,
        quickLiquidityRatio: null,
        qlrPasses: null,
        qlrThreshold: null,
        qlrFormula: null,
        saudizationPercent: null,
        boqItems: [
          { item: "Portal", unit: "LS", qty: 1, unitPrice: null, total: null },
        ],
        localContentPreferenceApplied: null,
        notes: ["structure only"],
      },
      coverage: plan,
      brandTagline: "ArabClue",
      vision2030: "thriving-economy",
      locale: "en",
    });

    const sections = [
      "Executive Summary",
      "Project Understanding",
      "Evaluation Alignment",
      "Requirement Coverage Matrix",
      "Execution Methodology",
      "Solution Architecture & Delivery Model",
      "Governance & Quality",
      "Risk Management",
      "Security & Privacy Response",
      "SLA & Service Management",
      "Team & Qualifications",
      "Relevant Experience",
      "Compliance Commitments",
      "Training, Transition & Continuity",
      "Financial Forms Structure",
      "Assumptions, Exclusions & Clarifications",
      "Vision 2030 Alignment",
      "Closing",
    ];
    for (const s of sections) {
      expect(md).toContain(s);
    }
    expect(md).toContain("Requirement coverage:");
    expect(md).toContain("| — | — |");
    expect(md.toLowerCase()).not.toMatch(
      /unit price\s*[:=]\s*\d|margin|discount|markup/
    );
    expect(md.toLowerCase()).toContain("not legal advice");
    expect(md).toContain("final author");
  });
});
