import { describe, expect, test } from "bun:test";
import { AUTOPILOT_CONFIDENCE, classifyAttachment } from "@/lib/agents/platform/classify-attachment";
import { assertSafeExternalUrl } from "@/lib/agents/platform/connectors";

describe("mission autopilot gates", () => {
  test("high-confidence RFP enables pipeline flag", () => {
    const d = classifyAttachment({
      originalName: "tender-rfp.pdf",
      mimeType: "application/pdf",
      textPreview: "مناقصة اعتماد كراسة الشروط Scope of Work SLA",
    });
    expect(d.confidence).toBeGreaterThanOrEqual(AUTOPILOT_CONFIDENCE);
    expect(d.runPipeline).toBe(true);
  });

  test("blocks private URLs", () => {
    expect(() => assertSafeExternalUrl("http://127.0.0.1/secret")).toThrow();
    expect(() => assertSafeExternalUrl("http://192.168.1.8/x")).toThrow();
  });
});
