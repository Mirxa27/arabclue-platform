import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonOk, withTenant } from "@/lib/api-controller";
import { serializeAgentRun } from "@/lib/agent-runs";

export const dynamic = "force-dynamic";

function parseLimit(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("limit");
  const parsed = raw ? Number.parseInt(raw, 10) : 50;
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(parsed, 1), 100);
}

// GET /api/agents/runs?limit=50 — latest workspace-wide agent runs
export async function GET(req: NextRequest) {
  return withTenant("session", async ({ workspace }) => {
    const runs = await db.agentRun.findMany({
      where: { project: { workspaceId: workspace.id } },
      orderBy: { createdAt: "desc" },
      take: parseLimit(req),
      include: {
        project: {
          select: {
            workspaceId: true,
            title: true,
            etimadRef: true,
          },
        },
      },
    });

    return jsonOk({ runs: runs.map(serializeAgentRun) });
  }, "agents runs GET");
}
