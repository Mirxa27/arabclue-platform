import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireWriter } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { agentCancelBodySchema, parseJsonBody } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** POST /api/agents/cancel { runId } — mark run CANCELLED; pipeline exits at next checkpoint */
export async function POST(req: NextRequest) {
  try {
    const session = await requireWriter();
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const parsed = await parseJsonBody(req, agentCancelBodySchema);
    if (!parsed.ok) return parsed.response;

    const { workspace } = await getTenantContext(session.user.id);
    const { runId } = parsed.data;

    const run = await db.agentRun.findUnique({
      where: { id: runId },
      include: { project: { select: { workspaceId: true } } },
    });
    if (!run || !assertWorkspaceMatch(run.project.workspaceId, workspace.id)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (
      run.status === "COMPLETED" ||
      run.status === "FAILED" ||
      run.status === "CANCELLED"
    ) {
      return NextResponse.json({ ok: true, status: run.status, runId: run.id });
    }

    // Conditional update prevents racing COMPLETED overwrite
    const result = await db.agentRun.updateMany({
      where: {
        id: runId,
        status: { in: ["QUEUED", "RUNNING"] },
      },
      data: {
        status: "CANCELLED",
        errorMessage: "Cancelled by user",
        completedAt: new Date(),
      },
    });

    if (result.count === 0) {
      const latest = await db.agentRun.findUnique({ where: { id: runId } });
      return NextResponse.json({
        ok: true,
        status: latest?.status ?? "UNKNOWN",
        runId,
      });
    }

    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.AGENT_RUN,
      resource: "AgentRun",
      resourceId: runId,
      details: { cancelled: true },
    });

    return NextResponse.json({ ok: true, status: "CANCELLED", runId });
  } catch (err) {
    console.error("[agents/cancel]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
