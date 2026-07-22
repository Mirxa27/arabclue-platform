import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seedComplianceChecks } from "@/lib/bootstrap";
import { AGENTS } from "@/lib/constants";
import { tr } from "@/lib/i18n";
import type { AgentState } from "@/lib/types";
import { runAgentPipeline } from "@/lib/agents/orchestrator";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { requireWriter } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { assertWithinQuota, QuotaExceededError } from "@/lib/quotas";
import { agentRunBodySchema, parseJsonBody } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/agents/run — kick off multi-agent workflow (idempotent per project)
export async function POST(req: NextRequest) {
  try {
    const session = await requireWriter();
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const parsed = await parseJsonBody(req, agentRunBodySchema);
    if (!parsed.ok) return parsed.response;

    const { workspace } = await getTenantContext(session.user.id);
    const userId = session.user.id;
    const { projectId, tenderType, budget } = parsed.data;
    const locale =
      parsed.data.locale ??
      (session.user.locale === "en" ? "en" : "ar");

    try {
      await assertWithinQuota(userId, "proposal");
    } catch (e) {
      if (e instanceof QuotaExceededError) {
        return NextResponse.json({ error: e.message, code: e.code }, { status: 402 });
      }
      throw e;
    }

    let project = await db.tenderProject.findUnique({ where: { id: projectId } });
    if (!project || !assertWorkspaceMatch(project.workspaceId, workspace.id)) {
      return NextResponse.json({ error: "project not found" }, { status: 404 });
    }

    // Atomic race guard: only one QUEUED/RUNNING run per project
    const active = await db.agentRun.findFirst({
      where: {
        projectId: project.id,
        status: { in: ["QUEUED", "RUNNING"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (active) {
      return NextResponse.json(
        {
          error: "An agent run is already in progress for this project",
          runId: active.id,
          status: active.status,
        },
        { status: 409 }
      );
    }

    if (tenderType && tenderType !== project.category) {
      project = await db.tenderProject.update({
        where: { id: project.id },
        data: {
          category: tenderType,
          ...(budget != null ? { budget } : {}),
        },
      });
    }

    await seedComplianceChecks(project.id);
    await db.tenderProject.update({
      where: { id: project.id },
      data: { status: "PARSING" },
    });

    const agentStates: AgentState[] = AGENTS.map((a) => ({
      id: a.id,
      name: tr(`agent_${a.id}_name` as Parameters<typeof tr>[0], "en"),
      nameAr: tr(`agent_${a.id}_name` as Parameters<typeof tr>[0], "ar"),
      status: "pending",
      progress: 0,
    }));

    // Create under transaction; re-check active to close TOCTOU window
    const run = await db.$transaction(async (tx) => {
      const racing = await tx.agentRun.findFirst({
        where: {
          projectId: project.id,
          status: { in: ["QUEUED", "RUNNING"] },
        },
      });
      if (racing) {
        return { conflict: true as const, run: racing };
      }
      const created = await tx.agentRun.create({
        data: {
          projectId: project.id,
          triggeredById: userId,
          status: "QUEUED",
          overallProgress: 0,
          agentStates: JSON.stringify(agentStates),
        },
      });
      return { conflict: false as const, run: created };
    });

    if (run.conflict) {
      return NextResponse.json(
        {
          error: "An agent run is already in progress for this project",
          runId: run.run.id,
          status: run.run.status,
        },
        { status: 409 }
      );
    }

    await audit({
      userId,
      action: AUDIT_ACTIONS.AGENT_RUN,
      resource: "AgentRun",
      resourceId: run.run.id,
      details: { projectId: project.id, locale },
    });

    void runAgentPipeline({
      runId: run.run.id,
      projectId: project.id,
      workspaceId: workspace.id,
      userId,
      locale,
    }).catch((err) => console.error("[agents/run pipeline]", err));

    return NextResponse.json({
      runId: run.run.id,
      projectId: project.id,
      status: "QUEUED",
      agentStates,
    });
  } catch (err) {
    console.error("[agents/run]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
