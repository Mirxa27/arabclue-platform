/**
 * Authoritative Saudi government procurement rules for Arabclue agents.
 * These constants drive compliance matrices, SLA enforcement, BoQ preference,
 * and financial qualification — never invent numbers outside these rules.
 */

/** نظام المنافسات والمشتريات الحكومية — citation strings for matrices */
export const PROCUREMENT_LAW = {
  nameAr: "نظام المنافسات والمشتريات الحكومية",
  nameEn: "Government Tenders and Procurement Law",
  citation:
    "Government Tenders and Procurement Law (نظام المنافسات والمشتريات الحكومية) and its Implementing Regulations",
  localContentPreferencePercent: 10,
  smePreferenceNote:
    "Mandatory 10% price preference for Local Content and SMEs per Local Content & Government Procurement Authority directives",
} as const;

/** SLA delay penalty caps (Saudi services / construction practice) */
export const SLA_PENALTY_RULES = {
  defaultWeeklyPercent: 2,
  /** Maximum cumulative delay penalty for services contracts */
  maxPenaltyServicesPercent: 20,
  /** Maximum cumulative delay penalty for construction contracts */
  maxPenaltyConstructionPercent: 10,
  enforceCap: (weeklyPercent: number, tenderCategory?: string | null): { weekly: number; max: number; capped: boolean } => {
    const isConstruction =
      (tenderCategory ?? "").toUpperCase() === "CONSTRUCTION" ||
      (tenderCategory ?? "").toUpperCase() === "OPERATIONS";
    const max = isConstruction
      ? SLA_PENALTY_RULES.maxPenaltyConstructionPercent
      : SLA_PENALTY_RULES.maxPenaltyServicesPercent;
    const weekly = Math.min(Math.max(weeklyPercent, 0), max);
    return { weekly, max, capped: weeklyPercent > max };
  },
} as const;

/** PDPL data residency requirements */
export const PDPL_RULES = {
  dataResidencyRequired: true,
  residencyStatement:
    "100% personal data residency within the Kingdom of Saudi Arabia; no cross-border transfer without NDMO approval",
  breachNotificationHours: 72,
} as const;

/** NCA control framework identifiers */
export const NCA_FRAMEWORKS = {
  ecc: "ECC-1:2018",
  ccc: "CCC-1:2020",
} as const;

/** NORA enterprise architecture principles */
export const NORA_PRINCIPLES = [
  {
    id: "TP1",
    name: "Cloud First",
    nameAr: "السحابة أولاً",
    requirement: "Mandatory local hosting on certified Saudi cloud providers",
  },
  {
    id: "SP1",
    name: "Secure by Design",
    nameAr: "التصميم الآمن",
    requirement: "AES-256 at rest, TLS 1.3 in transit, secure SDLC",
  },
  {
    id: "SP2",
    name: "Zero Trust",
    nameAr: "الثقة المعدومة",
    requirement: "Continuous verification, least privilege, MFA for privileged access",
  },
] as const;

/**
 * Quick Liquidity Ratio — Saudi government qualification metric.
 * QLR = (Cash & Equivalents + Accounts Receivable) / Current Liabilities
 */
export function computeQuickLiquidityRatio(input: {
  cashEquivalents: number;
  accountsReceivable: number;
  currentLiabilities: number;
}): { ratio: number; passes: boolean; formula: string } {
  const { cashEquivalents, accountsReceivable, currentLiabilities } = input;
  if (currentLiabilities <= 0) {
    return {
      ratio: 0,
      passes: false,
      formula: "(CashEquivalents + AccountsReceivable) / CurrentLiabilities",
    };
  }
  const ratio =
    (cashEquivalents + accountsReceivable) / currentLiabilities;
  return {
    ratio: Math.round(ratio * 100) / 100,
    passes: ratio >= 1.0,
    formula: "(CashEquivalents + AccountsReceivable) / CurrentLiabilities",
  };
}

/** Default minimum Saudization rate for technical roles narrative */
export const SAUDIZATION_DEFAULT_MIN = 35;

/** Local content price preference applied to BoQ comparable pricing */
export const LOCAL_CONTENT_PRICE_PREFERENCE = 0.1;
