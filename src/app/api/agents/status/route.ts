import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonApiFailure, toErrorResponse } from "@/lib/api-controller";
import { requireSession } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { isAgentRunStale } from "@/lib/proposal-studio";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * A run that has gone quiet past the heartbeat window is failed here with a
 * reason. It is never restarted from this route: the pipeline runs as a
 * durable workflow whose engine owns retries, and a second `start()` for the
 * same row would execute the agents twice.
 */
const STALE_RUN_MESSAGE =
  "Agent run stopped reporting progress (stale). Start a new run.";

// GET /api/agents/status?runId=... — poll real agent pipeline progress; resume stale runs
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return jsonApiFailure("UNAUTHORIZED", { status: 401 });
    }
    const { workspace } = await getTenantContext(session.user.id);
    const runIdParam = req.nextUrl.searchParams.get("runId");
    const projectId = req.nextUrl.searchParams.get("projectId");
    // A pure read. The dock's run pulse polls from every page; it must never
    // fail a quiet run on the page's behalf — only the agents page does that.
    const observeOnly = req.nextUrl.searchParams.get("observe") === "1";

    let run =
      runIdParam != null
        ? await db.agentRun.findUnique({
            where: { id: runIdParam },
            include: { project: { select: { workspaceId: true } } },
          })
        : null;

    // Latest run for a project (used to hydrate the agent UI after reload)
    if (!run && projectId) {
      const project = await db.tenderProject.findFirst({
        where: { id: projectId, workspaceId: workspace.id },
        select: { id: true },
      });
      if (!project) {
        return jsonApiFailure("PROJECT_NOT_FOUND", { status: 404 });
      }
      run = await db.agentRun.findFirst({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        include: { project: { select: { workspaceId: true } } },
      });
      if (!run) {
        return NextResponse.json({
          runId: null,
          status: null,
          overallProgress: 0,
          agentStates: [],
          finalArtifact: null,
        });
      }
    }

    if (!runIdParam && !projectId) {
      return jsonApiFailure("AGENT_RUN_SELECTOR_MISSING", { status: 400 });
    }

    if (!run || !assertWorkspaceMatch(run.project.workspaceId, workspace.id)) {
      return jsonApiFailure("AGENT_RUN_NOT_FOUND", { status: 404 });
    }

    const runId = run.id;

    if (
      !observeOnly &&
      (run.status === "QUEUED" || run.status === "RUNNING") &&
      isAgentRunStale({
        status: run.status,
        createdAt: run.createdAt,
        startedAt: run.startedAt,
        updatedAt: run.updatedAt,
        overallProgress: run.overallProgress,
      })
    ) {
      // Guarded on the live statuses so a concurrent poll, or the workflow
      // itself finishing this instant, is not overwritten.
      const failed = await db.agentRun.updateMany({
        where: { id: runId, status: { in: ["QUEUED", "RUNNING"] } },
        data: {
          status: "FAILED",
          errorMessage: STALE_RUN_MESSAGE,
          failureKind: "TIMEOUT",
          completedAt: new Date(),
        },
      });
      if (failed.count === 1) {
        try {
          await audit({
            userId: session.user.id,
            action: AUDIT_ACTIONS.AGENT_RUN,
            resource: "AgentRun",
            resourceId: runId,
            details: { via: "agents/status GET", reason: "stale run auto-failed" },
          });
        } catch (auditErr) {
          console.warn("[agents/status] audit failed", auditErr);
        }
      }
      run = await db.agentRun.findUnique({
        where: { id: runId },
        include: { project: { select: { workspaceId: true } } },
      });
    }

    if (!run) {
      return jsonApiFailure("AGENT_RUN_NOT_FOUND", { status: 404 });
    }

    const finalArtifact = run.finalArtifact
      ? JSON.parse(run.finalArtifact)
      : null;

    return NextResponse.json({
      runId: run.id,
      status: run.status,
      overallProgress: run.overallProgress,
      agentStates: run.agentStates ? JSON.parse(run.agentStates) : [],
      finalArtifact,
      errorMessage: run.errorMessage,
      failureKind: run.failureKind,
      proposalId: finalArtifact?.proposalId ?? null,
      contractId: finalArtifact?.contractId ?? null,
      coveragePercent: finalArtifact?.coverage?.coveragePercent ?? null,
      exportReady: finalArtifact?.exportReady ?? null,
      validation: finalArtifact?.validation ?? null,
      contractValidation: finalArtifact?.contractValidation ?? null,
    });
  } catch (err) {
    return toErrorResponse(err, "[agents/status]");
  }
}
