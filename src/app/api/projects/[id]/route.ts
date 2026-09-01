import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  ResourceNotFoundError,
  parseJsonBody,
  withTenant,
} from "@/lib/api-controller";
import { assertWorkspaceMatch } from "@/lib/workspace-context";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { projectPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Absent and foreign are both `not found`, deliberately.
 *
 * `requireTenantRecord` would answer 403 for a project that exists in someone
 * else's workspace, which turns this route into an existence oracle: guess an
 * id, read the status, learn whether a rival's bid is in the system. The three
 * 404s below are the one place that distinction is worth losing.
 */
async function loadOwnedProject(id: string, workspaceId: string) {
  const project = await db.tenderProject.findUnique({ where: { id } });
  if (!project || !assertWorkspaceMatch(project.workspaceId, workspaceId)) return null;
  return project;
}

// GET /api/projects/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTenant(
    "session",
    async ({ workspace }) => {
      const { id } = await params;
      const project = await loadOwnedProject(id, workspace.id);
      if (!project) throw new ResourceNotFoundError();
      return NextResponse.json({ project });
    },
    "[projects GET id]"
  );
}

// PATCH /api/projects/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTenant(
    "writer",
    async ({ session, workspace }) => {
      const body = await parseJsonBody(req, projectPatchSchema);

      const { id } = await params;
      const project = await loadOwnedProject(id, workspace.id);
      if (!project) throw new ResourceNotFoundError();

      const data: Record<string, unknown> = {};
      if (body.title !== undefined) data.title = body.title;
      if (body.titleAr !== undefined) data.titleAr = body.titleAr;
      if (body.category !== undefined) data.category = body.category;
      if (body.budget !== undefined) data.budget = body.budget;
      if (body.currency !== undefined) data.currency = body.currency;
      if (body.status !== undefined) data.status = body.status;
      if (body.saudizationTarget !== undefined) data.saudizationTarget = body.saudizationTarget;
      if (body.localContentTarget !== undefined) data.localContentTarget = body.localContentTarget;
      if (body.submissionDeadline === null) data.submissionDeadline = null;
      else if (typeof body.submissionDeadline === "string") {
        data.submissionDeadline = new Date(body.submissionDeadline);
      }

      const updated = await db.tenderProject.update({ where: { id }, data });
      await audit({
        userId: session.user.id,
        action: AUDIT_ACTIONS.PROJECT_UPDATE,
        resource: "TenderProject",
        resourceId: id,
        details: { patched: Object.keys(data) },
      });
      return NextResponse.json({ project: updated });
    },
    "[projects PATCH]"
  );
}

// DELETE /api/projects/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTenant(
    "writer",
    async ({ session, workspace }) => {
      const { id } = await params;
      const project = await loadOwnedProject(id, workspace.id);
      if (!project) throw new ResourceNotFoundError();

      await db.tenderProject.delete({ where: { id } });
      await audit({
        userId: session.user.id,
        action: AUDIT_ACTIONS.PROJECT_DELETE,
        resource: "TenderProject",
        resourceId: id,
        details: { deleted: true },
      });
      return NextResponse.json({ ok: true });
    },
    "[projects DELETE]"
  );
}
