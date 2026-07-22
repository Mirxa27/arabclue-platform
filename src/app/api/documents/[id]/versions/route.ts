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

// POST /api/documents/[id]/versions — create a new version
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

  const newVersion = current.currentVersion + 1;
  const [version] = await db.$transaction([
    db.documentVersion.create({
      data: {
        documentId: id,
        version: newVersion,
        storagePath,
        sizeBytes,
        changeLog: changeLog ?? `Version ${newVersion}`,
        createdBy: session.user.id,
      },
    }),
    db.uploadedDocument.update({
      where: { id },
      data: { currentVersion: newVersion, storagePath, sizeBytes },
    }),
  ]);

  return NextResponse.json({ version });
}
