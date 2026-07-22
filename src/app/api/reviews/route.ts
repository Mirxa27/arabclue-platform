import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenant, jsonOk } from "@/lib/api-controller";

export const dynamic = "force-dynamic";

export async function GET() {
  return withTenant("session", async ({ workspace, userId }) => {
    const items = await db.proposalReview.findMany({
      where: {
        reviewerId: userId,
        status: "PENDING",
        proposal: { workspaceId: workspace.id },
      },
      orderBy: { createdAt: "asc" },
      include: {
        reviewer: { select: { id: true, name: true, email: true } },
        proposal: {
          select: {
            id: true,
            title: true,
            status: true,
            project: { select: { id: true, title: true } },
          },
        },
      },
    });
    return jsonOk({ items });
  }, "reviews");
}
