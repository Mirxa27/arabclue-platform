import { describe, expect, test } from "bun:test";
import {
  extractDocumentPreview,
  extractTheaterTools,
  isToolRunning,
  summarizeToolOutput,
  toolDisplayName,
} from "@/lib/agents/platform/mission-tool-parts";

describe("mission tool theater parts", () => {
  test("extracts static tool-* and dynamic-tool parts", () => {
    const tools = extractTheaterTools([
      {
        id: "m1",
        role: "assistant",
        parts: [
          {
            type: "tool-listProjects",
            toolCallId: "c1",
            state: "input-available",
            input: { limit: 5 },
          },
          {
            type: "dynamic-tool",
            toolCallId: "c2",
            toolName: "startAgentPipeline",
            state: "output-available",
            output: { ok: true, runId: "run-1" },
          },
          { type: "text", toolCallId: undefined },
        ],
      },
    ]);
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe("listProjects");
    expect(tools[1].name).toBe("startAgentPipeline");
    expect(isToolRunning(tools[0].state)).toBe(true);
  });

  test("summarizes and previews documentish outputs", () => {
    expect(toolDisplayName("startAgentPipeline", false)).toContain("pipeline");
    expect(
      summarizeToolOutput({ projects: [{ id: "1" }, { id: "2" }] }, false)
    ).toContain("2 projects");
    const preview = extractDocumentPreview({
      title: "Proposal EN|AR",
      content: "# Executive\n\nBody\n\n# Coverage\n\nMatrix",
    });
    expect(preview?.title).toBe("Proposal EN|AR");
    expect(preview?.sections.length).toBeGreaterThan(0);
  });
});
