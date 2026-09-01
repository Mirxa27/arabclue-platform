import { NextRequest, NextResponse } from "next/server";
import type { DocumentVersion } from "@prisma/client";
import { db } from "@/lib/db";
import { jsonApiFailure } from "@/lib/api-controller";
import { requireWriter } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { readWorkspaceStoredFile } from "@/lib/storage";
import {
  MAX_DOCUMENT_VERSION_BYTES,
  verifyDocumentVersionBytes,
} from "@/lib/document-version-integrity";
import {
  analyticsRequestOrigin,
  recordDocumentAnalyticsEvent,
} from "@/lib/analytics-collector";

export const dynamic = "force-dynamic";
class DocumentVersionConflictError extends Error {}

// POST /api/documents/[id]/versions/[version]/revert
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  const session = await requireWriter();
  if (!session) return jsonApiFailure("FORBIDDEN");
  const { workspace } = await getTenantContext(session.user.id);
  const userId = session.user.id;
  const { id, version: versionStr } = await params;
  const versionNum = Number(versionStr);
  if (!versionNum) return jsonApiFailure("INVALID_VERSION");

  const doc = await db.uploadedDocument.findUnique({ where: { id } });
  if (!doc || !assertWorkspaceMatch(doc.workspaceId, workspace.id)) {
    return jsonApiFailure("RESOURCE_NOT_FOUND");
  }

  const target = await db.documentVersion.findUnique({
    where: { documentId_version: { documentId: id, version: versionNum } },
  });
  if (!target) return jsonApiFailure("VERSION_NOT_FOUND");
  if (!target.checksum || !/^[a-f0-9]{64}$/i.test(target.checksum)) {
    return jsonApiFailure("DOCUMENT_VERSION_CHECKSUM_MISSING");
  }
  let bytes: Buffer;
  try {
    bytes = await readWorkspaceStoredFile(target.storagePath, workspace.id, {
      maxBytes: MAX_DOCUMENT_VERSION_BYTES,
    });
  } catch {
    return jsonApiFailure("DOCUMENT_VERSION_BYTES_UNAVAILABLE");
  }
  let verified: ReturnType<typeof verifyDocumentVersionBytes>;
  try {
    verified = verifyDocumentVersionBytes(bytes, target.sizeBytes);
  } catch {
    return jsonApiFailure("DOCUMENT_VERSION_INTEGRITY_FAILED");
  }
  const actualChecksum = verified.checksum;
  if (actualChecksum !== target.checksum.toLowerCase()) {
    return jsonApiFailure("DOCUMENT_VERSION_INTEGRITY_FAILED");
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
      return jsonApiFailure("DOCUMENT_VERSION_CONFLICT");
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

  await recordDocumentAnalyticsEvent({
    eventType: "document_version_created",
    documentId: id,
    mutationRef: `revert:v${created.version}:from:${versionNum}`,
    origin: analyticsRequestOrigin({
      tenantWorkspaceId: workspace.id,
      actorUserId: userId,
    }),
    metadata: {
      documentVersionId: created.id,
    },
  });

  return NextResponse.json({ version: created, revertedFrom: versionNum });
}
