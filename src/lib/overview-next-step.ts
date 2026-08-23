import type { DashboardView } from "@/lib/dashboard-routes";

export type OverviewStepId = "create" | "upload" | "agents" | "export";

export function resolveOverviewNextStep(input: {
  projectCount: number;
  documentCount: number;
  agentRunCount: number;
  proposalCount: number;
}): OverviewStepId {
  if (input.projectCount === 0) {
    return "create";
  }
  if (input.documentCount === 0) {
    return "upload";
  }
  if (input.agentRunCount === 0) {
    return "agents";
  }
  return "export";
}

/** Null while projects are still loading — never treat pending as zero. */
export function resolveOverviewNextStepWhenReady(input: {
  isSuccess: boolean;
  projectCount: number;
  documentCount: number;
  agentRunCount: number;
  proposalCount: number;
}): OverviewStepId | null {
  if (!input.isSuccess) return null;
  return resolveOverviewNextStep(input);
}

export function overviewStepView(id: OverviewStepId): DashboardView | null {
  switch (id) {
    case "create":
      return null;
    case "upload":
      return "documents";
    case "agents":
      return "agents";
    case "export":
      return "proposals";
  }
}

export function shouldShowOverviewWorkPanels(projectCount: number): boolean {
  return projectCount > 0;
}
