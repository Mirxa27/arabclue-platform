import { describe, expect, test } from "bun:test";
import { parseTenderText } from "@/lib/agents/ingestion";
import { buildAutopilotProjectCreateData } from "@/lib/agents/platform/autopilot";
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

  test("enriches new project payload from parsed RFP tender facts", () => {
    const rfpText = `
      Tender Name: National Data Strategy Advisory Platform
      Etimad Ref: ETM-2026-0042
      Category: Consulting & Advisory
      Estimated budget: SAR 8,500,000
      Submission deadline: 2026-09-15
      Saudization target: 38%
      Local content preference 12%
      Scope of Work: Provide consulting, enterprise architecture, and delivery governance services for a national data strategy platform. The contractor must produce roadmaps, operating model designs, and knowledge-transfer deliverables.
      Technical evaluation 80% Financial 20%.
      Delay penalty 1.5% per week maximum 15%.
    `;
    const decision = classifyAttachment({
      originalName: "rfp-upload.pdf",
      mimeType: "application/pdf",
      textPreview: rfpText,
    });
    const entities = parseTenderText(rfpText);
    const data = buildAutopilotProjectCreateData({
      workspaceId: "workspace-1",
      userId: "user-1",
      decision,
      entities,
      now: new Date("2026-07-23T00:00:00.000Z"),
    });

    expect(decision.runPipeline).toBe(true);
    expect(data).toMatchObject({
      workspaceId: "workspace-1",
      createdById: "user-1",
      title: "National Data Strategy Advisory Platform",
      titleAr: "National Data Strategy Advisory Platform",
      etimadRef: "ETM-2026-0042",
      category: "CONSULTING",
      budget: 8_500_000,
      currency: "SAR",
      saudizationTarget: 38,
      localContentTarget: 12,
      status: "DRAFT",
    });
    expect(data.submissionDeadline?.toISOString()).toBe(
      "2026-09-15T00:00:00.000Z"
    );
  });

  test("falls back to suggested title and IT category when parsed facts are missing", () => {
    const data = buildAutopilotProjectCreateData({
      workspaceId: "workspace-1",
      userId: "user-1",
      decision: { suggestedTitle: "tender-rfp" },
      entities: null,
      now: new Date("2026-07-23T00:00:00.000Z"),
    });

    expect(data).toMatchObject({
      title: "tender-rfp",
      titleAr: "tender-rfp",
      etimadRef: null,
      category: "IT",
      budget: null,
      currency: "SAR",
      submissionDeadline: null,
      status: "DRAFT",
    });
    expect(data.saudizationTarget).toBeUndefined();
    expect(data.localContentTarget).toBeUndefined();
  });
});
