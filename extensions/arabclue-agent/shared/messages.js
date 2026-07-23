/** Shared message types for ArabClue Voice Agent extension (MV3). */

export const MSG = {
  GET_PAGE_CONTEXT: "GET_PAGE_CONTEXT",
  CAPTURE_SCREENSHOT: "CAPTURE_SCREENSHOT",
  SEND_TO_AGENT: "SEND_TO_AGENT",
  GET_SETTINGS: "GET_SETTINGS",
  SET_SETTINGS: "SET_SETTINGS",
  PING: "PING",
  AGENT_EVENT: "AGENT_EVENT",
  OPEN_MISSION_CONTROL: "OPEN_MISSION_CONTROL",
  GET_QUEUE_STATUS: "GET_QUEUE_STATUS",
  FLUSH_QUEUE: "FLUSH_QUEUE",
};

export const DEFAULT_SETTINGS = {
  apiBase: "https://arabclue.com",
  locale: "en",
  autoOpenDashboard: true,
};

/**
 * Normalize user-entered API base to origin only.
 * Fixes common mistake of pasting https://arabclue.com/app
 */
export function normalizeApiBase(raw) {
  const fallback = DEFAULT_SETTINGS.apiBase;
  if (!raw || typeof raw !== "string") return fallback;
  let value = raw.trim().replace(/\/+$/, "");
  if (!value) return fallback;
  try {
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
    const u = new URL(value);
    // Strip accidental /app or other paths — ingest lives at origin root.
    return u.origin;
  } catch {
    return fallback;
  }
}
