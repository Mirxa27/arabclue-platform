/**
 * Client-safe helpers for dashboard view selection (Requirement 14.1 / 14.6).
 * Used by the sidebar and any surface that must push exactly one history entry.
 */

import {
  getPathForView,
  isAdminView,
  isProjectScopedView,
  type DashboardView,
} from "./dashboard-routes";

export type DashboardNavigateDecision = Readonly<{
  path: string;
  view: DashboardView;
  notice: "ROUTE_VIEW_FORBIDDEN" | "ROUTE_PROJECT_REQUIRED" | null;
}>;

/**
 * Resolves the next path and view for a user selection without touching the
 * router. Callers push `path` once and apply the view through the store.
 */
export function resolveDashboardNavigation(input: {
  readonly target: DashboardView;
  readonly isAdmin: boolean;
  readonly activeProjectId: string | null;
}): DashboardNavigateDecision {
  const permitted =
    isAdminView(input.target) && !input.isAdmin ? "overview" : input.target;
  const notice =
    permitted === input.target ? null : ("ROUTE_VIEW_FORBIDDEN" as const);

  if (isProjectScopedView(permitted) && !input.activeProjectId) {
    return {
      path: getPathForView("projects"),
      view: "projects",
      notice: "ROUTE_PROJECT_REQUIRED",
    };
  }

  return {
    path: getPathForView(permitted, input.activeProjectId),
    view: permitted,
    notice,
  };
}
