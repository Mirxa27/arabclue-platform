/**
 * The empty mission screen is where a first-time user decides whether the
 * platform is usable. It named three example commands in a sentence and left
 * the user to retype one of them into a blank composer.
 *
 * A starter that the agent cannot serve is worse than no starter, so each one
 * is pinned to a tool that exists on the platform surface.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MISSION_STARTERS } from "@/lib/mission-starters";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

describe("mission starters", () => {
  test("offers a first command, phrased in both languages", () => {
    expect(MISSION_STARTERS.length).toBeGreaterThan(0);
    for (const starter of MISSION_STARTERS) {
      expect(starter.en.trim()).not.toBe("");
      expect(starter.ar.trim()).not.toBe("");
      expect(starter.ar).not.toBe(starter.en);
    }
  });

  test("every starter names a capability the platform agent actually has", () => {
    const source = read("src/lib/agents/platform/tools.ts");
    for (const starter of MISSION_STARTERS) {
      expect(source).toContain(`${starter.tool}: platformTool(`);
    }
  });

  test("the console sends the starter instead of asking the user to retype it", () => {
    const source = read("src/components/dashboard/platform-agent-console.tsx");
    expect(source).toContain("MISSION_STARTERS");
    expect(source).toContain("onStarter");
  });

  test("the empty screen renders them as buttons, not prose", () => {
    const source = read("src/components/dashboard/mission-conversation.tsx");
    expect(source).toContain("starters");
    expect(source).toContain("<button");
  });
});
