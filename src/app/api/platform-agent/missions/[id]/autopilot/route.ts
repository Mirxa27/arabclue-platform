import { NextRequest, NextResponse } from "next/server";
import { requireSession, canWriteRole } from "@/lib/auth";
import {
  getTenantContext,
  resolveOwnedProjectId,
} from "@/lib/workspace-context";
import { getOrCreateMission } from "@/lib/agents/platform/mission";
import { db } from "@/lib/db";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { AGENTS } from "@/lib/constants";
import { tr } from "@/lib/i18n";
import { seedComplianceChecks } from "@/lib/bootstrap";
import { runAgentPipeline } from "@/lib/agents/orchestrator";
import { assertWithinQuota, QuotaExceededError } from "@/lib/quotas";
import { assertOnboardingReady } from "@/lib/onboarding";
import { ApiError } from "@/lib/api-controller";
import type { AgentState } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/platform-agent/missions/[id]/autopilot
 * Chrome extension / Mission Control trigger: create or reuse a project from
 * an Etimad tender reference and start the agent pipeline.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: missionId } = await ctx.params;
  const tenant = await getTenantContext(session.user.id);
  const locale = session.user.locale === "en" ? "en" : "ar";
  const canWrite = canWriteRole(session.user.role);

  if (!canWrite) {
    return NextResponse.json(
      { error: "Read-only role cannot start autopilot" },
      { status: 403 }
    );
  }

  const mission = await getOrCreateMission({
    workspaceId: tenant.workspace.id,
    userId: session.user.id,
    locale,
  });
  if (mission.id !== missionId) {
    return NextResponse.json({ error: "Mission not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    tenderRef?: string;
    message?: string;
    title?: string;
    titleAr?: string;
    entity?: string;
    closingDate?: string;
    category?: string;
    activeProjectId?: string | null;
  };

  try {
    await assertOnboardingReady(tenant.workspace.id);
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 422 });
    }
    throw e;
  }

  try {
    await assertWithinQuota(session.user.id, "proposal");
  } catch (e) {
    if (e instanceof QuotaExceededError) {
      return NextResponse.json({ error: e.message, code: "QUOTA" }, { status: 429 });
    }
    throw e;
  }

  const tenderRef = body.tenderRef?.trim() || null;
  // Both candidates are client-influenced: `activeProjectId` arrives in the
  // request body, and `mission.activeProjectId` is whatever a previous request
  // stored. Each is resolved against the tenant before it can select, mutate,
  // or seed a project.
  let projectId =
    (await resolveOwnedProjectId(body.activeProjectId, tenant.workspace.id)) ??
    (await resolveOwnedProjectId(
      mission.activeProjectId,
      tenant.workspace.id
    ));

  if (tenderRef) {
    const existing = await db.tenderProject.findFirst({
      where: {
        workspaceId: tenant.workspace.id,
        etimadRef: tenderRef,
      },
      select: { id: true },
    });
    if (existing) projectId = existing.id;
  }

  if (!projectId) {
    const title =
      body.titleAr?.trim() ||
      body.title?.trim() ||
      (tenderRef ? `Etimad ${tenderRef}` : "Extension tender");
    const deadline = body.closingDate ? new Date(body.closingDate) : null;
    const project = await db.tenderProject.create({
      data: {
        workspaceId: tenant.workspace.id,
        createdById: session.user.id,
        etimadRef: tenderRef,
        title,
        titleAr: body.titleAr?.trim() || null,
        category: body.category?.trim() || "other",
        budget: null,
        currency: "SAR",
        submissionDeadline:
          deadline && !Number.isNaN(deadline.getTime()) ? deadline : null,
        status: "DRAFT",
      },
    });
    projectId = project.id;
  }

  await db.copilotMission.update({
    where: { id: mission.id },
    data: { activeProjectId: projectId },
  });

  // Link recent mission-staged documents to the project
  const attachments = await db.copilotAttachment.findMany({
    where: { missionId: mission.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { documentId: true },
  });
  const documentIds = attachments
    .map((a) => a.documentId)
    .filter((id): id is string => Boolean(id));
  if (documentIds.length) {
    await db.uploadedDocument.updateMany({
      where: { id: { in: documentIds }, workspaceId: tenant.workspace.id },
      data: { projectId },
    });
    await db.documentChunk.updateMany({
      where: { documentId: { in: documentIds } },
      data: { projectId },
    });
  }

  const active = await db.agentRun.findFirst({
    where: {
      projectId,
      status: { in: ["QUEUED", "RUNNING"] },
    },
  });
  if (active) {
    return NextResponse.json({
      ok: true,
      mode: "already_running",
      projectId,
      agentRunId: active.id,
      missionId: mission.id,
      message: `Pipeline already running (${active.id})`,
    });
  }

  await seedComplianceChecks(projectId);
  await db.tenderProject.update({
    where: { id: projectId },
    data: { status: "PARSING" },
  });

  const agentStates: AgentState[] = AGENTS.map((a) => ({
    id: a.id,
    name: tr(`agent_${a.id}_name` as Parameters<typeof tr>[0], "en"),
    nameAr: tr(`agent_${a.id}_name` as Parameters<typeof tr>[0], "ar"),
    status: "pending",
    progress: 0,
  }));

  const run = await db.agentRun.create({
    data: {
      projectId,
      triggeredById: session.user.id,
      status: "QUEUED",
      overallProgress: 0,
      agentStates: JSON.stringify(agentStates),
      configJson: JSON.stringify({
        locale,
        workspaceId: tenant.workspace.id,
        userId: session.user.id,
        projectId,
        regenerateMode: null,
        targetProposalId: null,
        via: "extension-autopilot",
        tenderRef,
        message: body.message?.slice(0, 2000) ?? null,
      }),
    },
  });

  await audit({
    userId: session.user.id,
    action: AUDIT_ACTIONS.AGENT_RUN,
    resource: "AgentRun",
    resourceId: run.id,
    details: { via: "extension-autopilot", projectId, tenderRef },
  });

  void runAgentPipeline({
    runId: run.id,
    projectId,
    workspaceId: tenant.workspace.id,
    userId: session.user.id,
    locale,
  }).catch((err) => {
    console.error("[extension-autopilot] pipeline", err);
  });

  return NextResponse.json({
    ok: true,
    mode: "autopilot",
    projectId,
    agentRunId: run.id,
    missionId: mission.id,
    message: "Proposal pipeline started",
  });
}
