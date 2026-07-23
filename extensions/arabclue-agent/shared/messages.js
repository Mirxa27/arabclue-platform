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
