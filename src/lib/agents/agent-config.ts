/**
 * @module agent-config
 * Centralized, auditable configuration for all agents.
 * All thresholds, limits, and behavior flags are here, not scattered.
 * Easy to modify, review, and test.
 */

export const AGENT_CONFIG = {
  INGESTION: {
    /** Max chars of combined text passed to LLM enrichment */
    excerptLength: 6000,
    /** Max evidence items kept */
    maxEvidence: 20,
    /** Quality filters */
    scopeMinLength: 40,
    milestoneMax: 10,
    weekMax: 260,
    /** Text extraction limits */
    maxZipEntries: 100,
    maxEntrySizeMiB: 10,
    milestonePatterns: 3,
    supportedMimes: ["text/*", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip", "image/*"] as const,
  },
  COMPLIANCE: {
    frameworks: ["NCA_ECC", "NCA_CCC", "PDPL", "LOCAL_CONTENT", "NORA", "PROCUREMENT_LAW"],
    /** Keyword hits thresholds */
    ncaCompliantThreshold: 3,
    ncaPartialThreshold: 1,
    /** Score = compliant / total */
    complianceFrames: ["PDPL", "NCA", "LOCAL_CONTENT", "NORA"],
    pdplBreachCandidateHours: 72,
    /** Source categories enforced */
    requiredSourceCategories: ["EXPLICIT_TENDER", "REGULATORY_CANDIDATE", "INFERRED_APPLICABILITY", "INTERNAL_RECOMMENDATION"] as const,
  },
  TECHNICAL: {
    ragTopK: {
      pastProjects: 5,
      tenderCorpus: 8,
    },
    scoreThresholds: {
      minRelevant: 0.18,
      analogous: 0.22,
      exact: 0.45,
    },
    embeddingCache: true,
    vision2030AllowedWithoutTender: false,
  },
  FINANCIAL: {
    qlrFormula: "(CashEquivalents + AccountsReceivable) / CurrentLiabilities",
    boqUnitDefault: "LS" as const,
    boqQtyDefault: 1,
    allowPricePopulation: false, // hard safety
    maxBoqLines: 50,
  },
  DRAFTING: {
    sectionCount: 18,
    complianceRowsInPromptMax: 50,
    coverageRowsInPromptMax: 40,
    missingEvidenceInPromptMax: 15,
    ingestionJsonMax: 8000,
    llm: {
      maxTokens: 8192,
      temperature: 0.28,
      engine: "DRAFTING" as const,
      fallbackEnabled: true,
    },
    mandatoryPhrases: [
      "Draft pending authorized human approval",
      "user is final author of record",
      "Not legal advice",
      "ليست استشارة قانونية",
    ] as const,
  },
  LAW_CONTRACT: {
    standardArticleCount: 14,
    minArticlesForLLM: 8,
    minArticlesWarning: 5,
    articlePattern: /^###\s*Article\s+(\d+)[^\n]*$/gim,
    bilingualHeaderPattern: /^###\s*Article\s+\d+\s*—\s*[^|\n]+\|\s*المادة\s+\d+\s*—\s*[^\n]+$/i,
    markers: {
      en: ":::en",
      ar: ":::ar",
    },
    requiredSections: ["# DRAFT CONTRACT | مسودة عقد", "# RESEARCH SUMMARY | موجز البحث", "# OPERATIVE ARTICLES | البنود النافذة", "# SIGNATURES | التوقيعات"] as const,
    llm: {
      maxTokens: 8192,
      temperature: 0.15,
      engine: "LAW" as const,
    },
    forbiddenCertaintyPattern: /100%\s*(certain|certainty|sure|guaranteed)|يقين\s*100|مضمون\s*100/i,
  },
  ORCHESTRATOR: {
    progressCalc: "mean(agent.progress)",
    cancellationCheck: "before every mark/persist",
    overallRound: "Math.round(mean)",
    proposalStatus: {
      blockingValidation: "DRAFT",
      passingValidation: "GENERATED",
    },
    versioning: {
      optimisticLockFields: ["status", "version", "updatedAt"],
      maxRetries: 1,
    },
  },
  COVERAGE: {
    /** Token-overlap best score → COVERED */
    coveredMinScore: 0.28,
    /** Token-overlap best score → PARTIAL (else GAP / NEEDS_USER_INPUT) */
    partialMinScore: 0.12,
    evidenceHitsMax: 4,
    maxRowsInPrompt: 40,
    missingTasksMax: 12,
    strengthsMax: 3,
    winStrategyNotesInclude: true,
  },
  PLATFORM: {
    /** Heuristic classify confidence required for autopilot pipeline start */
    autopilotConfidence: 0.78,
    toolLoopMaxSteps: 28,
    toolLoopTemperature: 0.3,
    forcePipelineMinConfidence: 0.9,
  },
  VALIDATION: {
    blockOnPricing: true,
    blockOnDisclaimerMissing: true,
    blockOnFalseCertainty: true,
    blockOnMissingResearch: true,
    blockOnBilingualAsymmetry: true,
  },
  PERFORMANCE: {
    /** Timeouts and retries */
    agentTimeoutMs: 120_000,
    embeddingTimeoutMs: 30_000,
    pollIntervalMs: 900,
    /** Concurrency limits */
    maxParallelExtractions: 3,
  },
} as const;

export type AgentConfig = typeof AGENT_CONFIG;

/** Helper to get typed config with defaults */
export function getAgentConfig<K extends keyof AgentConfig>(agent: K): AgentConfig[K] {
  return AGENT_CONFIG[agent];
}

/** Verification helper: ensures safety invariants cannot be disabled via config */
export function verifySafetyInvariants(): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  if (AGENT_CONFIG.FINANCIAL.allowPricePopulation !== false) {
    violations.push("FINANCIAL.allowPricePopulation must be false");
  }
  if (AGENT_CONFIG.DRAFTING.mandatoryPhrases.length < 3) {
    violations.push("DRAFTING.mandatoryPhrases must include legal disclaimers");
  }
  if (AGENT_CONFIG.LAW_CONTRACT.standardArticleCount < 10) {
    violations.push("LAW_CONTRACT.standardArticleCount too low");
  }
  if (AGENT_CONFIG.VALIDATION.blockOnPricing !== true) {
    violations.push("VALIDATION.blockOnPricing must be true");
  }
  return { ok: violations.length === 0, violations };
}

if (process.env.NODE_ENV !== "production") {
  const v = verifySafetyInvariants();
  if (!v.ok) {
    console.error("[agent-config] Safety invariant violations:", v.violations);
  }
}
