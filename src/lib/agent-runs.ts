type AgentRunProject = {
  title: string;
  etimadRef?: string | null;
};

type SerializableAgentRun = {
  id: string;
  projectId: string;
  status: string;
  overallProgress: number;
  agentStates?: string | null;
  errorMessage?: string | null;
  createdAt: Date;
  completedAt?: Date | null;
  project: AgentRunProject;
};

export type AgentRunDto = {
  id: string;
  projectId: string;
  projectTitle: string;
  status: string;
  progress: number;
  currentAgent: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

function currentAgentFromStates(agentStates?: string | null): string | null {
  if (!agentStates) return null;
  try {
    const states = JSON.parse(agentStates);
    if (!Array.isArray(states)) return null;
    const active = states.find(
      (state) =>
        state &&
        typeof state === "object" &&
        typeof state.id === "string" &&
        String(state.status).toLowerCase() === "running"
    );
    return active?.id ?? null;
  } catch {
    return null;
  }
}

export function serializeAgentRun(run: SerializableAgentRun): AgentRunDto {
  return {
    id: run.id,
    projectId: run.projectId,
    projectTitle: run.project.title || run.project.etimadRef || run.projectId,
    status: run.status,
    progress: run.overallProgress,
    currentAgent: currentAgentFromStates(run.agentStates),
    errorMessage: run.errorMessage ?? null,
    createdAt: run.createdAt.toISOString(),
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
  };
}
