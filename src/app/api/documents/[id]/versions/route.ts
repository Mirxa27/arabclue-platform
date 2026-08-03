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
import {
  analyticsRequestOrigin,
  recordDocumentAnalyticsEvent,
} from "@/lib/analytics-collector";
import {
  decodeDocumentVersionCursor,
  encodeDocumentVersionCursor,
} from "@/lib/version-history-cursor";

export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

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
// Keyset pagination with bounded page size max 50
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspace } = await getTenantContext(session.user.id);
  const { id } = await params;
  const doc = await ownedDoc(id, workspace.id);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Parse pagination params
  const searchParams = req.nextUrl.searchParams;
  const limitParam = searchParams.get("limit");
  const cursorParam = searchParams.get("cursor");

  const limit = Math.min(
    Math.max(1, limitParam ? parseInt(limitParam, 10) || DEFAULT_PAGE_SIZE : DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  );

  let cursorVersion: number | null = null;
  if (cursorParam) {
    cursorVersion = decodeDocumentVersionCursor(
      cursorParam,
      workspace.id,
      id
    );
    if (cursorVersion === null) {
      return NextResponse.json(
        {
          error: "Version history cursor is invalid",
          code: "VERSION_CURSOR_INVALID",
        },
        { status: 400 }
      );
    }
  }

  // Build query with keyset pagination (descending by version)
  const versions = await db.documentVersion.findMany({
    where: {
      documentId: id,
      ...(cursorVersion !== null ? { version: { lt: cursorVersion } } : {}),
    },
    orderBy: { version: "desc" },
    take: limit + 1, // Fetch one extra to determine if there's a next page
    select: {
      id: true,
      version: true,
      storagePath: true,
      sizeBytes: true,
      changeLog: true,
      checksum: true,
      createdBy: true,
      createdAt: true,
    },
  });

  // Determine if there's more data
  const hasMore = versions.length > limit;
  const results = hasMore ? versions.slice(0, limit) : versions;
  const last = results[results.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeDocumentVersionCursor(workspace.id, id, last.version)
      : null;

  // Fetch author info for display
  const authorIds = [...new Set(results.map((v) => v.createdBy).filter(Boolean))];
  const authors = authorIds.length
    ? await db.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const authorMap = new Map(authors.map((a) => [a.id, { name: a.name, email: a.email }]));

  const versionsWithAuthors = results.map((v) => ({
    id: v.id,
    version: v.version,
    storagePath: v.storagePath,
    sizeBytes: v.sizeBytes,
    changeLog: v.changeLog,
    checksum: v.checksum,
    createdAt: v.createdAt.toISOString(),
    author: v.createdBy ? authorMap.get(v.createdBy) ?? null : null,
  }));

  return NextResponse.json({
    versions: versionsWithAuthors,
    nextCursor,
    hasMore,
  });
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

  // The version row has committed. The persisted version identifier is both the
  // mutation reference and the required version identifier of the event; a
  // failure never changes this response (requirements 4.3, 4.4, 4.5, 4.6).
  await recordDocumentAnalyticsEvent({
    eventType: "document_version_created",
    documentId: id,
    mutationRef: version.id,
    origin: analyticsRequestOrigin({
      tenantWorkspaceId: workspace.id,
      actorUserId: session.user.id,
    }),
    metadata: {
      documentVersionId: version.id,
      versionNumber: version.version,
      sizeBytes: verified.sizeBytes,
    },
  });

  return NextResponse.json({ version });
}
