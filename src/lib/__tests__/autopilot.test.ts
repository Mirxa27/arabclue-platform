/**
 * Sit back and watch.
 *
 * With the pipeline finally completing on real providers, the remaining
 * distance between "upload a tender" and "read the proposal" was three
 * manual steps on three screens: go to Agents, press Run, come back later
 * and find the proposal. Autopilot closes it: one persisted switch, on by
 * default, that runs the agents when a tender document lands, shows the run's
 * pulse on every page while they work, and opens the proposal when they
 * finish. Every visible motion is driven by the real run state the status
 * route reports — nothing animates on a timer alone.
 *
 * The decisions are pure and tested here; the wiring is ratcheted by source.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  shouldAutopilotRun,
  runPulseIntervalMs,
  RUN_STARTED_EVENT,
} from "../agents/autopilot";
import {
  DEFAULT_UI_PREFERENCES,
  UI_PERSIST_OPTIONS,
  sanitizePersistedUI,
} from "../store";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("shouldAutopilotRun", () => {
  test("a tender document with the switch on and no live run starts one", () => {
    for (const docCategory of ["RFP", "TECHNICAL_SPECS", "QUALIFICATION", "FINANCIAL", "EA_COMPLIANCE", "IT_CONTRACT", "OTHER"]) {
      expect(
        shouldAutopilotRun({ autopilot: true, docCategory, activeRunStatus: null }),
        docCategory,
      ).toBe(true);
    }
  });

  test("a brand asset is not a tender — a logo never starts a bid", () => {
    expect(shouldAutopilotRun({ autopilot: true, docCategory: "BRAND_ASSET", activeRunStatus: null })).toBe(false);
  });

  test("the switch off, or a run already live, means no second run", () => {
    expect(shouldAutopilotRun({ autopilot: false, docCategory: "RFP", activeRunStatus: null })).toBe(false);
    expect(shouldAutopilotRun({ autopilot: true, docCategory: "RFP", activeRunStatus: "RUNNING" })).toBe(false);
    expect(shouldAutopilotRun({ autopilot: true, docCategory: "RFP", activeRunStatus: "QUEUED" })).toBe(false);
    expect(shouldAutopilotRun({ autopilot: true, docCategory: "RFP", activeRunStatus: "COMPLETED" })).toBe(true);
  });
});

describe("runPulseIntervalMs", () => {
  test("polls while a run is live and stops when it is not", () => {
    expect(runPulseIntervalMs("RUNNING")).toBe(3000);
    expect(runPulseIntervalMs("QUEUED")).toBe(3000);
    for (const done of ["COMPLETED", "FAILED", "CANCELLED", null, undefined, "weird"]) {
      expect(runPulseIntervalMs(done), String(done)).toBeNull();
    }
  });

  test("the run-started event has a namespaced name", () => {
    expect(RUN_STARTED_EVENT).toBe("arabclue:run-started");
  });
});

describe("the switch is a persisted preference, on by default", () => {
  test("defaults, sanitisation and partialize all carry it", () => {
    expect(DEFAULT_UI_PREFERENCES.autopilot).toBe(true);
    expect(sanitizePersistedUI({ autopilot: false })).toEqual({ autopilot: false });
    expect(sanitizePersistedUI({ autopilot: "no" })).toEqual({});
    const persisted = UI_PERSIST_OPTIONS.partialize!({
      activeProjectId: "p1",
      tenderType: "IT",
      sidebarCollapsed: false,
      autopilot: false,
    } as never);
    expect(persisted.autopilot).toBe(false);
  });
});

describe("the wiring", () => {
  test("uploading a document consults the decision and starts the run", () => {
    const src = read("src/components/dashboard/file-ingestion.tsx");
    expect(/shouldAutopilotRun\(/.test(src)).toBe(true);
    expect(/fetch\("\/api\/agents\/run"/.test(src)).toBe(true);
    expect(/RUN_STARTED_EVENT/.test(src)).toBe(true);
    expect(/onCheckedChange=\{setAutopilot\}|setAutopilot\(/.test(src)).toBe(true);
  });

  test("the dock shows the run's pulse on every page", () => {
    const src = read("src/components/dashboard/assistant-dock.tsx");
    expect(/\/api\/agents\/status\?projectId=/.test(src)).toBe(true);
    expect(/runPulseIntervalMs\(/.test(src)).toBe(true);
    expect(/RUN_STARTED_EVENT/.test(src)).toBe(true);
  });

  test("the agents page moves with the run and opens the proposal when done", () => {
    const src = read("src/components/dashboard/agent-workflow.tsx");
    expect(/from "framer-motion"/.test(src)).toBe(true);
    expect(/useReducedMotion\(/.test(src)).toBe(true);
    expect(/RUN_STARTED_EVENT/.test(src)).toBe(true);
    // Completion with the switch on hands the bidder the proposal.
    expect(/autopilot[\s\S]{0,400}setView\("proposals"\)/.test(src)).toBe(true);
  });
});
