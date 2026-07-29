import { describe, expect, test } from "bun:test";
import {
  COPILOT_PROCESSING_PHASES,
  COPILOT_PROCESSING_STORAGE_PREFIX,
  COPILOT_DEFAULT_TIMEOUT_MS,
  COPILOT_COMPLETED_HOLD_MS,
  DOCUMENT_TOOL_NAMES,
  type CopilotProcessingPhase,
  type DeriveProcessingInput,
  countStreamTokens,
  formatElapsed,
  estimateProcessingProgress,
  deriveCopilotProcessingPhase,
  buildProcessingSnapshot,
  phaseMessageKey,
  persistenceKey,
  serializePartial,
  parsePartial,
  advanceTerminalPhase,
  isDocumentToolName,
  type PersistedCopilotPartial,
} from "../copilot-processing";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseInput(overrides: Partial<DeriveProcessingInput> = {}): DeriveProcessingInput {
  return {
    chatStatus: "ready",
    hasError: false,
    offline: false,
    timedOut: false,
    assistantTextLength: 0,
    toolsRunning: 0,
    toolsDone: 0,
    toolsTotal: 0,
    documentToolsActive: false,
    previousPhase: "idle",
    elapsedMs: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("copilot-processing constants", () => {
  test("COPILOT_PROCESSING_PHASES lists all phases in order", () => {
    expect(COPILOT_PROCESSING_PHASES).toEqual([
      "idle",
      "queued",
      "streaming",
      "generating",
      "finalizing",
      "error",
      "completed",
    ]);
  });

  test("storage prefix and timeout constants are stable", () => {
    expect(COPILOT_PROCESSING_STORAGE_PREFIX).toBe("arabclue.copilot.partial.");
    expect(COPILOT_DEFAULT_TIMEOUT_MS).toBe(180_000);
    expect(COPILOT_COMPLETED_HOLD_MS).toBe(2_400);
  });

  test("DOCUMENT_TOOL_NAMES contains expected tool names", () => {
    expect(DOCUMENT_TOOL_NAMES.has("draftProposalSection")).toBe(true);
    expect(DOCUMENT_TOOL_NAMES.has("generateProposal")).toBe(true);
    expect(DOCUMENT_TOOL_NAMES.has("updateProposal")).toBe(true);
    expect(DOCUMENT_TOOL_NAMES.has("createDocument")).toBe(true);
    expect(DOCUMENT_TOOL_NAMES.has("rewriteSection")).toBe(true);
    expect(DOCUMENT_TOOL_NAMES.has("exportProposal")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// countStreamTokens
// ---------------------------------------------------------------------------

describe("countStreamTokens", () => {
  test("returns 0 for empty or whitespace-only text", () => {
    expect(countStreamTokens("")).toBe(0);
    expect(countStreamTokens("   ")).toBe(0);
    expect(countStreamTokens("\t\n")).toBe(0);
  });

  test("counts whitespace-separated tokens", () => {
    expect(countStreamTokens("hello world")).toBe(2);
    expect(countStreamTokens("one two three four five")).toBe(5);
  });

  test("handles leading/trailing whitespace", () => {
    expect(countStreamTokens("  hello  world  ")).toBe(2);
  });

  test("returns 1 for a single word", () => {
    expect(countStreamTokens("procurement")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// formatElapsed
// ---------------------------------------------------------------------------

describe("formatElapsed", () => {
  test("formats seconds under a minute", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(5_000)).toBe("0:05");
    expect(formatElapsed(59_999)).toBe("0:59");
  });

  test("formats minutes and seconds", () => {
    expect(formatElapsed(60_000)).toBe("1:00");
    expect(formatElapsed(90_000)).toBe("1:30");
    expect(formatElapsed(125_999)).toBe("2:05");
  });

  test("clamps negative values to zero", () => {
    expect(formatElapsed(-1_000)).toBe("0:00");
    expect(formatElapsed(-500)).toBe("0:00");
  });
});

// ---------------------------------------------------------------------------
// deriveCopilotProcessingPhase
// ---------------------------------------------------------------------------

describe("deriveCopilotProcessingPhase", () => {
  test("returns idle when not busy and previousPhase is idle", () => {
    expect(deriveCopilotProcessingPhase(baseInput())).toBe("idle");
  });

  test("returns error when hasError is true", () => {
    expect(
      deriveCopilotProcessingPhase(baseInput({ hasError: true }))
    ).toBe("error");
  });

  test("returns error when chatStatus is error", () => {
    expect(
      deriveCopilotProcessingPhase(baseInput({ chatStatus: "error" }))
    ).toBe("error");
  });

  test("returns error when timedOut is true", () => {
    expect(
      deriveCopilotProcessingPhase(baseInput({ timedOut: true }))
    ).toBe("error");
  });

  test("returns error when offline and busy", () => {
    expect(
      deriveCopilotProcessingPhase(
        baseInput({ offline: true, chatStatus: "submitted" })
      )
    ).toBe("error");
    expect(
      deriveCopilotProcessingPhase(
        baseInput({ offline: true, chatStatus: "streaming" })
      )
    ).toBe("error");
  });

  test("returns queued when submitted with no text and no tools running", () => {
    expect(
      deriveCopilotProcessingPhase(
        baseInput({ chatStatus: "submitted", assistantTextLength: 0, toolsRunning: 0 })
      )
    ).toBe("queued");
  });

  test("returns generating when documentToolsActive is true", () => {
    expect(
      deriveCopilotProcessingPhase(
        baseInput({ chatStatus: "streaming", documentToolsActive: true })
      )
    ).toBe("generating");
  });

  test("returns generating when toolsRunning > 0", () => {
    expect(
      deriveCopilotProcessingPhase(
        baseInput({ chatStatus: "streaming", toolsRunning: 2 })
      )
    ).toBe("generating");
  });

  test("returns streaming when chatStatus is streaming and text exists", () => {
    expect(
      deriveCopilotProcessingPhase(
        baseInput({ chatStatus: "streaming", assistantTextLength: 50 })
      )
    ).toBe("streaming");
  });

  test("returns streaming when chatStatus is streaming with no tools", () => {
    expect(
      deriveCopilotProcessingPhase(
        baseInput({ chatStatus: "streaming", assistantTextLength: 10, toolsRunning: 0 })
      )
    ).toBe("streaming");
  });

  test("returns streaming when submitted with text and no tools running", () => {
    // submitted + assistantTextLength > 0 + no tools → falls through to streaming
    expect(
      deriveCopilotProcessingPhase(
        baseInput({ chatStatus: "submitted", assistantTextLength: 5, toolsRunning: 0 })
      )
    ).toBe("streaming");
  });

  test("post-busy: previousPhase streaming → finalizing", () => {
    expect(
      deriveCopilotProcessingPhase(
        baseInput({ chatStatus: "ready", previousPhase: "streaming" })
      )
    ).toBe("finalizing");
  });

  test("post-busy: previousPhase generating → finalizing", () => {
    expect(
      deriveCopilotProcessingPhase(
        baseInput({ chatStatus: "ready", previousPhase: "generating" })
      )
    ).toBe("finalizing");
  });

  test("post-busy: previousPhase queued → finalizing", () => {
    expect(
      deriveCopilotProcessingPhase(
        baseInput({ chatStatus: "ready", previousPhase: "queued" })
      )
    ).toBe("finalizing");
  });

  test("post-busy: previousPhase finalizing → completed", () => {
    expect(
      deriveCopilotProcessingPhase(
        baseInput({ chatStatus: "ready", previousPhase: "finalizing" })
      )
    ).toBe("completed");
  });

  test("post-busy: previousPhase completed → completed", () => {
    expect(
      deriveCopilotProcessingPhase(
        baseInput({ chatStatus: "ready", previousPhase: "completed" })
      )
    ).toBe("completed");
  });

  test("post-busy: previousPhase idle → idle", () => {
    expect(
      deriveCopilotProcessingPhase(
        baseInput({ chatStatus: "ready", previousPhase: "idle" })
      )
    ).toBe("idle");
  });
});

// ---------------------------------------------------------------------------
// estimateProcessingProgress
// ---------------------------------------------------------------------------

describe("estimateProcessingProgress", () => {
  test("returns 0 for idle phase", () => {
    expect(estimateProcessingProgress(baseInput())).toBe(0);
  });

  test("returns 8 for queued phase", () => {
    const input = baseInput({ chatStatus: "submitted", assistantTextLength: 0, toolsRunning: 0 });
    expect(estimateProcessingProgress(input)).toBe(8);
  });

  test("streaming progress scales with text length and is capped at 68", () => {
    const input = baseInput({ chatStatus: "streaming", assistantTextLength: 100 });
    const progress = estimateProcessingProgress(input);
    expect(progress).toBeGreaterThan(18);
    expect(progress).toBeLessThanOrEqual(68);
  });

  test("streaming progress never exceeds 68", () => {
    const input = baseInput({ chatStatus: "streaming", assistantTextLength: 100_000 });
    expect(estimateProcessingProgress(input)).toBeLessThanOrEqual(68);
  });

  test("generating progress is between 68 and 90 based on tool completion", () => {
    const input = baseInput({
      chatStatus: "streaming",
      toolsRunning: 1,
      toolsDone: 0,
      toolsTotal: 4,
      documentToolsActive: true,
    });
    const progress = estimateProcessingProgress(input);
    expect(progress).toBeGreaterThanOrEqual(68);
    expect(progress).toBeLessThanOrEqual(90);
  });

  test("generating progress reaches 90 when all tools done", () => {
    const input = baseInput({
      chatStatus: "streaming",
      toolsRunning: 0,
      toolsDone: 4,
      toolsTotal: 4,
      documentToolsActive: true,
    });
    expect(estimateProcessingProgress(input)).toBe(90);
  });

  test("finalizing returns 94", () => {
    const input = baseInput({ chatStatus: "ready", previousPhase: "streaming" });
    expect(estimateProcessingProgress(input)).toBe(94);
  });

  test("completed returns 100", () => {
    const input = baseInput({ chatStatus: "ready", previousPhase: "finalizing" });
    expect(estimateProcessingProgress(input)).toBe(100);
  });

  test("error returns previousProgress when > 0", () => {
    const input = baseInput({ hasError: true });
    expect(estimateProcessingProgress(input, 42)).toBe(42);
  });

  test("error returns 0 when previousProgress is 0", () => {
    const input = baseInput({ hasError: true });
    expect(estimateProcessingProgress(input, 0)).toBe(0);
  });

  test("progress never regresses within a turn", () => {
    const input = baseInput({ chatStatus: "submitted", assistantTextLength: 0, toolsRunning: 0 });
    // queued = 8, but previousProgress is 50 → should stay at 50
    expect(estimateProcessingProgress(input, 50)).toBe(50);
  });

  test("idle always returns 0 regardless of previousProgress", () => {
    expect(estimateProcessingProgress(baseInput(), 80)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildProcessingSnapshot
// ---------------------------------------------------------------------------

describe("buildProcessingSnapshot", () => {
  test("builds a complete snapshot for idle", () => {
    const snap = buildProcessingSnapshot(baseInput({ elapsedMs: 0 }));
    expect(snap.phase).toBe("idle");
    expect(snap.progress).toBe(0);
    expect(snap.tokenCount).toBe(0);
    expect(snap.elapsedMs).toBe(0);
    expect(snap.messageKey).toBe("copilot_proc_idle");
    expect(snap.assertive).toBe(false);
    expect(snap.degraded).toBe(false);
    expect(snap.canCancel).toBe(false);
    expect(snap.canRetry).toBe(true);
  });

  test("builds a snapshot for queued", () => {
    const snap = buildProcessingSnapshot(
      baseInput({ chatStatus: "submitted", elapsedMs: 500 }),
      { tokenText: "hello" }
    );
    expect(snap.phase).toBe("queued");
    expect(snap.progress).toBe(8);
    expect(snap.tokenCount).toBe(1);
    expect(snap.elapsedMs).toBe(500);
    expect(snap.messageKey).toBe("copilot_proc_queued");
    expect(snap.canCancel).toBe(true);
    expect(snap.canRetry).toBe(false);
  });

  test("builds a snapshot for streaming with tokenText", () => {
    const snap = buildProcessingSnapshot(
      baseInput({ chatStatus: "streaming", assistantTextLength: 50, elapsedMs: 3_000 }),
      { tokenText: "one two three four" }
    );
    expect(snap.phase).toBe("streaming");
    expect(snap.tokenCount).toBe(4);
    expect(snap.elapsedMs).toBe(3_000);
    expect(snap.messageKey).toBe("copilot_proc_streaming");
    expect(snap.canCancel).toBe(true);
  });

  test("builds a snapshot for generating", () => {
    const snap = buildProcessingSnapshot(
      baseInput({
        chatStatus: "streaming",
        toolsRunning: 1,
        toolsDone: 1,
        toolsTotal: 3,
        documentToolsActive: true,
        elapsedMs: 10_000,
      })
    );
    expect(snap.phase).toBe("generating");
    expect(snap.messageKey).toBe("copilot_proc_generating");
    expect(snap.canCancel).toBe(true);
  });

  test("builds a snapshot for finalizing", () => {
    const snap = buildProcessingSnapshot(
      baseInput({ chatStatus: "ready", previousPhase: "streaming", elapsedMs: 15_000 })
    );
    expect(snap.phase).toBe("finalizing");
    expect(snap.progress).toBe(94);
    expect(snap.messageKey).toBe("copilot_proc_finalizing");
    expect(snap.canCancel).toBe(true);
  });

  test("builds a snapshot for completed", () => {
    const snap = buildProcessingSnapshot(
      baseInput({ chatStatus: "ready", previousPhase: "finalizing", elapsedMs: 20_000 })
    );
    expect(snap.phase).toBe("completed");
    expect(snap.progress).toBe(100);
    expect(snap.messageKey).toBe("copilot_proc_completed");
    expect(snap.canCancel).toBe(false);
    expect(snap.canRetry).toBe(true);
  });

  test("builds a snapshot for error with assertive flag", () => {
    const snap = buildProcessingSnapshot(
      baseInput({ hasError: true, elapsedMs: 5_000 })
    );
    expect(snap.phase).toBe("error");
    expect(snap.assertive).toBe(true);
    expect(snap.degraded).toBe(false);
    expect(snap.canRetry).toBe(true);
    expect(snap.canCancel).toBe(false);
  });

  test("degraded flag is true when offline", () => {
    const snap = buildProcessingSnapshot(
      baseInput({ offline: true, chatStatus: "ready" })
    );
    expect(snap.degraded).toBe(true);
  });

  test("degraded flag is true when timedOut", () => {
    const snap = buildProcessingSnapshot(
      baseInput({ timedOut: true })
    );
    expect(snap.degraded).toBe(true);
  });

  test("uses previousProgress from opts", () => {
    const snap = buildProcessingSnapshot(
      baseInput({ chatStatus: "submitted", assistantTextLength: 0, toolsRunning: 0 }),
      { previousProgress: 50 }
    );
    // queued = 8, but previousProgress = 50 → stays at 50
    expect(snap.progress).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// phaseMessageKey
// ---------------------------------------------------------------------------

describe("phaseMessageKey", () => {
  test("returns correct keys for each phase", () => {
    expect(phaseMessageKey("idle")).toBe("copilot_proc_idle");
    expect(phaseMessageKey("queued")).toBe("copilot_proc_queued");
    expect(phaseMessageKey("streaming")).toBe("copilot_proc_streaming");
    expect(phaseMessageKey("generating")).toBe("copilot_proc_generating");
    expect(phaseMessageKey("finalizing")).toBe("copilot_proc_finalizing");
    expect(phaseMessageKey("completed")).toBe("copilot_proc_completed");
  });

  test("returns generic error key for error phase", () => {
    expect(phaseMessageKey("error")).toBe("copilot_proc_error");
  });

  test("returns timeout error key when timedOut is true", () => {
    expect(phaseMessageKey("error", false, true)).toBe("copilot_proc_error_timeout");
  });

  test("returns offline error key when degraded is true and not timedOut", () => {
    expect(phaseMessageKey("error", true, false)).toBe("copilot_proc_error_offline");
  });

  test("timeout takes precedence over degraded", () => {
    expect(phaseMessageKey("error", true, true)).toBe("copilot_proc_error_timeout");
  });
});

// ---------------------------------------------------------------------------
// persistenceKey
// ---------------------------------------------------------------------------

describe("persistenceKey", () => {
  test("builds key with missionId", () => {
    expect(persistenceKey("mission-123")).toBe(
      `${COPILOT_PROCESSING_STORAGE_PREFIX}mission-123`
    );
  });

  test("uses 'default' for null/undefined missionId", () => {
    expect(persistenceKey(null)).toBe(`${COPILOT_PROCESSING_STORAGE_PREFIX}default`);
    expect(persistenceKey(undefined)).toBe(`${COPILOT_PROCESSING_STORAGE_PREFIX}default`);
  });

  test("uses 'default' for empty string", () => {
    expect(persistenceKey("")).toBe(`${COPILOT_PROCESSING_STORAGE_PREFIX}default`);
  });
});

// ---------------------------------------------------------------------------
// serializePartial / parsePartial
// ---------------------------------------------------------------------------

describe("serializePartial / parsePartial", () => {
  const validPartial: PersistedCopilotPartial = {
    missionId: "mission-1",
    partialText: "Hello world",
    phase: "streaming",
    tokenCount: 2,
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastUserText: "List my projects",
  };

  test("serializePartial produces valid JSON string", () => {
    const raw = serializePartial(validPartial);
    expect(typeof raw).toBe("string");
    expect(JSON.parse(raw)).toEqual(validPartial);
  });

  test("parsePartial round-trips serialized data", () => {
    const raw = serializePartial(validPartial);
    const parsed = parsePartial(raw);
    expect(parsed).toEqual(validPartial);
  });

  test("parsePartial returns null for null input", () => {
    expect(parsePartial(null)).toBeNull();
  });

  test("parsePartial returns null for empty string", () => {
    expect(parsePartial("")).toBeNull();
  });

  test("parsePartial returns null for invalid JSON", () => {
    expect(parsePartial("{not valid json")).toBeNull();
  });

  test("parsePartial returns null when partialText is not a string", () => {
    const bad = JSON.stringify({ ...validPartial, partialText: 123 });
    expect(parsePartial(bad)).toBeNull();
  });

  test("parsePartial returns null when phase is invalid", () => {
    const bad = JSON.stringify({ ...validPartial, phase: "nonexistent" });
    expect(parsePartial(bad)).toBeNull();
  });

  test("parsePartial accepts a valid phase from the constant list", () => {
    for (const phase of COPILOT_PROCESSING_PHASES) {
      const data: PersistedCopilotPartial = { ...validPartial, phase };
      expect(parsePartial(serializePartial(data))).not.toBeNull();
    }
  });

  test("parsePartial handles missing optional lastUserText", () => {
    const data: PersistedCopilotPartial = {
      missionId: null,
      partialText: "text",
      phase: "idle",
      tokenCount: 0,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const parsed = parsePartial(serializePartial(data));
    expect(parsed).toEqual(data);
    expect(parsed?.lastUserText).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// advanceTerminalPhase
// ---------------------------------------------------------------------------

describe("advanceTerminalPhase", () => {
  test("advances finalizing to completed after 400ms hold", () => {
    expect(advanceTerminalPhase("finalizing", 400)).toBe("completed");
    expect(advanceTerminalPhase("finalizing", 500)).toBe("completed");
  });

  test("does not advance finalizing before 400ms", () => {
    expect(advanceTerminalPhase("finalizing", 399)).toBe("finalizing");
    expect(advanceTerminalPhase("finalizing", 0)).toBe("finalizing");
  });

  test("advances completed to idle after default hold (2400ms)", () => {
    expect(advanceTerminalPhase("completed", 2_400)).toBe("idle");
    expect(advanceTerminalPhase("completed", 3_000)).toBe("idle");
  });

  test("does not advance completed before default hold", () => {
    expect(advanceTerminalPhase("completed", 2_399)).toBe("completed");
  });

  test("respects custom holdMs", () => {
    expect(advanceTerminalPhase("completed", 1_000, 1_000)).toBe("idle");
    expect(advanceTerminalPhase("completed", 999, 1_000)).toBe("completed");
  });

  test("returns unchanged for non-terminal phases", () => {
    expect(advanceTerminalPhase("idle", 10_000)).toBe("idle");
    expect(advanceTerminalPhase("queued", 10_000)).toBe("queued");
    expect(advanceTerminalPhase("streaming", 10_000)).toBe("streaming");
    expect(advanceTerminalPhase("generating", 10_000)).toBe("generating");
    expect(advanceTerminalPhase("error", 10_000)).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// isDocumentToolName
// ---------------------------------------------------------------------------

describe("isDocumentToolName", () => {
  test("returns true for exact tool names in the set", () => {
    expect(isDocumentToolName("draftProposalSection")).toBe(true);
    expect(isDocumentToolName("generateProposal")).toBe(true);
    expect(isDocumentToolName("updateProposal")).toBe(true);
    expect(isDocumentToolName("createDocument")).toBe(true);
    expect(isDocumentToolName("rewriteSection")).toBe(true);
    expect(isDocumentToolName("exportProposal")).toBe(true);
  });

  test("returns true for names matching proposal/document/draft/export pattern", () => {
    expect(isDocumentToolName("customProposalTool")).toBe(true);
    expect(isDocumentToolName("myDocumentGenerator")).toBe(true);
    expect(isDocumentToolName("draftSectionV2")).toBe(true);
    expect(isDocumentToolName("exportToPdf")).toBe(true);
  });

  test("returns false for unrelated tool names", () => {
    expect(isDocumentToolName("search")).toBe(false);
    expect(isDocumentToolName("navigate")).toBe(false);
    expect(isDocumentToolName("chat")).toBe(false);
    expect(isDocumentToolName("")).toBe(false);
  });
});
