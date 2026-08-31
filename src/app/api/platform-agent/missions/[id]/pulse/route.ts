import { jsonApiFailure } from "@/lib/api-controller";
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
    return jsonApiFailure("AUTHENTICATION_REQUIRED");
  }
  const { id } = await ctx.params;
  const tenant = await getTenantContext(session.user.id);
  const pulse = await loadMissionPulse(id, tenant.workspace.id);
  if (!pulse) {
    return jsonApiFailure("MISSION_NOT_FOUND");
  }
  return NextResponse.json({ ok: true, pulse });
}
