/**
 * AI-powered Procurement Compliance Analysis Engine.
 *
 * Extends the existing compliance agent with:
 * 1. Real-time compliance scanning against Saudi procurement regulations
 * 2. Gap analysis — identify missing compliance requirements
 * 3. Regulatory update detection — check for new regulations affecting documents
 * 4. Compliance scorecard — detailed pass/fail/warning per requirement
 *
 * Uses existing procurement-rules.ts for rule definitions.
 * Uses existing saudi-law-research.ts for law references.
 * All compliance checks are evidence-backed — no fabricated regulatory requirements.
 * Bilingual compliance reports.
 */

import { z } from "zod";
import { generateCompletion, type LLMMessage } from "../llm";
import {
  ProviderUnavailableError,
  guardCaughtOrThrow,
  guardOrThrow,
} from "./provider-unavailable";
import { parseJsonWithSchema, schemaRejection } from "./json-output";
import { appendGlossaryWithinBudget, styleGuideFor } from "./style-guide";
import {
  NO_PRICING_RULE,
  REGULATORY_PRECISION_RULE,
} from "../agents/prompts";
import {
  LEGAL_DISCLAIMER,
  LEGAL_DISCLAIMER_AR,
  PROCUREMENT_LAW,
  PDPL_RULES,
  NCA_FRAMEWORKS,
  REGULATORY_POLICY_REGISTRY,
  type LegalReviewStatus,
} from "../procurement-rules";
import { evaluateCompliance } from "../agents/compliance";
import type { IngestionEntities, Locale } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AiProvenance = {
  source: "AI_GENERATED" | "DETERMINISTIC_FALLBACK";
  provider: string;
  model: string;
  engine: string;
  generatedAt: string;
  confidence: number;
  fallback: boolean;
};

export type ComplianceFinding = {
  controlId: string;
  frameworkId: string;
  status: "PASS" | "FAIL" | "WARNING" | "NOT_APPLICABLE";
  evidenceEn: string;
  evidenceAr: string;
  remediationEn: string | null;
  remediationAr: string | null;
  sourceCategory: string;
  policyVersionId: string | null;
  /**
   * What in the scanned document the verdict rests on: a verbatim quote or a
   * section/page reference. `null` means the document is silent on the
   * control, in which case the status is never PASS or FAIL.
   */
  sourceRef: string | null;
  /** REQUIRED when the verdict turns on a legal reading rather than on evidence. */
  legalReviewStatus: LegalReviewStatus;
  provenance: AiProvenance;
};

export type ComplianceGap = {
  controlId: string;
  frameworkId: string;
  gapEn: string;
  gapAr: string;
  severity: "CRITICAL" | "MAJOR" | "MINOR";
  remediationEn: string;
  remediationAr: string;
  /** Registry entry that makes the control applicable; the gap cites it, never invents one. */
  policyVersionId: string | null;
  legalReviewStatus: LegalReviewStatus;
  provenance: AiProvenance;
};

export type RegulatoryUpdate = {
  policyId: string;
  instrumentName: string;
  instrumentNameAr: string;
  reviewDate: string;
  updateType: "NEW_VERSION" | "AMENDMENT" | "SUPERSESSION" | "NO_CHANGE";
  notesEn: string;
  notesAr: string;
  provenance: AiProvenance;
};

export type ComplianceScorecard = {
  totalControls: number;
  passed: number;
  failed: number;
  warnings: number;
  notApplicable: number;
  overallScore: number;
  findings: ComplianceFinding[];
  gaps: ComplianceGap[];
  regulatoryUpdates: RegulatoryUpdate[];
  reportEn: string;
  reportAr: string;
  provenance: AiProvenance;
};

export type ComplianceAnalysisInput = {
  documentText: string;
  documentType: "PROPOSAL" | "CONTRACT" | "TENDER";
  entities: IngestionEntities | null;
  tenderCategory?: string | null;
  saudizationTarget?: number | null;
  localContentTarget?: number | null;
  locale?: Locale;
  workspaceId: string;
};

// ---------------------------------------------------------------------------
// System prompt builders
// ---------------------------------------------------------------------------

/** Glossary budget inside these prompts; the rules and the schema come first. */
const PROMPT_GLOSSARY_CHARS = 1_200;

/**
 * Exported so the size cap can be asserted: each system prompt stays under
 * 6,000 characters whatever document is passed, because the glossary is
 * filtered to the terms the document uses and capped besides.
 */
export function buildComplianceScanSystemPrompt(
  locale: Locale = "ar",
  documentText = ""
): string {
  const head = `You are ArabClue AI Compliance Scanner for Saudi procurement regulations.
${NO_PRICING_RULE}
${REGULATORY_PRECISION_RULE}
Scan documents against: ${PROCUREMENT_LAW.nameEn} / ${PROCUREMENT_LAW.nameAr}, PDPL, NCA ${NCA_FRAMEWORKS.ecc}/${NCA_FRAMEWORKS.ccc}.
Rules:
- Report ONLY the controls listed under "controls" in the request; copy controlId, frameworkId and policyVersionId verbatim. Never add a control, a principle identifier, or a requirement the registry and the document do not contain.
- Every finding cites what it rests on: "sourceRef" is a verbatim quote (at most 200 characters) or a section/page reference from the scanned document; null when the document is silent on the control.
- PASS or FAIL only when sourceRef is non-null and the quoted passage supports the verdict on its own. When evidence is absent or ambiguous, or the verdict turns on a legal reading (data residency, cross-border transfer, penalty caps, preference percentages, applicability of a framework), return "WARNING" with legalReviewStatus "REQUIRED" and say in the evidence what is missing or what counsel must decide. Never assert.
- legalReviewStatus is "REQUIRED" or "NOT_LEGAL_ADVICE". evidenceEn/evidenceAr carry the same facts; remediation names the evidence to add, not a commercial action.
- Include: "${LEGAL_DISCLAIMER}"
- Output JSON only: { "findings": [{ "controlId": string, "frameworkId": string, "status": "PASS"|"FAIL"|"WARNING"|"NOT_APPLICABLE", "evidenceEn": string, "evidenceAr": string, "remediationEn": string|null, "remediationAr": string|null, "sourceCategory": string, "policyVersionId": string|null, "sourceRef": string|null, "legalReviewStatus": "REQUIRED"|"NOT_LEGAL_ADVICE" }] }
${styleGuideFor(locale)}`;
  return appendGlossaryWithinBudget(head, locale, documentText, {
    maxChars: PROMPT_GLOSSARY_CHARS,
  });
}

export function buildGapAnalysisSystemPrompt(
  locale: Locale = "ar",
  documentText = ""
): string {
  const head = `You are ArabClue AI Compliance Gap Analyzer.
${NO_PRICING_RULE}
${REGULATORY_PRECISION_RULE}
Identify missing compliance requirements in proposals/contracts.
Rules:
- A gap names one control from the "complianceMatrix" rows in the request, with controlId, frameworkId and policyVersionId copied verbatim; the matrix row is what makes the control applicable. Emit no gap for a control the matrix does not list.
- gapEn/gapAr state what the document lacks and quote or reference the passage that shows it (or say the document is silent). Never invent regulatory requirements, thresholds, or percentages.
- Severity: CRITICAL only when the matrix row is EVIDENCE_MISSING or NON_COMPLIANT for a tender-explicit control; a gap that turns on a legal reading is MAJOR with legalReviewStatus "REQUIRED".
- legalReviewStatus is "REQUIRED" or "NOT_LEGAL_ADVICE". Remediation names the evidence to upload or the decision to obtain — no commercial or pricing action.
- Output JSON only: { "gaps": [{ "controlId": string, "frameworkId": string, "gapEn": string, "gapAr": string, "severity": "CRITICAL"|"MAJOR"|"MINOR", "remediationEn": string, "remediationAr": string, "policyVersionId": string|null, "legalReviewStatus": "REQUIRED"|"NOT_LEGAL_ADVICE" }] }
${styleGuideFor(locale)}`;
  return appendGlossaryWithinBudget(head, locale, documentText, {
    maxChars: PROMPT_GLOSSARY_CHARS,
  });
}

// ---------------------------------------------------------------------------
// Answer schemas — the model's JSON is admitted only in this shape
// ---------------------------------------------------------------------------

const legalReviewStatusSchema = z.enum(["REQUIRED", "NOT_LEGAL_ADVICE"]);
const optionalText = z.string().nullable().optional();

const findingAnswerSchema = z.object({
  controlId: z.string(),
  frameworkId: z.string().nullable().optional(),
  status: z.enum(["PASS", "FAIL", "WARNING", "NOT_APPLICABLE"]),
  evidenceEn: z.string(),
  evidenceAr: z.string(),
  remediationEn: optionalText,
  remediationAr: optionalText,
  sourceCategory: optionalText,
  policyVersionId: optionalText,
  sourceRef: optionalText,
  legalReviewStatus: legalReviewStatusSchema.nullable().optional(),
});

const findingsAnswerSchema = z.object({ findings: z.array(findingAnswerSchema) });

const gapAnswerSchema = z.object({
  controlId: z.string(),
  frameworkId: z.string().nullable().optional(),
  gapEn: z.string(),
  gapAr: z.string(),
  severity: z.enum(["CRITICAL", "MAJOR", "MINOR"]),
  remediationEn: z.string(),
  remediationAr: z.string(),
  policyVersionId: optionalText,
  legalReviewStatus: legalReviewStatusSchema.nullable().optional(),
});

const gapsAnswerSchema = z.object({ gaps: z.array(gapAnswerSchema) });

/** Longest quote a finding may carry as its citation. */
const SOURCE_REF_CHARS = 200;

/**
 * A verdict is only as good as its citation. A PASS or FAIL with no sourceRef
 * is downgraded to WARNING + legal review rather than dropped: the model's
 * observation may still be useful, but it is not evidence.
 */
function withCitationDiscipline(finding: {
  status: ComplianceFinding["status"];
  sourceRef: string | null;
  legalReviewStatus: LegalReviewStatus;
}): Pick<ComplianceFinding, "status" | "sourceRef" | "legalReviewStatus"> {
  const sourceRef = finding.sourceRef?.trim().slice(0, SOURCE_REF_CHARS) || null;
  const asserts = finding.status === "PASS" || finding.status === "FAIL";
  if (asserts && !sourceRef) {
    return { status: "WARNING", sourceRef: null, legalReviewStatus: "REQUIRED" };
  }
  return { status: finding.status, sourceRef, legalReviewStatus: finding.legalReviewStatus };
}

// ---------------------------------------------------------------------------
// Deterministic fallbacks
// ---------------------------------------------------------------------------

function deterministicFindings(
  input: ComplianceAnalysisInput
): ComplianceFinding[] {
  const provenance: AiProvenance = {
    source: "DETERMINISTIC_FALLBACK",
    provider: "deterministic",
    model: "compliance-matrix-engine",
    engine: "COMPLIANCE",
    generatedAt: new Date().toISOString(),
    confidence: 0.7,
    fallback: true,
  };

  // Use existing evaluateCompliance for deterministic baseline
  const matrix = evaluateCompliance({
    tenderText: input.documentText,
    entities: input.entities,
    tenderCategory: input.tenderCategory,
    saudizationTarget: input.saudizationTarget,
    localContentTarget: input.localContentTarget,
  });

  return matrix.rows.map((row): ComplianceFinding => {
    const status: ComplianceFinding["status"] =
      row.status === "COMPLIANT"
        ? "PASS"
        : row.status === "NON_COMPLIANT"
          ? "FAIL"
          : row.status === "NOT_APPLICABLE"
            ? "NOT_APPLICABLE"
            : "WARNING";

    return {
      controlId: row.controlId,
      frameworkId: row.frameworkId,
      status,
      evidenceEn: row.evidence,
      evidenceAr: row.evidence, // Evidence is already bilingual-aware from the matrix
      remediationEn: row.remediation ?? null,
      remediationAr: row.remediation ?? null,
      sourceCategory: row.sourceCategory ?? "INFERRED_APPLICABILITY",
      policyVersionId: row.policyVersionId ?? null,
      // The matrix reasons from keyword hits, not from a quotable passage; its
      // evidence text says which terms it matched.
      sourceRef: null,
      legalReviewStatus: row.legalReviewStatus ?? "NOT_LEGAL_ADVICE",
      provenance: provenance,
    };
  });
}

function deterministicGaps(
  input: ComplianceAnalysisInput
): ComplianceGap[] {
  const provenance: AiProvenance = {
    source: "DETERMINISTIC_FALLBACK",
    provider: "deterministic",
    model: "gap-detector",
    engine: "COMPLIANCE",
    generatedAt: new Date().toISOString(),
    confidence: 0.65,
    fallback: true,
  };

  const matrix = evaluateCompliance({
    tenderText: input.documentText,
    entities: input.entities,
    tenderCategory: input.tenderCategory,
    saudizationTarget: input.saudizationTarget,
    localContentTarget: input.localContentTarget,
  });

  const gaps: ComplianceGap[] = [];
  for (const row of matrix.rows) {
    if (row.status === "COMPLIANT" || row.status === "NOT_APPLICABLE") continue;

    const severity: ComplianceGap["severity"] =
      row.status === "NON_COMPLIANT" || row.status === "EVIDENCE_MISSING"
        ? "CRITICAL"
        : row.status === "LEGAL_REVIEW_REQUIRED"
          ? "MAJOR"
          : "MINOR";

    gaps.push({
      controlId: row.controlId,
      frameworkId: row.frameworkId,
      gapEn: `${row.controlId}: ${row.evidence.slice(0, 200)}`,
      gapAr: `${row.controlId}: ${row.evidence.slice(0, 200)}`,
      severity,
      remediationEn: row.remediation ?? "Review and provide evidence",
      remediationAr: row.remediation ?? "يلزم المراجعة وتقديم الدليل الداعم",
      policyVersionId: row.policyVersionId ?? null,
      legalReviewStatus: row.legalReviewStatus ?? "NOT_LEGAL_ADVICE",
      provenance,
    });
  }

  return gaps;
}

function deterministicRegulatoryUpdates(): RegulatoryUpdate[] {
  const provenance: AiProvenance = {
    source: "DETERMINISTIC_FALLBACK",
    provider: "deterministic",
    model: "registry-review-date-checker",
    engine: "COMPLIANCE",
    generatedAt: new Date().toISOString(),
    confidence: 0.6,
    fallback: true,
  };

  const now = new Date();
  return REGULATORY_POLICY_REGISTRY.filter((p) => !p.superseded).map((p) => {
    const reviewDate = new Date(p.reviewDate);
    const isStale = reviewDate < now;
    return {
      policyId: p.id,
      instrumentName: p.instrumentName,
      instrumentNameAr: p.instrumentNameAr ?? p.instrumentName,
      reviewDate: p.reviewDate,
      updateType: isStale ? "AMENDMENT" : "NO_CHANGE",
      notesEn: isStale
        ? `Registry review date ${p.reviewDate} has passed. Authorized counsel must verify current official text.`
        : `Registry entry is current as of review date ${p.reviewDate}.`,
      notesAr: isStale
        ? `تاريخ مراجعة السجل ${p.reviewDate} قد مضى. يجب على المستشار المعتمد التحقق من النص الرسمي الحالي.`
        : `إدخال السجل محدّث حتى تاريخ المراجعة ${p.reviewDate}.`,
      provenance,
    };
  });
}

// ---------------------------------------------------------------------------
// AI-powered compliance scanning
// ---------------------------------------------------------------------------

export async function scanCompliance(
  input: ComplianceAnalysisInput
): Promise<ComplianceFinding[]> {
  const deterministic = deterministicFindings(input);
  const locale = input.locale ?? "ar";

  try {
    const contextJson = JSON.stringify({
      documentType: input.documentType,
      documentExcerpt: input.documentText.slice(0, 6000),
      scope: input.entities?.scope?.slice(0, 1000) ?? null,
      sla: input.entities?.sla ?? null,
      noraPrinciples: input.entities?.noraPrinciplesFromTender ?? [],
      localContentPreference: input.entities?.localContentPreferencePercent ?? null,
      // The controls in scope, from the registry-backed matrix. The model
      // reports on these and nothing else; the baseline is what the keyword
      // matrix concluded, for it to confirm, refine, or downgrade with a quote.
      controls: deterministic.map((f) => ({
        controlId: f.controlId,
        frameworkId: f.frameworkId,
        policyVersionId: f.policyVersionId,
        sourceCategory: f.sourceCategory,
        baselineStatus: f.status,
        baselineNote: f.evidenceEn.slice(0, 120),
      })),
      frameworks: {
        procurementLaw: PROCUREMENT_LAW.citation,
        pdpl: PDPL_RULES.residencyEvaluationNote,
        ncaEcc: NCA_FRAMEWORKS.ecc,
        ncaCcc: NCA_FRAMEWORKS.ccc,
      },
    }).slice(0, 12000);

    const messages: LLMMessage[] = [
      {
        role: "system",
        content: buildComplianceScanSystemPrompt(locale, input.documentText),
      },
      {
        role: "user",
        content: `Scan this document for compliance:\n${contextJson}\n\nReturn JSON only.`,
      },
    ];

    const result = await generateCompletion(messages, {
      engine: "COMPLIANCE",
      temperature: 0.1,
      maxTokens: 8192,
    });

    if (result.fallback || !result.content) {
      guardOrThrow(result, "compliance-analyzer:scanCompliance");
      return deterministic;
    }

    const parsed = parseAiFindings(result.content, deterministic);
    if (!parsed.ok) {
      guardOrThrow(schemaRejection(result, parsed.issues), "compliance-analyzer:scanCompliance");
      return deterministic;
    }
    if (parsed.data.length === 0) return deterministic;

    const provenance: AiProvenance = {
      source: "AI_GENERATED",
      provider: result.provider,
      model: result.model,
      engine: result.engine ?? "COMPLIANCE",
      generatedAt: new Date().toISOString(),
      confidence: result.confidence,
      fallback: false,
    };

    return parsed.data.map((f) => ({ ...f, provenance }));
  } catch (err) {
    if (err instanceof ProviderUnavailableError) throw err;
    console.warn("[compliance-analyzer] LLM scan failed, using deterministic", err);
    guardCaughtOrThrow(err, "compliance-analyzer:scanCompliance");
    return deterministic;
  }
}

type ParsedAnswer<T> = { ok: true; data: T[] } | { ok: false; issues: string[] };

/**
 * The model's findings, admitted only for controls the matrix knows. A
 * finding for an unknown control is a fabricated identifier and is dropped;
 * frameworkId and policyVersionId come from the matrix row, not from the
 * answer, so they cannot drift. Provenance is filled in by the caller.
 */
export function parseAiFindings(
  content: string,
  known: readonly ComplianceFinding[]
): ParsedAnswer<Omit<ComplianceFinding, "provenance">> {
  const parsed = parseJsonWithSchema(content, findingsAnswerSchema);
  if (!parsed.ok) return parsed;
  const byControl = new Map(known.map((f) => [f.controlId, f]));
  const seen = new Set<string>();
  const findings: Omit<ComplianceFinding, "provenance">[] = [];
  for (const f of parsed.data.findings) {
    const controlId = f.controlId.trim();
    const row = byControl.get(controlId);
    if (!row || seen.has(controlId)) continue;
    seen.add(controlId);
    const disciplined = withCitationDiscipline({
      status: f.status,
      sourceRef: f.sourceRef ?? null,
      legalReviewStatus: f.legalReviewStatus ?? row.legalReviewStatus,
    });
    findings.push({
      controlId,
      frameworkId: row.frameworkId,
      ...disciplined,
      evidenceEn: f.evidenceEn,
      evidenceAr: f.evidenceAr,
      remediationEn: f.remediationEn || null,
      remediationAr: f.remediationAr || null,
      sourceCategory: f.sourceCategory || row.sourceCategory,
      policyVersionId: row.policyVersionId,
    });
  }
  return { ok: true, data: findings };
}

// ---------------------------------------------------------------------------
// AI-powered gap analysis
// ---------------------------------------------------------------------------

export async function analyzeComplianceGaps(
  input: ComplianceAnalysisInput
): Promise<ComplianceGap[]> {
  const deterministic = deterministicGaps(input);
  const locale = input.locale ?? "ar";
  // Rows the model may name a gap against — the matrix rows short of PASS,
  // each with the registry entry that makes the control applicable.
  const candidates = deterministicFindings(input).filter((f) => f.status !== "PASS");

  try {
    const contextJson = JSON.stringify({
      documentType: input.documentType,
      documentExcerpt: input.documentText.slice(0, 6000),
      scope: input.entities?.scope?.slice(0, 1000) ?? null,
      complianceMatrix: candidates.slice(0, 15).map((f) => ({
        controlId: f.controlId,
        frameworkId: f.frameworkId,
        policyVersionId: f.policyVersionId,
        sourceCategory: f.sourceCategory,
        status: f.status,
        legalReviewStatus: f.legalReviewStatus,
        evidence: f.evidenceEn.slice(0, 200),
      })),
    }).slice(0, 10000);

    const messages: LLMMessage[] = [
      {
        role: "system",
        content: buildGapAnalysisSystemPrompt(locale, input.documentText),
      },
      {
        role: "user",
        content: `Analyze compliance gaps:\n${contextJson}\n\nReturn JSON only.`,
      },
    ];

    const result = await generateCompletion(messages, {
      engine: "COMPLIANCE",
      temperature: 0.15,
      maxTokens: 4096,
    });

    if (result.fallback || !result.content) {
      guardOrThrow(result, "compliance-analyzer:analyzeComplianceGaps");
      return deterministic;
    }

    const parsed = parseAiGaps(result.content, candidates);
    if (!parsed.ok) {
      guardOrThrow(
        schemaRejection(result, parsed.issues),
        "compliance-analyzer:analyzeComplianceGaps"
      );
      return deterministic;
    }
    if (parsed.data.length === 0) return deterministic;

    const provenance: AiProvenance = {
      source: "AI_GENERATED",
      provider: result.provider,
      model: result.model,
      engine: result.engine ?? "COMPLIANCE",
      generatedAt: new Date().toISOString(),
      confidence: result.confidence,
      fallback: false,
    };

    return parsed.data.map((g) => ({ ...g, provenance }));
  } catch (err) {
    if (err instanceof ProviderUnavailableError) throw err;
    console.warn("[compliance-analyzer] LLM gap analysis failed, using deterministic", err);
    guardCaughtOrThrow(err, "compliance-analyzer:analyzeComplianceGaps");
    return deterministic;
  }
}

/**
 * The model's gaps, admitted only against matrix rows it was shown. The
 * registry entry and framework come from the row; a gap "for" a control the
 * matrix never listed is an invented requirement and is dropped.
 */
export function parseAiGaps(
  content: string,
  candidates: readonly ComplianceFinding[]
): ParsedAnswer<Omit<ComplianceGap, "provenance">> {
  const parsed = parseJsonWithSchema(content, gapsAnswerSchema);
  if (!parsed.ok) return parsed;
  const byControl = new Map(candidates.map((f) => [f.controlId, f]));
  const seen = new Set<string>();
  const gaps: Omit<ComplianceGap, "provenance">[] = [];
  for (const g of parsed.data.gaps) {
    const controlId = g.controlId.trim();
    const row = byControl.get(controlId);
    if (!row || seen.has(controlId)) continue;
    seen.add(controlId);
    const legalReviewStatus = g.legalReviewStatus ?? row.legalReviewStatus;
    gaps.push({
      controlId,
      frameworkId: row.frameworkId,
      gapEn: g.gapEn,
      gapAr: g.gapAr,
      // A gap that needs counsel is not a certainty, whatever the model rated it.
      severity:
        g.severity === "CRITICAL" && legalReviewStatus === "REQUIRED" ? "MAJOR" : g.severity,
      remediationEn: g.remediationEn,
      remediationAr: g.remediationAr,
      policyVersionId: row.policyVersionId,
      legalReviewStatus,
    });
  }
  return { ok: true, data: gaps };
}

// ---------------------------------------------------------------------------
// Regulatory update detection
// ---------------------------------------------------------------------------

export async function detectRegulatoryUpdates(): Promise<RegulatoryUpdate[]> {
  // This is deterministic — registry-based, no LLM needed
  return deterministicRegulatoryUpdates();
}

// ---------------------------------------------------------------------------
// Full compliance scorecard
// ---------------------------------------------------------------------------

export async function generateComplianceScorecard(
  input: ComplianceAnalysisInput
): Promise<ComplianceScorecard> {
  const [findings, gaps] = await Promise.all([
    scanCompliance(input),
    analyzeComplianceGaps(input),
  ]);
  const regulatoryUpdates = await detectRegulatoryUpdates();

  const passed = findings.filter((f) => f.status === "PASS").length;
  const failed = findings.filter((f) => f.status === "FAIL").length;
  const warnings = findings.filter((f) => f.status === "WARNING").length;
  const notApplicable = findings.filter((f) => f.status === "NOT_APPLICABLE").length;
  const overallScore = findings.length
    ? Math.round((passed / findings.length) * 100)
    : 0;

  const legalReview = findings.filter((f) => f.legalReviewStatus === "REQUIRED").length;
  const cited = findings.filter((f) => f.sourceRef !== null).length;
  const stats: ScorecardStats = {
    passed,
    failed,
    warnings,
    notApplicable,
    overallScore,
    total: findings.length,
    legalReview,
    cited,
  };
  const reportEn = buildScorecardReportEn(stats, gaps, input);
  const reportAr = buildScorecardReportAr(stats, gaps, input);

  const provenance: AiProvenance = findings[0]?.provenance ?? {
    source: "DETERMINISTIC_FALLBACK",
    provider: "deterministic",
    model: "compliance-matrix-engine",
    engine: "COMPLIANCE",
    generatedAt: new Date().toISOString(),
    confidence: 0.7,
    fallback: true,
  };

  return {
    totalControls: findings.length,
    passed,
    failed,
    warnings,
    notApplicable,
    overallScore,
    findings,
    gaps,
    regulatoryUpdates,
    reportEn,
    reportAr,
    provenance,
  };
}

type ScorecardStats = {
  passed: number;
  failed: number;
  warnings: number;
  notApplicable: number;
  overallScore: number;
  total: number;
  /** Findings whose verdict needs authorized counsel before it is relied on. */
  legalReview: number;
  /** Findings that quote or reference a passage of the scanned document. */
  cited: number;
};

const DOCUMENT_TYPE_AR: Record<ComplianceAnalysisInput["documentType"], string> = {
  PROPOSAL: "عرض",
  CONTRACT: "عقد",
  TENDER: "منافسة",
};

function buildScorecardReportEn(
  stats: ScorecardStats,
  gaps: ComplianceGap[],
  input: ComplianceAnalysisInput
): string {
  const gapList = gaps
    .slice(0, 10)
    .map(
      (g) =>
        `- [${g.severity}] ${g.controlId}: ${g.gapEn}${
          g.legalReviewStatus === "REQUIRED" ? " — legal review required" : ""
        }`
    )
    .join("\n");

  return `# Compliance Scorecard

**Document Type:** ${input.documentType}
**Overall Score:** ${stats.overallScore}% (${stats.passed}/${stats.total} PASS)

## Summary
- PASS: ${stats.passed}
- FAIL: ${stats.failed}
- WARNING: ${stats.warnings}
- NOT APPLICABLE: ${stats.notApplicable}
- Legal review required: ${stats.legalReview}
- Findings citing a document passage: ${stats.cited}/${stats.total}

## Critical Gaps
${gapList || "No critical gaps identified."}

${LEGAL_DISCLAIMER}
`;
}

function buildScorecardReportAr(
  stats: ScorecardStats,
  gaps: ComplianceGap[],
  input: ComplianceAnalysisInput
): string {
  const gapList = gaps
    .slice(0, 10)
    .map(
      (g) =>
        `- [${g.severity}] ${g.controlId}: ${g.gapAr}${
          g.legalReviewStatus === "REQUIRED" ? " — تلزم مراجعة قانونية" : ""
        }`
    )
    .join("\n");

  return `# بطاقة امتثال

**نوع المستند:** ${DOCUMENT_TYPE_AR[input.documentType]} (${input.documentType})
**النتيجة الإجمالية:** ${stats.overallScore}% (${stats.passed}/${stats.total} مستوفى)

## الملخص
- مستوفى (PASS): ${stats.passed}
- غير مستوفى (FAIL): ${stats.failed}
- تحذير (WARNING): ${stats.warnings}
- غير منطبق: ${stats.notApplicable}
- تلزم مراجعة قانونية: ${stats.legalReview}
- نتائج تستند إلى نص المستند: ${stats.cited}/${stats.total}

## الفجوات الحرجة
${gapList || "لا توجد فجوات حرجة."}

${LEGAL_DISCLAIMER_AR}
`;
}
