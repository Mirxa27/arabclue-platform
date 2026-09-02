/**
 * @module agent-metrics
 * Performance, reliability, and capability metrics for each agent.
 * Captures timing, token usage, fallback rates, success/failure, and quality indicators.
 * Designed for auditability and continuous improvement.
 */

export interface AgentTiming {
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly timedOut?: boolean;
}

export interface AgentQualityMetrics {
  /** Percentage of requirements covered (if applicable) */
  readonly coveragePercent?: number;
  /** Compliance score */
  readonly complianceScore?: number;
  /** Number of evidence items */
  readonly evidenceCount?: number;
  /** Number of gaps / tasks for human */
  readonly gapCount?: number;
  /** Deterministic vs LLM enriched */
  readonly enriched: boolean;
  readonly provider?: string;
  readonly fallback: boolean;
  readonly tokensUsed?: number;
}

export interface AgentRunMetrics {
  readonly runId: string;
  readonly projectId: string;
  readonly timing: Record<string, AgentTiming>;
  readonly quality: Record<string, AgentQualityMetrics>;
  readonly reliability: {
    readonly retries: Record<string, number>;
    readonly errors: Record<string, string[]>;
    readonly blockedExports: number;
  };
  readonly overallProgress: number;
  readonly status: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  readonly totalDurationMs: number;
}

/**
 * Everything the tracker knows, as plain data. A pipeline stage running in its
 * own function hands this to the next stage, which seeds a new tracker with it.
 */
export interface MetricsSnapshot {
  readonly startedAtMs: number;
  readonly timing: Record<string, AgentTiming>;
  readonly quality: Record<string, AgentQualityMetrics>;
  readonly retries: Record<string, number>;
  readonly errors: Record<string, string[]>;
  readonly blockedExports: number;
}

/**
 * Two stages that ran in parallel from the same seed each carry the seed plus
 * their own agent. The merge keeps the seed's clock, unions the per-agent maps
 * (each agent is written by exactly one stage) and adds the export blocks the
 * two stages raised on top of the seed's.
 */
export function mergeMetricsSnapshots(
  seed: MetricsSnapshot,
  ...stages: MetricsSnapshot[]
): MetricsSnapshot {
  return stages.reduce<MetricsSnapshot>(
    (acc, stage) => ({
      startedAtMs: seed.startedAtMs,
      timing: { ...acc.timing, ...stage.timing },
      quality: { ...acc.quality, ...stage.quality },
      retries: { ...acc.retries, ...stage.retries },
      errors: { ...acc.errors, ...stage.errors },
      blockedExports: acc.blockedExports + Math.max(0, stage.blockedExports - seed.blockedExports),
    }),
    seed,
  );
}

export function createMetricsTracker(runId: string, projectId: string, seed?: MetricsSnapshot) {
  const started = seed?.startedAtMs ?? Date.now();
  const timing: Record<string, AgentTiming> = { ...(seed?.timing ?? {}) };
  const quality: Record<string, AgentQualityMetrics> = { ...(seed?.quality ?? {}) };
  const retries: Record<string, number> = { ...(seed?.retries ?? {}) };
  const errors: Record<string, string[]> = { ...(seed?.errors ?? {}) };
  let blockedExports = seed?.blockedExports ?? 0;

  return {
    snapshot(): MetricsSnapshot {
      return {
        startedAtMs: started,
        timing: { ...timing },
        quality: { ...quality },
        retries: { ...retries },
        errors: { ...errors },
        blockedExports,
      };
    },
    startAgent(agentId: string) {
      timing[agentId] = { startedAt: new Date().toISOString() };
    },
    completeAgent(agentId: string, q: Partial<AgentQualityMetrics> = {}) {
      const s = timing[agentId];
      const now = Date.now();
      const startMs = s ? new Date(s.startedAt).getTime() : now;
      timing[agentId] = {
        startedAt: s?.startedAt ?? new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: now - startMs,
      };
      quality[agentId] = {
        enriched: q.enriched ?? false,
        fallback: q.fallback ?? false,
        evidenceCount: q.evidenceCount,
        gapCount: q.gapCount,
        coveragePercent: q.coveragePercent,
        complianceScore: q.complianceScore,
        provider: q.provider,
        tokensUsed: q.tokensUsed,
      };
    },
    failAgent(agentId: string, errMsg: string) {
      if (!errors[agentId]) errors[agentId] = [];
      errors[agentId].push(errMsg);
      const s = timing[agentId];
      if (s && !s.completedAt) {
        timing[agentId] = { ...s, completedAt: new Date().toISOString(), durationMs: Date.now() - new Date(s.startedAt).getTime() };
      }
    },
    retryAgent(agentId: string) {
      retries[agentId] = (retries[agentId] ?? 0) + 1;
    },
    blockExport() {
      blockedExports += 1;
    },
    build(status: AgentRunMetrics["status"], overallProgress: number): AgentRunMetrics {
      return {
        runId,
        projectId,
        timing,
        quality,
        reliability: { retries, errors, blockedExports },
        overallProgress,
        status,
        totalDurationMs: Date.now() - started,
      };
    },
  };
}

export type MetricsTracker = ReturnType<typeof createMetricsTracker>;
