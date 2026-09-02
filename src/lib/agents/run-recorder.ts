/**
 * How a pipeline stage writes its progress to the run row.
 *
 * The six agents used to share one in-memory array inside one invocation.
 * As durable workflow steps they run in separate functions — drafting and the
 * contract at the same time — so a stage may only write the agents it owns and
 * has to merge around whatever the other stage wrote in between. Every write
 * first reads the row, which is also where cancellation (and a run failed from
 * outside, e.g. by the stale check) is noticed.
 */

import { db } from "../db";
import type { AgentId, AgentState } from "../types";
import type { AgentRunFailureKind } from "./run-failure";

export type TerminalRunStatus = "CANCELLED" | "FAILED" | "COMPLETED";

/**
 * Thrown by the recorder when the row has reached a terminal status under the
 * stage's feet. `classifyRunFailure` recognises the name; the stage's failure
 * handler reads `status` to decide whether anything is left to write.
 */
export class PipelineCancelledError extends Error {
  constructor(readonly status: TerminalRunStatus = "CANCELLED") {
    super(status === "CANCELLED" ? "Agent pipeline cancelled" : `Agent pipeline already ${status.toLowerCase()}`);
    this.name = "PipelineCancelledError";
  }
}

export function parseAgentStates(raw: string | null | undefined): AgentState[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) && v.length > 0 ? (v as AgentState[]) : null;
  } catch {
    return null;
  }
}

/**
 * The row's states with this stage's own agents replaced by its copies. With
 * no row states yet, the stage's copies are written whole.
 */
export function mergeOwnedAgentStates(
  current: readonly AgentState[] | null,
  mine: readonly AgentState[],
  owned: ReadonlySet<AgentId>,
): AgentState[] {
  if (!current) return [...mine];
  return current.map((s) => (owned.has(s.id) ? (mine.find((m) => m.id === s.id) ?? s) : s));
}

export const RUN_ENDED_FINDING = "Run ended before this agent finished";

/**
 * The row's states with `agentId` shown as failed if it was still running when
 * the run ended from outside (the other tail failed it, or the stale check
 * did). Null when there is nothing to change: the agent had already finished.
 */
export function interruptedAgentStates(
  current: readonly AgentState[],
  agentId: AgentId,
): AgentState[] | null {
  const idx = current.findIndex((s) => s.id === agentId);
  if (idx < 0) return null;
  const mine = current[idx];
  if (mine.status !== "running" && mine.status !== "pending") return null;
  const next: AgentState = {
    ...mine,
    status: "failed",
    completedAt: new Date().toISOString(),
    findings: [...(mine.findings ?? []), RUN_ENDED_FINDING],
  };
  return current.map((s, i) => (i === idx ? next : s));
}

export function overallProgressOf(states: readonly AgentState[]): number {
  return Math.round(states.reduce((sum, a) => sum + a.progress, 0) / Math.max(states.length, 1));
}

export function createRunRecorder(opts: {
  runId: string;
  states: AgentState[];
  owned: ReadonlySet<AgentId>;
}) {
  const { runId, states, owned } = opts;

  const readRow = async () => {
    const row = await db.agentRun.findUnique({
      where: { id: runId },
      select: { status: true, agentStates: true },
    });
    if (!row) throw new Error("Agent run not found");
    return row;
  };

  const persist = async (
    status: "RUNNING" | "COMPLETED" | "FAILED",
    errorMessage?: string,
    failureKind?: AgentRunFailureKind,
  ) => {
    const row = await readRow();
    if (row.status === "CANCELLED" || row.status === "FAILED" || row.status === "COMPLETED") {
      throw new PipelineCancelledError(row.status);
    }
    const merged = mergeOwnedAgentStates(parseAgentStates(row.agentStates), states, owned);
    const overall = overallProgressOf(merged);
    await db.agentRun.update({
      where: { id: runId },
      data: {
        status,
        overallProgress: overall,
        agentStates: JSON.stringify(merged),
        errorMessage: errorMessage ?? null,
        // The stable kind the page speaks to; the message stays the operator's.
        failureKind: status === "FAILED" ? (failureKind ?? "INTERNAL") : null,
        ...(status === "COMPLETED" || status === "FAILED" ? { completedAt: new Date() } : {}),
        ...(status === "RUNNING" ? { startedAt: new Date() } : {}),
      },
    });
    return overall;
  };

  const mark = async (id: AgentId, patch: Partial<AgentState>) => {
    const idx = states.findIndex((s) => s.id === id);
    if (idx >= 0) states[idx] = { ...states[idx], ...patch };
    return persist("RUNNING");
  };

  /** The run was cancelled by the user while this stage ran: record it as such. */
  const cancel = async () => {
    const overall = overallProgressOf(states);
    await db.agentRun.updateMany({
      where: { id: runId, status: "CANCELLED" },
      data: {
        overallProgress: overall,
        agentStates: JSON.stringify(states),
        errorMessage: "Cancelled by user",
        completedAt: new Date(),
      },
    });
    return overall;
  };

  /**
   * The run reached a terminal status while this stage's agent was still
   * running: record the interruption on the agent alone. Guarded on the very
   * status that was read so a concurrent transition is never overwritten;
   * the run's status, message and kind stay exactly as the other writer left
   * them.
   */
  const markInterrupted = async (agentId: AgentId) => {
    const row = await readRow();
    if (row.status !== "CANCELLED" && row.status !== "FAILED" && row.status !== "COMPLETED") return;
    const current = parseAgentStates(row.agentStates);
    if (!current) return;
    const next = interruptedAgentStates(current, agentId);
    if (!next) return;
    await db.agentRun.updateMany({
      where: { id: runId, status: row.status },
      data: { agentStates: JSON.stringify(next) },
    });
  };

  /**
   * Touch `updatedAt` so the staleness check (180 s without a write) does not
   * fail a run whose stage is inside one long, healthy provider call. Guarded
   * on RUNNING so it can never revive a row that was cancelled or failed.
   */
  const heartbeat = async () => {
    await db.agentRun.updateMany({
      where: { id: runId, status: "RUNNING" },
      data: { updatedAt: new Date() },
    });
  };

  return { states, persist, mark, cancel, heartbeat, readRow, markInterrupted };
}

export type RunRecorder = ReturnType<typeof createRunRecorder>;

export const HEARTBEAT_INTERVAL_MS = 45_000;

/** Runs `work` while beating every 45 s; a failed beat is logged, never fatal. */
export async function withHeartbeat<T>(recorder: RunRecorder, work: () => Promise<T>): Promise<T> {
  const timer = setInterval(() => {
    recorder.heartbeat().catch((err) => console.warn("[agents] heartbeat failed", err));
  }, HEARTBEAT_INTERVAL_MS);
  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
}
