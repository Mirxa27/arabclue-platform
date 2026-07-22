import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { assertWorkspaceMatch } from "@/lib/workspace-context";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";

export const dynamic = "force-dynamic";

// GET /api/compliance?projectId=...
export async function GET(req: NextRequest) {
  return withTenant("session", async ({ workspace }) => {
    const projectId = req.nextUrl.searchParams.get("projectId");

    if (projectId) {
      const project = await db.tenderProject.findUnique({
        where: { id: projectId },
      });
      if (!project || !assertWorkspaceMatch(project.workspaceId, workspace.id)) {
        throw new ApiError("not found", 404);
      }
    }

    const where = projectId
      ? { projectId }
      : { project: { workspaceId: workspace.id } };

    const checks = await db.complianceCheck.findMany({
      where,
      orderBy: [{ framework: "asc" }, { controlId: "asc" }],
    });

    const grouped: Record<string, typeof checks> = {};
    for (const c of checks) {
      if (!grouped[c.framework]) grouped[c.framework] = [];
      grouped[c.framework].push(c);
    }

    const summary = {
      total: checks.length,
      compliant: checks.filter((c) => c.status === "COMPLIANT").length,
      partial: checks.filter((c) => c.status === "PARTIAL").length,
      nonCompliant: checks.filter(
        (c) => c.status === "NON_COMPLIANT" || c.status === "GAP"
      ).length,
      pending: checks.filter((c) => c.status === "PENDING").length,
      na: checks.filter((c) => c.status === "NOT_APPLICABLE").length,
    };

    return jsonOk({ grouped, summary });
  }, "compliance GET");
}
