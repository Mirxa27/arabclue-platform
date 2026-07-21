import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/proposals/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const proposal = await db.generatedProposal.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, title: true, titleAr: true, etimadRef: true } },
    },
  });
  if (!proposal) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    proposal: {
      ...proposal,
      artifacts: proposal.artifactsJson ? JSON.parse(proposal.artifactsJson) : [],
    },
  });
}
