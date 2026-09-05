"use client";

import { useEffect, useMemo } from "react";
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
  const { data, isSuccess, isFetching, isStale } = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiJson<{ projects: ProjectRow[] }>("/api/projects"),
    staleTime: 5_000,
  });

  // Stable identity: `data?.projects ?? []` allocates a new array every render,
  // which re-ran the effect below on every render.
  const projects = useMemo(() => data?.projects ?? [], [data]);

  useEffect(() => {
    // Only reconcile once the list is actually known. While the query is
    // pending `projects` is empty, and treating that as "this workspace has no
    // projects" cleared the persisted selection on every page load and then
    // replaced it with projects[0] when the data arrived.
    if (!isSuccess) return;
    // Only a fresh list may overrule the selection. A project created a
    // moment ago is absent from the cached list until the invalidation
    // refetch lands; judging the new id against that stale list replaced it
    // with projects[0] (or null in a new workspace) and bounced the router.
    if (isFetching || isStale) return;

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
  }, [isSuccess, isFetching, isStale, projects, activeProjectId, setActiveProjectId]);

  const active =
    projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;

  return { projects, active, activeProjectId: active?.id ?? null, isSuccess };
}
