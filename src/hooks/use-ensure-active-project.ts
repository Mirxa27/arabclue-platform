"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api-client";
import { useUI } from "@/lib/store";

type ProjectRow = {
  id: string;
  title: string;
  status?: string;
  _count?: { documents: number; agentRuns: number; proposals: number };
};

/**
 * Keeps `activeProjectId` valid: auto-selects the first workspace project when
 * none is set (or the saved id was deleted), so upload/agents/docs work.
 */
export function useEnsureActiveProject() {
  const { activeProjectId, setActiveProjectId } = useUI();
  const { data } = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiJson<{ projects: ProjectRow[] }>("/api/projects"),
    staleTime: 5_000,
  });

  const projects = data?.projects ?? [];

  useEffect(() => {
    if (projects.length === 0) {
      if (activeProjectId) setActiveProjectId(null);
      return;
    }
    const stillExists = activeProjectId
      ? projects.some((p) => p.id === activeProjectId)
      : false;
    if (!stillExists) {
      setActiveProjectId(projects[0].id);
    }
  }, [projects, activeProjectId, setActiveProjectId]);

  const active =
    projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;

  return { projects, active, activeProjectId: active?.id ?? null };
}
