import { describe, expect, test } from "bun:test";
import { AUTOPILOT_CONFIDENCE, classifyAttachment } from "@/lib/agents/platform/classify-attachment";
import { assertSafeExternalUrl, MISSION_CONNECTORS } from "@/lib/agents/platform/connectors";

describe("mission control domain", () => {
  test("exposes production-ready connectors only", () => {
    const ids = MISSION_CONNECTORS.map((c) => c.id);
    expect(ids).toContain("upload");
    expect(ids).toContain("url");
    expect(ids).toContain("email");
    expect(ids).toContain("google_drive");
    expect(ids).toContain("onedrive");
    expect(MISSION_CONNECTORS.every((c) => c.status === "ready")).toBe(true);
    expect(MISSION_CONNECTORS.some((c) => c.importMode === "paste")).toBe(true);
  });

  test("allows public https URLs", () => {
    const url = assertSafeExternalUrl("https://example.com/tender.pdf");
    expect(url.hostname).toBe("example.com");
  });

  test("classifier autopilot threshold is stable", () => {
    expect(AUTOPILOT_CONFIDENCE).toBeGreaterThan(0.7);
    const d = classifyAttachment({
      originalName: "مناقصة-كراسة.pdf",
      mimeType: "application/pdf",
      textPreview: "كراسة الشروط مناقصة اعتماد Scope of Work SLA evaluation criteria ".repeat(20),
    });
    expect(d.category).toBe("RFP");
    expect(d.runPipeline).toBe(true);
  });
});
