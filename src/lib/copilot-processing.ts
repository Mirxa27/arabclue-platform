/**
 * Copilot turn processing state machine — pure helpers for UI + tests.
 * Phases: idle → queued → streaming → generating → finalizing → completed | error
 */

export const COPILOT_PROCESSING_PHASES = [
  "idle",
  "queued",
  "streaming",
  "generating",
  "finalizing",
  "error",
  "completed",
] as const;

export type CopilotProcessingPhase = (typeof COPILOT_PROCESSING_PHASES)[number];

export type ChatTransportStatus =
  | "submitted"
  | "streaming"
  | "ready"
  | "error"
  | string;

export type DeriveProcessingInput = {
  chatStatus: ChatTransportStatus;
  hasError: boolean;
  offline: boolean;
  timedOut: boolean;
  assistantTextLength: number;
  toolsRunning: number;
  toolsDone: number;
  toolsTotal: number;
  /** Document/proposal tools actively producing output */
  documentToolsActive: boolean;
  /** Previous non-idle phase in this turn (for finalizing/completed) */
  previousPhase: CopilotProcessingPhase;
  /** Milliseconds since turn start; null when idle */
  elapsedMs: number | null;
};

export type CopilotProcessingSnapshot = {
  phase: CopilotProcessingPhase;
  progress: number; // 0–100 deterministic estimate
  tokenCount: number;
  elapsedMs: number;
  messageKey: string;
  assertive: boolean;
  degraded: boolean;
  canCancel: boolean;
  canRetry: boolean;
};

export const COPILOT_PROCESSING_STORAGE_PREFIX = "arabclue.copilot.partial.";
export const COPILOT_DEFAULT_TIMEOUT_MS = 180_000;
export const COPILOT_COMPLETED_HOLD_MS = 2_400;

/** Count approximate tokens from streamed text (whitespace split, min 1 when non-empty). */
export function countStreamTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Deterministic progress estimate from phase + tool/text signals.
 * Never regresses within a turn when `previousProgress` is provided.
 */
export function estimateProcessingProgress(
  input: DeriveProcessingInput,
  previousProgress = 0
): number {
  let next = 0;
  const phase = deriveCopilotProcessingPhase(input);

  switch (phase) {
    case "idle":
      next = 0;
      break;
    case "queued":
      next = 8;
      break;
    case "streaming": {
      const chars = input.assistantTextLength;
      next = Math.min(68, 18 + Math.floor(Math.log10(chars + 10) * 18));
      break;
    }
    case "generating": {
      const total = Math.max(1, input.toolsTotal);
      const doneRatio = input.toolsDone / total;
      next = Math.round(68 + doneRatio * 22);
      break;
    }
    case "finalizing":
      next = 94;
      break;
    case "completed":
      next = 100;
      break;
    case "error":
      next = previousProgress > 0 ? previousProgress : 0;
      break;
    default:
      next = 0;
  }

  if (phase === "idle") return 0;
  if (phase === "error") return next;
  return Math.max(previousProgress, Math.min(100, next));
}

export function deriveCopilotProcessingPhase(
  input: DeriveProcessingInput
): CopilotProcessingPhase {
  const busy =
    input.chatStatus === "submitted" || input.chatStatus === "streaming";

  if (input.hasError || input.timedOut || input.chatStatus === "error") {
    return "error";
  }

  if (input.offline && busy) {
    return "error";
  }

  if (busy) {
    if (
      input.chatStatus === "submitted" &&
      input.assistantTextLength === 0 &&
      input.toolsRunning === 0
    ) {
      return "queued";
    }
    if (input.documentToolsActive || input.toolsRunning > 0) {
      return "generating";
    }
    if (input.chatStatus === "streaming" || input.assistantTextLength > 0) {
      return "streaming";
    }
    return "queued";
  }

  // Post-busy transitions
  if (
    input.previousPhase === "streaming" ||
    input.previousPhase === "generating" ||
    input.previousPhase === "queued"
  ) {
    return "finalizing";
  }

  if (input.previousPhase === "finalizing") {
    return "completed";
  }

  if (input.previousPhase === "completed") {
    return "completed";
  }

  return "idle";
}

export function buildProcessingSnapshot(
  input: DeriveProcessingInput,
  opts?: { previousProgress?: number; tokenText?: string }
): CopilotProcessingSnapshot {
  const phase = deriveCopilotProcessingPhase(input);
  const progress = estimateProcessingProgress(
    input,
    opts?.previousProgress ?? 0
  );
  const tokenCount = countStreamTokens(opts?.tokenText ?? "");
  const degraded = input.offline || input.timedOut;

  return {
    phase,
    progress,
    tokenCount,
    elapsedMs: input.elapsedMs ?? 0,
    messageKey: phaseMessageKey(phase, degraded, input.timedOut),
    assertive: phase === "error",
    degraded,
    canCancel:
      phase === "queued" ||
      phase === "streaming" ||
      phase === "generating" ||
      phase === "finalizing",
    canRetry: phase === "error" || phase === "completed" || phase === "idle",
  };
}

export function phaseMessageKey(
  phase: CopilotProcessingPhase,
  degraded = false,
  timedOut = false
): string {
  if (phase === "error") {
    if (timedOut) return "copilot_proc_error_timeout";
    if (degraded) return "copilot_proc_error_offline";
    return "copilot_proc_error";
  }
  switch (phase) {
    case "queued":
      return "copilot_proc_queued";
    case "streaming":
      return "copilot_proc_streaming";
    case "generating":
      return "copilot_proc_generating";
    case "finalizing":
      return "copilot_proc_finalizing";
    case "completed":
      return "copilot_proc_completed";
    default:
      return "copilot_proc_idle";
  }
}

export type PersistedCopilotPartial = {
  missionId: string | null;
  partialText: string;
  phase: CopilotProcessingPhase;
  tokenCount: number;
  updatedAt: string;
  lastUserText?: string;
};

export function persistenceKey(missionId: string | null | undefined): string {
  return `${COPILOT_PROCESSING_STORAGE_PREFIX}${missionId || "default"}`;
}

export function serializePartial(
  data: PersistedCopilotPartial
): string {
  return JSON.stringify(data);
}

export function parsePartial(raw: string | null): PersistedCopilotPartial | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as PersistedCopilotPartial;
    if (typeof data.partialText !== "string") return null;
    if (!COPILOT_PROCESSING_PHASES.includes(data.phase)) return null;
    return data;
  } catch {
    return null;
  }
}

/** Advance finalizing → completed after hold; used by the hook tick. */
export function advanceTerminalPhase(
  phase: CopilotProcessingPhase,
  heldMs: number,
  holdMs = COPILOT_COMPLETED_HOLD_MS
): CopilotProcessingPhase {
  if (phase === "finalizing" && heldMs >= 400) return "completed";
  if (phase === "completed" && heldMs >= holdMs) return "idle";
  return phase;
}

export const DOCUMENT_TOOL_NAMES = new Set([
  "draftProposalSection",
  "generateProposal",
  "updateProposal",
  "createDocument",
  "rewriteSection",
  "exportProposal",
]);

export function isDocumentToolName(name: string): boolean {
  return DOCUMENT_TOOL_NAMES.has(name) || /proposal|document|draft|export/i.test(name);
}
