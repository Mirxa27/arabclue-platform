/**
 * Inputs for the sectioned-drafting suites. Every context slice carries a
 * marker so a prompt can be checked for what it received and what it did not.
 */

import type { CoverageRow } from "../../agents/coverage";
import type { DraftProposalOptions } from "../../agents/drafting";

export const RAG = "RAG-CORPUS-MARKER " + "r".repeat(20_000);
export const TENDER = "TENDER-PASSAGE-MARKER: the contractor shall deliver the portal.";
export const LIVE = "LIVE-RESEARCH-MARKER [1] 2026-08-30 buyer digital strategy.";

export function row(
  id: string,
  proposalSection: string,
  status: CoverageRow["status"] = "COVERED"
): CoverageRow {
  return {
    requirementId: id,
    requirementText: `Requirement ${id} text`,
    sectionRef: "3.1",
    pageRef: "12",
    status,
    evidenceIds: status === "COVERED" ? ["doc-1"] : [],
    evidenceTitles: status === "COVERED" ? ["Approved Evidence One"] : [],
    proposalSection,
    responseOutline: "Respond using approved methodology.",
    matchScore: 0.5,
  };
}

export const ROWS: CoverageRow[] = [
  row("REQ-001", "Security & Privacy"),
  row("REQ-002", "SLA & Service Management", "PARTIAL"),
  row("REQ-003", "Team & Qualifications", "GAP"),
  row("REQ-004", "Training & Transition"),
  row("REQ-005", "Risk Management"),
  row("REQ-006", "Quality Management"),
  row("REQ-007", "Business Continuity", "NEEDS_USER_INPUT"),
  row("REQ-008", "Solution Architecture"),
  row("REQ-009", "Compliance"),
  row("REQ-010", "Methodology"),
  row("REQ-011", "Delivery Plan"),
  row("REQ-012", "Technical Response"),
];

/** One kept question, so the sections that declare the register slice receive it. */
export const CLARIFICATIONS = [
  {
    id: "c-fixture",
    severity: "MAJOR" as const,
    status: "KEPT" as const,
    titleEn: "CLARIFICATION-MARKER title",
    titleAr: "عنوان الاستفسار",
    questionEn: "CLARIFICATION-MARKER We kindly request the Entity to confirm the penalty cap.",
    questionAr: "نرجو من الجهة الحكومية التكرم بتأكيد الحد الأقصى للغرامات.",
    quotes: [],
    answerMd: null,
    answeredAt: null,
    submittedAt: null,
  },
];

export function sampleOptions(
  overrides: Partial<DraftProposalOptions> = {}
): Omit<DraftProposalOptions, "onDelta"> {
  return {
    projectTitle: "Portal Modernization",
    etimadRef: "ETM-77",
    tenderTypeName: "IT / تقنية المعلومات",
    entities: {
      scope: "SCOPE-MARKER modernize the citizen portal",
      evaluation: { technical: 70, financial: 30 },
      sla: { perWeek: 2, maxPercent: 20, capped: true },
      milestones: [{ name: "Discovery", weeks: 4 }],
      evidence: [],
      requirements: ROWS.map((r) => ({ text: r.requirementText, sectionRef: r.sectionRef, pageRef: r.pageRef })),
    },
    complianceRows: [
      {
        frameworkId: "NCA",
        controlId: "ECC-1-1",
        title: "Governance",
        status: "COMPLIANT",
        evidence: "COMPLIANCE-MARKER policy approved",
        remediation: null,
        sourceCategory: "EXPLICIT_TENDER",
      },
    ],
    technical: {
      methodology: [{ id: 1, name: "Discovery", nameAr: "الاستكشاف", rationale: "METHOD-MARKER" }],
      matchedProjects: [
        { id: "p1", title: "PROJECT-MARKER Ministry Portal", score: 0.8, why: "same scope", experienceClass: "exact" },
      ],
      solutionApproach: "APPROACH-MARKER",
      vision2030Notes: "VISION-MARKER",
      deliveryModel: "DELIVERY-MARKER",
      governance: "GOVERNANCE-MARKER",
      qualityPlan: "QUALITY-MARKER",
      riskPlan: "RISK-MARKER",
      securityPrivacy: "SECURITY-MARKER",
      serviceManagement: "SERVICE-MARKER",
      trainingTransition: "TRAINING-MARKER",
      continuity: "CONTINUITY-MARKER",
      evaluationAlignment: "ALIGNMENT-MARKER",
      ragContext: RAG,
      tenderContext: TENDER,
    },
    financial: {
      cashEquivalents: 10,
      accountsReceivable: 5,
      currentLiabilities: 5,
      quickLiquidityRatio: 3,
      qlrPasses: null,
      qlrThreshold: null,
      qlrFormula: "(CashEquivalents + AccountsReceivable) / CurrentLiabilities",
      saudizationPercent: null,
      boqItems: [{ item: "Portal build", unit: "LS", qty: 1, unitPrice: null, total: null }],
      localContentPreferenceApplied: null,
      notes: ["FINANCIAL-MARKER structure only"],
    },
    coverage: {
      rows: ROWS,
      coveredCount: 9,
      partialCount: 1,
      gapCount: 2,
      coveragePercent: 79,
      evaluationWeights: { technical: 70, financial: 30 },
      missingEvidenceTasks: ["REQ-003: upload staff CVs"],
      strengths: ["REQ-001 covered via Approved Evidence One"],
      winStrategyNotes: ["WINSTRATEGY-MARKER prioritize technical weight"],
    },
    brandTagline: "ArabClue Bidder",
    vision2030: "thriving-economy",
    locale: "en",
    restrictions: "Never name competitor X",
    sectors: ["Government"],
    liveResearch: LIVE,
    clarifications: CLARIFICATIONS,
    ...overrides,
  };
}

/** Restores after the promise settles, so a flag cannot leak into another file. */
export async function withEnv<T>(
  vars: Record<string, string | undefined>,
  run: () => Promise<T>
): Promise<T> {
  const previous = Object.keys(vars).map((key) => [key, process.env[key]] as const);
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
