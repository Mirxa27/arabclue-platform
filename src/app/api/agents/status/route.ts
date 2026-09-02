import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonApiFailure, toErrorResponse } from "@/lib/api-controller";
import { requireSession } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { scheduleAgentPipeline } from "@/lib/agents/schedule-pipeline";
import {
  isAgentRunStale,
  parseAgentRunConfig,
} from "@/lib/proposal-studio";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

export const dynamic = "force-dynamic";
// A resumed pipeline runs inside this invocation's `after()`. At 60 s it was
// killed before its third agent, every time.
export const maxDuration = 300;

/**
 * A stale run is restarted from zero at most this many times. Each restart
 * spends provider tokens on the same first agents; a run that cannot fit the
 * platform's execution window twice is failed with a reason instead.
 */
const MAX_STALE_RESUMES = 1;

// In-memory resume locks to avoid double-resume in same instance
const resumeLocks = new Set<string>();

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

    let resumed = false;
    if (
      (run.status === "QUEUED" || run.status === "RUNNING") &&
      isAgentRunStale({
        status: run.status,
        createdAt: run.createdAt,
        startedAt: run.startedAt,
        updatedAt: run.updatedAt,
        overallProgress: run.overallProgress,
      })
    ) {
      const cfg = parseAgentRunConfig(run.configJson);
      if (cfg && cfg.resumeCount >= MAX_STALE_RESUMES) {
        // Second time this run has gone quiet past the heartbeat window. The
        // message is internal English by design (it is mapped to bilingual
        // copy where it is shown); the record has to say what happened.
        await db.agentRun.updateMany({
          where: { id: runId, status: { in: ["QUEUED", "RUNNING"] } },
          data: {
            status: "FAILED",
            errorMessage:
              "Agent run exceeded the execution window twice (stale after resume). Start a new run.",
            completedAt: new Date(),
          },
        });
        return NextResponse.json({
          runId: run.id,
          status: "FAILED",
          overallProgress: run.overallProgress,
          agentStates: run.agentStates ? JSON.parse(run.agentStates) : [],
          finalArtifact: null,
          errorMessage:
            "Agent run exceeded the execution window twice (stale after resume). Start a new run.",
          resumed: false,
          resumeExhausted: true,
        });
      }
      if (cfg && !resumeLocks.has(runId)) {
        // Resume is a real side-effect that spends LLM tokens. Bound how
        // often a workspace can trigger it — real polling only needs 1 or
        // 2 resumes per run, but a stuck tab could hammer this.
        const blocked = await checkAiRateLimit({
          route: "agents.status.resume",
          identifier: workspace.id,
          limit: 10,
          windowMs: 60_000,
        });
        if (blocked) {
          // Fall through to a plain read below — we still return current state.
          return NextResponse.json({
            runId: run.id,
            status: run.status,
            overallProgress: run.overallProgress,
            agentStates: run.agentStates ? JSON.parse(run.agentStates) : [],
            finalArtifact: run.finalArtifact
              ? JSON.parse(run.finalArtifact)
              : null,
            errorMessage: run.errorMessage,
            resumed: false,
            rateLimited: true,
          });
        }
        resumeLocks.add(runId);
        resumed = true;
        // Touch updatedAt so concurrent polls don't stampede
        await db.agentRun.update({
          where: { id: runId },
          data: {
            status: "QUEUED",
            errorMessage: null,
            overallProgress: 0,
            configJson: JSON.stringify({
              ...cfg,
              resumeCount: cfg.resumeCount + 1,
            }),
          },
        });
        scheduleAgentPipeline({
          runId,
          projectId: cfg.projectId,
          workspaceId: cfg.workspaceId,
          userId: cfg.userId,
          locale: cfg.locale,
          regenerateMode: cfg.regenerateMode,
          targetProposalId: cfg.targetProposalId,
          logLabel: "[agents/status resume]",
        });
        // Audit the resume so operators can trace phantom pipeline restarts.
        try {
          await audit({
            userId: session.user.id,
            action: AUDIT_ACTIONS.AGENT_RUN,
            resource: "AgentRun",
            resourceId: runId,
            details: {
              via: "agents/status GET",
              reason: "stale run auto-resume",
            },
          });
        } catch (auditErr) {
          console.warn("[agents/status] audit failed", auditErr);
        }
        // Clear lock after a short delay so concurrent polls don't double-resume
        // while after() is still scheduling the same run.
        setTimeout(() => resumeLocks.delete(runId), 5_000);

        run = await db.agentRun.findUnique({
          where: { id: runId },
          include: { project: { select: { workspaceId: true } } },
        });
      }
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
      resumed,
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
