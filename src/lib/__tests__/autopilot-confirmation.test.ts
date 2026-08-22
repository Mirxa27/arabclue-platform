/**
 * Guard tests for the autopilot approval gate.
 *
 * Content captured by the browser extension is attacker-influenceable: a
 * crafted page can steer the keyword classifier, and above the confidence
 * floor the classifier's opinion alone was enough to create a project and run
 * the full six-agent pipeline over it. Staging is fine; privileged action on
 * untrusted content requires a human.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

describe("maybeAutopilotAfterIngest honours a confirmation requirement", () => {
  const source = read("src/lib/agents/platform/autopilot.ts");

  test("the option exists", () => {
    expect(source).toContain("requireConfirmation?: boolean;");
  });

  test("it short-circuits to clarify before any project is created", () => {
    const gateAt = source.indexOf("if (opts.requireConfirmation)");
    const createAt = source.indexOf("createProject");
    expect(gateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(createAt);
  });

  test("the gate returns clarify rather than acting", () => {
    expect(source).toMatch(
      /if \(opts\.requireConfirmation\) \{[\s\S]{0,400}?mode: "clarify"/
    );
  });

  test("the read-only guard is still first", () => {
    const roGate = source.indexOf("if (!opts.canWrite)");
    const confirmGate = source.indexOf("if (opts.requireConfirmation)");
    expect(roGate).toBeGreaterThan(-1);
    expect(roGate).toBeLessThan(confirmGate);
  });
});

describe("stageMissionAttachment forwards the requirement", () => {
  const source = read("src/lib/agents/platform/stage-attachment.ts");

  test("the option is accepted and passed through", () => {
    expect(source).toContain("requireConfirmation?: boolean;");
    expect(source).toContain("requireConfirmation: opts.requireConfirmation,");
  });
});

describe("extension ingest requires confirmation on every path", () => {
  const source = read("src/app/api/platform-agent/extension/ingest/route.ts");

  test("every auto-routed stage call also requires confirmation", () => {
    const autoRoutes = source.match(/autoRoute:\s*true,/g) ?? [];
    const confirmations = source.match(/requireConfirmation:\s*true,/g) ?? [];
    expect(autoRoutes.length).toBeGreaterThan(0);
    expect(confirmations.length).toBe(autoRoutes.length);
  });
});

describe("in-app attachment upload is unaffected", () => {
  // A file a user deliberately drops into Mission Control is a first-party
  // action and keeps its existing autopilot behaviour.
  const source = read(
    "src/app/api/platform-agent/missions/[id]/attachments/route.ts"
  );

  test("does not require confirmation", () => {
    expect(source).not.toContain("requireConfirmation");
  });
});
