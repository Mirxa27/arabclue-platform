import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toErrorResponse } from "@/lib/api-controller";
import { requireWriter } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { agentCancelBodySchema, parseJsonBody } from "@/lib/validation";
import {
  analyticsRequestOrigin,
  recordAgentRunAnalyticsEvent,
} from "@/lib/analytics-collector";

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

    // The cancellation transition has committed. The collector derives the
    // elapsed time from the recorded start instant as a nonnegative whole number
    // of milliseconds; a failure never changes this response (requirements 4.2,
    // 4.4, 4.5, 4.6).
    await recordAgentRunAnalyticsEvent({
      eventType: "agent_run_cancelled",
      runId,
      origin: analyticsRequestOrigin({
        tenantWorkspaceId: workspace.id,
        actorUserId: session.user.id,
      }),
      startedAt: run.startedAt ?? run.createdAt,
      metadata: {
        projectId: run.projectId,
        outcomeReason: "cancelled_by_user",
      },
    });

    return NextResponse.json({ ok: true, status: "CANCELLED", runId });
  } catch (err) {
    return toErrorResponse(err, "[agents/cancel]");
  }
}
