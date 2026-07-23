import { describe, expect, test } from "bun:test";
import { classifyAttachment } from "@/lib/agents/platform/classify-attachment";
import { AUTOPILOT_CONFIDENCE } from "@/lib/agents/platform/classify-attachment";

describe("mission attachment classifier", () => {
  test("classifies RFP tenders for autopilot", () => {
    const d = classifyAttachment({
      originalName: "Etimad-RFP-Cloud-2026.pdf",
      mimeType: "application/pdf",
      textPreview:
        "كراسة الشروط لمناقصة خدمات تقنية المعلومات على اعتماد. Scope of Work and SLA penalties apply.",
    });
    expect(d.category).toBe("RFP");
    expect(d.confidence).toBeGreaterThanOrEqual(AUTOPILOT_CONFIDENCE);
    expect(d.createProject).toBe(true);
    expect(d.runPipeline).toBe(true);
    expect(d.clarifyingQuestion).toBeNull();
  });

  test("classifies cloud-source RFP text without collapsing source inputs", () => {
    const shared = {
      mimeType: "text/plain",
      textPreview:
        "RFP tender كراسة شروط Scope of Work SLA evaluation criteria ".repeat(12),
    };
    const googleDrive = classifyAttachment({
      ...shared,
      originalName: "google-drive-import.txt",
      source: "google_drive",
    });
    const oneDrive = classifyAttachment({
      ...shared,
      originalName: "onedrive-import.txt",
      source: "onedrive",
    });

    expect(googleDrive.category).toBe("RFP");
    expect(oneDrive.category).toBe("RFP");
    expect(googleDrive.runPipeline).toBe(true);
    expect(oneDrive.runPipeline).toBe(true);
  });

  test("routes logos to brand assets", () => {
    const d = classifyAttachment({
      originalName: "company-logo.png",
      mimeType: "image/png",
    });
    expect(d.category).toBe("BRAND_ASSET");
    expect(d.runPipeline).toBe(false);
  });

  test("asks one question for ambiguous uploads", () => {
    const d = classifyAttachment({
      originalName: "notes.txt",
      mimeType: "text/plain",
      textPreview: "hello world",
    });
    expect(d.confidence).toBeLessThan(AUTOPILOT_CONFIDENCE);
    expect(d.clarifyingQuestion).toBeTruthy();
    expect(d.runPipeline).toBe(false);
  });

  test("routes financial statements without autopilot pipeline", () => {
    const d = classifyAttachment({
      originalName: "qlr-balance-2025.pdf",
      mimeType: "application/pdf",
      textPreview: "قوائم مالية بيان مالي QLR financial statements",
    });
    expect(d.category).toBe("FINANCIAL");
    expect(d.runPipeline).toBe(false);
    expect(d.createProject).toBe(false);
  });
});
