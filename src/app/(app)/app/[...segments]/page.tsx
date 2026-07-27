import { AppRouteEntry } from "../app-route-entry";

export const dynamic = "force-dynamic";

/**
 * Every canonical view path below `/app`: `/app/projects`,
 * `/app/projects/:projectId/documents`, `/app/admin/billing`, and the rest.
 * Paths outside the canonical set resolve to the overview fallback with a
 * bilingual notice rather than a 404 (Requirement 14.4).
 */
export default async function WorkspaceViewPage({
  params,
}: {
  params: Promise<{ segments?: string[] }>;
}) {
  const { segments } = await params;
  return <AppRouteEntry segments={segments ?? []} />;
}
