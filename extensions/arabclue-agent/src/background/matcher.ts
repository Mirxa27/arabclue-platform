/** Multi-factor tender matching engine */

import type { EtimadTender, UserMatchCriteria, MatchResult, TenderCategory } from "../types";
import { LIMITS } from "../constants";
import { daysUntil } from "../utils";

/** Score a tender against user criteria — returns 0-100 score + reasons */
export function matchTender(tender: EtimadTender, criteria: UserMatchCriteria): MatchResult {
  const scores: { weight: number; score: number; reason: string }[] = [];

  // Category match (weight: 30)
  const catScore = scoreCategory(tender, criteria);
  if (catScore > 0) scores.push({ weight: 30, score: catScore, reason: `Category: ${tender.category}` });

  // Keyword match (weight: 35)
  const kwScore = scoreKeywords(tender, criteria);
  if (kwScore > 0) scores.push({ weight: 35, score: kwScore, reason: `Keywords matched` });

  // Value range match (weight: 15)
  const valScore = scoreValue(tender, criteria);
  if (valScore > 0) scores.push({ weight: 15, score: valScore, reason: `Value in range` });

  // Deadline proximity (weight: 10)
  const deadlineScore = scoreDeadline(tender, criteria);
  if (deadlineScore > 0) scores.push({ weight: 10, score: deadlineScore, reason: `Deadline ok` });

  // Entity match (weight: 10)
  const entityScore = scoreEntity(tender, criteria);
  if (entityScore > 0) scores.push({ weight: 10, score: entityScore, reason: `Entity: ${tender.entity}` });

  // Excluded entity penalty
  if (isExcludedEntity(tender, criteria)) {
    return { score: 0, reasons: ["Excluded entity"] };
  }

  // Local content filter
  if (criteria.requireLocalContent && !tender.localContentRequired) {
    return { score: 0, reasons: ["No local content requirement"] };
  }

  // Calculate weighted score
  const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) return { score: 0, reasons: ["No criteria matched"] };

  const weightedScore = Math.round(
    scores.reduce((sum, s) => sum + (s.score * s.weight), 0) / totalWeight
  );

  const reasons = scores.filter(s => s.score > 50).map(s => s.reason);

  return { score: Math.min(100, weightedScore), reasons };
}

/** Filter tenders by match score */
export function filterMatches(
  tenders: EtimadTender[],
  criteria: UserMatchCriteria,
  minScore = LIMITS.MATCH_MIN_SCORE
): EtimadTender[] {
  return tenders
    .map(tender => {
      const { score, reasons } = matchTender(tender, criteria);
      return { ...tender, matchScore: score, matchReasons: reasons };
    })
    .filter(t => t.matchScore >= minScore)
    .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
}

/** Score category match (0-100) */
export function scoreCategory(tender: EtimadTender, criteria: UserMatchCriteria): number {
  if (!criteria.categories.length) return 50; // No filter = neutral
  if (criteria.categories.includes(tender.category)) return 100;
  return 0;
}

/** Score keyword match (0-100) */
export function scoreKeywords(tender: EtimadTender, criteria: UserMatchCriteria): number {
  const allKeywords = [...criteria.keywords, ...criteria.keywordsAr];
  if (!allKeywords.length) return 50; // No keywords = neutral

  const searchText = [
    tender.title,
    tender.titleAr,
    tender.entity,
    tender.entityAr,
    tender.subcategory || "",
    ...(tender.qualifications || []),
  ].join(" ").toLowerCase();

  let hits = 0;
  for (const keyword of allKeywords) {
    if (searchText.includes(keyword.toLowerCase())) hits++;
  }

  if (hits === 0) return 0;
  return Math.min(100, Math.round((hits / allKeywords.length) * 100));
}

/** Score value range match (0-100) */
export function scoreValue(tender: EtimadTender, criteria: UserMatchCriteria): number {
  if (criteria.minValue == null && criteria.maxValue == null) return 50; // No filter
  if (tender.value == null) return 30; // Unknown value = partial match

  if (criteria.minValue != null && tender.value < criteria.minValue) return 0;
  if (criteria.maxValue != null && tender.value > criteria.maxValue) return 0;

  return 100;
}

/** Score deadline proximity (0-100) */
export function scoreDeadline(tender: EtimadTender, criteria: UserMatchCriteria): number {
  if (!tender.closingDate) return 30;

  const days = daysUntil(tender.closingDate);
  if (days < 0) return 0; // Already closed
  if (days <= 2) return 20; // Too close

  if (criteria.maxDaysUntilClose != null && days > criteria.maxDaysUntilClose) return 0;

  // Prefer tenders with 5-30 days remaining
  if (days >= 5 && days <= 30) return 100;
  if (days > 30) return 70;
  return 50;
}

/** Score entity match (0-100) */
function scoreEntity(tender: EtimadTender, criteria: UserMatchCriteria): number {
  if (!criteria.entities?.length) return 50; // No filter
  const entityText = (tender.entity + " " + tender.entityAr).toLowerCase();
  for (const entity of criteria.entities) {
    if (entityText.includes(entity.toLowerCase())) return 100;
  }
  return 0;
}

/** Check if tender entity is excluded */
function isExcludedEntity(tender: EtimadTender, criteria: UserMatchCriteria): boolean {
  if (!criteria.excludeEntities?.length) return false;
  const entityText = (tender.entity + " " + tender.entityAr).toLowerCase();
  for (const excluded of criteria.excludeEntities) {
    if (entityText.includes(excluded.toLowerCase())) return true;
  }
  return false;
}

/** Deduplicate tenders by reference number */
export function deduplicateTenders(tenders: EtimadTender[]): EtimadTender[] {
  const seen = new Map<string, EtimadTender>();
  for (const tender of tenders) {
    const existing = seen.get(tender.referenceNumber);
    // Keep the most recently extracted version
    if (!existing || tender.extractedAt > existing.extractedAt) {
      seen.set(tender.referenceNumber, tender);
    }
  }
  return Array.from(seen.values());
}
