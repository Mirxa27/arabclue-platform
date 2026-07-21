import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

// GET /api/documents/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const doc = await db.uploadedDocument.findUnique({
    where: { id },
    include: {
      versions: { orderBy: { version: "desc" } },
      uploadedBy: { select: { name: true } },
      project: { select: { id: true, title: true, titleAr: true, etimadRef: true } },
    },
  });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ document: doc });
}

// DELETE /api/documents/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.uploadedDocument.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// PATCH /api/documents/[id] — update parse status / reparse
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const updated = await db.uploadedDocument.update({
    where: { id },
    data: body,
  });
  return NextResponse.json({ document: updated });
}
