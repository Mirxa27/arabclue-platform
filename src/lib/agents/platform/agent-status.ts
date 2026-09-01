/**
 * The single status the Agent screen reports.
 *
 * Three widgets used to answer this question independently and disagree; see
 * `src/lib/__tests__/agent-status.test.ts` for the production capture. Only the
 * header pill renders it now, and it renders this.
 */

export const AGENT_STATUSES = ["offline", "connecting", "ready", "working"] as const;

export type AgentStatus = (typeof AGENT_STATUSES)[number];

/** What the live voice transport reports about itself. */
export type LiveTransport = "disconnected" | "connecting" | "connected";

/**
 * When there is a transport, the transport decides.
 *
 * `performing` is the classic console's own run state. In live mode it is stale
 * — the work happens on a socket the console never sees — so it only gets a
 * vote once that socket is up.
 */
export function resolveAgentStatus(input: {
  live: boolean;
  liveTransport?: LiveTransport;
  performing: boolean;
}): AgentStatus {
  if (!input.live) return input.performing ? "working" : "ready";

  switch (input.liveTransport ?? "disconnected") {
    case "connecting":
      return "connecting";
    case "connected":
      return input.performing ? "working" : "ready";
    default:
      return "offline";
  }
}

const LABELS: Record<AgentStatus, { ar: string; en: string }> = {
  offline: { ar: "غير متصل", en: "Not connected" },
  connecting: { ar: "يتصل…", en: "Connecting…" },
  ready: { ar: "جاهز", en: "Ready" },
  working: { ar: "ينفّذ", en: "Working" },
};

export function agentStatusLabel(status: AgentStatus, locale: "ar" | "en"): string {
  return LABELS[status][locale];
}
