import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import {
  getOrCreateMission,
  loadMissionBundle,
} from "@/lib/agents/platform/mission";
import { canWriteRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenant = await getTenantContext(session.user.id);
  const locale = session.user.locale === "en" ? "en" : "ar";
  const mission = await getOrCreateMission({
    workspaceId: tenant.workspace.id,
    userId: session.user.id,
    locale,
  });
  const bundle = await loadMissionBundle(mission.id, tenant.workspace.id);
  return NextResponse.json({
    mission: bundle,
    canWrite: canWriteRole(session.user.role),
  });
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenant = await getTenantContext(session.user.id);
  const body = (await req.json().catch(() => ({}))) as {
    activeProjectId?: string | null;
  };
  const locale = session.user.locale === "en" ? "en" : "ar";
  const mission = await getOrCreateMission({
    workspaceId: tenant.workspace.id,
    userId: session.user.id,
    locale,
    activeProjectId: body.activeProjectId,
  });
  const bundle = await loadMissionBundle(mission.id, tenant.workspace.id);
  return NextResponse.json({
    mission: bundle,
    canWrite: canWriteRole(session.user.role),
  });
}
