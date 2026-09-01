import {
  isToolDone,
  isToolRunning,
  toolKind,
  type TheaterToolEvent,
} from "./mission-tool-parts";

/**
 * The five stages the mission strip shows, and the telemetry that lights each
 * one. Kept apart from the component so the matching can be tested without a
 * renderer; the component owns the icons and the copy placement.
 */
export type PipelineStep = {
  key: "analyze" | "delegate" | "research" | "draft" | "review";
  labelEn: string;
  labelAr: string;
  kinds: string[];
  toolNames: string[];
};

export const PIPELINE_STEPS: PipelineStep[] = [
  {
    key: "analyze",
    labelEn: "Analyzing",
    labelAr: "تحليل",
    kinds: ["general", "mission", "search"],
    toolNames: [
      "getWorkspaceOverview",
      "listProjects",
      "listDocuments",
      "searchDocumentChunks",
      "getMissionPulse",
    ],
  },
  {
    key: "delegate",
    labelEn: "Planning",
    labelAr: "تخطيط",
    kinds: ["delegate", "plan"],
    toolNames: ["delegateToAgent", "planMission", "createProject"],
  },
  {
    key: "research",
    labelEn: "Research",
    labelAr: "بحث",
    kinds: ["tender", "vendor", "research"],
    toolNames: ["searchTenders", "getTenderDetail", "matchVendors"],
  },
  {
    key: "draft",
    labelEn: "Drafting",
    labelAr: "صياغة",
    kinds: ["document", "proposal", "pipeline"],
    toolNames: [
      "runAgentPipeline",
      "generateProposal",
      "draftContract",
      "rewriteSection",
    ],
  },
  {
    key: "review",
    labelEn: "Review",
    labelAr: "مراجعة",
    kinds: ["review", "billing", "admin", "navigate"],
    toolNames: [
      "navigateToView",
      "setActiveProject",
      "listReviews",
      "decideReview",
      "getBillingStatus",
    ],
  },
];

/** A tool the agent has started but not finished. */
function isInFlight(t: TheaterToolEvent): boolean {
  return isToolRunning(t.state) || Boolean(t.preliminary);
}

function stepFor(t: TheaterToolEvent): number {
  const kind = toolKind(t.name);
  for (let i = PIPELINE_STEPS.length - 1; i >= 0; i--) {
    const s = PIPELINE_STEPS[i];
    if (s.toolNames.includes(t.name) || s.kinds.includes(kind)) return i;
  }
  if (kind === "document" || kind === "proposal" || kind === "pipeline") return 3;
  if (kind === "compliance") return 2;
  return 0;
}

/**
 * The step currently in progress, or -1 when nothing is.
 *
 * -1 is the whole point. This used to fall back to the most recent tool
 * regardless of state, so a workspace with any mission history rendered a
 * permanent spinner on whatever that history ended with — next to a
 * "Disconnected" badge and an idle ticker. The strip is fed persisted actions,
 * so that was its resting state, not a transient.
 *
 * A finished run still shows its checkmarks; see `computeCompleted`. It just
 * stops claiming to be working.
 */
export function inferActiveStep(tools: TheaterToolEvent[]): number {
  const running = tools.filter(isInFlight);
  const last = running[running.length - 1];
  return last ? stepFor(last) : -1;
}

/**
 * Steps with at least one tool that finished successfully.
 *
 * A tool counts toward exactly the step `inferActiveStep` would have made
 * active for it. The previous shape asked each step "does any finished tool
 * match me?", so a tool matching two steps by name *and* kind — `searchTenders`
 * is both a Research tool name and a search kind — ticked both, and could tick a
 * step that could never have been active.
 */
export function computeCompleted(tools: TheaterToolEvent[]): Set<number> {
  const completed = new Set<number>();
  for (const t of tools) {
    if (isToolDone(t.state)) completed.add(stepFor(t));
  }
  return completed;
}
