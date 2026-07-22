import { describe, expect, test } from "bun:test";
import { buildPlatformAgentInstructions } from "@/lib/agents/platform/instructions";
import { DASHBOARD_VIEWS } from "@/lib/agents/platform/context";
import { detectPricingRequest } from "@/lib/guardrails";

describe("platform agent instructions", () => {
  test("includes constitution guardrails", () => {
    const text = buildPlatformAgentInstructions({
      locale: "en",
      userName: "Test User",
      userRole: "BIDDER",
      workspaceName: "Acme",
      canWrite: true,
      isAdmin: false,
    });
    expect(text).toContain("No pricing");
    expect(text).toContain("100% legal certainty");
    expect(text).toContain("ArabClue Copilot");
    expect(text).toContain("Law & Contract");
  });

  test("reflects read-only role", () => {
    const text = buildPlatformAgentInstructions({
      locale: "ar",
      userName: "مراجع",
      userRole: "REVIEWER",
      workspaceName: "مساحة",
      canWrite: false,
      isAdmin: false,
    });
    expect(text).toContain("no (read-only reviewer)");
  });
});

describe("platform agent views", () => {
  test("includes copilot and core product views", () => {
    expect(DASHBOARD_VIEWS).toContain("copilot");
    expect(DASHBOARD_VIEWS).toContain("projects");
    expect(DASHBOARD_VIEWS).toContain("contracts");
    expect(DASHBOARD_VIEWS).toContain("agents");
  });
});

describe("platform agent pricing gate", () => {
  test("blocks pricing strategy prompts", () => {
    expect(detectPricingRequest("suggest a competitive bid price")).toBe(true);
    expect(detectPricingRequest("list my projects")).toBe(false);
  });
});
