import { describe, expect, test } from "bun:test";
import {
  currentAgentAction,
  extractDocumentPreview,
  extractRegulatoryPreview,
  extractTheaterTools,
  humanActionLabel,
  isToolRunning,
  summarizeToolInput,
  summarizeToolOutput,
  toolDisplayName,
  unwrapToolPayload,
  type TheaterToolEvent,
} from "@/lib/agents/platform/mission-tool-parts";
import { listRegistrySnapshot } from "@/lib/agents/platform/regulatory-synthesis";
import { researchSaudiLawForContract } from "@/lib/saudi-law-research";

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

  test("summarizes tool inputs without dumping JSON", () => {
    expect(summarizeToolInput({ view: "agents" }, false)).toBe("Screen: agents");
    expect(summarizeToolInput({ query: "NCA ECC" }, false)).toContain("Search:");
    expect(summarizeToolInput({ projectId: "proj_abcdefghijk" }, false)).toContain(
      "Project"
    );
    const opaque = summarizeToolInput({ nested: { a: 1 }, flag: true }, false);
    expect(opaque).not.toContain("{");
    expect(opaque).toContain("flag=true");
    expect(summarizeToolOutput({ ok: true, mysteryBlob: { x: 1 } }, false)).toBe(
      "Completed successfully"
    );
  });

  test("unwraps nested proposal/run payloads for theater", () => {
    const flat = unwrapToolPayload({
      ok: true,
      proposal: { title: "Bid pack", excerpt: "Hello tender" },
    });
    expect(flat.title).toBe("Bid pack");
    expect(flat.excerpt).toBe("Hello tender");
    const runPreview = extractDocumentPreview({
      ok: true,
      run: {
        projectTitle: "Cloud RFP",
        overallProgress: 50,
        agentStates: [
          { name: "Ingestion", status: "completed", progress: 1 },
          { name: "Compliance", status: "running", progress: 0.4 },
        ],
      },
    });
    expect(runPreview?.title).toBe("Cloud RFP");
    expect(runPreview?.sections).toContain("Ingestion");
  });

  test("extracts regulatory forge preview from synthesis", () => {
    const brief = researchSaudiLawForContract({
      entities: null,
      complianceRows: [],
      projectTitle: "Hello World Tender 2026",
    });
    const preview = extractRegulatoryPreview({
      ok: true,
      title: "Regulatory synthesis · Hello World Tender 2026",
      research: brief,
      findings: brief.findings,
      disclaimerEn: brief.disclaimerEn,
    });
    expect(preview).toBeTruthy();
    expect(preview!.findings.length).toBeGreaterThan(0);
    expect(preview!.disclaimer.length).toBeGreaterThan(10);
    expect(
      summarizeToolOutput({ findings: brief.findings }, false)
    ).toContain("regulatory findings");
  });

  test("registry snapshot exposes instruments", () => {
    const snap = listRegistrySnapshot();
    expect(snap.instruments.length).toBeGreaterThan(0);
    expect(snap.disclaimer.length).toBeGreaterThan(10);
  });

  test("human action labels mirror click-through language", () => {
    expect(humanActionLabel("navigateToView", false)).toContain("sidebar");
    expect(humanActionLabel("listProjects", false)).toContain("Projects");
    expect(humanActionLabel("startAgentPipeline", true)).toContain("الوكلاء");
  });

  test("currentAgentAction reflects the most recent running tool", () => {
    const tools: TheaterToolEvent[] = [
      {
        id: "t1",
        name: "listProjects",
        state: "output-available",
        messageId: "m1",
      },
      {
        id: "t2",
        name: "startAgentPipeline",
        state: "input-available",
        messageId: "m1",
      },
    ];
    const action = currentAgentAction({ tools, locale: "en" });
    expect(action.phase).toBe("acting");
    expect(action.label).toContain("Run agents");
    expect(action.toolName).toBeTruthy();
  });

  test("currentAgentAction prioritizes listening/speaking/idle when no tool runs", () => {
    const done: TheaterToolEvent[] = [
      { id: "t1", name: "listProjects", state: "output-available", messageId: "m" },
    ];
    expect(currentAgentAction({ tools: done, locale: "en", listening: true }).phase).toBe(
      "listening"
    );
    expect(currentAgentAction({ tools: done, locale: "en", speaking: true }).phase).toBe(
      "speaking"
    );
    expect(currentAgentAction({ tools: [], locale: "en" }).phase).toBe("idle");
    expect(currentAgentAction({ tools: [], locale: "ar" }).label).toContain("جاهز");
  });
});
