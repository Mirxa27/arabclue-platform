import { db } from "@/lib/db";
import { withTenant, jsonOk } from "@/lib/api-controller";
import {
  ACTIVE_TENDER_STATUSES,
  aggregateTenderInsights,
} from "@/lib/tender-insights";

export const dynamic = "force-dynamic";

// GET /api/stats/tender-insights — total budget distribution across active
// tenders by category (tenant-scoped).
export async function GET() {
  return withTenant("session", async ({ workspace }) => {
    const projects = await db.tenderProject.findMany({
      where: {
        workspaceId: workspace.id,
        status: { in: [...ACTIVE_TENDER_STATUSES] },
      },
      select: {
        category: true,
        budget: true,
        currency: true,
        status: true,
      },
    });

    const insights = aggregateTenderInsights(
      projects.map((p) => ({
        category: p.category,
        budget: p.budget,
        currency: p.currency,
        status: p.status,
      }))
    );

    return jsonOk({
      workspace: { id: workspace.id, name: workspace.name },
      insights,
    });
  }, "tender-insights GET");
}
