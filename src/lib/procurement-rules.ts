/**
 * Versioned regulatory policy registry for ArabClue.
 *
 * Hard rules (product constitution §1.3):
 * - Never encode broad legal assumptions as universal tender facts.
 * - Extract actual tender clauses; list statutory candidates separately with source + applicability.
 * - Do not assume blanket local-content preference percentages.
 * - Do not state PDPL universally requires 100% KSA residency.
 * - Do not invent NORA principle identifiers.
 * - Compliance content is not legal advice — always carry legal-review status.
 */

export type PolicyHumanApproval = "APPROVED" | "DRAFT" | "PENDING_REVIEW";

export type RequirementSourceCategory =
  | "EXPLICIT_TENDER"
  | "REGULATORY_CANDIDATE"
  | "INFERRED_APPLICABILITY"
  | "INTERNAL_RECOMMENDATION";

export type LegalReviewStatus =
  | "NOT_REQUIRED"
  | "REQUIRED"
  | "PENDING"
  | "APPROVED"
  | "NOT_LEGAL_ADVICE";

export type RegulatoryPolicyVersion = {
  id: string;
  jurisdiction: string;
  authority: string;
  instrumentName: string;
  instrumentNameAr?: string;
  version: string;
  effectiveDate: string;
  sourceReference: string;
  applicabilityCriteria: string;
  controlIdentifiers: string[];
  superseded: boolean;
  reviewDate: string;
  humanApprovalStatus: PolicyHumanApproval;
  notes: string;
  /** Normalized rule payload — never applied as universal tender facts without applicability checks */
  rules: Record<string, unknown>;
};

/** Platform-default KSA hosting posture (deployment), not a universal PDPL legal conclusion. */
export const PLATFORM_DATA_POSTURE = {
  defaultHostingRegion: "KSA",
  defaultStorageRegion: "KSA",
  crossBorderRequiresExplicitPolicy: true,
  note:
    "Default platform posture is KSA-hosted storage and processing where configured. Cross-border transfers must be evaluated against current PDPL, implementing regulations, transfer rules, contracts, data classification, and tenant policy — not assumed automatically allowed or forbidden.",
} as const;

/**
 * Approved / draft registry entries. Entries with humanApprovalStatus !== APPROVED
 * must never be presented as settled legal obligations.
 */
export const REGULATORY_POLICY_REGISTRY: RegulatoryPolicyVersion[] = [
  {
    id: "gtpl-ksa-baseline",
    jurisdiction: "SA",
    authority: "Ministry of Finance / Local Content & Government Procurement Authority (as applicable)",
    instrumentName: "Government Tenders and Procurement Law and Implementing Regulations",
    instrumentNameAr: "نظام المنافسات والمشتريات الحكومية ولائحته التنفيذية",
    version: "baseline-registry-2026-02",
    effectiveDate: "2019-01-01",
    sourceReference:
      "Official published GTPL and implementing regulations; tender-specific clauses control when present",
    applicabilityCriteria:
      "Saudi government and semi-government tenders conducted under GTPL. Private-sector tenders only when the tender incorporates these rules.",
    controlIdentifiers: ["GTPL", "PROCUREMENT_LAW"],
    superseded: false,
    reviewDate: "2026-08-01",
    humanApprovalStatus: "APPROVED",
    notes:
      "Penalty percentages and preference mechanisms are tender-specific. Do not inject default percentages as tender facts.",
    rules: {
      extractPenaltiesFromTenderOnly: true,
      statutoryPenaltyCapsAreCandidatesOnly: true,
    },
  },
  {
    id: "pdpl-ksa-baseline",
    jurisdiction: "SA",
    authority: "Saudi Data & AI Authority / NDMO (as applicable)",
    instrumentName: "Personal Data Protection Law and related regulations",
    instrumentNameAr: "نظام حماية البيانات الشخصية واللوائح ذات الصلة",
    version: "baseline-registry-2026-02",
    effectiveDate: "2023-09-14",
    sourceReference:
      "Official PDPL publication and implementing / transfer regulations as amended",
    applicabilityCriteria:
      "Processing of personal data subject to PDPL. Transfer and residency requirements depend on data classification, lawful basis, and current transfer regulation — not a universal 100% residency mandate.",
    controlIdentifiers: ["PDPL"],
    superseded: false,
    reviewDate: "2026-08-01",
    humanApprovalStatus: "APPROVED",
    notes: PLATFORM_DATA_POSTURE.note,
    rules: {
      universalResidencyMandate: false,
      evaluateCrossBorderTransfers: true,
      breachNotificationHoursCandidate: 72,
    },
  },
  {
    id: "nca-ecc-baseline",
    jurisdiction: "SA",
    authority: "National Cybersecurity Authority",
    instrumentName: "Essential Cybersecurity Controls (ECC)",
    instrumentNameAr: "ضوابط الأمن السيبراني الأساسية",
    version: "ECC-1:2018",
    effectiveDate: "2018-01-01",
    sourceReference: "Official NCA ECC publication; successor versions supersede when applicable",
    applicabilityCriteria:
      "Entities and systems within NCA ECC scope as defined by NCA and the tender. Always check for successor ECC versions.",
    controlIdentifiers: ["NCA_ECC1", "ECC"],
    superseded: false,
    reviewDate: "2026-08-01",
    humanApprovalStatus: "APPROVED",
    notes: "Registry supports successor versions; do not hardcode obsolete baselines as sole controls.",
    rules: { frameworkLabel: "ECC-1:2018", supportsSuccessorVersions: true },
  },
  {
    id: "nca-ccc-baseline",
    jurisdiction: "SA",
    authority: "National Cybersecurity Authority",
    instrumentName: "Cloud Cybersecurity Controls (CCC)",
    instrumentNameAr: "ضوابط الأمن السيبراني السحابية",
    version: "CCC-1:2020",
    effectiveDate: "2020-01-01",
    sourceReference: "Official NCA CCC publication; successor versions supersede when applicable",
    applicabilityCriteria:
      "Cloud services and workloads within NCA CCC scope as defined by NCA and the tender.",
    controlIdentifiers: ["NCA_CCC1", "CCC"],
    superseded: false,
    reviewDate: "2026-08-01",
    humanApprovalStatus: "APPROVED",
    notes: "Supports successor CCC versions when published.",
    rules: { frameworkLabel: "CCC-1:2020", supportsSuccessorVersions: true },
  },
  {
    id: "local-content-mechanisms",
    jurisdiction: "SA",
    authority: "Local Content & Government Procurement Authority (as applicable)",
    instrumentName: "Local content / SME preference mechanisms",
    instrumentNameAr: "آليات تفضيل المحتوى المحلي والمنشآت الصغيرة والمتوسطة",
    version: "baseline-registry-2026-02",
    effectiveDate: "2019-01-01",
    sourceReference:
      "Official LCGPA / related directives and the specific tender mechanism language",
    applicabilityCriteria:
      "Only when the tender and current official rules establish a specific mechanism and eligibility. No blanket percentage applies to every tender, bidder, SME, product, or local-content program.",
    controlIdentifiers: ["LOCAL_CONTENT"],
    superseded: false,
    reviewDate: "2026-08-01",
    humanApprovalStatus: "APPROVED",
    notes:
      "Preference percentages must be taken from the tender or an approved official rule matching applicability — never defaulted to 10%.",
    rules: {
      blanketPreferencePercent: null,
      requireTenderOrApprovedRule: true,
    },
  },
];

export function getPolicyById(id: string): RegulatoryPolicyVersion | undefined {
  return REGULATORY_POLICY_REGISTRY.find((p) => p.id === id);
}

export function getActivePolicies(
  controlIdOrFramework?: string
): RegulatoryPolicyVersion[] {
  return REGULATORY_POLICY_REGISTRY.filter((p) => {
    if (p.superseded) return false;
    if (!controlIdOrFramework) return true;
    const needle = controlIdOrFramework.toUpperCase();
    return p.controlIdentifiers.some((c) => needle.includes(c.toUpperCase()) || c.toUpperCase().includes(needle));
  });
}

/** Citation helpers for UI/evidence — not universal legal conclusions. */
export const PROCUREMENT_LAW = {
  nameAr: "نظام المنافسات والمشتريات الحكومية",
  nameEn: "Government Tenders and Procurement Law",
  citation:
    "Government Tenders and Procurement Law (نظام المنافسات والمشتريات الحكومية) and its Implementing Regulations — apply only when tender/jurisdiction criteria match registry entry gtpl-ksa-baseline",
  policyId: "gtpl-ksa-baseline",
} as const;

/**
 * Statutory delay-penalty *candidates* for legal-review context.
 * Never rewrite a tender clause to these values.
 */
export const STATUTORY_PENALTY_CANDIDATES = {
  servicesMaxPercentCandidate: 20,
  constructionMaxPercentCandidate: 10,
  sourceReference:
    "Common Saudi services/construction practice and procurement implementing guidance — applicability must be confirmed against the tender and current official rules",
  humanApprovalStatus: "PENDING_REVIEW" as PolicyHumanApproval,
  note:
    "Candidates only. Extract the tender's actual penalty clause as EXPLICIT_TENDER; list these separately as REGULATORY_CANDIDATE.",
} as const;

/** @deprecated Use extractTenderPenalty + statutory candidates. Kept for migration of call sites. */
export const SLA_PENALTY_RULES = {
  defaultWeeklyPercent: 2,
  maxPenaltyServicesPercent: STATUTORY_PENALTY_CANDIDATES.servicesMaxPercentCandidate,
  maxPenaltyConstructionPercent: STATUTORY_PENALTY_CANDIDATES.constructionMaxPercentCandidate,
  /**
   * Returns statutory *candidate* caps for legal-review comparison.
   * Does not mutate tender-extracted values.
   */
  statutoryCandidate: (
    tenderCategory?: string | null
  ): {
    weeklyCandidate: number | null;
    maxCandidate: number;
    category: "CONSTRUCTION" | "SERVICES";
    sourceCategory: RequirementSourceCategory;
    sourceReference: string;
  } => {
    const isConstruction =
      (tenderCategory ?? "").toUpperCase() === "CONSTRUCTION" ||
      (tenderCategory ?? "").toUpperCase() === "OPERATIONS";
    return {
      weeklyCandidate: null,
      maxCandidate: isConstruction
        ? STATUTORY_PENALTY_CANDIDATES.constructionMaxPercentCandidate
        : STATUTORY_PENALTY_CANDIDATES.servicesMaxPercentCandidate,
      category: isConstruction ? "CONSTRUCTION" : "SERVICES",
      sourceCategory: "REGULATORY_CANDIDATE",
      sourceReference: STATUTORY_PENALTY_CANDIDATES.sourceReference,
    };
  },
  /** @deprecated Does not rewrite tender facts; returns candidate comparison only. */
  enforceCap: (
    weeklyPercent: number,
    tenderCategory?: string | null
  ): { weekly: number; max: number; capped: boolean } => {
    const candidate = SLA_PENALTY_RULES.statutoryCandidate(tenderCategory);
    return {
      weekly: weeklyPercent,
      max: candidate.maxCandidate,
      capped: weeklyPercent > candidate.maxCandidate,
    };
  },
} as const;

export type TenderPenaltyExtract = {
  perWeek: number | null;
  maxPercent: number | null;
  originalWording: string | null;
  sourceCategory: RequirementSourceCategory;
};

export function buildTenderPenaltyExtract(opts: {
  perWeek: number | null;
  maxPercent: number | null;
  originalWording?: string | null;
}): TenderPenaltyExtract {
  return {
    perWeek: opts.perWeek,
    maxPercent: opts.maxPercent,
    originalWording: opts.originalWording ?? null,
    sourceCategory: "EXPLICIT_TENDER",
  };
}

/**
 * PDPL evaluation helpers — no universal residency mandate.
 */
export const PDPL_RULES = {
  policyId: "pdpl-ksa-baseline",
  universalResidencyMandate: false,
  residencyEvaluationNote:
    "Evaluate KSA residency and cross-border transfers against current PDPL, implementing regulations, transfer regulation, contractual restrictions, data classification, and tenant policy. Platform default hosting is KSA where configured; that is an operational posture, not a universal legal mandate.",
  breachNotificationHoursCandidate: 72,
  legalReviewStatus: "NOT_LEGAL_ADVICE" as LegalReviewStatus,
} as const;

/** Active NCA framework labels from the registry (supports successor entries). */
export const NCA_FRAMEWORKS = {
  ecc: String(getPolicyById("nca-ecc-baseline")?.rules.frameworkLabel ?? "ECC-1:2018"),
  ccc: String(getPolicyById("nca-ccc-baseline")?.rules.frameworkLabel ?? "CCC-1:2020"),
  note: "Use only identifiers from approved registry entries or the tender itself. Successor versions may apply.",
} as const;

/**
 * NORA / DGA architecture principles.
 * Empty by design until an approved official NORA source is registered.
 * Tender-extracted principle IDs may be used with sourceCategory EXPLICIT_TENDER.
 */
export const NORA_PRINCIPLES: ReadonlyArray<{
  id: string;
  name: string;
  nameAr: string;
  requirement: string;
  sourceCategory: RequirementSourceCategory;
  sourceReference: string;
  humanApprovalStatus: PolicyHumanApproval;
}> = [];

export function noraPrinciplesFromTender(tenderText: string): Array<{
  id: string;
  name: string;
  sourceCategory: RequirementSourceCategory;
  snippet: string;
}> {
  const found: Array<{
    id: string;
    name: string;
    sourceCategory: RequirementSourceCategory;
    snippet: string;
  }> = [];
  // Capture principle-like tokens only when present in tender text (never invent IDs).
  const re = /\b((?:TP|SP|BP|IP)\d+)\b[:\s\-–]*([^\n.]{3,80})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tenderText)) !== null) {
    found.push({
      id: m[1].toUpperCase(),
      name: m[2].trim(),
      sourceCategory: "EXPLICIT_TENDER",
      snippet: m[0].slice(0, 120),
    });
  }
  return found;
}

/**
 * Local-content / SME preference — only when tender or approved rule states it.
 */
export function extractLocalContentPreference(tenderText: string): {
  preferencePercent: number | null;
  mechanism: string | null;
  eligibilityNote: string | null;
  sourceCategory: RequirementSourceCategory | null;
  originalWording: string | null;
} {
  const patterns: RegExp[] = [
    /(?:local\s*content|محتوى\s*محلي|sme|منشآت)[^%\d]{0,40}(\d+(?:\.\d+)?)\s*%/i,
    /(\d+(?:\.\d+)?)\s*%[^.\n]{0,40}(?:local\s*content|محتوى\s*محلي|sme|تفضيل)/i,
    /(?:price\s*preference|تفضيل\s*سعري)[^%\d]{0,30}(\d+(?:\.\d+)?)\s*%/i,
  ];
  for (const re of patterns) {
    const m = tenderText.match(re);
    if (m?.[1]) {
      const preferencePercent = parseFloat(m[1]);
      if (!Number.isNaN(preferencePercent)) {
        return {
          preferencePercent,
          mechanism: "tender_stated_preference",
          eligibilityNote:
            "Eligibility and mechanism must match the tender clause and current official rules for the bidder/product category.",
          sourceCategory: "EXPLICIT_TENDER",
          originalWording: m[0].slice(0, 200),
        };
      }
    }
  }
  return {
    preferencePercent: null,
    mechanism: null,
    eligibilityNote:
      "No tender-stated local-content/SME preference percentage found. Do not assume a blanket preference.",
    sourceCategory: null,
    originalWording: null,
  };
}

/** @deprecated Never use as a universal default. Prefer extractLocalContentPreference. */
export const LOCAL_CONTENT_PRICE_PREFERENCE: number | null = null;

/**
 * Quick Liquidity Ratio — Saudi government qualification metric when requested.
 * QLR = (Cash & Equivalents + Accounts Receivable) / Current Liabilities
 *
 * Pass/fail is only set when an explicit tender threshold (or approved rule threshold) is provided.
 */
export function computeQuickLiquidityRatio(
  input: {
    cashEquivalents: number;
    accountsReceivable: number;
    currentLiabilities: number;
  },
  threshold: number | null = null
): {
  ratio: number;
  passes: boolean | null;
  formula: string;
  threshold: number | null;
  sourceValues: {
    cashEquivalents: number;
    accountsReceivable: number;
    currentLiabilities: number;
  };
} {
  const { cashEquivalents, accountsReceivable, currentLiabilities } = input;
  const formula = "(CashEquivalents + AccountsReceivable) / CurrentLiabilities";
  if (currentLiabilities <= 0) {
    return {
      ratio: 0,
      passes: threshold == null ? null : false,
      formula,
      threshold,
      sourceValues: { cashEquivalents, accountsReceivable, currentLiabilities },
    };
  }
  const ratio =
    Math.round(
      ((cashEquivalents + accountsReceivable) / currentLiabilities) * 100
    ) / 100;
  return {
    ratio,
    passes: threshold == null ? null : ratio >= threshold,
    formula,
    threshold,
    sourceValues: { cashEquivalents, accountsReceivable, currentLiabilities },
  };
}

/** Extract QLR threshold from tender text when explicitly stated. */
export function extractQlrThreshold(tenderText: string): number | null {
  const patterns = [
    /(?:quick\s*liquidity\s*ratio|QLR|نسبة\s*السيولة\s*السريعة)[^%\d]{0,40}(?:≥|>=|at\s*least|minimum|لا\s*تقل\s*عن)?\s*(\d+(?:\.\d+)?)/i,
    /(?:≥|>=)\s*(\d+(?:\.\d+)?)\s*(?:QLR|quick\s*liquidity)/i,
  ];
  for (const re of patterns) {
    const m = tenderText.match(re);
    if (m?.[1]) {
      const n = parseFloat(m[1]);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

/** Default minimum Saudization — only as INTERNAL_RECOMMENDATION narrative, not tender fact. */
export const SAUDIZATION_DEFAULT_MIN = 35;

export const LEGAL_DISCLAIMER =
  "Compliance matrices and regulatory commentary are assisted drafting aids, not legal advice. Authorized human legal review and approval are required before submission.";

export const LEGAL_DISCLAIMER_AR =
  "مصفوفات الامتثال والتعليقات التنظيمية أدوات صياغة مساعدة وليست استشارة قانونية. يلزم مراجعة واعتماد قانوني بشري قبل التقديم.";
