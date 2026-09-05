/**
 * AI-powered Predictive Vendor Matching Engine.
 *
 * Extends the existing qualification system with:
 * 1. Vendor capability profiling from historical proposal data
 * 2. Tender-vendor matching — score how well vendor capabilities match requirements
 * 3. Readiness estimate — a heuristic on the vendor's own inputs (match score,
 *    its proposal history, its qualification gaps); never an award forecast,
 *    since no award or competitor data exists here
 * 4. Gap recommendations — suggest capability improvements
 *
 * Uses existing qualification data from Prisma.
 * No fabricated vendor data: the model may only score vendors and requirement
 * ids it was given, and an answer that names anything else is dropped.
 * All estimates include confidence scores.
 * Bilingual matching reports.
 * Respects tenant isolation (workspaceId scoping).
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
import { LEGAL_DISCLAIMER, LEGAL_DISCLAIMER_AR } from "../procurement-rules";
import {
  QUALIFICATION_DOSSIER,
  assessQualificationDossier,
  type QualificationCertInput,
  type QualificationWorkspaceInput,
} from "../qualification";
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

export type VendorCapabilityProfile = {
  vendorId: string;
  vendorName: string;
  vendorNameAr: string;
  capabilities: {
    key: string;
    labelEn: string;
    labelAr: string;
    present: boolean;
    strength: "STRONG" | "MODERATE" | "WEAK" | "ABSENT";
  }[];
  qualificationGaps: {
    key: string;
    labelEn: string;
    labelAr: string;
    reason: string;
  }[];
  overallReadiness: number;
  provenance: AiProvenance;
};

export type VendorMatchScore = {
  vendorId: string;
  vendorName: string;
  vendorNameAr: string;
  matchScore: number;
  confidence: number;
  matchedRequirements: string[];
  unmatchedRequirements: string[];
  gapRecommendations: {
    requirementId: string;
    recommendationEn: string;
    recommendationAr: string;
    priority: "HIGH" | "MEDIUM" | "LOW";
  }[];
  provenance: AiProvenance;
};

export type SuccessPrediction = {
  vendorId: string;
  vendorName: string;
  winProbability: number;
  confidence: number;
  factors: {
    factorEn: string;
    factorAr: string;
    impact: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
    weight: number;
  }[];
  provenance: AiProvenance;
};

export type VendorMatchingResult = {
  profiles: VendorCapabilityProfile[];
  matchScores: VendorMatchScore[];
  successPredictions: SuccessPrediction[];
  reportEn: string;
  reportAr: string;
  provenance: AiProvenance;
};

export type VendorMatchingInput = {
  tenderRequirements: string[];
  entities: IngestionEntities | null;
  vendors: VendorInput[];
  locale?: Locale;
  workspaceId: string;
};

export type VendorInput = {
  vendorId: string;
  vendorName: string;
  vendorNameAr: string;
  workspace: QualificationWorkspaceInput;
  certificates: QualificationCertInput[];
  historicalProposals?: number;
  historicalWins?: number;
  pastProjectTags?: string[];
};

// ---------------------------------------------------------------------------
// System prompt builders
// ---------------------------------------------------------------------------

/** Glossary budget inside these prompts; the rules and the schema come first. */
const PROMPT_GLOSSARY_CHARS = 1_200;

/**
 * Exported so the size cap can be asserted: each system prompt stays under
 * 6,000 characters whatever context is passed, because the glossary is
 * filtered to the terms the context uses and capped besides.
 */
export function buildMatchingSystemPrompt(locale: Locale = "ar", contextText = ""): string {
  const head = `You are ArabClue AI Vendor Matching Engine for Saudi procurement.
${NO_PRICING_RULE}
${REGULATORY_PRECISION_RULE}
Score how well each vendor's evidenced capabilities match the tender requirements.
Rules:
- Score ONLY the vendors listed under "vendors" in the request, vendorId copied verbatim; never add, rename, or merge a vendor. A vendor's capabilities are exactly its listed capabilities, qualification gaps, history and past project tags — never assume a certificate, staff, or project the list does not show.
- Requirements are identified by the "id" given under "tenderRequirements" (REQ-n); matchedRequirements, unmatchedRequirements and gapRecommendations.requirementId use those ids and nothing else, and every requirement appears in exactly one of the two lists.
- A requirement is matched only when a listed capability or tag evidences it; when the evidence is indirect, leave it unmatched and say in the recommendation what evidence would close it.
- "confidence" is 0 to 1 and falls as the vendor's listed evidence gets thinner. recommendationEn and recommendationAr carry the same advice; none of it is about price.
- Include: "${LEGAL_DISCLAIMER}"
- Output JSON only: { "matches": [{ "vendorId": string, "matchScore": number, "confidence": number, "matchedRequirements": [string], "unmatchedRequirements": [string], "gapRecommendations": [{ "requirementId": string, "recommendationEn": string, "recommendationAr": string, "priority": "HIGH"|"MEDIUM"|"LOW" }] }] }
${styleGuideFor(locale)}`;
  return appendGlossaryWithinBudget(head, locale, contextText, {
    maxChars: PROMPT_GLOSSARY_CHARS,
  });
}

export function buildPredictionSystemPrompt(locale: Locale = "ar"): string {
  return `You are ArabClue AI Vendor Readiness Estimator.
${NO_PRICING_RULE}
${REGULATORY_PRECISION_RULE}
Estimate, for each listed vendor, how ready it is to qualify and score well on this tender's technical evaluation, using ONLY the request: its match score, its own proposal history, and its qualification gaps. You have no award data, no competitor data, and no pricing: "winProbability" is a readiness heuristic on that vendor's own inputs, never a forecast of award.
Rules:
- Estimate ONLY the vendors listed under "vendors", vendorId copied verbatim.
- winProbability is 0-100 and means readiness; never claim certainty. A vendor with no history is estimated from match score and gaps alone, and the factors say so.
- Each factor names the input that drives it (match score, unmatched requirements, qualification gaps, history) with its impact and weight; factorEn and factorAr state the same factor.
- Output JSON only: { "predictions": [{ "vendorId": string, "winProbability": number, "confidence": number, "factors": [{ "factorEn": string, "factorAr": string, "impact": "POSITIVE"|"NEGATIVE"|"NEUTRAL", "weight": number }] }] }
${styleGuideFor(locale)}`;
}

// ---------------------------------------------------------------------------
// Answer schemas — the model's JSON is admitted only in this shape
// ---------------------------------------------------------------------------

const matchAnswerSchema = z.object({
  vendorId: z.string(),
  matchScore: z.number(),
  confidence: z.number().nullable().optional(),
  matchedRequirements: z.array(z.string()).nullable().optional(),
  unmatchedRequirements: z.array(z.string()).nullable().optional(),
  gapRecommendations: z
    .array(
      z.object({
        requirementId: z.string(),
        recommendationEn: z.string(),
        recommendationAr: z.string(),
        priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
      })
    )
    .nullable()
    .optional(),
});

const matchesAnswerSchema = z.object({ matches: z.array(matchAnswerSchema) });

const predictionAnswerSchema = z.object({
  vendorId: z.string(),
  winProbability: z.number(),
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

const predictionsAnswerSchema = z.object({ predictions: z.array(predictionAnswerSchema) });

type ParsedAnswer<T> = { ok: true; data: T[] } | { ok: false; issues: string[] };

/** `REQ-n` for the n-th tender requirement — the ids the deterministic matcher uses too. */
export function requirementIdsFor(requirements: readonly string[]): string[] {
  return requirements.map((_, i) => `REQ-${i + 1}`);
}

function clamp01(v: number | null | undefined, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
}

function clampPercent(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;
}

/**
 * The model's matches, admitted only for vendors the request listed and
 * requirement ids the request defined. A match for a vendor that was never
 * in the input is a fabricated vendor and is dropped; a requirement id the
 * tender does not have is dropped from the lists and its recommendation with
 * it. Names come from the input, never from the answer. Provenance is the
 * caller's.
 */
export function parseAiMatchScores(
  content: string,
  vendors: readonly VendorInput[],
  requirementIds: readonly string[]
): ParsedAnswer<Omit<VendorMatchScore, "provenance">> {
  const parsed = parseJsonWithSchema(content, matchesAnswerSchema);
  if (!parsed.ok) return parsed;
  const vendorMap = new Map(vendors.map((v) => [v.vendorId, v]));
  const known = new Set(requirementIds);
  const seen = new Set<string>();
  const matches: Omit<VendorMatchScore, "provenance">[] = [];
  for (const m of parsed.data.matches) {
    const vendorId = m.vendorId.trim();
    const vendor = vendorMap.get(vendorId);
    if (!vendor || seen.has(vendorId)) continue;
    seen.add(vendorId);
    const matched = [...new Set((m.matchedRequirements ?? []).map((r) => r.trim()))].filter((r) =>
      known.has(r)
    );
    const matchedSet = new Set(matched);
    const unmatched = [
      ...new Set((m.unmatchedRequirements ?? []).map((r) => r.trim())),
    ].filter((r) => known.has(r) && !matchedSet.has(r));
    matches.push({
      vendorId,
      vendorName: vendor.vendorName,
      vendorNameAr: vendor.vendorNameAr,
      matchScore: clampPercent(m.matchScore),
      confidence: clamp01(m.confidence, 0.5),
      matchedRequirements: matched,
      unmatchedRequirements: unmatched,
      gapRecommendations: (m.gapRecommendations ?? [])
        .filter((g) => known.has(g.requirementId.trim()))
        .map((g) => ({
          requirementId: g.requirementId.trim(),
          recommendationEn: g.recommendationEn,
          recommendationAr: g.recommendationAr,
          priority: g.priority,
        })),
    });
  }
  return { ok: true, data: matches };
}

/** The model's estimates, admitted only for vendors the request listed. */
export function parseAiPredictions(
  content: string,
  vendors: readonly VendorInput[]
): ParsedAnswer<Omit<SuccessPrediction, "provenance">> {
  const parsed = parseJsonWithSchema(content, predictionsAnswerSchema);
  if (!parsed.ok) return parsed;
  const vendorMap = new Map(vendors.map((v) => [v.vendorId, v]));
  const seen = new Set<string>();
  const predictions: Omit<SuccessPrediction, "provenance">[] = [];
  for (const p of parsed.data.predictions) {
    const vendorId = p.vendorId.trim();
    const vendor = vendorMap.get(vendorId);
    if (!vendor || seen.has(vendorId)) continue;
    seen.add(vendorId);
    predictions.push({
      vendorId,
      vendorName: vendor.vendorName,
      winProbability: clampPercent(p.winProbability),
      confidence: clamp01(p.confidence, 0.5),
      factors: (p.factors ?? []).map((f) => ({
        factorEn: f.factorEn,
        factorAr: f.factorAr ?? "",
        impact: f.impact,
        weight: typeof f.weight === "number" && Number.isFinite(f.weight) ? f.weight : 0,
      })),
    });
  }
  return { ok: true, data: predictions };
}

// ---------------------------------------------------------------------------
// Deterministic fallbacks
// ---------------------------------------------------------------------------

function deterministicProfile(
  vendor: VendorInput
): VendorCapabilityProfile {
  const provenance: AiProvenance = {
    source: "DETERMINISTIC_FALLBACK",
    provider: "deterministic",
    model: "qualification-dossier-assessor",
    engine: "DEFAULT",
    generatedAt: new Date().toISOString(),
    confidence: 0.7,
    fallback: true,
  };

  const assessment = assessQualificationDossier({
    workspace: vendor.workspace,
    certificates: vendor.certificates,
  });

  const capabilities = QUALIFICATION_DOSSIER.map((doc) => {
    const present = assessment.presentKeys.includes(doc.key);
    const gap = assessment.gaps.find((g) => g.key === doc.key);
    const strength: VendorCapabilityProfile["capabilities"][number]["strength"] =
      gap ? "ABSENT" : doc.requiredForStrongBid ? "STRONG" : "MODERATE";
    return {
      key: doc.key,
      labelEn: doc.labelEn,
      labelAr: doc.labelAr,
      present,
      strength,
    };
  });

  const gaps = assessment.gaps.map((g) => ({
    key: g.key,
    labelEn: g.labelEn,
    labelAr: g.labelAr,
    reason: g.reason,
  }));

  const presentCount = capabilities.filter((c) => c.present).length;
  const overallReadiness = Math.round((presentCount / capabilities.length) * 100);

  return {
    vendorId: vendor.vendorId,
    vendorName: vendor.vendorName,
    vendorNameAr: vendor.vendorNameAr,
    capabilities,
    qualificationGaps: gaps,
    overallReadiness,
    provenance,
  };
}

function deterministicMatchScore(
  vendor: VendorInput,
  input: VendorMatchingInput
): VendorMatchScore {
  const provenance: AiProvenance = {
    source: "DETERMINISTIC_FALLBACK",
    provider: "deterministic",
    model: "requirement-keyword-matcher",
    engine: "DEFAULT",
    generatedAt: new Date().toISOString(),
    confidence: 0.65,
    fallback: true,
  };

  const profile = deterministicProfile(vendor);
  const requirements = input.tenderRequirements;

  // Simple keyword matching: check if vendor capabilities relate to requirement text
  const matched: string[] = [];
  const unmatched: string[] = [];

  for (let i = 0; i < requirements.length; i++) {
    const req = requirements[i].toLowerCase();
    const hasMatch = profile.capabilities.some((c) => {
      if (!c.present) return false;
      const label = c.labelEn.toLowerCase();
      return req.includes(label) || label.includes(req.slice(0, 20));
    });

    // Also check past project tags
    const tagMatch = vendor.pastProjectTags?.some((tag) =>
      req.includes(tag.toLowerCase())
    );

    if (hasMatch || tagMatch) {
      matched.push(`REQ-${i + 1}`);
    } else {
      unmatched.push(`REQ-${i + 1}`);
    }
  }

  const matchScore = requirements.length
    ? Math.round((matched.length / requirements.length) * 100)
    : 0;

  const gapRecommendations = unmatched.slice(0, 10).map((reqId) => ({
    requirementId: reqId,
    recommendationEn: `Acquire or evidence capabilities matching requirement ${reqId}`,
    recommendationAr: `اكتسب أو أثبت القدرات المطابقة للمتطلب ${reqId}`,
    priority: "HIGH" as const,
  }));

  return {
    vendorId: vendor.vendorId,
    vendorName: vendor.vendorName,
    vendorNameAr: vendor.vendorNameAr,
    matchScore,
    confidence: provenance.confidence,
    matchedRequirements: matched,
    unmatchedRequirements: unmatched,
    gapRecommendations,
    provenance,
  };
}

function deterministicSuccessPrediction(
  vendor: VendorInput,
  matchScore: VendorMatchScore
): SuccessPrediction {
  const provenance: AiProvenance = {
    source: "DETERMINISTIC_FALLBACK",
    provider: "deterministic",
    model: "win-probability-estimator",
    engine: "DEFAULT",
    generatedAt: new Date().toISOString(),
    confidence: 0.6,
    fallback: true,
  };

  const profile = deterministicProfile(vendor);
  const historicalRate =
    vendor.historicalProposals && vendor.historicalProposals > 0
      ? ((vendor.historicalWins ?? 0) / vendor.historicalProposals) * 100
      : null;

  // Base probability from match score and readiness
  let probability = matchScore.matchScore * 0.5 + profile.overallReadiness * 0.3;
  if (historicalRate != null) {
    probability = probability * 0.7 + historicalRate * 0.3;
  }
  probability = Math.max(0, Math.min(100, Math.round(probability)));

  const factors: SuccessPrediction["factors"] = [
    {
      factorEn: `Capability match: ${matchScore.matchScore}%`,
      factorAr: `تطابق القدرات: ${matchScore.matchScore}%`,
      impact: matchScore.matchScore >= 60 ? "POSITIVE" : "NEGATIVE",
      weight: 0.3,
    },
    {
      factorEn: `Qualification readiness: ${profile.overallReadiness}%`,
      factorAr: `جاهزية التأهيل: ${profile.overallReadiness}%`,
      impact: profile.overallReadiness >= 70 ? "POSITIVE" : "NEGATIVE",
      weight: 0.25,
    },
    {
      factorEn: `Unmatched requirements: ${matchScore.unmatchedRequirements.length}`,
      factorAr: `المتطلبات غير المطابقة: ${matchScore.unmatchedRequirements.length}`,
      impact: matchScore.unmatchedRequirements.length > 3 ? "NEGATIVE" : "NEUTRAL",
      weight: 0.2,
    },
  ];

  if (historicalRate != null) {
    factors.push({
      factorEn: `Historical win rate: ${Math.round(historicalRate)}%`,
      factorAr: `معدل الفوز التاريخي: ${Math.round(historicalRate)}%`,
      impact: historicalRate >= 50 ? "POSITIVE" : "NEGATIVE",
      weight: 0.25,
    });
  }

  return {
    vendorId: vendor.vendorId,
    vendorName: vendor.vendorName,
    winProbability: probability,
    confidence: provenance.confidence,
    factors,
    provenance,
  };
}

// ---------------------------------------------------------------------------
// AI-powered vendor matching
// ---------------------------------------------------------------------------

export async function matchVendors(
  input: VendorMatchingInput
): Promise<VendorMatchScore[]> {
  const deterministic = input.vendors.map((v) =>
    deterministicMatchScore(v, input)
  );
  const locale = input.locale ?? "ar";
  const requirements = input.tenderRequirements.slice(0, 30);
  const requirementIds = requirementIdsFor(requirements);

  try {
    const contextJson = JSON.stringify({
      // Requirements carry the ids the answer must use, so the model cannot
      // coin its own and the report can join them to the deterministic rows.
      tenderRequirements: requirements.map((text, i) => ({
        id: requirementIds[i],
        text: text.slice(0, 400),
      })),
      scope: input.entities?.scope?.slice(0, 1000) ?? null,
      vendors: input.vendors.map((v) => {
        const profile = deterministicProfile(v);
        return {
          vendorId: v.vendorId,
          vendorName: v.vendorName,
          capabilities: profile.capabilities.filter((c) => c.present).map((c) => c.key),
          qualificationGaps: profile.qualificationGaps.map((g) => g.key),
          historicalProposals: v.historicalProposals ?? 0,
          historicalWins: v.historicalWins ?? 0,
          pastProjectTags: v.pastProjectTags ?? [],
        };
      }),
    }).slice(0, 12000);

    const messages: LLMMessage[] = [
      { role: "system", content: buildMatchingSystemPrompt(locale, contextJson) },
      {
        role: "user",
        content: `Match vendors to tender requirements:\n${contextJson}\n\nReturn JSON only.`,
      },
    ];

    const result = await generateCompletion(messages, {
      engine: "DEFAULT",
      temperature: 0.15,
      maxTokens: 8192,
    });

    if (result.fallback || !result.content) {
      guardOrThrow(result, "vendor-matching-engine:matchVendors");
      return deterministic;
    }

    const parsed = parseAiMatchScores(result.content, input.vendors, requirementIds);
    if (!parsed.ok) {
      guardOrThrow(schemaRejection(result, parsed.issues), "vendor-matching-engine:matchVendors");
      return deterministic;
    }
    if (parsed.data.length === 0) return deterministic;

    const provenance: AiProvenance = {
      source: "AI_GENERATED",
      provider: result.provider,
      model: result.model,
      engine: result.engine ?? "DEFAULT",
      generatedAt: new Date().toISOString(),
      confidence: result.confidence,
      fallback: false,
    };

    // A vendor the model skipped keeps its deterministic row, labelled as
    // such, so the report still covers every vendor the caller asked about.
    const byVendor = new Map(parsed.data.map((m) => [m.vendorId, { ...m, provenance }]));
    return deterministic.map((d) => byVendor.get(d.vendorId) ?? d);
  } catch (err) {
    if (err instanceof ProviderUnavailableError) throw err;
    console.warn("[vendor-matching-engine] LLM matching failed, using deterministic", err);
    guardCaughtOrThrow(err, "vendor-matching-engine:matchVendors");
    return deterministic;
  }
}

// ---------------------------------------------------------------------------
// AI-powered success prediction
// ---------------------------------------------------------------------------

export async function predictVendorSuccess(
  input: VendorMatchingInput,
  matchScores: VendorMatchScore[]
): Promise<SuccessPrediction[]> {
  const deterministic = input.vendors.map((v) => {
    const score = matchScores.find((s) => s.vendorId === v.vendorId);
    return deterministicSuccessPrediction(v, score ?? deterministicMatchScore(v, input));
  });

  try {
    const contextJson = JSON.stringify({
      vendors: input.vendors.map((v) => {
        const score = matchScores.find((s) => s.vendorId === v.vendorId);
        return {
          vendorId: v.vendorId,
          vendorName: v.vendorName,
          matchScore: score?.matchScore ?? 0,
          unmatchedRequirements: score?.unmatchedRequirements ?? [],
          historicalProposals: v.historicalProposals ?? 0,
          historicalWins: v.historicalWins ?? 0,
          qualificationGaps: deterministicProfile(v).qualificationGaps.map((g) => g.key),
        };
      }),
    }).slice(0, 8000);

    const messages: LLMMessage[] = [
      { role: "system", content: buildPredictionSystemPrompt(input.locale ?? "ar") },
      {
        role: "user",
        content: `Estimate vendor readiness:\n${contextJson}\n\nReturn JSON only.`,
      },
    ];

    const result = await generateCompletion(messages, {
      engine: "DEFAULT",
      temperature: 0.15,
      maxTokens: 4096,
    });

    if (result.fallback || !result.content) {
      guardOrThrow(result, "vendor-matching-engine:predictVendorSuccess");
      return deterministic;
    }

    const parsed = parseAiPredictions(result.content, input.vendors);
    if (!parsed.ok) {
      guardOrThrow(
        schemaRejection(result, parsed.issues),
        "vendor-matching-engine:predictVendorSuccess"
      );
      return deterministic;
    }
    if (parsed.data.length === 0) return deterministic;

    const provenance: AiProvenance = {
      source: "AI_GENERATED",
      provider: result.provider,
      model: result.model,
      engine: result.engine ?? "DEFAULT",
      generatedAt: new Date().toISOString(),
      confidence: result.confidence,
      fallback: false,
    };

    // A vendor the model skipped keeps its deterministic estimate, labelled
    // as such, so every vendor the caller asked about has exactly one row.
    const byVendor = new Map(parsed.data.map((p) => [p.vendorId, { ...p, provenance }]));
    return deterministic.map((d) => byVendor.get(d.vendorId) ?? d);
  } catch (err) {
    if (err instanceof ProviderUnavailableError) throw err;
    console.warn("[vendor-matching-engine] LLM prediction failed, using deterministic", err);
    guardCaughtOrThrow(err, "vendor-matching-engine:predictVendorSuccess");
    return deterministic;
  }
}

// ---------------------------------------------------------------------------
// Full vendor matching orchestration
// ---------------------------------------------------------------------------

export async function matchVendorsWithPrediction(
  input: VendorMatchingInput
): Promise<VendorMatchingResult> {
  // Build profiles (deterministic — from qualification data)
  const profiles = input.vendors.map((v) => deterministicProfile(v));

  // Match scores (AI or deterministic)
  const matchScores = await matchVendors(input);

  // Success predictions (AI or deterministic)
  const successPredictions = await predictVendorSuccess(input, matchScores);

  const reportEn = buildMatchingReportEn(profiles, matchScores, successPredictions);
  const reportAr = buildMatchingReportAr(profiles, matchScores, successPredictions);

  const provenance: AiProvenance = matchScores[0]?.provenance ?? {
    source: "DETERMINISTIC_FALLBACK",
    provider: "deterministic",
    model: "qualification-dossier-assessor",
    engine: "DEFAULT",
    generatedAt: new Date().toISOString(),
    confidence: 0.7,
    fallback: true,
  };

  return {
    profiles,
    matchScores,
    successPredictions,
    reportEn,
    reportAr,
    provenance,
  };
}

function buildMatchingReportEn(
  profiles: VendorCapabilityProfile[],
  matchScores: VendorMatchScore[],
  predictions: SuccessPrediction[]
): string {
  const vendorRows = matchScores
    .map((m) => {
      const pred = predictions.find((p) => p.vendorId === m.vendorId);
      return `| ${m.vendorName} | ${m.matchScore}% | ${pred?.winProbability ?? "—"}% | ${m.matchedRequirements.length} | ${m.unmatchedRequirements.length} |`;
    })
    .join("\n");

  return `# Vendor Matching Report

## Match Summary
| Vendor | Match Score | Readiness (heuristic) | Matched | Unmatched |
| --- | --- | --- | --- | --- |
${vendorRows}

## Top Gap Recommendations
${matchScores
  .flatMap((m) => m.gapRecommendations.slice(0, 3))
  .slice(0, 10)
  .map((g) => `- [${g.priority}] ${g.requirementId}: ${g.recommendationEn}`)
  .join("\n") || "No gaps identified."}

${LEGAL_DISCLAIMER}
`;
}

function buildMatchingReportAr(
  profiles: VendorCapabilityProfile[],
  matchScores: VendorMatchScore[],
  predictions: SuccessPrediction[]
): string {
  const vendorRows = matchScores
    .map((m) => {
      const pred = predictions.find((p) => p.vendorId === m.vendorId);
      return `| ${m.vendorNameAr} | ${m.matchScore}% | ${pred?.winProbability ?? "—"}% | ${m.matchedRequirements.length} | ${m.unmatchedRequirements.length} |`;
    })
    .join("\n");

  return `# تقرير مطابقة الموردين

## ملخص المطابقة
| المورد | درجة المطابقة | الجاهزية (تقديرية) | مطابق | غير مطابق |
| --- | --- | --- | --- | --- |
${vendorRows}

## أهم توصيات الفجوات
${matchScores
  .flatMap((m) => m.gapRecommendations.slice(0, 3))
  .slice(0, 10)
  .map((g) => `- [${g.priority}] ${g.requirementId}: ${g.recommendationAr}`)
  .join("\n") || "لم تُحدَّد فجوات."}

${LEGAL_DISCLAIMER_AR}
`;
}
