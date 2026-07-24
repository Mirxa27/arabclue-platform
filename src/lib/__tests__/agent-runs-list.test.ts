import { describe, expect, test } from "bun:test";
import { serializeAgentRun } from "../agent-runs";

describe("serializeAgentRun", () => {
  test("maps an agent run with project context into the run history DTO", () => {
    const createdAt = new Date("2026-07-24T08:15:00.000Z");
    const completedAt = new Date("2026-07-24T08:20:00.000Z");

    const dto = serializeAgentRun({
      id: "run_123",
      projectId: "project_456",
      status: "FAILED",
      overallProgress: 42.4,
      agentStates: JSON.stringify([
        { id: "INGESTION", status: "completed", progress: 100 },
        { id: "TECHNICAL_ARCHITECT", status: "running", progress: 35 },
      ]),
      errorMessage: "RFP parsing failed",
      createdAt,
      completedAt,
      project: {
        title: "Etimad network modernization",
      },
    });

    expect(dto).toEqual({
      id: "run_123",
      projectId: "project_456",
      projectTitle: "Etimad network modernization",
      status: "FAILED",
      progress: 42.4,
      currentAgent: "TECHNICAL_ARCHITECT",
      errorMessage: "RFP parsing failed",
      createdAt: createdAt.toISOString(),
      completedAt: completedAt.toISOString(),
    });
  });
});
