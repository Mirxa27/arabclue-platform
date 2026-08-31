import { jsonApiFailure } from "@/lib/api-controller";
import { NextResponse } from "next/server";
import { requireSession, canWriteRole } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import { loadMissionBundle } from "@/lib/agents/platform/mission";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession();
  if (!session) {
    return jsonApiFailure("AUTHENTICATION_REQUIRED");
  }
  const { id } = await ctx.params;
  const tenant = await getTenantContext(session.user.id);
  const bundle = await loadMissionBundle(id, tenant.workspace.id);
  if (!bundle) {
    return jsonApiFailure("MISSION_NOT_FOUND");
  }
  return NextResponse.json({
    mission: bundle,
    canWrite: canWriteRole(session.user.role),
  });
}
