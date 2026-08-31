import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { buildPlatformAgentInstructions } from "@/lib/agents/platform/instructions";
import { DASHBOARD_VIEWS } from "@/lib/agents/platform/context";
import { DASHBOARD_VIEWS as CANONICAL_VIEWS } from "@/lib/dashboard-routes";
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
  test("includes the core product views", () => {
    expect(DASHBOARD_VIEWS).toContain("overview");
    expect(DASHBOARD_VIEWS).toContain("projects");
    expect(DASHBOARD_VIEWS).toContain("documents");
    expect(DASHBOARD_VIEWS).toContain("contracts");
    expect(DASHBOARD_VIEWS).toContain("agents");
    expect(DASHBOARD_VIEWS).toContain("proposal-builder");
    expect(DASHBOARD_VIEWS).toContain("marketplace");
    expect(DASHBOARD_VIEWS).toContain("analytics");
    expect(DASHBOARD_VIEWS).toContain("account");
  });

  test("offers no address that opens a screen the agent can already open", () => {
    // `copilot` was `overview`, `brand` was `account`, and `compliance` and
    // `history` were subsets of `documents`. Offering them back would give the
    // agent two names for one screen — see dashboard-view-retirement.test.ts.
    for (const retired of ["copilot", "brand", "compliance", "history"]) {
      expect(DASHBOARD_VIEWS).not.toContain(retired);
    }
  });

  test("the agent can navigate to every screen the app has", () => {
    // A view the agent cannot name is a screen the user can only reach by
    // hunting through the sidebar, which defeats "just ask the copilot".
    expect([...DASHBOARD_VIEWS].sort()).toEqual([...CANONICAL_VIEWS].sort());
  });

  test("navigateToView accepts every canonical view", () => {
    const schema = z.object({ view: z.enum(DASHBOARD_VIEWS) });
    const rejected = CANONICAL_VIEWS.filter(
      (view) => !schema.safeParse({ view }).success
    );
    expect(rejected).toEqual([]);
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
