import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonApiFailure } from "@/lib/api-controller";
import { requireSession } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import {
  assertWorkspaceStoragePath,
  readWorkspaceStoredFile,
} from "@/lib/storage";
import { verifyDocumentVersionBytes } from "@/lib/document-version-integrity";

export const dynamic = "force-dynamic";

/**
 * GET /api/documents/[id]/versions/[version]
 * Immutable document revision detail with integrity metadata.
 * Optional `?includeBytes=1` returns base64 file bytes after checksum verify.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  const session = await requireSession();
  if (!session) return jsonApiFailure("UNAUTHORIZED");

  const { workspace } = await getTenantContext(session.user.id);
  const { id, version: versionRaw } = await params;
  const versionNum = Number.parseInt(versionRaw, 10);
  if (!Number.isFinite(versionNum) || versionNum < 1) {
    return jsonApiFailure("INVALID_VERSION");
  }

  const doc = await db.uploadedDocument.findUnique({
    where: { id },
    select: {
      id: true,
      workspaceId: true,
      originalName: true,
      mimeType: true,
      currentVersion: true,
    },
  });
  if (!doc || !assertWorkspaceMatch(doc.workspaceId, workspace.id)) {
    return jsonApiFailure("RESOURCE_NOT_FOUND");
  }

  const row = await db.documentVersion.findUnique({
    where: {
      documentId_version: {
        documentId: id,
        version: versionNum,
      },
    },
  });
  if (!row) return jsonApiFailure("VERSION_NOT_FOUND");

  const author = row.createdBy
    ? await db.user.findUnique({
        where: { id: row.createdBy },
        select: { id: true, name: true, email: true },
      })
    : null;

  const includeBytes = req.nextUrl.searchParams.get("includeBytes") === "1";
  let bytesBase64: string | null = null;
  let integrityOk = true;

  if (includeBytes) {
    try {
      assertWorkspaceStoragePath(row.storagePath, workspace.id);
      const bytes = await readWorkspaceStoredFile(
        row.storagePath,
        workspace.id
      );
      const verified = verifyDocumentVersionBytes(bytes, row.sizeBytes);
      integrityOk =
        !row.checksum ||
        verified.checksum.toLowerCase() === row.checksum.toLowerCase();
      if (integrityOk) {
        bytesBase64 = Buffer.from(bytes).toString("base64");
      }
    } catch {
      integrityOk = false;
    }
  }

  return NextResponse.json({
    document: {
      id: doc.id,
      originalName: doc.originalName,
      mimeType: doc.mimeType,
      currentVersion: doc.currentVersion,
    },
    version: {
      id: row.id,
      version: row.version,
      storagePath: row.storagePath,
      sizeBytes: row.sizeBytes,
      changeLog: row.changeLog,
      checksum: row.checksum,
      createdAt: row.createdAt.toISOString(),
      author,
      integrityOk,
      ...(includeBytes ? { bytesBase64 } : {}),
    },
  });
}
