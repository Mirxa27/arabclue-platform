import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenant, jsonOk } from "@/lib/api-controller";

export const dynamic = "force-dynamic";

// GET /api/proposals?projectId=...
export async function GET(req: NextRequest) {
  return withTenant("session", async ({ workspace }) => {
    const projectId = req.nextUrl.searchParams.get("projectId");
    // List view only: bounded, newest-touched first, and without the
    // Markdown body (the detail route serves contentMd for one proposal).
    const proposals = await db.generatedProposal.findMany({
      where: {
        workspaceId: workspace.id,
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      omit: {
        contentMd: true,
        structuredSnapshot: true,
        contractRenderSnapshot: true,
      },
      include: {
        project: {
          select: { id: true, title: true, titleAr: true, etimadRef: true },
        },
      },
    });
    return jsonOk({ proposals });
  }, "proposals GET");
}
