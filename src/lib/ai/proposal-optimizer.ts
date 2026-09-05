/**
 * AI-powered Proposal Optimization Engine.
 *
 * Extends the existing drafting agent with:
 * 1. Scoring engine — coverage, compliance, clarity, competitiveness
 * 2. Improvement suggestions — actionable, requirement-ID-referenced
 * 3. Section optimization — rewrite weak sections using LLM
 * 4. Readiness estimate (the `winProbability` field) — a heuristic on coverage,
 *    compliance and the workspace's own history; never an award forecast
 *
 * Uses the existing LLM provider system.
 * Deterministic scoring when LLM is not configured.
 * No pricing suggestions (existing guardrail).
 * Model answers are admitted only through a schema (`json-output.ts`); a
 * requirement id the inputs do not contain drops the suggestion that cites it.
 * Bilingual output, in the house style (`style-guide.ts`).
 */

import { z } from "zod";
import { generateCompletion, type LLMMessage } from "../llm";
import {
  NO_PRICING_RULE,
  REGULATORY_PRECISION_RULE,
} from "../agents/prompts";
import { LEGAL_DISCLAIMER } from "../procurement-rules";
import { detectPricingSuggestion } from "../guardrails";
import type {
  ComplianceMatrixRow,
  IngestionEntities,
  Locale,
} from "../types";
import type { CoveragePlan } from "../agents/coverage";
import {
  ProviderUnavailableError,
  guardCaughtOrThrow,
  guardOrThrow,
} from "./provider-unavailable";
import { parseJsonWithSchema, schemaRejection } from "./json-output";
import { appendGlossaryWithinBudget, styleGuideFor } from "./style-guide";

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

/** Glossary budget inside these prompts; the rules and the schema come first. */
const PROMPT_GLOSSARY_CHARS = 1_200;

/**
 * Exported so the size cap can be asserted: each system prompt stays under
 * 6,000 characters whatever document is passed, because the glossary is
 * filtered to the terms the document uses and capped besides.
 */
export function buildScoringSystemPrompt(locale: Locale = "ar", documentText = ""): string {
  const head = `You are ArabClue AI Proposal Scoring Engine.
${NO_PRICING_RULE}
${REGULATORY_PRECISION_RULE}
Score proposals on: coverage, compliance, clarity, competitiveness (0-100 each). "Competitiveness" here means how completely and verifiably the technical response answers the evaluation criteria — never price position.
Rules:
- Scores must be evidence-based — never inflate. Each breakdown note quotes or names what in the document earned or cost the points, with requirement IDs verbatim.
- Include: "${LEGAL_DISCLAIMER}"
- Output JSON only: { "overall": number, "coverage": number, "compliance": number, "clarity": number, "competitiveness": number, "breakdown": [{ "metric": string, "metricAr": string, "score": number, "maxScore": 100, "notesEn": string, "notesAr": string }] }
${styleGuideFor(locale)}`;
  return appendGlossaryWithinBudget(head, locale, documentText, {
    maxChars: PROMPT_GLOSSARY_CHARS,
  });
}

export function buildSuggestionSystemPrompt(locale: Locale = "ar", documentText = ""): string {
  const head = `You are ArabClue AI Proposal Improvement Advisor.
${NO_PRICING_RULE}
${REGULATORY_PRECISION_RULE}
Generate specific, actionable improvement suggestions for proposal sections.
Rules:
- "sectionId" is the exact text of the ## heading the suggestion belongs to, or one of "coverage-matrix", "compliance", "structure" for document-level advice.
- "requirementId" is an identifier that appears verbatim in the document, the gaps, or the compliance gaps provided; null when none applies. Never coin one.
- Suggest asking the human team for evidence rather than inventing experience, staff, certifications, or metrics.
- Never suggest pricing, discounts, or commercial strategy.
- suggestionEn and suggestionAr carry the same advice.
- Output JSON only: { "suggestions": [{ "sectionId": string, "requirementId": string|null, "suggestionEn": string, "suggestionAr": string, "priority": "HIGH"|"MEDIUM"|"LOW" }] }
${styleGuideFor(locale)}`;
  return appendGlossaryWithinBudget(head, locale, documentText, {
    maxChars: PROMPT_GLOSSARY_CHARS,
  });
}

export function buildSectionOptimizationSystemPrompt(
  locale: Locale = "ar",
  sectionText = ""
): string {
  const head = `You are ArabClue AI Section Optimization Engine.
${NO_PRICING_RULE}
${REGULATORY_PRECISION_RULE}
Rewrite weak proposal sections to improve evaluator scannability and requirement coverage.
Rules:
- Preserve every fact, figure, citation, and requirement ID; keep the section's language and its heading line.
- Never invent experience, staff, certifications, clients, metrics, or prices; where evidence is missing, leave an explicit "[evidence needed: …]" marker for the human team.
- improvementsEn and improvementsAr list the same changes.
- Output JSON only: { "optimizedContent": string, "improvementsEn": [string], "improvementsAr": [string] }
${styleGuideFor(locale)}`;
  return appendGlossaryWithinBudget(head, locale, sectionText, {
    maxChars: PROMPT_GLOSSARY_CHARS,
  });
}

export function buildWinProbabilitySystemPrompt(locale: Locale = "ar"): string {
  return `You are ArabClue AI Readiness Estimator.
${NO_PRICING_RULE}
${REGULATORY_PRECISION_RULE}
Estimate how ready this proposal is to score well on the tender's technical evaluation, using ONLY the provided document, requirement matrix and compliance rows. You have no award history and no competitor data: this is a readiness heuristic, never a win forecast, and the factors must name what in the document drives them.
Rules:
- Probability is 0-100 and means "technical readiness", not the chance of award. Never claim certainty.
- List contributing factors with impact and weight; factorEn and factorAr state the same factor.
- Output JSON only: { "probability": number, "confidence": number, "factors": [{ "factorEn": string, "factorAr": string, "impact": "POSITIVE"|"NEGATIVE"|"NEUTRAL", "weight": number }] }
${styleGuideFor(locale)}`;
}

// ---------------------------------------------------------------------------
// Answer schemas — the model's JSON is admitted only in this shape
// ---------------------------------------------------------------------------

const scoreAnswerSchema = z.object({
  overall: z.number(),
  coverage: z.number(),
  compliance: z.number(),
  clarity: z.number(),
  competitiveness: z.number(),
  breakdown: z
    .array(
      z.object({
        metric: z.string(),
        metricAr: z.string().nullable().optional(),
        score: z.number(),
        notesEn: z.string().nullable().optional(),
        notesAr: z.string().nullable().optional(),
      })
    )
    .nullable()
    .optional(),
});

const suggestionsAnswerSchema = z.object({
  suggestions: z.array(
    z.object({
      sectionId: z.string(),
      requirementId: z.string().nullable().optional(),
      suggestionEn: z.string().nullable().optional(),
      suggestionAr: z.string().nullable().optional(),
      priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
    })
  ),
});

const sectionAnswerSchema = z.object({
  optimizedContent: z.string().min(1),
  improvementsEn: z.array(z.string()).nullable().optional(),
  improvementsAr: z.array(z.string()).nullable().optional(),
});

const winAnswerSchema = z.object({
  probability: z.number(),
  confidence: z.number().nullable().optional(),
  factors: z
    .array(
      z.object({
        factorEn: z.string(),
        factorAr: z.string().nullable().optional(),
        impact: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]),
        weight: z.number().nullable().optional(),
      })
    )
    .nullable()
    .optional(),
});

type ParsedAnswer<T> = { ok: true; data: T } | { ok: false; issues: string[] };

/** `ECC-1.1`, `REQ-12`, `PDPL-14`, `TP1.3` — the shapes requirement IDs take in a tender. */
const REQUIREMENT_ID_RE = /\b[A-Z]{2,}[-_ ]?\d+(?:\.\d+)*\b/g;

/**
 * Every requirement identifier the inputs actually contain. A suggestion may
 * only point at one of these; anything else is a reference the reader could
 * not look up.
 */
export function knownRequirementIds(input: {
  contentMd: string;
  complianceRows: readonly Pick<ComplianceMatrixRow, "controlId">[];
  coverage: Pick<CoveragePlan, "missingEvidenceTasks"> | null;
}): Set<string> {
  const ids = new Set<string>();
  const texts = [input.contentMd, ...(input.coverage?.missingEvidenceTasks ?? [])];
  for (const text of texts) {
    for (const match of text.matchAll(REQUIREMENT_ID_RE)) ids.add(normalizeId(match[0]));
  }
  for (const row of input.complianceRows) ids.add(normalizeId(row.controlId));
  return ids;
}

function normalizeId(id: string): string {
  return id.trim().toUpperCase().replace(/\s+/g, "");
}

export function parseAiScore(content: string): ParsedAnswer<Omit<ProposalScore, "provenance">> {
  const parsed = parseJsonWithSchema(content, scoreAnswerSchema);
  if (!parsed.ok) return parsed;
  const s = parsed.data;
  return {
    ok: true,
    data: {
      overall: clampScore(s.overall),
      coverage: clampScore(s.coverage),
      compliance: clampScore(s.compliance),
      clarity: clampScore(s.clarity),
      competitiveness: clampScore(s.competitiveness),
      breakdown: (s.breakdown ?? []).map((b) => ({
        metric: b.metric,
        metricAr: b.metricAr ?? "",
        score: clampScore(b.score),
        maxScore: 100,
        notesEn: b.notesEn ?? "",
        notesAr: b.notesAr ?? "",
      })),
    },
  };
}

/**
 * Suggestions with at least one language of advice and, when they cite a
 * requirement, a requirement the inputs contain. A coined identifier drops
 * the suggestion: advice that points at nothing is not actionable.
 */
export function parseAiSuggestions(
  content: string,
  knownIds: ReadonlySet<string>
): ParsedAnswer<Omit<ImprovementSuggestion, "provenance">[]> {
  const parsed = parseJsonWithSchema(content, suggestionsAnswerSchema);
  if (!parsed.ok) return parsed;
  const suggestions: Omit<ImprovementSuggestion, "provenance">[] = [];
  for (const s of parsed.data.suggestions) {
    const suggestionEn = s.suggestionEn?.trim() ?? "";
    const suggestionAr = s.suggestionAr?.trim() ?? "";
    if (!suggestionEn && !suggestionAr) continue;
    const requirementId = s.requirementId?.trim() || null;
    if (requirementId && !knownIds.has(normalizeId(requirementId))) continue;
    suggestions.push({
      sectionId: s.sectionId.trim(),
      requirementId,
      suggestionEn,
      suggestionAr,
      priority: s.priority,
    });
  }
  return { ok: true, data: suggestions };
}

export function parseAiSectionOptimization(
  content: string,
  sectionId: string,
  original: string
): ParsedAnswer<Omit<SectionOptimization, "provenance">> {
  const parsed = parseJsonWithSchema(content, sectionAnswerSchema);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    data: {
      sectionId,
      originalContent: original,
      optimizedContent: parsed.data.optimizedContent,
      improvementsEn: parsed.data.improvementsEn ?? [],
      improvementsAr: parsed.data.improvementsAr ?? [],
    },
  };
}

export function parseAiWinProbability(
  content: string
): ParsedAnswer<Omit<WinProbability, "provenance">> {
  const parsed = parseJsonWithSchema(content, winAnswerSchema);
  if (!parsed.ok) return parsed;
  const w = parsed.data;
  return {
    ok: true,
    data: {
      probability: clampScore(w.probability),
      confidence:
        typeof w.confidence === "number" && Number.isFinite(w.confidence)
          ? Math.max(0, Math.min(1, w.confidence))
          : 0.7,
      factors: (w.factors ?? []).map((f) => ({
        factorEn: f.factorEn,
        factorAr: f.factorAr ?? "",
        impact: f.impact,
        weight: typeof f.weight === "number" && Number.isFinite(f.weight) ? f.weight : 0,
      })),
    },
  };
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
      {
        role: "system",
        content: buildScoringSystemPrompt(input.locale ?? "ar", input.contentMd),
      },
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

    if (result.fallback || !result.content) {
      guardOrThrow(result, "proposal-optimizer:scoreProposal");
      return deterministic;
    }

    const parsed = parseAiScore(result.content);
    if (!parsed.ok) {
      guardOrThrow(schemaRejection(result, parsed.issues), "proposal-optimizer:scoreProposal");
      return deterministic;
    }

    return {
      ...parsed.data,
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
    if (err instanceof ProviderUnavailableError) throw err;
    console.warn("[proposal-optimizer] LLM scoring failed, using deterministic", err);
    guardCaughtOrThrow(err, "proposal-optimizer:scoreProposal");
    return deterministic;
  }
}

function clampScore(v: number): number {
  const n = Number.isFinite(v) ? v : 0;
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
      {
        role: "system",
        content: buildSuggestionSystemPrompt(input.locale ?? "ar", input.contentMd),
      },
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

    if (result.fallback || !result.content) {
      guardOrThrow(result, "proposal-optimizer:generateImprovementSuggestions");
      return deterministic;
    }

    const parsed = parseAiSuggestions(result.content, knownRequirementIds(input));
    if (!parsed.ok) {
      guardOrThrow(
        schemaRejection(result, parsed.issues),
        "proposal-optimizer:generateImprovementSuggestions"
      );
      return deterministic;
    }
    if (parsed.data.length === 0) return deterministic;

    const provenance: AiProvenance = {
      source: "AI_GENERATED",
      provider: result.provider,
      model: result.model,
      engine: result.engine ?? "DRAFTING",
      generatedAt: new Date().toISOString(),
      confidence: result.confidence,
      fallback: false,
    };

    return parsed.data.map((s) => ({ ...s, provenance }));
  } catch (err) {
    if (err instanceof ProviderUnavailableError) throw err;
    console.warn("[proposal-optimizer] LLM suggestions failed, using deterministic", err);
    guardCaughtOrThrow(err, "proposal-optimizer:generateImprovementSuggestions");
    return deterministic;
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
      {
        role: "system",
        content: buildSectionOptimizationSystemPrompt(input.locale ?? "ar", sectionContent),
      },
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

    if (result.fallback || !result.content) {
      guardOrThrow(result, "proposal-optimizer:optimizeSection");
      return deterministic;
    }

    const parsed = parseAiSectionOptimization(result.content, sectionId, sectionContent);
    if (!parsed.ok) {
      guardOrThrow(schemaRejection(result, parsed.issues), "proposal-optimizer:optimizeSection");
      return deterministic;
    }

    // Guardrail: a rewrite that prices is rejected the same way as one that
    // failed its schema — refused when strict, deterministic when permissive.
    if (detectPricingSuggestion(parsed.data.optimizedContent)) {
      guardOrThrow(
        schemaRejection(result, ["pricing_guardrail"]),
        "proposal-optimizer:optimizeSection"
      );
      return deterministic;
    }

    return {
      ...parsed.data,
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
    if (err instanceof ProviderUnavailableError) throw err;
    console.warn("[proposal-optimizer] LLM section optimization failed, using deterministic", err);
    guardCaughtOrThrow(err, "proposal-optimizer:optimizeSection");
    return deterministic;
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
      { role: "system", content: buildWinProbabilitySystemPrompt(input.locale ?? "ar") },
      {
        role: "user",
        content: `Estimate technical readiness:\n${contextJson}\n\nReturn JSON only.`,
      },
    ];

    const result = await generateCompletion(messages, {
      engine: "DRAFTING",
      temperature: 0.15,
      maxTokens: 2048,
    });

    if (result.fallback || !result.content) {
      guardOrThrow(result, "proposal-optimizer:estimateWinProbability");
      return deterministic;
    }

    const parsed = parseAiWinProbability(result.content);
    if (!parsed.ok) {
      guardOrThrow(
        schemaRejection(result, parsed.issues),
        "proposal-optimizer:estimateWinProbability"
      );
      return deterministic;
    }

    return {
      ...parsed.data,
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
    if (err instanceof ProviderUnavailableError) throw err;
    console.warn("[proposal-optimizer] LLM win probability failed, using deterministic", err);
    guardCaughtOrThrow(err, "proposal-optimizer:estimateWinProbability");
    return deterministic;
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
