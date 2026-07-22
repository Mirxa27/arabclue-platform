import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, requireWriter } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { documentPatchSchema, parseJsonBody } from "@/lib/validation";

export const dynamic = "force-dynamic";

async function loadOwnedDoc(id: string, workspaceId: string) {
  const doc = await db.uploadedDocument.findUnique({
    where: { id },
    include: {
      versions: { orderBy: { version: "desc" } },
      uploadedBy: { select: { name: true } },
      project: {
        select: { id: true, title: true, titleAr: true, etimadRef: true },
      },
    },
  });
  if (!doc || !assertWorkspaceMatch(doc.workspaceId, workspaceId)) return null;
  return doc;
}

// GET /api/documents/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = await getTenantContext(session.user.id);
    const { id } = await params;
    const doc = await loadOwnedDoc(id, workspace.id);
    if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ document: doc });
  } catch (err) {
    console.error("[documents GET id]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}

// DELETE /api/documents/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireWriter();
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { workspace } = await getTenantContext(session.user.id);
    const { id } = await params;
    const doc = await loadOwnedDoc(id, workspace.id);
    if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
    await db.uploadedDocument.delete({ where: { id } });
    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.DOC_DELETE,
      resource: "UploadedDocument",
      resourceId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[documents DELETE]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}

// PATCH /api/documents/[id] — sanitized fields only
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireWriter();
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const parsed = await parseJsonBody(req, documentPatchSchema);
    if (!parsed.ok) return parsed.response;

    const { workspace } = await getTenantContext(session.user.id);
    const { id } = await params;
    const doc = await loadOwnedDoc(id, workspace.id);
    if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

    const updated = await db.uploadedDocument.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json({ document: updated });
  } catch (err) {
    console.error("[documents PATCH]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
