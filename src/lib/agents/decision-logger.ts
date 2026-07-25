/**
 * @module decision-logger
 * Auditable, structured decision trace for every agent.
 * Enables transparency: each decision is logged with inputs, ruleId, sourceCategory, output, timing, and evidence.
 * Logs are persisted in AgentRun.agentStates[].findings and finalArtifact for later audit.
 * Designed to be serializable, deterministic, and easy to query.
 */

import type { AgentId } from "@/lib/types";
import type { AgentDecisionSourceCategory } from "./agent-registry";

export type DecisionLevel = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "BLOCKING";

export interface AgentDecisionEntry {
  readonly timestamp: string;
  readonly agentId: AgentId | "ORCHESTRATOR";
  readonly ruleId: string;
  readonly sourceCategory: AgentDecisionSourceCategory;
  readonly level: DecisionLevel;
  /** Human readable */
  readonly message: string;
  /** Arabic translation where relevant */
  readonly messageAr?: string;
  /** Inputs that led to decision (truncated, PII-free) */
  readonly inputs?: Record<string, unknown>;
  /** Output or conclusion */
  readonly output?: string;
  /** Evidence snippet for auditor */
  readonly evidence?: string;
  /** Config params used */
  readonly configUsed?: Record<string, unknown>;
  /** Duration ms for this decision if measured */
  readonly durationMs?: number;
  /** Whether this decision blocked export */
  readonly blocking?: boolean;
  /** Correlation id (runId) */
  readonly runId?: string;
}

export interface AgentDecisionLog {
  /** Run-level */
  runId: string;
  projectId: string;
  startedAt: string;
  entries: AgentDecisionEntry[];
}

class DecisionLogger {
  private entries: AgentDecisionEntry[] = [];
  private timers = new Map<string, number>();

  startTimer(key: string) {
    this.timers.set(key, Date.now());
  }

  endTimer(key: string): number | undefined {
    const start = this.timers.get(key);
    if (start == null) return undefined;
    const dur = Date.now() - start;
    this.timers.delete(key);
    return dur;
  }

  log(entry: Omit<AgentDecisionEntry, "timestamp">) {
    const full: AgentDecisionEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };
    this.entries.push(full);

    if (process.env.NODE_ENV !== "production") {
      const prefix = `[${full.agentId}][${full.ruleId}][${full.sourceCategory}]`;
      if (full.level === "ERROR" || full.level === "BLOCKING") {
        console.error(prefix, full.message, full.evidence ?? "");
      } else if (full.level === "WARNING") {
        console.warn(prefix, full.message);
      }
    }
  }

  getEntries(): AgentDecisionEntry[] {
    return [...this.entries];
  }

  getFindingsForState(maxLines = 20): string[] {
    return this.entries.slice(0, maxLines).map((e) => `[${e.sourceCategory}] ${e.ruleId}: ${e.message}${e.evidence ? ` | ${e.evidence.slice(0, 140)}` : ""}`);
  }

  toLog(runId: string, projectId: string, startedAt: string): AgentDecisionLog {
    return {
      runId,
      projectId,
      startedAt,
      entries: this.getEntries(),
    };
  }

  clear() {
    this.entries = [];
    this.timers.clear();
  }
}

export function createDecisionLogger(): DecisionLogger {
  return new DecisionLogger();
}

export type { DecisionLogger };

/** Global helper for quick, auditable decision records */
export function decision(
  logger: DecisionLogger,
  params: {
    agentId: AgentId | "ORCHESTRATOR";
    ruleId: string;
    sourceCategory: AgentDecisionSourceCategory;
    level?: DecisionLevel;
    message: string;
    messageAr?: string;
    inputs?: Record<string, unknown>;
    output?: string;
    evidence?: string;
    configUsed?: Record<string, unknown>;
    runId?: string;
    blocking?: boolean;
  }
) {
  const { agentId, ruleId, sourceCategory, level = "INFO", message, messageAr, inputs, output, evidence, configUsed, runId, blocking } = params;
  logger.log({
    agentId,
    ruleId,
    sourceCategory,
    level,
    message,
    messageAr,
    inputs,
    output,
    evidence,
    configUsed,
    runId,
    blocking,
  });
}

/** Redact helper: truncate long strings, strip PII-like patterns */
export function truncateForLog(value: unknown, max = 240): unknown {
  if (typeof value === "string") {
    return value.length > max ? `${value.slice(0, max)}…[${value.length - max} truncated]` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((v) => truncateForLog(v, max));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.toLowerCase().includes("password") || k.toLowerCase().includes("secret")) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = truncateForLog(v, max);
      }
      if (Object.keys(out).length > 20) break;
    }
    return out;
  }
  return value;
}
