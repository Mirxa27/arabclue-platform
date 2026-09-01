/**
 * One agent status, one place on screen.
 *
 * Observed on production `/app` on 2026-09-01, all three at once, in live mode:
 *
 *   - the header pill said  "Ready"        (mission-control-shell.tsx:134)
 *   - the session badge said "Disconnected" (live-voice-session.tsx:438)
 *   - the activity ticker said "READY"      (mission-action-ticker.tsx:132)
 *
 * Three widgets, three claims, and the only one that reflected reality was the
 * middle one. The header pill was fed `performing` from the *classic* console —
 * `busy || listening || theaterTools.some(running)` — which stays false for the
 * whole of a live session, because a live session's work happens on the
 * realtime transport the console cannot see. So the pill said "Ready" about a
 * session that could not accept a word until you pressed Connect.
 *
 * The rule: when there is a transport, the transport decides. `performing` only
 * gets a vote once the transport is actually up.
 */

import { describe, expect, test } from "bun:test";
import {
  AGENT_STATUSES,
  agentStatusLabel,
  resolveAgentStatus,
} from "../agents/platform/agent-status";

describe("resolveAgentStatus", () => {
  test("classic chat is ready when idle", () => {
    expect(resolveAgentStatus({ live: false, performing: false })).toBe("ready");
  });

  test("classic chat is working while a run is in flight", () => {
    expect(resolveAgentStatus({ live: true, performing: true, liveTransport: "connected" })).toBe(
      "working"
    );
    expect(resolveAgentStatus({ live: false, performing: true })).toBe("working");
  });

  test("classic chat is never offline", () => {
    // There is no socket to lose: it is a request per turn. Reporting "offline"
    // here would be the same lie in the other direction.
    expect(resolveAgentStatus({ live: false, performing: false, liveTransport: "disconnected" })).toBe(
      "ready"
    );
  });

  test("a live session with no transport is offline, not ready", () => {
    // The defect, exactly as screenshotted.
    expect(
      resolveAgentStatus({ live: true, liveTransport: "disconnected", performing: false })
    ).toBe("offline");
  });

  test("a stale performing flag cannot make a dead transport look busy", () => {
    // `performing` in live mode is the classic console's leftover state. It must
    // not outvote the transport.
    expect(
      resolveAgentStatus({ live: true, liveTransport: "disconnected", performing: true })
    ).toBe("offline");
  });

  test("connecting is its own state, not ready and not offline", () => {
    expect(
      resolveAgentStatus({ live: true, liveTransport: "connecting", performing: false })
    ).toBe("connecting");
    expect(
      resolveAgentStatus({ live: true, liveTransport: "connecting", performing: true })
    ).toBe("connecting");
  });

  test("a connected but quiet session is ready", () => {
    expect(
      resolveAgentStatus({ live: true, liveTransport: "connected", performing: false })
    ).toBe("ready");
  });

  test("live mode with no transport reported yet is offline", () => {
    // Before LiveVoiceSession mounts and reports up, nothing is connected.
    expect(resolveAgentStatus({ live: true, performing: false })).toBe("offline");
  });
});

describe("agentStatusLabel", () => {
  test("every status has a distinct label in both locales", () => {
    for (const locale of ["ar", "en"] as const) {
      const labels = AGENT_STATUSES.map((s) => agentStatusLabel(s, locale));
      expect(labels.every((l) => l.trim().length > 0)).toBe(true);
      expect(new Set(labels).size).toBe(AGENT_STATUSES.length);
    }
  });

  test("Arabic and English do not collide", () => {
    // Guards the copy/paste failure where one locale silently falls back.
    for (const status of AGENT_STATUSES) {
      expect(agentStatusLabel(status, "ar")).not.toBe(agentStatusLabel(status, "en"));
    }
  });

  test("the four statuses are the whole vocabulary", () => {
    expect([...AGENT_STATUSES]).toEqual(["offline", "connecting", "ready", "working"]);
  });
});
