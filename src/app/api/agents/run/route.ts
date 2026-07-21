import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext, seedComplianceChecks } from "@/lib/bootstrap";
import { AGENTS } from "@/lib/constants";
import type { AgentState, AgentId } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/agents/run — kick off a multi-agent workflow for a project
export async function POST(req: NextRequest) {
  try {
    const { workspace } = await getBootstrapContext();
    const user = await db.user.findFirst({
      where: { workspaces: { some: { workspaceId: workspace.id } } },
    });
    const body = await req.json();
    const { projectId } = body as { projectId?: string };

    // Resolve project: provided, or most recent DRAFT, or create one
    let project = projectId
      ? await db.tenderProject.findUnique({ where: { id: projectId } })
      : null;

    if (!project) {
      project = await db.tenderProject.findFirst({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: "desc" },
      });
    }
    if (!project) {
      project = await db.tenderProject.create({
        data: {
          workspaceId: workspace.id,
          createdById: user!.id,
          etimadRef: `ETM-${Date.now().toString(36).toUpperCase()}`,
          title: "New Tender Project",
          status: "DRAFT",
          currency: "SAR",
        },
      });
    }

    // Seed compliance checks for this project
    await seedComplianceChecks(project.id);

    // Update project status to PARSING
    await db.tenderProject.update({
      where: { id: project.id },
      data: { status: "PARSING" },
    });

    // Initialize agent states (all pending, 0 progress)
    const agentStates: AgentState[] = AGENTS.map((a) => ({
      id: a.id,
      name: "",
      nameAr: "",
      status: "pending",
      progress: 0,
    }));

    const run = await db.agentRun.create({
      data: {
        projectId: project.id,
        triggeredById: user!.id,
        status: "RUNNING",
        startedAt: new Date(),
        overallProgress: 0,
        agentStates: JSON.stringify(agentStates),
      },
    });

    return NextResponse.json({
      runId: run.id,
      projectId: project.id,
      status: "RUNNING",
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
