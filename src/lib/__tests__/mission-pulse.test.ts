import { describe, expect, test } from "bun:test";
import {
  computeMissionPulse,
  narrateMissionPulse,
  type PulseActionRow,
  type PulseAttachmentRow,
} from "@/lib/agents/platform/mission-pulse";

const NOW = new Date("2026-07-23T12:00:00Z");

function att(overrides: Partial<PulseAttachmentRow> = {}): PulseAttachmentRow {
  return {
    source: "browser",
    docCategory: "RFP",
    routeStatus: "ROUTED",
    confidence: 0.8,
    createdAt: new Date(NOW.getTime() - 10 * 60 * 1000),
    ...overrides,
  };
}

function act(overrides: Partial<PulseActionRow> = {}): PulseActionRow {
  return {
    toolName: "stageMissionAttachment",
    status: "SUCCEEDED",
    createdAt: new Date(NOW.getTime() - 5 * 60 * 1000),
    ...overrides,
  };
}

describe("mission pulse", () => {
  test("empty mission is idle with zero counts", () => {
    const pulse = computeMissionPulse({ attachments: [], actions: [], now: NOW });
    expect(pulse.health).toBe("idle");
    expect(pulse.attachments.total).toBe(0);
    expect(pulse.actions.total).toBe(0);
    expect(pulse.attachments.avgConfidence).toBe(0);
  });

  test("tallies attachments by source/category/status and avg confidence", () => {
    const pulse = computeMissionPulse({
      attachments: [
        att({ confidence: 0.9 }),
        att({ source: "upload", docCategory: "BOQ", confidence: 0.5 }),
        att({ routeStatus: "NEEDS_CLARIFICATION", confidence: 0.4 }),
      ],
      actions: [],
      now: NOW,
    });
    expect(pulse.attachments.total).toBe(3);
    expect(pulse.attachments.bySource.browser).toBe(2);
    expect(pulse.attachments.bySource.upload).toBe(1);
    expect(pulse.attachments.byCategory.RFP).toBe(2);
    expect(pulse.attachments.needsClarification).toBe(1);
    expect(pulse.attachments.avgConfidence).toBe(0.6);
    expect(pulse.activity.extensionCaptures).toBe(2);
  });

  test("action stats include top tools and failure counts", () => {
    const pulse = computeMissionPulse({
      attachments: [],
      actions: [
        act(),
        act(),
        act({ toolName: "runAgents", status: "FAILED" }),
        act({ toolName: "getCompliance" }),
      ],
      now: NOW,
    });
    expect(pulse.actions.total).toBe(4);
    expect(pulse.actions.succeeded).toBe(3);
    expect(pulse.actions.failed).toBe(1);
    expect(pulse.actions.topTools[0]).toEqual({
      tool: "stageMissionAttachment",
      count: 2,
    });
  });

  test("recent activity drives health from idle to thriving", () => {
    const old = new Date(NOW.getTime() - 3 * 60 * 60 * 1000);
    const idle = computeMissionPulse({
      attachments: [att({ createdAt: old })],
      actions: [act({ createdAt: old })],
      now: NOW,
    });
    expect(idle.health).toBe("idle");

    const thriving = computeMissionPulse({
      attachments: [att(), att(), att()],
      actions: [act(), act()],
      now: NOW,
    });
    expect(thriving.health).toBe("thriving");
    expect(thriving.activity.capturesLastHour).toBe(3);
  });

  test("narration is spoken-friendly in both locales", () => {
    const pulse = computeMissionPulse({
      attachments: [att(), att({ routeStatus: "NEEDS_CLARIFICATION" })],
      actions: [act(), act({ status: "FAILED" })],
      now: NOW,
    });
    const en = narrateMissionPulse(pulse, "en");
    expect(en).toContain("2 documents ingested");
    expect(en).toContain("1 need clarification");
    expect(en).toContain("1 tool runs succeeded");
    const arText = narrateMissionPulse(pulse, "ar");
    expect(arText).toContain("مستند");
    expect(arText).toContain("2");
  });
});
