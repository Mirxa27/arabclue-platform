import { DashboardViews } from "@/components/dashboard/views";
import { resolveAppRouteForRequest } from "@/lib/app-route-resolver";

/**
 * Shared server entry for `/app` and every canonical view path beneath it.
 *
 * Resolving on the server means an administrator path opened by a
 * non-administrator, or a path naming a project outside the workspace, never
 * mounts the protected panel and so never issues its data request
 * (Requirements 14.5 and 14.8).
 */
export async function AppRouteEntry({
  segments,
}: {
  segments: readonly string[];
}) {
  const route = await resolveAppRouteForRequest(segments);

  // The shell wraps this from `(app)/app/layout.tsx`.
  return (
    <DashboardViews
      initialView={route.view}
      initialProjectId={route.projectId}
      canonicalPath={route.canonicalPath}
      initialNotice={route.notice}
      projectContextMissing={route.projectContextMissing}
    />
  );
}
