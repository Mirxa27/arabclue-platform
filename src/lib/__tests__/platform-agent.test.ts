import { describe, expect, test } from "bun:test";
import { buildPlatformAgentInstructions } from "@/lib/agents/platform/instructions";
import { DASHBOARD_VIEWS } from "@/lib/agents/platform/context";
import { detectPricingRequest } from "@/lib/guardrails";
import {
  AGENT_ENGINES,
  PROVIDER_CONNECTION_TEMPLATES,
} from "@/lib/llm/model-catalog";
import { preferVoiceLiveModels } from "@/lib/llm/fetch-models";

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

describe("voice live admin configuration", () => {
  test("VOICE engine and live provider templates exist", () => {
    expect(AGENT_ENGINES).toContain("VOICE");
    const voiceTemplates = PROVIDER_CONNECTION_TEMPLATES.filter(
      (t) => t.engine === "VOICE"
    );
    expect(voiceTemplates.some((t) => t.provider === "openai")).toBe(true);
    expect(voiceTemplates.some((t) => t.provider === "google")).toBe(true);
  });

  test("preferVoiceLiveModels keeps only live/realtime ids when present", () => {
    const models = preferVoiceLiveModels([
      {
        id: "gpt-4o",
        contextWindow: 1,
        maxTokens: 1,
        supportsVision: false,
        supportsJsonMode: true,
        supportsTools: true,
      },
      {
        id: "gpt-realtime-2",
        contextWindow: 1,
        maxTokens: 1,
        supportsVision: false,
        supportsJsonMode: true,
        supportsTools: true,
      },
      {
        id: "gemini-3.1-flash-live-preview",
        contextWindow: 1,
        maxTokens: 1,
        supportsVision: false,
        supportsJsonMode: true,
        supportsTools: true,
      },
    ]);
    expect(models.map((m) => m.id)).toEqual([
      "gpt-realtime-2",
      "gemini-3.1-flash-live-preview",
    ]);
  });
});
