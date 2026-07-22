import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import { requirementPatchSchema, parseJsonBody } from "@/lib/validation";
import { assertWorkspaceMatch } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTenant("session", async ({ workspace }) => {
    const { id } = await params;
    const project = await db.tenderProject.findUnique({ where: { id } });
    if (!project || !assertWorkspaceMatch(project.workspaceId, workspace.id)) {
      throw new ApiError("not found", 404);
    }
    const items = await db.tenderRequirement.findMany({
      where: { projectId: id },
      orderBy: { sortOrder: "asc" },
    });
    const summary = {
      total: items.length,
      COVERED: items.filter((i) => i.status === "COVERED").length,
      IN_PROGRESS: items.filter((i) => i.status === "IN_PROGRESS").length,
      MISSING: items.filter((i) => i.status === "MISSING").length,
    };
    return jsonOk({ items, summary });
  }, "requirements");
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTenant("writer", async ({ workspace }) => {
    const { id: projectId } = await params;
    const project = await db.tenderProject.findUnique({ where: { id: projectId } });
    if (!project || !assertWorkspaceMatch(project.workspaceId, workspace.id)) {
      throw new ApiError("not found", 404);
    }
    const body = await req.json().catch(() => ({}));
    const reqId = typeof body.id === "string" ? body.id : null;
    if (!reqId) throw new ApiError("id required", 400);
    const existing = await db.tenderRequirement.findFirst({
      where: { id: reqId, projectId },
    });
    if (!existing) throw new ApiError("requirement not found", 404);

    const parsed = requirementPatchSchema.safeParse(body);
    if (!parsed.success) throw new ApiError("Validation failed", 400);
    const d = parsed.data;

    const item = await db.tenderRequirement.update({
      where: { id: reqId },
      data: {
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.linkedResourceType !== undefined
          ? { linkedResourceType: d.linkedResourceType }
          : {}),
        ...(d.linkedResourceId !== undefined
          ? { linkedResourceId: d.linkedResourceId }
          : {}),
      },
    });
    return jsonOk({ item });
  }, "requirements");
}
