import { describe, expect, test } from "bun:test";
import {
  overviewStepView,
  resolveOverviewNextStep,
  shouldShowOverviewWorkPanels,
} from "@/lib/overview-next-step";

describe("resolveOverviewNextStep", () => {
  test("create when there is no project", () => {
    expect(
      resolveOverviewNextStep({
        projectCount: 0,
        documentCount: 0,
        agentRunCount: 0,
        proposalCount: 0,
      })
    ).toBe("create");
  });

  test("upload when the active tender has no documents", () => {
    expect(
      resolveOverviewNextStep({
        projectCount: 1,
        documentCount: 0,
        agentRunCount: 4,
        proposalCount: 1,
      })
    ).toBe("upload");
  });

  test("agents when documents exist but no runs", () => {
    expect(
      resolveOverviewNextStep({
        projectCount: 1,
        documentCount: 2,
        agentRunCount: 0,
        proposalCount: 0,
      })
    ).toBe("agents");
  });

  test("export once a run exists", () => {
    expect(
      resolveOverviewNextStep({
        projectCount: 1,
        documentCount: 2,
        agentRunCount: 1,
        proposalCount: 0,
      })
    ).toBe("export");
  });
});

describe("overviewStepView", () => {
  test("create has no view; the others map to the flow views", () => {
    expect(overviewStepView("create")).toBeNull();
    expect(overviewStepView("upload")).toBe("documents");
    expect(overviewStepView("agents")).toBe("agents");
    expect(overviewStepView("export")).toBe("proposals");
  });
});

describe("shouldShowOverviewWorkPanels", () => {
  test("hides upload and agents until a project exists", () => {
    expect(shouldShowOverviewWorkPanels(0)).toBe(false);
    expect(shouldShowOverviewWorkPanels(1)).toBe(true);
  });
});
