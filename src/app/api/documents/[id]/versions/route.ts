import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { DocumentVersion } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession, requireWriter } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import {
  assertWorkspaceStoragePath,
  readWorkspaceStoredFile,
} from "@/lib/storage";
import {
  MAX_DOCUMENT_VERSION_BYTES,
  verifyDocumentVersionBytes,
} from "@/lib/document-version-integrity";

export const dynamic = "force-dynamic";

const createVersionSchema = z
  .object({
    storagePath: z.string().trim().min(1).max(1_000),
    sizeBytes: z.number().int().positive().max(MAX_DOCUMENT_VERSION_BYTES),
    changeLog: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict();

class DocumentVersionConflictError extends Error {}

async function ownedDoc(id: string, workspaceId: string) {
  const doc = await db.uploadedDocument.findUnique({
    where: { id },
    select: { id: true, workspaceId: true, currentVersion: true, uploadedById: true },
  });
  if (!doc || !assertWorkspaceMatch(doc.workspaceId, workspaceId)) return null;
  return doc;
}

// GET /api/documents/[id]/versions
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspace } = await getTenantContext(session.user.id);
  const { id } = await params;
  const doc = await ownedDoc(id, workspace.id);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const versions = await db.documentVersion.findMany({
    where: { documentId: id },
    orderBy: { version: "desc" },
  });
  return NextResponse.json({ versions });
}

// POST /api/documents/[id]/versions — create a new version (server-validated path)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireWriter();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { workspace } = await getTenantContext(session.user.id);
  const { id } = await params;
  const current = await ownedDoc(id, workspace.id);
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = createVersionSchema.safeParse(
    await req.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid document version request" },
      { status: 400 }
    );
  }
  const { storagePath, sizeBytes, changeLog } = parsed.data;

  let normalized: string;
  let bytes: Buffer;
  try {
    normalized = assertWorkspaceStoragePath(storagePath, workspace.id);
    bytes = await readWorkspaceStoredFile(normalized, workspace.id, {
      maxBytes: MAX_DOCUMENT_VERSION_BYTES,
    });
  } catch {
    return NextResponse.json(
      { error: "Stored version file was not found in this workspace" },
      { status: 400 }
    );
  }
  let verified: ReturnType<typeof verifyDocumentVersionBytes>;
  try {
    verified = verifyDocumentVersionBytes(bytes, sizeBytes);
  } catch {
    return NextResponse.json(
      { error: "Declared version size does not match stored bytes" },
      { status: 400 }
    );
  }
  const { checksum } = verified;

  let version: DocumentVersion;
  try {
    version = await db.$transaction(
      async (tx) => {
        const latest = await tx.uploadedDocument.findFirst({
          where: { id, workspaceId: workspace.id },
          select: { currentVersion: true },
        });
        if (!latest) {
          throw new DocumentVersionConflictError();
        }
        const newVersion = latest.currentVersion + 1;
        const updated = await tx.uploadedDocument.updateMany({
          where: {
            id,
            workspaceId: workspace.id,
            currentVersion: latest.currentVersion,
          },
          data: {
            currentVersion: newVersion,
            storagePath: normalized,
            sizeBytes: verified.sizeBytes,
            checksum,
            parseStatus: "PENDING",
            parsedSummary: null,
            extractedEntities: null,
          },
        });
        if (updated.count !== 1) {
          throw new DocumentVersionConflictError();
        }
        // Derived chunks belong to the previous bytes. They must not remain
        // queryable while the new version awaits parsing.
        await tx.documentChunk.deleteMany({ where: { documentId: id } });
        return tx.documentVersion.create({
          data: {
            documentId: id,
            version: newVersion,
            storagePath: normalized,
            sizeBytes: verified.sizeBytes,
            checksum,
            changeLog: changeLog ?? `Version ${newVersion}`,
            createdBy: session.user.id,
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

  const { audit, AUDIT_ACTIONS } = await import("@/lib/audit");
  await audit({
    userId: session.user.id,
    action: AUDIT_ACTIONS.DOC_UPLOAD,
    resource: "UploadedDocument",
    resourceId: id,
    details: {
      version: version.version,
      sizeBytes: verified.sizeBytes,
      checksum,
      parseStatus: "PENDING",
    },
  });

  return NextResponse.json({ version });
}
