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

import { generateCompletion, type LLMMessage } from "../llm";
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
  getActivePolicies,
  extractLocalContentPreference,
  noraPrinciplesFromTender,
  type RegulatoryPolicyVersion,
} from "../procurement-rules";
import { evaluateCompliance } from "../agents/compliance";
import type {
  ComplianceMatrixRow,
  IngestionEntities,
  Locale,
} from "../types";

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

function buildComplianceScanSystemPrompt(): string {
  return `You are ArabClue AI Compliance Scanner for Saudi procurement regulations.
${NO_PRICING_RULE}
${REGULATORY_PRECISION_RULE}
Scan documents against: ${PROCUREMENT_LAW.nameEn} / ${PROCUREMENT_LAW.nameAr}, PDPL, NCA ${NCA_FRAMEWORKS.ecc}/${NCA_FRAMEWORKS.ccc}.
Rules:
- Evidence-backed only — never fabricate regulatory requirements.
- Use only identifiers from the tender or approved registry.
- Include: "${LEGAL_DISCLAIMER}"
- Output JSON only: { "findings": [{ "controlId": string, "frameworkId": string, "status": "PASS"|"FAIL"|"WARNING"|"NOT_APPLICABLE", "evidenceEn": string, "evidenceAr": string, "remediationEn": string|null, "remediationAr": string|null, "sourceCategory": string, "policyVersionId": string|null }] }`;
}

function buildGapAnalysisSystemPrompt(): string {
  return `You are ArabClue AI Compliance Gap Analyzer.
${NO_PRICING_RULE}
${REGULATORY_PRECISION_RULE}
Identify missing compliance requirements in proposals/contracts.
Rules:
- Gaps must reference specific controls.
- Never invent regulatory requirements.
- Output JSON only: { "gaps": [{ "controlId": string, "frameworkId": string, "gapEn": string, "gapAr": string, "severity": "CRITICAL"|"MAJOR"|"MINOR", "remediationEn": string, "remediationAr": string }] }`;
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
      remediationAr: row.remediation ?? "راجع وقدم الدليل",
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

  try {
    const contextJson = JSON.stringify({
      documentType: input.documentType,
      documentExcerpt: input.documentText.slice(0, 8000),
      scope: input.entities?.scope?.slice(0, 1000) ?? null,
      sla: input.entities?.sla ?? null,
      noraPrinciples: input.entities?.noraPrinciplesFromTender ?? [],
      localContentPreference: input.entities?.localContentPreferencePercent ?? null,
      frameworks: {
        procurementLaw: PROCUREMENT_LAW.citation,
        pdpl: PDPL_RULES.residencyEvaluationNote,
        ncaEcc: NCA_FRAMEWORKS.ecc,
        ncaCcc: NCA_FRAMEWORKS.ccc,
      },
    }).slice(0, 12000);

    const messages: LLMMessage[] = [
      { role: "system", content: buildComplianceScanSystemPrompt() },
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

    if (result.fallback || !result.content) return deterministic;

    const parsed = safeParseFindings(result.content);
    if (!parsed || parsed.length === 0) return deterministic;

    const provenance: AiProvenance = {
      source: "AI_GENERATED",
      provider: result.provider,
      model: result.model,
      engine: result.engine ?? "COMPLIANCE",
      generatedAt: new Date().toISOString(),
      confidence: result.confidence,
      fallback: false,
    };

    return parsed.map((f) => ({ ...f, provenance }));
  } catch (err) {
    console.warn("[compliance-analyzer] LLM scan failed, using deterministic", err);
    return deterministic;
  }
}

function safeParseFindings(content: string): ComplianceFinding[] | null {
  try {
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.findings || !Array.isArray(parsed.findings)) return null;

    return parsed.findings
      .filter(
        (f: unknown): f is Record<string, unknown> =>
          typeof f === "object" && f !== null
      )
      .map((f) => ({
        controlId: String(f.controlId ?? ""),
        frameworkId: String(f.frameworkId ?? ""),
        status: (["PASS", "FAIL", "WARNING", "NOT_APPLICABLE"].includes(String(f.status))
          ? String(f.status)
          : "WARNING") as ComplianceFinding["status"],
        evidenceEn: String(f.evidenceEn ?? ""),
        evidenceAr: String(f.evidenceAr ?? ""),
        remediationEn: f.remediationEn ? String(f.remediationEn) : null,
        remediationAr: f.remediationAr ? String(f.remediationAr) : null,
        sourceCategory: String(f.sourceCategory ?? "INFERRED_APPLICABILITY"),
        policyVersionId: f.policyVersionId ? String(f.policyVersionId) : null,
        provenance: {
          source: "AI_GENERATED" as const,
          provider: "pending",
          model: "pending",
          engine: "COMPLIANCE",
          generatedAt: new Date().toISOString(),
          confidence: 0.8,
          fallback: false,
        },
      }))
      .filter((f) => f.controlId);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// AI-powered gap analysis
// ---------------------------------------------------------------------------

export async function analyzeComplianceGaps(
  input: ComplianceAnalysisInput
): Promise<ComplianceGap[]> {
  const deterministic = deterministicGaps(input);

  try {
    const contextJson = JSON.stringify({
      documentType: input.documentType,
      documentExcerpt: input.documentText.slice(0, 6000),
      scope: input.entities?.scope?.slice(0, 1000) ?? null,
      complianceMatrix: deterministicFindings(input)
        .filter((f) => f.status !== "PASS")
        .slice(0, 15)
        .map((f) => ({
          controlId: f.controlId,
          status: f.status,
          evidence: f.evidenceEn.slice(0, 200),
        })),
    }).slice(0, 10000);

    const messages: LLMMessage[] = [
      { role: "system", content: buildGapAnalysisSystemPrompt() },
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

    if (result.fallback || !result.content) return deterministic;

    const parsed = safeParseGaps(result.content);
    if (!parsed || parsed.length === 0) return deterministic;

    const provenance: AiProvenance = {
      source: "AI_GENERATED",
      provider: result.provider,
      model: result.model,
      engine: result.engine ?? "COMPLIANCE",
      generatedAt: new Date().toISOString(),
      confidence: result.confidence,
      fallback: false,
    };

    return parsed.map((g) => ({ ...g, provenance }));
  } catch (err) {
    console.warn("[compliance-analyzer] LLM gap analysis failed, using deterministic", err);
    return deterministic;
  }
}

function safeParseGaps(content: string): ComplianceGap[] | null {
  try {
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.gaps || !Array.isArray(parsed.gaps)) return null;

    return parsed.gaps
      .filter(
        (g: unknown): g is Record<string, unknown> =>
          typeof g === "object" && g !== null
      )
      .map((g) => ({
        controlId: String(g.controlId ?? ""),
        frameworkId: String(g.frameworkId ?? ""),
        gapEn: String(g.gapEn ?? ""),
        gapAr: String(g.gapAr ?? ""),
        severity: (["CRITICAL", "MAJOR", "MINOR"].includes(String(g.severity))
          ? String(g.severity)
          : "MINOR") as ComplianceGap["severity"],
        remediationEn: String(g.remediationEn ?? ""),
        remediationAr: String(g.remediationAr ?? ""),
        provenance: {
          source: "AI_GENERATED" as const,
          provider: "pending",
          model: "pending",
          engine: "COMPLIANCE",
          generatedAt: new Date().toISOString(),
          confidence: 0.8,
          fallback: false,
        },
      }))
      .filter((g) => g.controlId);
  } catch {
    return null;
  }
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

  const reportEn = buildScorecardReportEn(
    { passed, failed, warnings, notApplicable, overallScore, total: findings.length },
    gaps,
    input
  );
  const reportAr = buildScorecardReportAr(
    { passed, failed, warnings, notApplicable, overallScore, total: findings.length },
    gaps,
    input
  );

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

function buildScorecardReportEn(
  stats: { passed: number; failed: number; warnings: number; notApplicable: number; overallScore: number; total: number },
  gaps: ComplianceGap[],
  input: ComplianceAnalysisInput
): string {
  const gapList = gaps
    .slice(0, 10)
    .map((g) => `- [${g.severity}] ${g.controlId}: ${g.gapEn}`)
    .join("\n");

  return `# Compliance Scorecard

**Document Type:** ${input.documentType}
**Overall Score:** ${stats.overallScore}% (${stats.passed}/${stats.total} PASS)

## Summary
- PASS: ${stats.passed}
- FAIL: ${stats.failed}
- WARNING: ${stats.warnings}
- NOT APPLICABLE: ${stats.notApplicable}

## Critical Gaps
${gapList || "No critical gaps identified."}

${LEGAL_DISCLAIMER}
`;
}

function buildScorecardReportAr(
  stats: { passed: number; failed: number; warnings: number; notApplicable: number; overallScore: number; total: number },
  gaps: ComplianceGap[],
  input: ComplianceAnalysisInput
): string {
  const gapList = gaps
    .slice(0, 10)
    .map((g) => `- [${g.severity}] ${g.controlId}: ${g.gapAr}`)
    .join("\n");

  return `# بطاقة امتثال

**نوع المستند:** ${input.documentType}
**النتيجة الإجمالية:** ${stats.overallScore}% (${stats.passed}/${stats.total} ناجح)

## الملخص
- ناجح: ${stats.passed}
- فاشل: ${stats.failed}
- تحذير: ${stats.warnings}
- غير منطبق: ${stats.notApplicable}

## الفجوات الحرجة
${gapList || "لا توجد فجوات حرجة."}

${LEGAL_DISCLAIMER_AR}
`;
}
