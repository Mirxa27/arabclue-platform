import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import { loadMissionPulse } from "@/lib/agents/platform/mission-pulse";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/platform-agent/missions/:id/pulse — live mission analytics. */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const tenant = await getTenantContext(session.user.id);
  const pulse = await loadMissionPulse(id, tenant.workspace.id);
  if (!pulse) {
    return NextResponse.json({ error: "Mission not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, pulse });
}
