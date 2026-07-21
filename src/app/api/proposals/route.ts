import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

// GET /api/proposals?projectId=...
export async function GET(req: NextRequest) {
  const { workspace } = await getBootstrapContext();
  const projectId = req.nextUrl.searchParams.get("projectId");
  const proposals = await db.generatedProposal.findMany({
    where: {
      workspaceId: workspace.id,
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { id: true, title: true, titleAr: true, etimadRef: true } },
    },
  });
  return NextResponse.json({ proposals });
}
