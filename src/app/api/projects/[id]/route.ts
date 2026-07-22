import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, requireWriter } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { parseJsonBody, projectPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

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
  try {
    const session = await requireSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { workspace } = await getTenantContext(session.user.id);
    const { id } = await params;
    const project = await loadOwnedProject(id, workspace.id);
    if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ project });
  } catch (err) {
    console.error("[projects GET id]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireWriter();
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsed = await parseJsonBody(req, projectPatchSchema);
    if (!parsed.ok) return parsed.response;

    const { workspace } = await getTenantContext(session.user.id);
    const { id } = await params;
    const project = await loadOwnedProject(id, workspace.id);
    if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

    const body = parsed.data;
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
      action: AUDIT_ACTIONS.PROJECT_CREATE,
      resource: "TenderProject",
      resourceId: id,
      details: { patched: Object.keys(data) },
    });
    return NextResponse.json({ project: updated });
  } catch (err) {
    console.error("[projects PATCH]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireWriter();
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { workspace } = await getTenantContext(session.user.id);
    const { id } = await params;
    const project = await loadOwnedProject(id, workspace.id);
    if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

    await db.tenderProject.delete({ where: { id } });
    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.PROJECT_CREATE,
      resource: "TenderProject",
      resourceId: id,
      details: { deleted: true },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[projects DELETE]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
