import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toErrorResponse } from "@/lib/api-controller";
import { requireSession, requireWriter } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { documentPatchSchema, parseJsonBody } from "@/lib/validation";
import { bumpUsage } from "@/lib/quotas";

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
    return toErrorResponse(err, "[documents GET id]");
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
    const [
      pastProjectReferences,
      certificateReferences,
      methodologyReferences,
      libraryReferences,
    ] = await db.$transaction([
      db.pastProject.count({ where: { evidenceDocumentId: id } }),
      db.certificate.count({ where: { evidenceDocumentId: id } }),
      db.methodologyAsset.count({ where: { evidenceDocumentId: id } }),
      db.contentLibraryItem.count({ where: { evidenceDocumentId: id } }),
    ]);
    const evidenceReferenceCount =
      pastProjectReferences +
      certificateReferences +
      methodologyReferences +
      libraryReferences;
    if (evidenceReferenceCount > 0) {
      return NextResponse.json(
        {
          error:
            "Document is retained as reviewed knowledge evidence and cannot be deleted",
          code: "DOCUMENT_EVIDENCE_DELETE_FORBIDDEN",
        },
        { status: 409 }
      );
    }
    try {
      await db.uploadedDocument.delete({ where: { id } });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2003"
      ) {
        return NextResponse.json(
          {
            error:
              "Document became reviewed knowledge evidence and cannot be deleted",
            code: "DOCUMENT_EVIDENCE_DELETE_CONFLICT",
          },
          { status: 409 }
        );
      }
      throw error;
    }
    // The bytes are gone, so the allowance comes back. Credited to the uploader
    // because that is the subscription the upload was charged to — quotas hang
    // off a user, documents hang off a workspace.
    await bumpUsage(doc.uploadedById, "storage", -doc.sizeBytes);

    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.DOC_DELETE,
      resource: "UploadedDocument",
      resourceId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err, "[documents DELETE]");
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
    return toErrorResponse(err, "[documents PATCH]");
  }
}
