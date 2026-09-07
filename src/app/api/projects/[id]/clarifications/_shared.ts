import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-controller";
import { assertWorkspaceMatch } from "@/lib/workspace-context";

/** The project, when it exists inside the caller's workspace; 404 otherwise. */
export async function requireTenantProject(projectId: string, workspaceId: string) {
  const project = await db.tenderProject.findUnique({
    where: { id: projectId },
    select: { id: true, workspaceId: true, title: true, titleAr: true, etimadRef: true },
  });
  if (!project || !assertWorkspaceMatch(project.workspaceId, workspaceId)) {
    throw new ApiError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  }
  return project;
}
