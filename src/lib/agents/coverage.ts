/**
 * Requirement coverage planner — organizes proposal response around tender
 * requirements and approved tenant evidence only.
 *
 * Winning tenders requires complete coverage, explicit gaps, and citations —
 * never fabricated experience or pricing strategy.
 */

import type { RagDocument } from "../rag";
import type {
  ComplianceMatrixRow,
  IngestionEntities,
  TenderRequirementExtract,
} from "../types";

export type CoverageStatus =
  | "COVERED"
  | "PARTIAL"
  | "GAP"
  | "NEEDS_USER_INPUT";

export type CoverageRow = {
  requirementId: string;
  requirementText: string;
  sectionRef: string | null;
  pageRef: string | null;
  status: CoverageStatus;
  evidenceIds: string[];
  evidenceTitles: string[];
  proposalSection: string;
  responseOutline: string;
  matchScore: number;
};

export type CoveragePlan = {
  rows: CoverageRow[];
  coveredCount: number;
  partialCount: number;
  gapCount: number;
  coveragePercent: number;
  evaluationWeights: { technical: number; financial: number };
  missingEvidenceTasks: string[];
  strengths: string[];
  winStrategyNotes: string[];
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function overlapScore(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.max(ta.size, 1);
}

function mapRequirementToSection(text: string): string {
  const t = text.toLowerCase();
  if (/security|cyber|nca|أمن|سيبراني|تشفير/.test(t)) return "Security & Privacy";
  if (/privacy|pdpl|بيانات شخصية|خصوصية/.test(t)) return "Security & Privacy";
  if (/sla|kpi|uptime|غرامة|أداء|اتفاقية مستوى/.test(t)) return "SLA & Service Management";
  if (/team|staff|cv|مؤهل|فريق|خبرات الكوادر/.test(t)) return "Team & Qualifications";
  if (/train|تدريب|knowledge transfer|نقل معرفة/.test(t)) return "Training & Transition";
  if (/risk|مخاطر/.test(t)) return "Risk Management";
  if (/quality|qa|qc|جودة/.test(t)) return "Quality Management";
  if (/backup|dr|bcp|استمرارية|تعافي/.test(t)) return "Business Continuity";
  if (/cloud|استضافة|سحاب/.test(t)) return "Solution Architecture";
  if (/local content|محتوى محلي|saudization|سعودة/.test(t)) return "Compliance";
  if (/method|منهج|agile|pmi/.test(t)) return "Methodology";
  if (/deliver|milestone|جدول|مخرجات/.test(t)) return "Delivery Plan";
  return "Technical Response";
}

function buildOutline(
  requirementText: string,
  evidenceTitles: string[],
  status: CoverageStatus,
  locale: "ar" | "en"
): string {
  if (status === "GAP" || status === "NEEDS_USER_INPUT") {
    return locale === "ar"
      ? `فجوة أدلة: يلزم إدخال/اعتماد دليل مستأجر لهذا المتطلب — لا يُختلق محتوى.`
      : `Evidence gap: tenant must supply/approve evidence for this requirement — do not fabricate.`;
  }
  const ev =
    evidenceTitles.length > 0
      ? evidenceTitles.slice(0, 3).join("; ")
      : locale === "ar"
        ? "منهجية معتمدة"
        : "approved methodology";
  return locale === "ar"
    ? `استجابة مبنية على: ${ev}. ربط المتطلب بالنهج المقترح مع اقتباس من الدليل.`
    : `Respond using: ${ev}. Map the requirement to the proposed approach with evidence citation.`;
}

/**
 * Build a coverage plan mapping tender requirements to approved evidence.
 */
export function buildCoveragePlan(opts: {
  entities: IngestionEntities | null;
  evidenceDocs: RagDocument[];
  complianceRows: ComplianceMatrixRow[];
  locale?: "ar" | "en";
}): CoveragePlan {
  const locale = opts.locale === "ar" ? "ar" : "en";
  const requirements: TenderRequirementExtract[] =
    opts.entities?.requirements?.length
      ? opts.entities.requirements
      : deriveRequirementsFromEntities(opts.entities);

  const rows: CoverageRow[] = requirements.map((req, idx) => {
    const scored = opts.evidenceDocs
      .map((doc) => ({
        doc,
        score: Math.max(
          overlapScore(req.text, `${doc.title} ${doc.summary}`),
          overlapScore(req.text, doc.tags ?? "")
        ),
      }))
      .sort((a, b) => b.score - a.score);

    const top = scored.filter((s) => s.score >= 0.12).slice(0, 4);
    const best = top[0]?.score ?? 0;
    let status: CoverageStatus = "GAP";
    if (best >= 0.28 && top.length >= 1) status = "COVERED";
    else if (best >= 0.12) status = "PARTIAL";
    else status = "NEEDS_USER_INPUT";

    const evidenceIds = top.map((t) => t.doc.id);
    const evidenceTitles = top.map((t) => t.doc.title);

    return {
      requirementId: `REQ-${String(idx + 1).padStart(3, "0")}`,
      requirementText: req.text.slice(0, 500),
      sectionRef: req.sectionRef ?? null,
      pageRef: req.pageRef ?? null,
      status,
      evidenceIds,
      evidenceTitles,
      proposalSection: mapRequirementToSection(req.text),
      responseOutline: buildOutline(req.text, evidenceTitles, status, locale),
      matchScore: Math.round(best * 1000) / 1000,
    };
  });

  const coveredCount = rows.filter((r) => r.status === "COVERED").length;
  const partialCount = rows.filter((r) => r.status === "PARTIAL").length;
  const gapCount = rows.filter(
    (r) => r.status === "GAP" || r.status === "NEEDS_USER_INPUT"
  ).length;
  const coveragePercent = rows.length
    ? Math.round(((coveredCount + partialCount * 0.5) / rows.length) * 100)
    : 0;

  const missingEvidenceTasks = rows
    .filter((r) => r.status === "GAP" || r.status === "NEEDS_USER_INPUT")
    .slice(0, 20)
    .map(
      (r) =>
        `${r.requirementId}: upload/approve evidence for "${r.requirementText.slice(0, 80)}"`
    );

  const complianceGaps = opts.complianceRows
    .filter((r) =>
      ["EVIDENCE_MISSING", "NON_COMPLIANT", "CLARIFICATION_REQUIRED"].includes(
        r.status
      )
    )
    .slice(0, 10)
    .map((r) => `Compliance ${r.controlId}: ${r.remediation ?? r.title}`);

  const strengths = [
    ...rows
      .filter((r) => r.status === "COVERED")
      .slice(0, 5)
      .map((r) => `${r.requirementId} covered via ${r.evidenceTitles[0] ?? "evidence"}`),
    ...opts.complianceRows
      .filter((r) => r.status === "COMPLIANT")
      .slice(0, 5)
      .map((r) => `Compliant control ${r.controlId}`),
  ];

  const tech = opts.entities?.evaluation.technical ?? 70;
  const fin = opts.entities?.evaluation.financial ?? 30;

  const winStrategyNotes = [
    `Prioritize technical evaluation weight (${tech}%) with requirement-by-requirement responses.`,
    `Financial evaluation weight (${fin}%) is structure-only here — commercial team enters prices separately.`,
    gapCount > 0
      ? `${gapCount} requirement gap(s) must be closed with approved tenant evidence before final submission.`
      : "All extracted requirements have at least partial evidence mapping.",
    "Never invent experience; mark gaps explicitly — evaluators penalize unsupported claims.",
    "Use tender clause wording in responses; cite source section/page when available.",
  ];

  return {
    rows,
    coveredCount,
    partialCount,
    gapCount,
    coveragePercent,
    evaluationWeights: { technical: tech, financial: fin },
    missingEvidenceTasks: [...missingEvidenceTasks, ...complianceGaps],
    strengths,
    winStrategyNotes,
  };
}

function deriveRequirementsFromEntities(
  entities: IngestionEntities | null
): TenderRequirementExtract[] {
  if (!entities) {
    return [
      {
        text: "Deliver scope of work as defined in the tender package",
        sectionRef: "SOW",
        pageRef: null,
      },
    ];
  }
  const reqs: TenderRequirementExtract[] = [];
  if (entities.scope) {
    reqs.push({
      text: `Scope: ${entities.scope.slice(0, 300)}`,
      sectionRef: "SOW",
      pageRef: null,
    });
  }
  for (const m of entities.milestones.slice(0, 8)) {
    reqs.push({
      text: `Milestone / deliverable: ${m.name} (${m.weeks} weeks)`,
      sectionRef: "Schedule",
      pageRef: null,
    });
  }
  reqs.push({
    text: `Meet SLA delay penalty terms: ${entities.sla.perWeek}% per week, max ${entities.sla.maxPercent}% (tender clause)`,
    sectionRef: "SLA",
    pageRef: null,
  });
  reqs.push({
    text: `Satisfy technical evaluation criteria weighting ${entities.evaluation.technical}%`,
    sectionRef: "Evaluation",
    pageRef: null,
  });
  for (const e of entities.evidence.slice(0, 6)) {
    reqs.push({ text: e, sectionRef: "Evidence", pageRef: null });
  }
  return reqs;
}

/** Persist coverage status onto tender requirement statuses. */
export function coverageStatusToRequirementStatus(
  status: CoverageStatus
): "COVERED" | "IN_PROGRESS" | "MISSING" {
  if (status === "COVERED") return "COVERED";
  if (status === "PARTIAL") return "IN_PROGRESS";
  return "MISSING";
}
