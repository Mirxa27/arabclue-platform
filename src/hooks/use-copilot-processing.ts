"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  advanceTerminalPhase,
  buildProcessingSnapshot,
  COPILOT_DEFAULT_TIMEOUT_MS,
  countStreamTokens,
  deriveCopilotProcessingPhase,
  isDocumentToolName,
  parsePartial,
  persistenceKey,
  serializePartial,
  type CopilotProcessingPhase,
  type CopilotProcessingSnapshot,
  type PersistedCopilotPartial,
} from "@/lib/copilot-processing";
import { isToolDone, isToolRunning } from "@/lib/agents/platform/mission-tool-parts";

type ToolLike = {
  name: string;
  state: string;
  preliminary?: boolean;
};

type MessageLike = {
  id: string;
  role: string;
  parts: Array<{ type: string; text?: string }>;
};

export type UseCopilotProcessingArgs = {
  chatStatus: string;
  error: Error | undefined | null;
  messages: MessageLike[];
  tools: ToolLike[];
  missionId: string | null;
  stop: () => void;
  /** Re-send last user turn */
  retryLast: (text: string) => void | Promise<void>;
  timeoutMs?: number;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
};

export type UseCopilotProcessingResult = {
  snapshot: CopilotProcessingSnapshot;
  phase: CopilotProcessingPhase;
  partialText: string;
  restoredFromStorage: boolean;
  online: boolean;
  onCancel: () => void;
  onRetry: () => void;
  clearPartial: () => void;
};

function lastAssistantText(messages: MessageLike[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    return m.parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text!)
      .join("\n");
  }
  return "";
}

function lastUserText(messages: MessageLike[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    return m.parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text!)
      .join("\n")
      .trim();
  }
  return "";
}

function getStorage(
  override?: UseCopilotProcessingArgs["storage"]
): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  if (override !== undefined) return override;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function useCopilotProcessing(
  args: UseCopilotProcessingArgs
): UseCopilotProcessingResult {
  const timeoutMs = args.timeoutMs ?? COPILOT_DEFAULT_TIMEOUT_MS;
  const storage = getStorage(args.storage);

  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [previousPhase, setPreviousPhase] =
    useState<CopilotProcessingPhase>("idle");
  const [phaseOverride, setPhaseOverride] =
    useState<CopilotProcessingPhase | null>(null);
  const [terminalHeldMs, setTerminalHeldMs] = useState(0);
  const [previousProgress, setPreviousProgress] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [restoredFromStorage, setRestoredFromStorage] = useState(false);
  const [restoredPartial, setRestoredPartial] = useState("");
  const lastUserRef = useRef("");

  const assistantText = lastAssistantText(args.messages);
  const partialText = assistantText || restoredPartial;

  const toolsRunning = args.tools.filter(
    (t) => isToolRunning(t.state) || t.preliminary
  ).length;
  const toolsDone = args.tools.filter(
    (t) => isToolDone(t.state) && !t.preliminary
  ).length;
  const documentToolsActive = args.tools.some(
    (t) =>
      isDocumentToolName(t.name) &&
      (isToolRunning(t.state) || t.preliminary)
  );

  const busy =
    args.chatStatus === "submitted" || args.chatStatus === "streaming";

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Restore partial after refresh
  useEffect(() => {
    if (!storage) return;
    const parsed = parsePartial(storage.getItem(persistenceKey(args.missionId)));
    if (!parsed?.partialText) return;
    // Only restore if fresher than 30 minutes
    const age = Date.now() - Date.parse(parsed.updatedAt);
    if (Number.isFinite(age) && age < 30 * 60_000) {
      setRestoredPartial(parsed.partialText);
      setRestoredFromStorage(true);
      if (parsed.lastUserText) lastUserRef.current = parsed.lastUserText;
    }
  }, [args.missionId, storage]);

  // Start / stop turn clock
  useEffect(() => {
    if (busy && turnStartedAt == null) {
      setTurnStartedAt(Date.now());
      setTimedOut(false);
      setTerminalHeldMs(0);
      setPhaseOverride(null);
      setPreviousProgress(0);
      const user = lastUserText(args.messages);
      if (user) lastUserRef.current = user;
    }
    if (!busy && turnStartedAt != null && !args.error && !timedOut) {
      // enter terminal sequence
      setPhaseOverride((prev) => prev ?? "finalizing");
    }
  }, [busy, turnStartedAt, args.error, timedOut, args.messages]);

  const stopRef = useRef(args.stop);
  stopRef.current = args.stop;

  // Elapsed + timeout + terminal hold tick
  useEffect(() => {
    if (turnStartedAt == null && !phaseOverride) return;
    const id = window.setInterval(() => {
      if (turnStartedAt != null) {
        const elapsed = Date.now() - turnStartedAt;
        setElapsedMs(elapsed);
        if (busy && elapsed >= timeoutMs) {
          setTimedOut(true);
          stopRef.current();
        }
      }
      if (phaseOverride === "finalizing" || phaseOverride === "completed") {
        setTerminalHeldMs((h) => h + 250);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [turnStartedAt, phaseOverride, busy, timeoutMs]);

  // Advance finalizing → completed → idle
  useEffect(() => {
    if (!phaseOverride) return;
    const next = advanceTerminalPhase(phaseOverride, terminalHeldMs);
    if (next !== phaseOverride) {
      setPhaseOverride(next === "idle" ? null : next);
      if (next === "idle") {
        setTurnStartedAt(null);
        setElapsedMs(0);
        setTerminalHeldMs(0);
        setPreviousPhase("idle");
        setPreviousProgress(0);
      }
    }
  }, [phaseOverride, terminalHeldMs]);

  const derivedPhase = useMemo(() => {
    if (phaseOverride) return phaseOverride;
    return deriveCopilotProcessingPhase({
      chatStatus: args.chatStatus,
      hasError: Boolean(args.error),
      offline: !online,
      timedOut,
      assistantTextLength: partialText.length,
      toolsRunning,
      toolsDone,
      toolsTotal: args.tools.length,
      documentToolsActive,
      previousPhase,
      elapsedMs: turnStartedAt ? elapsedMs : null,
    });
  }, [
    phaseOverride,
    args.chatStatus,
    args.error,
    online,
    timedOut,
    partialText.length,
    toolsRunning,
    toolsDone,
    args.tools.length,
    documentToolsActive,
    previousPhase,
    turnStartedAt,
    elapsedMs,
  ]);

  useEffect(() => {
    if (derivedPhase !== "idle" && derivedPhase !== previousPhase) {
      setPreviousPhase(derivedPhase);
    }
  }, [derivedPhase, previousPhase]);

  const snapshot = useMemo(() => {
    const snap = buildProcessingSnapshot(
      {
        chatStatus: args.chatStatus,
        hasError: Boolean(args.error) || timedOut || (!online && busy),
        offline: !online,
        timedOut,
        assistantTextLength: partialText.length,
        toolsRunning,
        toolsDone,
        toolsTotal: args.tools.length,
        documentToolsActive,
        previousPhase,
        elapsedMs: turnStartedAt ? elapsedMs : null,
      },
      { previousProgress, tokenText: partialText }
    );
    // Honor terminal overrides
    if (phaseOverride) {
      return {
        ...snap,
        phase: phaseOverride,
        progress:
          phaseOverride === "completed"
            ? 100
            : phaseOverride === "finalizing"
              ? Math.max(snap.progress, 94)
              : snap.progress,
        messageKey:
          phaseOverride === "completed"
            ? "copilot_proc_completed"
            : phaseOverride === "finalizing"
              ? "copilot_proc_finalizing"
              : snap.messageKey,
        canCancel: phaseOverride === "finalizing",
        canRetry: phaseOverride === "completed" || phaseOverride === "idle",
      };
    }
    return snap;
  }, [
    args.chatStatus,
    args.error,
    timedOut,
    online,
    busy,
    partialText,
    toolsRunning,
    toolsDone,
    args.tools.length,
    documentToolsActive,
    previousPhase,
    turnStartedAt,
    elapsedMs,
    previousProgress,
    phaseOverride,
  ]);

  useEffect(() => {
    setPreviousProgress((p) =>
      snapshot.phase === "idle" ? 0 : Math.max(p, snapshot.progress)
    );
  }, [snapshot.phase, snapshot.progress]);

  // Persist partial stream
  useEffect(() => {
    if (!storage) return;
    if (
      snapshot.phase === "streaming" ||
      snapshot.phase === "generating" ||
      snapshot.phase === "queued"
    ) {
      const payload: PersistedCopilotPartial = {
        missionId: args.missionId,
        partialText,
        phase: snapshot.phase,
        tokenCount: countStreamTokens(partialText),
        updatedAt: new Date().toISOString(),
        lastUserText: lastUserRef.current || undefined,
      };
      try {
        storage.setItem(
          persistenceKey(args.missionId),
          serializePartial(payload)
        );
      } catch {
        /* quota */
      }
    }
    if (snapshot.phase === "completed" || snapshot.phase === "idle") {
      try {
        storage.removeItem(persistenceKey(args.missionId));
      } catch {
        /* ignore */
      }
      if (snapshot.phase === "completed") setRestoredPartial("");
    }
  }, [storage, snapshot.phase, partialText, args.missionId]);

  const clearPartial = useCallback(() => {
    setRestoredPartial("");
    setRestoredFromStorage(false);
    try {
      storage?.removeItem(persistenceKey(args.missionId));
    } catch {
      /* ignore */
    }
  }, [storage, args.missionId]);

  const onCancel = useCallback(() => {
    args.stop();
    setTimedOut(false);
    setPhaseOverride("finalizing");
    setTerminalHeldMs(0);
  }, [args]);

  const onRetry = useCallback(() => {
    const text = lastUserRef.current || lastUserText(args.messages);
    clearPartial();
    setTimedOut(false);
    setPhaseOverride(null);
    setTurnStartedAt(null);
    setPreviousPhase("idle");
    setPreviousProgress(0);
    if (text) void args.retryLast(text);
  }, [args, clearPartial]);

  return {
    snapshot,
    phase: snapshot.phase,
    partialText,
    restoredFromStorage,
    online,
    onCancel,
    onRetry,
    clearPartial,
  };
}
