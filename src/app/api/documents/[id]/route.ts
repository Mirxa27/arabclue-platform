import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonApiFailure, toErrorResponse } from "@/lib/api-controller";
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
    if (!session) return jsonApiFailure("UNAUTHORIZED");
    const { workspace } = await getTenantContext(session.user.id);
    const { id } = await params;
    const doc = await loadOwnedDoc(id, workspace.id);
    if (!doc) return jsonApiFailure("RESOURCE_NOT_FOUND");
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
    if (!session) return jsonApiFailure("FORBIDDEN");
    const { workspace } = await getTenantContext(session.user.id);
    const { id } = await params;
    const doc = await loadOwnedDoc(id, workspace.id);
    if (!doc) return jsonApiFailure("RESOURCE_NOT_FOUND");
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
      // The code was already on the wire under this name but was registered
      // nowhere, so `error` carried the only readable text and it was English.
      return jsonApiFailure("DOCUMENT_EVIDENCE_DELETE_FORBIDDEN");
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
        return jsonApiFailure("DOCUMENT_EVIDENCE_DELETE_CONFLICT");
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
    if (!session) return jsonApiFailure("FORBIDDEN");
    const parsed = await parseJsonBody(req, documentPatchSchema);
    if (!parsed.ok) return parsed.response;

    const { workspace } = await getTenantContext(session.user.id);
    const { id } = await params;
    const doc = await loadOwnedDoc(id, workspace.id);
    if (!doc) return jsonApiFailure("RESOURCE_NOT_FOUND");

    const updated = await db.uploadedDocument.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json({ document: updated });
  } catch (err) {
    return toErrorResponse(err, "[documents PATCH]");
  }
}
