import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireWriter } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

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
    return NextResponse.json({ error: "version not found" }, { status: 404 });
  }

  const newVersion = doc.currentVersion + 1;
  const [created] = await db.$transaction([
    db.documentVersion.create({
      data: {
        documentId: id,
        version: newVersion,
        storagePath: target.storagePath,
        sizeBytes: target.sizeBytes,
        changeLog: `Reverted to v${versionNum}`,
        parsedSummary: target.parsedSummary,
        extractedEntities: target.extractedEntities,
        checksum: target.checksum,
        createdBy: userId,
      },
    }),
    db.uploadedDocument.update({
      where: { id },
      data: {
        currentVersion: newVersion,
        storagePath: target.storagePath,
        sizeBytes: target.sizeBytes,
        checksum: target.checksum,
        parsedSummary: target.parsedSummary,
        extractedEntities: target.extractedEntities,
        parseStatus: "PARSED",
      },
    }),
  ]);

  await audit({
    userId,
    action: "DOC_VERSION_REVERT",
    resource: "UploadedDocument",
    resourceId: id,
    details: { revertedFrom: versionNum, newVersion },
  });

  return NextResponse.json({ version: created, revertedFrom: versionNum });
}
