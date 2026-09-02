import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  currentAgentAction,
  extractDocumentPreview,
  extractRegulatoryPreview,
  extractTheaterTools,
  humanActionLabel,
  isToolRunning,
  kindLabel,
  summarizeStoredOutput,
  summarizeToolInput,
  summarizeToolOutput,
  toolDisplayName,
  unwrapToolPayload,
  TOOL_META,
  type TheaterToolEvent,
} from "@/lib/agents/platform/mission-tool-parts";
import { listRegistrySnapshot } from "@/lib/agents/platform/regulatory-synthesis";
import { researchSaudiLawForContract } from "@/lib/saudi-law-research";

/**
 * Every tool the agent can call is narrated to the user by name. A tool with no
 * entry falls back to its camelCase identifier, so the user watches
 * "orchestrate Tender Package" run instead of "Command the full team".
 */
describe("tool naming coverage", () => {
  const toolsSource = readFileSync(
    join(import.meta.dir, "..", "agents", "platform", "tools.ts"),
    "utf8"
  );
  const toolNames = [
    ...toolsSource.matchAll(/^ {4}([a-zA-Z][a-zA-Z0-9_]*): platformTool\(/gm),
  ].map((m) => m[1]);

  test("the source list is found at all", () => {
    expect(toolNames.length).toBeGreaterThan(30);
  });

  test("every tool kind reads as a word, in Arabic too", () => {
    // The theater groups tools by kind and printed the raw key, so an Arabic
    // user saw "compliance 3" next to otherwise fully translated copy.
    const kinds = new Set(Object.values(TOOL_META).map((meta) => meta.kind));
    expect(kinds.size).toBeGreaterThan(5);
    for (const kind of kinds) {
      expect(kindLabel(kind, false).trim().length).toBeGreaterThan(0);
      expect(kindLabel(kind, true).trim().length).toBeGreaterThan(0);
      expect(kindLabel(kind, true)).not.toBe(kind);
    }
  });

  test("every callable tool has a human name in both locales", () => {
    const unnamed = toolNames.filter((name) => !TOOL_META[name]);
    expect(unnamed).toEqual([]);
    for (const name of toolNames) {
      expect(toolDisplayName(name, false)).not.toBe(name);
      expect(toolDisplayName(name, true)).not.toBe(name);
    }
  });
});

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
    expect(summarizeToolInput({ view: "agents" }, false)).toBe("Screen: AI Agents");
    expect(summarizeToolInput({ view: "clause-library" }, false)).toBe(
      "Screen: Clause Library"
    );
    // An unknown key is still shown rather than swallowed.
    expect(summarizeToolInput({ view: "not-a-view" }, false)).toBe(
      "Screen: not-a-view"
    );
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

  test("stored tool output rehydrates as prose, never as a JSON fragment", () => {
    // A reloaded mission replays actions from the database. Slicing the stored
    // JSON put `{"ok":true,"projects":[{"id":"cm…` on screen.
    const stored = JSON.stringify({
      ok: true,
      projects: [{ id: "p1" }, { id: "p2" }],
    });
    expect(summarizeStoredOutput(stored, false)).toBe("2 projects");
    expect(summarizeStoredOutput(stored, false)).not.toContain("{");
    expect(summarizeStoredOutput("not json at all", false)).toBe("");
    expect(summarizeStoredOutput(null, false)).toBe("");
    expect(summarizeStoredOutput(undefined, false)).toBe("");
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

  /**
   * Captured on production `/app` on 2026-09-01: the live session badge read
   * "Disconnected" while this ticker read "Ready — speak or type". Speaking at
   * that moment does nothing, because there is no socket to speak into. Idle
   * and reachable are not the same state.
   */
  test("an idle agent with no transport does not invite the user to speak", () => {
    const offline = currentAgentAction({ tools: [], locale: "en", offline: true });
    expect(offline.phase).toBe("idle");
    expect(offline.label).not.toContain("Ready");
    expect(offline.label.toLowerCase()).toContain("connect");

    expect(currentAgentAction({ tools: [], locale: "ar", offline: true }).label).not.toContain(
      "جاهز"
    );
  });

  test("offline never outranks work that is actually happening", () => {
    // The flag describes the voice transport, not the agent. A tool running
    // over the classic HTTP path is still a running tool.
    const running: TheaterToolEvent[] = [
      { id: "t1", name: "listProjects", state: "input-available", messageId: "m" },
    ];
    expect(currentAgentAction({ tools: running, locale: "en", offline: true }).phase).toBe(
      "acting"
    );
    expect(
      currentAgentAction({ tools: [], locale: "en", offline: true, listening: true }).phase
    ).toBe("listening");
  });
});

describe("previews never draw a gauge nobody measured", () => {
  // Production, Agent page: every "Document" preview under the live execution
  // path carried a 45 % bar — the value a short output body was assigned — and
  // a regulatory card with no findings read 55 %. The theater already shows a
  // finished tool as 100 % and a running one as indeterminate; the previews
  // now leave progress out unless the output carries a real measure.
  test("a short document body has no progress", () => {
    const preview = extractDocumentPreview({ title: "Stage attachment", content: "RFP · 90%" });
    expect(preview).not.toBeNull();
    expect(preview?.progress).toBeUndefined();
  });

  test("a pipeline output keeps its measured overall progress", () => {
    const preview = extractDocumentPreview({
      agentStates: [{ name: "Ingestion", status: "completed", progress: 100 }, { name: "Compliance", status: "running", progress: 20 }],
      overallProgress: 37,
    });
    expect(preview?.progress).toBeCloseTo(0.37);
  });

  test("a regulatory synthesis with nothing in it has no progress", () => {
    const preview = extractRegulatoryPreview({ frameworks: [{ framework: "NCA" }], findings: [], gaps: [] });
    expect(preview).not.toBeNull();
    expect(preview?.progress).toBeUndefined();
    const withFindings = extractRegulatoryPreview({ findings: [{ topic: "PDPL", certainty: "HIGH", statement: "Residency applies" }] });
    expect(withFindings?.progress).toBe(1);
  });
});
