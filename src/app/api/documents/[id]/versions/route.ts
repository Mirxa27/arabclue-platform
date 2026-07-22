import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, requireWriter } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

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

  const body = await req.json();
  const { storagePath, sizeBytes, changeLog } = body as {
    storagePath: string;
    sizeBytes: number;
    changeLog?: string;
  };
  if (!storagePath || typeof sizeBytes !== "number") {
    return NextResponse.json(
      { error: "storagePath and sizeBytes required" },
      { status: 400 }
    );
  }

  // HIGH fix: never trust client path — must be inside workspace folder and exist
  const normalized = storagePath.replace(/\\/g, "/");
  const expectedPrefix = `uploads/${workspace.id}/`;
  if (!normalized.startsWith(expectedPrefix) && !normalized.startsWith(`uploads/${workspace.id}`)) {
    return NextResponse.json({ error: "invalid storagePath workspace mismatch" }, { status: 400 });
  }
  if (normalized.includes("..")) {
    return NextResponse.json({ error: "invalid path traversal" }, { status: 400 });
  }

  // Verify file actually exists and size matches (if possible) — prevents injection
  const { fileExists } = await import("@/lib/storage");
  const exists = await fileExists(normalized);
  if (!exists) {
    return NextResponse.json({ error: "file not found on server for version" }, { status: 400 });
  }

  // Enforce reasonable size (max 100MB per version)
  if (sizeBytes <= 0 || sizeBytes > 100 * 1024 * 1024) {
    return NextResponse.json({ error: "invalid sizeBytes" }, { status: 400 });
  }

  const newVersion = current.currentVersion + 1;
  const [version] = await db.$transaction([
    db.documentVersion.create({
      data: {
        documentId: id,
        version: newVersion,
        storagePath: normalized,
        sizeBytes,
        changeLog: changeLog ?? `Version ${newVersion}`,
        createdBy: session.user.id,
      },
    }),
    db.uploadedDocument.update({
      where: { id },
      data: { currentVersion: newVersion, storagePath: normalized, sizeBytes },
    }),
  ]);

  const { audit, AUDIT_ACTIONS } = await import("@/lib/audit");
  await audit({
    userId: session.user.id,
    action: AUDIT_ACTIONS.DOC_UPLOAD,
    resource: "UploadedDocument",
    resourceId: id,
    details: { version: newVersion, storagePath: normalized },
  });

  return NextResponse.json({ version });
}
