/**
 * Why a pipeline run failed, as a stable kind the UI can speak to.
 *
 * `AgentRun.errorMessage` keeps the operator's breadcrumb — provider, step,
 * guardrail reason — and stays English by design. `AgentRun.failureKind` is
 * what a bidder is told about, in their language, via the copy keys below.
 * The column existed with this contract and nothing wrote it.
 *
 * Duck-typed on purpose: the orchestrator's cancellation error and the AI
 * layer's provider error are recognised by shape, so this module stays free
 * of both and testable on its own.
 */
export type AgentRunFailureKind =
  | "PROVIDER_UNAVAILABLE"
  | "RATE_LIMIT"
  | "INVALID_INPUT"
  | "TIMEOUT"
  | "INTERNAL"
  | "USER_CANCELLED";

export const RUN_FAILURE_COPY_KEYS: Record<AgentRunFailureKind, string> = {
  PROVIDER_UNAVAILABLE: "agent_run_failure_provider_unavailable",
  RATE_LIMIT: "agent_run_failure_rate_limit",
  INVALID_INPUT: "agent_run_failure_invalid_input",
  TIMEOUT: "agent_run_failure_timeout",
  INTERNAL: "agent_run_failure_internal",
  USER_CANCELLED: "agent_run_failure_cancelled",
};

export function classifyRunFailure(err: unknown): AgentRunFailureKind {
  if (!err || typeof err !== "object") return "INTERNAL";
  const e = err as {
    name?: unknown;
    message?: unknown;
    failureKind?: unknown;
    llmFailureKind?: unknown;
  };
  if (e.name === "PipelineCancelledError") return "USER_CANCELLED";
  if (e.failureKind === "PROVIDER_UNAVAILABLE") {
    if (e.llmFailureKind === "rate_limited") return "RATE_LIMIT";
    if (e.llmFailureKind === "timeout") return "TIMEOUT";
    return "PROVIDER_UNAVAILABLE";
  }
  const message = typeof e.message === "string" ? e.message : "";
  if (/no documents uploaded/i.test(message)) return "INVALID_INPUT";
  if (/timed out|execution window/i.test(message)) return "TIMEOUT";
  return "INTERNAL";
}

/** The translation key for a stored kind; unknown or missing kinds read as internal. */
export function runFailureCopyKey(kind: string | null | undefined): string {
  return (
    (kind && (RUN_FAILURE_COPY_KEYS as Record<string, string>)[kind]) ||
    RUN_FAILURE_COPY_KEYS.INTERNAL
  );
}
