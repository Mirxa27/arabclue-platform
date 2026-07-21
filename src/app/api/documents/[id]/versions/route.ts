import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

// GET /api/documents/[id]/versions
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
  const { id } = await params;
  const { workspace } = await getBootstrapContext();
  const body = await req.json();
  const { storagePath, sizeBytes, changeLog } = body as {
    storagePath: string;
    sizeBytes: number;
    changeLog?: string;
  };

  const current = await db.uploadedDocument.findUnique({
    where: { id },
    select: { currentVersion: true, uploadedById: true },
  });
  if (!current) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const newVersion = current.currentVersion + 1;
  const [version, _updated] = await db.$transaction([
    db.documentVersion.create({
      data: {
        documentId: id,
        version: newVersion,
        storagePath,
        sizeBytes,
        changeLog: changeLog ?? `Version ${newVersion}`,
        createdBy: current.uploadedById,
      },
    }),
    db.uploadedDocument.update({
      where: { id },
      data: { currentVersion: newVersion, storagePath, sizeBytes },
    }),
  ]);

  return NextResponse.json({ version });
}
