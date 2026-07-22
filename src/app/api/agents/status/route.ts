import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { runAgentPipeline } from "@/lib/agents/orchestrator";
import {
  isAgentRunStale,
  parseAgentRunConfig,
} from "@/lib/proposal-studio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// In-memory resume locks to avoid double-resume in same instance
const resumeLocks = new Set<string>();

// GET /api/agents/status?runId=... — poll real agent pipeline progress; resume stale runs
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = await getTenantContext(session.user.id);
    const runId = req.nextUrl.searchParams.get("runId");
    if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

    let run = await db.agentRun.findUnique({
      where: { id: runId },
      include: { project: { select: { workspaceId: true } } },
    });
    if (!run || !assertWorkspaceMatch(run.project.workspaceId, workspace.id)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

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
      if (cfg && !resumeLocks.has(runId)) {
        resumeLocks.add(runId);
        resumed = true;
        // Touch updatedAt so concurrent polls don't stampede
        await db.agentRun.update({
          where: { id: runId },
          data: {
            status: "QUEUED",
            errorMessage: null,
            overallProgress: 0,
          },
        });
        void runAgentPipeline({
          runId,
          projectId: cfg.projectId,
          workspaceId: cfg.workspaceId,
          userId: cfg.userId,
          locale: cfg.locale,
          regenerateMode: cfg.regenerateMode,
          targetProposalId: cfg.targetProposalId,
        })
          .catch((err) => console.error("[agents/status resume]", err))
          .finally(() => resumeLocks.delete(runId));

        run = await db.agentRun.findUnique({
          where: { id: runId },
          include: { project: { select: { workspaceId: true } } },
        });
      }
    }

    if (!run) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
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
      coveragePercent: finalArtifact?.coverage?.coveragePercent ?? null,
      exportReady: finalArtifact?.exportReady ?? null,
      validation: finalArtifact?.validation ?? null,
    });
  } catch (err) {
    console.error("[agents/status]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
