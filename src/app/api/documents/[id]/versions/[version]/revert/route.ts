import { NextRequest, NextResponse } from "next/server";
import type { DocumentVersion } from "@prisma/client";
import { db } from "@/lib/db";
import { requireWriter } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { readWorkspaceStoredFile } from "@/lib/storage";
import {
  MAX_DOCUMENT_VERSION_BYTES,
  verifyDocumentVersionBytes,
} from "@/lib/document-version-integrity";

export const dynamic = "force-dynamic";
class DocumentVersionConflictError extends Error {}

// POST /api/documents/[id]/versions/[version]/revert
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  const session = await requireWriter();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { workspace } = await getTenantContext(session.user.id);
  const userId = session.user.id;
  const { id, version: versionStr } = await params;
  const versionNum = Number(versionStr);
  if (!versionNum) {
    return NextResponse.json({ error: "invalid version" }, { status: 400 });
  }

  const doc = await db.uploadedDocument.findUnique({ where: { id } });
  if (!doc || !assertWorkspaceMatch(doc.workspaceId, workspace.id)) {
    return NextResponse.json({ error: "document not found" }, { status: 404 });
  }

  const target = await db.documentVersion.findUnique({
    where: { documentId_version: { documentId: id, version: versionNum } },
  });
  if (!target) {
    return NextResponse.json(
      { error: "Version not found", code: "VERSION_NOT_FOUND" },
      { status: 404 }
    );
  }
  if (!target.checksum || !/^[a-f0-9]{64}$/i.test(target.checksum)) {
    return NextResponse.json(
      { error: "Version has no verifiable checksum" },
      { status: 409 }
    );
  }
  let bytes: Buffer;
  try {
    bytes = await readWorkspaceStoredFile(target.storagePath, workspace.id, {
      maxBytes: MAX_DOCUMENT_VERSION_BYTES,
    });
  } catch {
    return NextResponse.json(
      { error: "Version bytes are unavailable" },
      { status: 409 }
    );
  }
  let verified: ReturnType<typeof verifyDocumentVersionBytes>;
  try {
    verified = verifyDocumentVersionBytes(bytes, target.sizeBytes);
  } catch {
    return NextResponse.json(
      { error: "Version bytes failed integrity verification" },
      { status: 409 }
    );
  }
  const actualChecksum = verified.checksum;
  if (actualChecksum !== target.checksum.toLowerCase()) {
    return NextResponse.json(
      { error: "Version bytes failed integrity verification" },
      { status: 409 }
    );
  }

  let created: DocumentVersion;
  try {
    created = await db.$transaction(
      async (tx) => {
        const latest = await tx.uploadedDocument.findFirst({
          where: { id, workspaceId: workspace.id },
          select: { currentVersion: true },
        });
        if (!latest) throw new DocumentVersionConflictError();
        const newVersion = latest.currentVersion + 1;
        const updated = await tx.uploadedDocument.updateMany({
          where: {
            id,
            workspaceId: workspace.id,
            currentVersion: latest.currentVersion,
          },
          data: {
            currentVersion: newVersion,
            storagePath: target.storagePath,
            sizeBytes: verified.sizeBytes,
            checksum: actualChecksum,
            parsedSummary: null,
            extractedEntities: null,
            parseStatus: "PENDING",
          },
        });
        if (updated.count !== 1) throw new DocumentVersionConflictError();
        // Chunks are not versioned. Keeping the current chunks after a revert
        // would make RAG serve text from different bytes.
        await tx.documentChunk.deleteMany({ where: { documentId: id } });
        return tx.documentVersion.create({
          data: {
            documentId: id,
            version: newVersion,
            storagePath: target.storagePath,
            sizeBytes: verified.sizeBytes,
            changeLog: `Reverted to v${versionNum}`,
            checksum: actualChecksum,
            createdBy: userId,
          },
        });
      },
      { isolationLevel: "Serializable" }
    );
  } catch (error) {
    if (
      error instanceof DocumentVersionConflictError ||
      (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002")
    ) {
      return NextResponse.json(
        { error: "Document changed concurrently; reload and retry" },
        { status: 409 }
      );
    }
    throw error;
  }

  await audit({
    userId,
    action: "DOC_VERSION_REVERT",
    resource: "UploadedDocument",
    resourceId: id,
    details: {
      revertedFrom: versionNum,
      newVersion: created.version,
      checksum: actualChecksum,
      parseStatus: "PENDING",
    },
  });

  return NextResponse.json({ version: created, revertedFrom: versionNum });
}
