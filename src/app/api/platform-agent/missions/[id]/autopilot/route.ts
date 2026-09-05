import { jsonApiFailure } from "@/lib/api-controller";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, canWriteRole } from "@/lib/auth";
import {
  getTenantContext,
  resolveOwnedProjectId,
} from "@/lib/workspace-context";
import { getOrCreateMission } from "@/lib/agents/platform/mission";
import { db } from "@/lib/db";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import { launchProjectPipeline } from "@/lib/agents/launch-pipeline";
import { computeOnboardingSteps } from "@/lib/onboarding";

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
    return jsonApiFailure("AUTHENTICATION_REQUIRED");
  }

  const { id: missionId } = await ctx.params;
  const tenant = await getTenantContext(session.user.id);
  const locale = session.user.locale === "en" ? "en" : "ar";
  const canWrite = canWriteRole(session.user.role);

  if (!canWrite) {
    return jsonApiFailure("WORKSPACE_ROLE_FORBIDDEN");
  }

  // Matches `agents.status.resume`: one call fans out to the whole agent
  // pipeline, so the ceiling is deliberately far below a chat turn's.
  const limited = await checkAiRateLimit({
    route: "platform-agent.autopilot",
    identifier: tenant.workspace.id,
    limit: 6,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const mission = await getOrCreateMission({
    workspaceId: tenant.workspace.id,
    userId: session.user.id,
    locale,
  });
  if (mission.id !== missionId) {
    return jsonApiFailure("MISSION_NOT_FOUND");
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

  // The launcher below gates the run on onboarding too, but a project must not
  // be created from an unconfigured workspace either.
  const onboarding = await computeOnboardingSteps(tenant.workspace.id);
  if (!onboarding.readyForProposals) {
    return jsonApiFailure("ONBOARDING_INCOMPLETE");
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

  // Onboarding, quota, provider preflight, document preflight (counted after
  // the link above, so freshly attached documents count), concurrency and the
  // run row: the same launcher as `POST /api/agents/run`.
  const launch = await launchProjectPipeline({
    workspaceId: tenant.workspace.id,
    userId: session.user.id,
    projectId,
    locale,
    source: "extension-autopilot",
    extra: { tenderRef, message: body.message?.slice(0, 2000) ?? null },
  });

  if (!launch.ok) {
    if (launch.code === "AGENT_RUN_IN_PROGRESS") {
      return NextResponse.json({
        ok: true,
        mode: "already_running",
        projectId,
        agentRunId: launch.runId,
        missionId: mission.id,
        message: `Pipeline already running (${launch.runId})`,
      });
    }
    return jsonApiFailure(launch.code);
  }

  return NextResponse.json({
    ok: true,
    mode: "autopilot",
    projectId,
    agentRunId: launch.runId,
    missionId: mission.id,
    message: "Proposal pipeline started",
  });
}
