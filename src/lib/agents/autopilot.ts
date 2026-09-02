/**
 * Autopilot: the decisions behind "upload a tender and watch the bid appear".
 *
 * Pure on purpose. The surfaces — the upload panel, the dock's run pulse and
 * the agents page — ask these questions and act; the answers are testable
 * without a browser.
 */

/** Dispatched on `window` when a run starts anywhere, so the dock's pulse wakes. */
export const RUN_STARTED_EVENT = "arabclue:run-started";

/** Documents that describe the company rather than the tender. */
const NON_TENDER_CATEGORIES = new Set(["BRAND_ASSET"]);

export function shouldAutopilotRun(input: {
  autopilot: boolean;
  docCategory: string | null | undefined;
  activeRunStatus: string | null | undefined;
}): boolean {
  if (!input.autopilot) return false;
  if (NON_TENDER_CATEGORIES.has(String(input.docCategory ?? ""))) return false;
  // The run route refuses a second live run per project anyway; asking first
  // keeps a doomed request and its error toast off the screen.
  if (input.activeRunStatus === "RUNNING" || input.activeRunStatus === "QUEUED") return false;
  return true;
}

/** How often to poll a run's status, or null when there is nothing live to watch. */
export function runPulseIntervalMs(status: string | null | undefined): number | null {
  return status === "RUNNING" || status === "QUEUED" ? 3000 : null;
}

/**
 * A panel's refetch interval: the given cadence while a run is live for the
 * active project, off otherwise. The data these panels show — project status,
 * compliance rows, the stat counts — only changes while the agents write it;
 * the user's own actions invalidate the queries directly.
 */
export function liveDataPollMs(activeRunLive: boolean, everyMs: number): number | false {
  return activeRunLive ? everyMs : false;
}
