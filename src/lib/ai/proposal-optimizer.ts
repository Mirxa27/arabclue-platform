/**
 * AI-powered Proposal Optimization Engine.
 *
 * Extends the existing drafting agent with:
 * 1. Scoring engine — coverage, compliance, clarity, competitiveness
 * 2. Improvement suggestions — actionable, requirement-ID-referenced
 * 3. Section optimization — rewrite weak sections using LLM
 * 4. Win probability estimation — based on historical data and coverage
 *
 * Uses the existing LLM provider system.
 * Deterministic scoring when LLM is not configured.
 * No pricing suggestions (existing guardrail).
 * Bilingual output.
 */

import { generateCompletion, type LLMMessage } from "../llm";
import {
  NO_PRICING_RULE,
  REGULATORY_PRECISION_RULE,
} from "../agents/prompts";
import { LEGAL_DISCLAIMER, LEGAL_DISCLAIMER_AR } from "../procurement-rules";
import { detectPricingSuggestion } from "../guardrails";
import type {
  ComplianceMatrixRow,
  IngestionEntities,
  Locale,
} from "../types";
import type { CoveragePlan } from "../agents/coverage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProposalScore = {
  overall: number;
  coverage: number;
  compliance: number;
  clarity: number;
  competitiveness: number;
  breakdown: {
    metric: string;
    metricAr: string;
    score: number;
    maxScore: number;
    notesEn: string;
    notesAr: string;
  }[];
  provenance: AiProvenance;
};

export type ImprovementSuggestion = {
  sectionId: string;
  requirementId: string | null;
  suggestionEn: string;
  suggestionAr: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  provenance: AiProvenance;
};

export type SectionOptimization = {
  sectionId: string;
  originalContent: string;
  optimizedContent: string;
  improvementsEn: string[];
  improvementsAr: string[];
  provenance: AiProvenance;
};

export type WinProbability = {
  probability: number;
  confidence: number;
  factors: {
    factorEn: string;
    factorAr: string;
    impact: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
    weight: number;
  }[];
  provenance: AiProvenance;
};

export type ProposalOptimizationResult = {
  score: ProposalScore;
  suggestions: ImprovementSuggestion[];
  sectionOptimizations: SectionOptimization[];
  winProbability: WinProbability;
  provenance: AiProvenance;
};

export type AiProvenance = {
  source: "AI_GENERATED" | "DETERMINISTIC_FALLBACK";
  provider: string;
  model: string;
  engine: string;
  generatedAt: string;
  confidence: number;
  fallback: boolean;
};

export type ProposalOptimizationInput = {
  contentMd: string;
  entities: IngestionEntities | null;
  complianceRows: ComplianceMatrixRow[];
  coverage: CoveragePlan | null;
  locale?: Locale;
  workspaceId: string;
  historicalWinRate?: number | null;
};

// ---------------------------------------------------------------------------
// System prompt builders
// ---------------------------------------------------------------------------

function buildScoringSystemPrompt(): string {
  return `You are ArabClue AI Proposal Scoring Engine.
${NO_PRICING_RULE}
${REGULATORY_PRECISION_RULE}
Score proposals on: coverage, compliance, clarity, competitiveness (0-100 each).
Rules:
- Scores must be evidence-based — never inflate.
- Reference specific requirement IDs in notes.
- Include: "${LEGAL_DISCLAIMER}"
- Output JSON only: { "overall": number, "coverage": number, "compliance": number, "clarity": number, "competitiveness": number, "breakdown": [{ "metric": string, "metricAr": string, "score": number, "maxScore": 100, "notesEn": string, "notesAr": string }] }`;
}

function buildSuggestionSystemPrompt(): string {
  return `You are ArabClue AI Proposal Improvement Advisor.
${NO_PRICING_RULE}
${REGULATORY_PRECISION_RULE}
Generate specific, actionable improvement suggestions for proposal sections.
Rules:
- Every suggestion must reference a specific requirement ID when applicable.
- Never suggest pricing, discounts, or commercial strategy.
- Bilingual output (EN/AR).
- Output JSON only: { "suggestions": [{ "sectionId": string, "requirementId": string|null, "suggestionEn": string, "suggestionAr": string, "priority": "HIGH"|"MEDIUM"|"LOW" }] }`;
}

function buildSectionOptimizationSystemPrompt(): string {
  return `You are ArabClue AI Section Optimization Engine.
${NO_PRICING_RULE}
${REGULATORY_PRECISION_RULE}
Rewrite weak proposal sections to improve evaluator scannability and requirement coverage.
Rules:
- Preserve all facts, citations, and requirement IDs.
- Never invent experience, staff, certifications, or prices.
- Bilingual improvements list.
- Output JSON only: { "optimizedContent": string, "improvementsEn": [string], "improvementsAr": [string] }`;
}

function buildWinProbabilitySystemPrompt(): string {
  return `You are ArabClue AI Win Probability Estimator.
${NO_PRICING_RULE}
${REGULATORY_PRECISION_RULE}
Estimate win probability based on coverage, compliance, and historical patterns.
Rules:
- Probability is 0-100. Never claim certainty.
- List contributing factors with impact and weight.
- Output JSON only: { "probability": number, "confidence": number, "factors": [{ "factorEn": string, "factorAr": string, "impact": "POSITIVE"|"NEGATIVE"|"NEUTRAL", "weight": number }] }`;
}

// ---------------------------------------------------------------------------
// Deterministic fallbacks
// ---------------------------------------------------------------------------

function deterministicScore(
  input: ProposalOptimizationInput
): ProposalScore {
  const provenance: AiProvenance = {
    source: "DETERMINISTIC_FALLBACK",
    provider: "deterministic",
    model: "coverage-compliance-calculator",
    engine: "DRAFTING",
    generatedAt: new Date().toISOString(),
    confidence: 0.7,
    fallback: true,
  };

  const coverage = input.coverage;
  const coverageScore = coverage?.coveragePercent ?? 0;

  const compliant = input.complianceRows.filter(
    (r) => r.status === "COMPLIANT"
  ).length;
  const complianceScore = input.complianceRows.length
    ? Math.round((compliant / input.complianceRows.length) * 100)
    : 0;

  // Clarity: check for headings, tables, requirement IDs
  const hasHeadings = /^##\s+/m.test(input.contentMd);
  const hasTables = /\|.*\|.*\n.*\|.*-/m.test(input.contentMd);
  const hasReqIds = /\b[A-Z]+\d+|REQ-|requirement/i.test(input.contentMd);
  const hasDisclaimer = /not legal advice|ليست استشارة قانونية/i.test(
    input.contentMd
  );
  const clarityScore = Math.round(
    ((hasHeadings ? 25 : 0) +
      (hasTables ? 25 : 0) +
      (hasReqIds ? 25 : 0) +
      (hasDisclaimer ? 25 : 0))
  );

  // Competitiveness: based on coverage + compliance + gap handling
  const gapCount = coverage?.gapCount ?? 0;
  const competitivenessScore = Math.max(
    0,
    Math.round((coverageScore + complianceScore) / 2 - gapCount * 2)
  );

  const overall = Math.round(
    (coverageScore + complianceScore + clarityScore + competitivenessScore) / 4
  );

  return {
    overall,
    coverage: coverageScore,
    compliance: complianceScore,
    clarity: clarityScore,
    competitiveness: competitivenessScore,
    breakdown: [
      {
        metric: "Requirement Coverage",
        metricAr: "تغطية المتطلبات",
        score: coverageScore,
        maxScore: 100,
        notesEn: `${coverage?.coveredCount ?? 0} covered, ${coverage?.partialCount ?? 0} partial, ${gapCount} gaps`,
        notesAr: `${coverage?.coveredCount ?? 0} مغطى، ${coverage?.partialCount ?? 0} جزئي، ${gapCount} فجوات`,
      },
      {
        metric: "Compliance Alignment",
        metricAr: "مواءمة الامتثال",
        score: complianceScore,
        maxScore: 100,
        notesEn: `${compliant}/${input.complianceRows.length} controls COMPLIANT`,
        notesAr: `${compliant}/${input.complianceRows.length} ضوابط ممتثلة`,
      },
      {
        metric: "Document Clarity",
        metricAr: "وضوح المستند",
        score: clarityScore,
        maxScore: 100,
        notesEn: `Headings: ${hasHeadings}, Tables: ${hasTables}, ReqIDs: ${hasReqIds}`,
        notesAr: `عناوين: ${hasHeadings}، جداول: ${hasTables}، معرفات: ${hasReqIds}`,
      },
      {
        metric: "Competitiveness",
        metricAr: "التنافسية",
        score: competitivenessScore,
        maxScore: 100,
        notesEn: `Based on coverage/compliance average minus gap penalty`,
        notesAr: `مبني على متوسط التغطية/الامتثال ناقص جزاء الفجوات`,
      },
    ],
    provenance,
  };
}

function deterministicSuggestions(
  input: ProposalOptimizationInput
): ImprovementSuggestion[] {
  const provenance: AiProvenance = {
    source: "DETERMINISTIC_FALLBACK",
    provider: "deterministic",
    model: "gap-analyzer",
    engine: "DRAFTING",
    generatedAt: new Date().toISOString(),
    confidence: 0.65,
    fallback: true,
  };

  const suggestions: ImprovementSuggestion[] = [];

  // Gap-based suggestions
  if (input.coverage) {
    for (const task of input.coverage.missingEvidenceTasks.slice(0, 10)) {
      const reqId = task.match(/\b([A-Z]+\d+)\b/)?.[1] ?? null;
      suggestions.push({
        sectionId: "coverage-matrix",
        requirementId: reqId,
        suggestionEn: `Address evidence gap: ${task.slice(0, 200)}`,
        suggestionAr: `عالج فجوة الأدلة: ${task.slice(0, 200)}`,
        priority: "HIGH",
        provenance,
      });
    }
  }

  // Compliance gap suggestions
  for (const row of input.complianceRows
    .filter((r) => r.status === "PARTIAL" || r.status === "EVIDENCE_MISSING")
    .slice(0, 8)) {
    suggestions.push({
      sectionId: "compliance",
      requirementId: row.controlId,
      suggestionEn: `Provide evidence for ${row.controlId}: ${row.remediation ?? row.evidence.slice(0, 150)}`,
      suggestionAr: `قدم دليلاً لـ ${row.controlId}: ${row.remediation ?? row.evidence.slice(0, 150)}`,
      priority: row.status === "EVIDENCE_MISSING" ? "HIGH" : "MEDIUM",
      provenance,
    });
  }

  // Clarity suggestions
  if (!/##\s+/m.test(input.contentMd)) {
    suggestions.push({
      sectionId: "structure",
      requirementId: null,
      suggestionEn: "Add clear ## section headings for evaluator scannability",
      suggestionAr: "أضف عناوين أقسام ## واضحة لتسهيل تقييم المقيّم",
      priority: "MEDIUM",
      provenance,
    });
  }

  if (!/not legal advice|ليست استشارة قانونية/i.test(input.contentMd)) {
    suggestions.push({
      sectionId: "compliance",
      requirementId: null,
      suggestionEn: "Include mandatory legal disclaimer",
      suggestionAr: "أدرج إخلاء المسؤولية القانونية الإلزامي",
      priority: "HIGH",
      provenance,
    });
  }

  return suggestions;
}

function deterministicWinProbability(
  input: ProposalOptimizationInput
): WinProbability {
  const provenance: AiProvenance = {
    source: "DETERMINISTIC_FALLBACK",
    provider: "deterministic",
    model: "win-probability-calculator",
    engine: "DRAFTING",
    generatedAt: new Date().toISOString(),
    confidence: 0.6,
    fallback: true,
  };

  const score = deterministicScore(input);
  const historicalRate = input.historicalWinRate ?? null;

  // Base probability from score, adjusted by historical rate
  let probability = score.overall * 0.6;
  if (historicalRate != null) {
    probability = probability * 0.7 + historicalRate * 0.3;
  }
  probability = Math.max(0, Math.min(100, Math.round(probability)));

  const factors: WinProbability["factors"] = [
    {
      factorEn: `Requirement coverage: ${score.coverage}%`,
      factorAr: `تغطية المتطلبات: ${score.coverage}%`,
      impact: score.coverage >= 70 ? "POSITIVE" : "NEGATIVE",
      weight: 0.3,
    },
    {
      factorEn: `Compliance alignment: ${score.compliance}%`,
      factorAr: `مواءمة الامتثال: ${score.compliance}%`,
      impact: score.compliance >= 70 ? "POSITIVE" : "NEGATIVE",
      weight: 0.25,
    },
    {
      factorEn: `Document clarity: ${score.clarity}%`,
      factorAr: `وضوح المستند: ${score.clarity}%`,
      impact: score.clarity >= 75 ? "POSITIVE" : "NEUTRAL",
      weight: 0.15,
    },
    {
      factorEn: `Evidence gaps: ${input.coverage?.gapCount ?? 0}`,
      factorAr: `فجوات الأدلة: ${input.coverage?.gapCount ?? 0}`,
      impact: (input.coverage?.gapCount ?? 0) > 5 ? "NEGATIVE" : "NEUTRAL",
      weight: 0.2,
    },
  ];

  if (historicalRate != null) {
    factors.push({
      factorEn: `Historical win rate: ${historicalRate}%`,
      factorAr: `معدل الفوز التاريخي: ${historicalRate}%`,
      impact: historicalRate >= 50 ? "POSITIVE" : "NEGATIVE",
      weight: 0.1,
    });
  }

  return {
    probability,
    confidence: provenance.confidence,
    factors,
    provenance,
  };
}

// ---------------------------------------------------------------------------
// AI-powered scoring
// ---------------------------------------------------------------------------

export async function scoreProposal(
  input: ProposalOptimizationInput
): Promise<ProposalScore> {
  const deterministic = deterministicScore(input);

  try {
    const contextJson = JSON.stringify({
      coveragePercent: input.coverage?.coveragePercent ?? 0,
      coveredCount: input.coverage?.coveredCount ?? 0,
      gapCount: input.coverage?.gapCount ?? 0,
      compliantControls: input.complianceRows.filter((r) => r.status === "COMPLIANT").length,
      totalControls: input.complianceRows.length,
      contentExcerpt: input.contentMd.slice(0, 6000),
    }).slice(0, 10000);

    const messages: LLMMessage[] = [
      { role: "system", content: buildScoringSystemPrompt() },
      {
        role: "user",
        content: `Score this proposal:\n${contextJson}\n\nReturn JSON only.`,
      },
    ];

    const result = await generateCompletion(messages, {
      engine: "DRAFTING",
      temperature: 0.15,
      maxTokens: 4096,
    });

    if (result.fallback || !result.content) return deterministic;

    const parsed = safeParseScore(result.content);
    if (!parsed) return deterministic;

    return {
      ...parsed,
      provenance: {
        source: "AI_GENERATED",
        provider: result.provider,
        model: result.model,
        engine: result.engine ?? "DRAFTING",
        generatedAt: new Date().toISOString(),
        confidence: result.confidence,
        fallback: false,
      },
    };
  } catch (err) {
    console.warn("[proposal-optimizer] LLM scoring failed, using deterministic", err);
    return deterministic;
  }
}

function safeParseScore(content: string): ProposalScore | null {
  try {
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    return {
      overall: clampScore(parsed.overall),
      coverage: clampScore(parsed.coverage),
      compliance: clampScore(parsed.compliance),
      clarity: clampScore(parsed.clarity),
      competitiveness: clampScore(parsed.competitiveness),
      breakdown: Array.isArray(parsed.breakdown)
        ? parsed.breakdown.map((b: Record<string, unknown>) => ({
            metric: String(b.metric ?? ""),
            metricAr: String(b.metricAr ?? ""),
            score: clampScore(b.score),
            maxScore: 100,
            notesEn: String(b.notesEn ?? ""),
            notesAr: String(b.notesAr ?? ""),
          }))
        : [],
      provenance: {
        source: "AI_GENERATED",
        provider: "pending",
        model: "pending",
        engine: "DRAFTING",
        generatedAt: new Date().toISOString(),
        confidence: 0.8,
        fallback: false,
      },
    };
  } catch {
    return null;
  }
}

function clampScore(v: unknown): number {
  const n = typeof v === "number" ? v : 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// ---------------------------------------------------------------------------
// AI-powered improvement suggestions
// ---------------------------------------------------------------------------

export async function generateImprovementSuggestions(
  input: ProposalOptimizationInput
): Promise<ImprovementSuggestion[]> {
  const deterministic = deterministicSuggestions(input);

  try {
    const contextJson = JSON.stringify({
      contentExcerpt: input.contentMd.slice(0, 6000),
      gaps: input.coverage?.missingEvidenceTasks.slice(0, 10) ?? [],
      complianceGaps: input.complianceRows
        .filter((r) => r.status === "PARTIAL" || r.status === "EVIDENCE_MISSING")
        .slice(0, 10)
        .map((r) => ({ controlId: r.controlId, remediation: r.remediation })),
      coveragePercent: input.coverage?.coveragePercent ?? 0,
    }).slice(0, 10000);

    const messages: LLMMessage[] = [
      { role: "system", content: buildSuggestionSystemPrompt() },
      {
        role: "user",
        content: `Generate improvement suggestions:\n${contextJson}\n\nReturn JSON only.`,
      },
    ];

    const result = await generateCompletion(messages, {
      engine: "DRAFTING",
      temperature: 0.2,
      maxTokens: 4096,
    });

    if (result.fallback || !result.content) return deterministic;

    const parsed = safeParseSuggestions(result.content);
    if (!parsed || parsed.length === 0) return deterministic;

    const provenance: AiProvenance = {
      source: "AI_GENERATED",
      provider: result.provider,
      model: result.model,
      engine: result.engine ?? "DRAFTING",
      generatedAt: new Date().toISOString(),
      confidence: result.confidence,
      fallback: false,
    };

    return parsed.map((s) => ({ ...s, provenance }));
  } catch (err) {
    console.warn("[proposal-optimizer] LLM suggestions failed, using deterministic", err);
    return deterministic;
  }
}

function safeParseSuggestions(
  content: string
): ImprovementSuggestion[] | null {
  try {
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) return null;

    return parsed.suggestions
      .filter(
        (s: unknown): s is Record<string, unknown> =>
          typeof s === "object" && s !== null
      )
      .map((s) => ({
        sectionId: String(s.sectionId ?? ""),
        requirementId: s.requirementId ? String(s.requirementId) : null,
        suggestionEn: String(s.suggestionEn ?? ""),
        suggestionAr: String(s.suggestionAr ?? ""),
        priority: (["HIGH", "MEDIUM", "LOW"].includes(String(s.priority))
          ? String(s.priority)
          : "MEDIUM") as ImprovementSuggestion["priority"],
        provenance: {
          source: "AI_GENERATED" as const,
          provider: "pending",
          model: "pending",
          engine: "DRAFTING",
          generatedAt: new Date().toISOString(),
          confidence: 0.8,
          fallback: false,
        },
      }))
      .filter((s) => s.suggestionEn || s.suggestionAr);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// AI-powered section optimization
// ---------------------------------------------------------------------------

export async function optimizeSection(
  sectionId: string,
  sectionContent: string,
  input: ProposalOptimizationInput
): Promise<SectionOptimization> {
  const provenance: AiProvenance = {
    source: "DETERMINISTIC_FALLBACK",
    provider: "deterministic",
    model: "section-structure-enhancer",
    engine: "DRAFTING",
    generatedAt: new Date().toISOString(),
    confidence: 0.6,
    fallback: true,
  };

  // Deterministic: ensure headings and structure
  const optimized = sectionContent.trim().startsWith("#")
    ? sectionContent
    : `## ${sectionId}\n\n${sectionContent}`;

  const deterministic: SectionOptimization = {
    sectionId,
    originalContent: sectionContent,
    optimizedContent: optimized,
    improvementsEn: ["Added section heading for evaluator scannability"],
    improvementsAr: ["أُضيف عنوان قسم لتسهيل تقييم المقيّم"],
    provenance,
  };

  try {
    const contextJson = JSON.stringify({
      sectionId,
      sectionContent: sectionContent.slice(0, 6000),
      coveragePercent: input.coverage?.coveragePercent ?? 0,
      relevantGaps: input.coverage?.missingEvidenceTasks.slice(0, 5) ?? [],
    }).slice(0, 8000);

    const messages: LLMMessage[] = [
      { role: "system", content: buildSectionOptimizationSystemPrompt() },
      {
        role: "user",
        content: `Optimize this proposal section:\n${contextJson}\n\nReturn JSON only.`,
      },
    ];

    const result = await generateCompletion(messages, {
      engine: "DRAFTING",
      temperature: 0.25,
      maxTokens: 4096,
    });

    if (result.fallback || !result.content) return deterministic;

    const parsed = safeParseSectionOptimization(result.content, sectionId, sectionContent);
    if (!parsed) return deterministic;

    // Guardrail: reject pricing suggestions
    if (detectPricingSuggestion(parsed.optimizedContent)) {
      return deterministic;
    }

    return {
      ...parsed,
      provenance: {
        source: "AI_GENERATED",
        provider: result.provider,
        model: result.model,
        engine: result.engine ?? "DRAFTING",
        generatedAt: new Date().toISOString(),
        confidence: result.confidence,
        fallback: false,
      },
    };
  } catch (err) {
    console.warn("[proposal-optimizer] LLM section optimization failed, using deterministic", err);
    return deterministic;
  }
}

function safeParseSectionOptimization(
  content: string,
  sectionId: string,
  original: string
): SectionOptimization | null {
  try {
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    return {
      sectionId,
      originalContent: original,
      optimizedContent: String(parsed.optimizedContent ?? original),
      improvementsEn: Array.isArray(parsed.improvementsEn)
        ? parsed.improvementsEn.map(String)
        : [],
      improvementsAr: Array.isArray(parsed.improvementsAr)
        ? parsed.improvementsAr.map(String)
        : [],
      provenance: {
        source: "AI_GENERATED",
        provider: "pending",
        model: "pending",
        engine: "DRAFTING",
        generatedAt: new Date().toISOString(),
        confidence: 0.8,
        fallback: false,
      },
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// AI-powered win probability
// ---------------------------------------------------------------------------

export async function estimateWinProbability(
  input: ProposalOptimizationInput
): Promise<WinProbability> {
  const deterministic = deterministicWinProbability(input);

  try {
    const contextJson = JSON.stringify({
      coveragePercent: input.coverage?.coveragePercent ?? 0,
      gapCount: input.coverage?.gapCount ?? 0,
      complianceScore: input.complianceRows.length
        ? Math.round(
            (input.complianceRows.filter((r) => r.status === "COMPLIANT").length /
              input.complianceRows.length) *
              100
          )
        : 0,
      historicalWinRate: input.historicalWinRate ?? null,
      contentLength: input.contentMd.length,
    }).slice(0, 6000);

    const messages: LLMMessage[] = [
      { role: "system", content: buildWinProbabilitySystemPrompt() },
      {
        role: "user",
        content: `Estimate win probability:\n${contextJson}\n\nReturn JSON only.`,
      },
    ];

    const result = await generateCompletion(messages, {
      engine: "DRAFTING",
      temperature: 0.15,
      maxTokens: 2048,
    });

    if (result.fallback || !result.content) return deterministic;

    const parsed = safeParseWinProbability(result.content);
    if (!parsed) return deterministic;

    return {
      ...parsed,
      provenance: {
        source: "AI_GENERATED",
        provider: result.provider,
        model: result.model,
        engine: result.engine ?? "DRAFTING",
        generatedAt: new Date().toISOString(),
        confidence: result.confidence,
        fallback: false,
      },
    };
  } catch (err) {
    console.warn("[proposal-optimizer] LLM win probability failed, using deterministic", err);
    return deterministic;
  }
}

function safeParseWinProbability(content: string): WinProbability | null {
  try {
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    return {
      probability: clampScore(parsed.probability),
      confidence: typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.7,
      factors: Array.isArray(parsed.factors)
        ? parsed.factors.map((f: Record<string, unknown>) => ({
            factorEn: String(f.factorEn ?? ""),
            factorAr: String(f.factorAr ?? ""),
            impact: (["POSITIVE", "NEGATIVE", "NEUTRAL"].includes(String(f.impact))
              ? String(f.impact)
              : "NEUTRAL") as WinProbability["factors"][number]["impact"],
            weight: typeof f.weight === "number" ? f.weight : 0,
          }))
        : [],
      provenance: {
        source: "AI_GENERATED",
        provider: "pending",
        model: "pending",
        engine: "DRAFTING",
        generatedAt: new Date().toISOString(),
        confidence: 0.8,
        fallback: false,
      },
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Full optimization orchestration
// ---------------------------------------------------------------------------

export async function optimizeProposal(
  input: ProposalOptimizationInput
): Promise<ProposalOptimizationResult> {
  const [score, suggestions, winProbability] = await Promise.all([
    scoreProposal(input),
    generateImprovementSuggestions(input),
    estimateWinProbability(input),
  ]);

  // Optimize top weak sections
  const weakSections = extractWeakSections(input.contentMd, suggestions);
  const sectionOptimizations: SectionOptimization[] = [];
  for (const section of weakSections.slice(0, 3)) {
    const optimized = await optimizeSection(section.id, section.content, input);
    sectionOptimizations.push(optimized);
  }

  const provenance: AiProvenance = score.provenance;

  return {
    score,
    suggestions,
    sectionOptimizations,
    winProbability,
    provenance,
  };
}

function extractWeakSections(
  contentMd: string,
  suggestions: ImprovementSuggestion[]
): Array<{ id: string; content: string }> {
  // Extract sections by ## headings
  const sections: Array<{ id: string; content: string }> = [];
  const parts = contentMd.split(/^(##\s+)/m);
  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i] + parts[i + 1];
    const id = heading.match(/^##\s+(.+?)(?:\n|$)/)?.[1]?.trim() ?? `section-${i}`;
    sections.push({ id, content: heading });
  }

  // Prioritize sections that have suggestions
  const suggestedIds = new Set(suggestions.map((s) => s.sectionId));
  return sections.sort((a, b) => {
    const aHas = suggestedIds.has(a.id) ? 0 : 1;
    const bHas = suggestedIds.has(b.id) ? 0 : 1;
    return aHas - bHas;
  });
}
