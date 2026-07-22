import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/agents/status?runId=... — poll real agent pipeline progress
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = await getTenantContext(session.user.id);
    const runId = req.nextUrl.searchParams.get("runId");
    if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

    const run = await db.agentRun.findUnique({
      where: { id: runId },
      include: { project: { select: { workspaceId: true } } },
    });
    if (!run || !assertWorkspaceMatch(run.project.workspaceId, workspace.id)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    return NextResponse.json({
      runId: run.id,
      status: run.status,
      overallProgress: run.overallProgress,
      agentStates: run.agentStates ? JSON.parse(run.agentStates) : [],
      finalArtifact: run.finalArtifact ? JSON.parse(run.finalArtifact) : null,
      errorMessage: run.errorMessage,
    });
  } catch (err) {
    console.error("[agents/status]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
