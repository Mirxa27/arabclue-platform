import { NextResponse } from "next/server";
import { requireSession, canWriteRole } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import { loadMissionBundle } from "@/lib/agents/platform/mission";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const tenant = await getTenantContext(session.user.id);
  const bundle = await loadMissionBundle(id, tenant.workspace.id);
  if (!bundle) {
    return NextResponse.json({ error: "Mission not found" }, { status: 404 });
  }
  return NextResponse.json({
    mission: bundle,
    canWrite: canWriteRole(session.user.role),
  });
}
