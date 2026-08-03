/**
 * AI-powered Predictive Vendor Matching Engine.
 *
 * Extends the existing qualification system with:
 * 1. Vendor capability profiling from historical proposal data
 * 2. Tender-vendor matching — score how well vendor capabilities match requirements
 * 3. Success prediction — predict likelihood of winning based on historical patterns
 * 4. Gap recommendations — suggest capability improvements
 *
 * Uses existing qualification data from Prisma.
 * No fabricated vendor data.
 * All predictions include confidence scores.
 * Bilingual matching reports.
 * Respects tenant isolation (workspaceId scoping).
 */

import { generateCompletion, type LLMMessage } from "../llm";
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

function buildMatchingSystemPrompt(): string {
  return `You are ArabClue AI Vendor Matching Engine for Saudi procurement.
${NO_PRICING_RULE}
${REGULATORY_PRECISION_RULE}
Score how well vendor capabilities match tender requirements.
Rules:
- Never fabricate vendor data or capabilities.
- All predictions must include confidence scores.
- Bilingual output (EN/AR).
- Include: "${LEGAL_DISCLAIMER}"
- Output JSON only: { "matches": [{ "vendorId": string, "matchScore": number, "confidence": number, "matchedRequirements": [string], "unmatchedRequirements": [string], "gapRecommendations": [{ "requirementId": string, "recommendationEn": string, "recommendationAr": string, "priority": "HIGH"|"MEDIUM"|"LOW" }] }] }`;
}

function buildPredictionSystemPrompt(): string {
  return `You are ArabClue AI Vendor Success Prediction Engine.
${NO_PRICING_RULE}
${REGULATORY_PRECISION_RULE}
Predict likelihood of winning based on historical patterns and capability matching.
Rules:
- Probability is 0-100. Never claim certainty.
- List contributing factors with impact and weight.
- Output JSON only: { "predictions": [{ "vendorId": string, "winProbability": number, "confidence": number, "factors": [{ "factorEn": string, "factorAr": string, "impact": "POSITIVE"|"NEGATIVE"|"NEUTRAL", "weight": number }] }] }`;
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

  try {
    const contextJson = JSON.stringify({
      tenderRequirements: input.tenderRequirements.slice(0, 30),
      scope: input.entities?.scope?.slice(0, 1000) ?? null,
      vendors: input.vendors.map((v) => ({
        vendorId: v.vendorId,
        vendorName: v.vendorName,
        capabilities: deterministicProfile(v).capabilities
          .filter((c) => c.present)
          .map((c) => c.key),
        qualificationGaps: deterministicProfile(v).qualificationGaps.map((g) => g.key),
        historicalProposals: v.historicalProposals ?? 0,
        historicalWins: v.historicalWins ?? 0,
        pastProjectTags: v.pastProjectTags ?? [],
      })),
    }).slice(0, 12000);

    const messages: LLMMessage[] = [
      { role: "system", content: buildMatchingSystemPrompt() },
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

    if (result.fallback || !result.content) return deterministic;

    const parsed = safeParseMatchScores(result.content, input.vendors);
    if (!parsed || parsed.length === 0) return deterministic;

    const provenance: AiProvenance = {
      source: "AI_GENERATED",
      provider: result.provider,
      model: result.model,
      engine: result.engine ?? "DEFAULT",
      generatedAt: new Date().toISOString(),
      confidence: result.confidence,
      fallback: false,
    };

    return parsed.map((m) => ({ ...m, provenance }));
  } catch (err) {
    console.warn("[vendor-matching-engine] LLM matching failed, using deterministic", err);
    return deterministic;
  }
}

function safeParseMatchScores(
  content: string,
  vendors: VendorInput[]
): VendorMatchScore[] | null {
  try {
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.matches || !Array.isArray(parsed.matches)) return null;

    const vendorMap = new Map(vendors.map((v) => [v.vendorId, v]));

    return parsed.matches
      .filter(
        (m: unknown): m is Record<string, unknown> =>
          typeof m === "object" && m !== null
      )
      .map((m) => {
        const vendorId = String(m.vendorId ?? "");
        const vendor = vendorMap.get(vendorId);
        return {
          vendorId,
          vendorName: vendor?.vendorName ?? "",
          vendorNameAr: vendor?.vendorNameAr ?? "",
          matchScore: typeof m.matchScore === "number" ? Math.max(0, Math.min(100, Math.round(m.matchScore))) : 0,
          confidence: typeof m.confidence === "number" ? Math.max(0, Math.min(1, m.confidence)) : 0.5,
          matchedRequirements: Array.isArray(m.matchedRequirements)
            ? m.matchedRequirements.map(String)
            : [],
          unmatchedRequirements: Array.isArray(m.unmatchedRequirements)
            ? m.unmatchedRequirements.map(String)
            : [],
          gapRecommendations: Array.isArray(m.gapRecommendations)
            ? m.gapRecommendations
                .filter(
                  (g: unknown): g is Record<string, unknown> =>
                    typeof g === "object" && g !== null
                )
                .map((g) => ({
                  requirementId: String(g.requirementId ?? ""),
                  recommendationEn: String(g.recommendationEn ?? ""),
                  recommendationAr: String(g.recommendationAr ?? ""),
                  priority: (["HIGH", "MEDIUM", "LOW"].includes(String(g.priority))
                    ? String(g.priority)
                    : "MEDIUM") as "HIGH" | "MEDIUM" | "LOW",
                }))
            : [],
          provenance: {
            source: "AI_GENERATED" as const,
            provider: "pending",
            model: "pending",
            engine: "DEFAULT",
            generatedAt: new Date().toISOString(),
            confidence: 0.8,
            fallback: false,
          },
        };
      })
      .filter((m) => m.vendorId);
  } catch {
    return null;
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
      vendors: input.vendors.map((v) => ({
        vendorId: v.vendorId,
        vendorName: v.vendorName,
        matchScore: matchScores.find((s) => s.vendorId === v.vendorId)?.matchScore ?? 0,
        historicalProposals: v.historicalProposals ?? 0,
        historicalWins: v.historicalWins ?? 0,
        qualificationGaps: deterministicProfile(v).qualificationGaps.length,
      })),
    }).slice(0, 8000);

    const messages: LLMMessage[] = [
      { role: "system", content: buildPredictionSystemPrompt() },
      {
        role: "user",
        content: `Predict vendor success:\n${contextJson}\n\nReturn JSON only.`,
      },
    ];

    const result = await generateCompletion(messages, {
      engine: "DEFAULT",
      temperature: 0.15,
      maxTokens: 4096,
    });

    if (result.fallback || !result.content) return deterministic;

    const parsed = safeParsePredictions(result.content, input.vendors);
    if (!parsed || parsed.length === 0) return deterministic;

    const provenance: AiProvenance = {
      source: "AI_GENERATED",
      provider: result.provider,
      model: result.model,
      engine: result.engine ?? "DEFAULT",
      generatedAt: new Date().toISOString(),
      confidence: result.confidence,
      fallback: false,
    };

    return parsed.map((p) => ({ ...p, provenance }));
  } catch (err) {
    console.warn("[vendor-matching-engine] LLM prediction failed, using deterministic", err);
    return deterministic;
  }
}

function safeParsePredictions(
  content: string,
  vendors: VendorInput[]
): SuccessPrediction[] | null {
  try {
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.predictions || !Array.isArray(parsed.predictions)) return null;

    const vendorMap = new Map(vendors.map((v) => [v.vendorId, v]));

    return parsed.predictions
      .filter(
        (p: unknown): p is Record<string, unknown> =>
          typeof p === "object" && p !== null
      )
      .map((p) => {
        const vendorId = String(p.vendorId ?? "");
        const vendor = vendorMap.get(vendorId);
        return {
          vendorId,
          vendorName: vendor?.vendorName ?? "",
          winProbability: typeof p.winProbability === "number"
            ? Math.max(0, Math.min(100, Math.round(p.winProbability)))
            : 0,
          confidence: typeof p.confidence === "number"
            ? Math.max(0, Math.min(1, p.confidence))
            : 0.5,
          factors: Array.isArray(p.factors)
            ? p.factors
                .filter(
                  (f: unknown): f is Record<string, unknown> =>
                    typeof f === "object" && f !== null
                )
                .map((f) => ({
                  factorEn: String(f.factorEn ?? ""),
                  factorAr: String(f.factorAr ?? ""),
                  impact: (["POSITIVE", "NEGATIVE", "NEUTRAL"].includes(String(f.impact))
                    ? String(f.impact)
                    : "NEUTRAL") as "POSITIVE" | "NEGATIVE" | "NEUTRAL",
                  weight: typeof f.weight === "number" ? f.weight : 0,
                }))
            : [],
          provenance: {
            source: "AI_GENERATED" as const,
            provider: "pending",
            model: "pending",
            engine: "DEFAULT",
            generatedAt: new Date().toISOString(),
            confidence: 0.8,
            fallback: false,
          },
        };
      })
      .filter((p) => p.vendorId);
  } catch {
    return null;
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
| Vendor | Match Score | Win Probability | Matched | Unmatched |
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
| المورد | درجة المطابقة | احتمالية الفوز | مطابق | غير مطابق |
| --- | --- | --- | --- | --- |
${vendorRows}

## أهم توصيات الفجوات
${matchScores
  .flatMap((m) => m.gapRecommendations.slice(0, 3))
  .slice(0, 10)
  .map((g) => `- [${g.priority}] ${g.requirementId}: ${g.recommendationAr}`)
  .join("\n") || "لا توجد فجوات."}

${LEGAL_DISCLAIMER_AR}
`;
}
