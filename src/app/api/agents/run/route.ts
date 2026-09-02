import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seedComplianceChecks } from "@/lib/bootstrap";
import { AGENTS } from "@/lib/constants";
import { tr } from "@/lib/i18n";
import type { AgentState } from "@/lib/types";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { requireWriter } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { assertWithinQuota } from "@/lib/quotas";
import { agentRunBodySchema, parseJsonBody } from "@/lib/validation";
import { assertOnboardingReady, computeOnboardingSteps } from "@/lib/onboarding";
import {
  ApiError,
  apiFailure,
  jsonApiFailure,
  toErrorResponse,
} from "@/lib/api-controller";
import { assertProjectHasDocuments } from "@/lib/agents/run-preflight";
import { scheduleAgentPipeline } from "@/lib/agents/schedule-pipeline";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import { isAgentRunStale } from "@/lib/proposal-studio";
import {
  analyticsRequestOrigin,
  recordAgentRunAnalyticsEvent,
} from "@/lib/analytics-collector";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/agents/run — kick off multi-agent workflow (idempotent per project)
export async function POST(req: NextRequest) {
  try {
    const session = await requireWriter();
    if (!session) {
      return jsonApiFailure("WORKSPACE_ROLE_FORBIDDEN", { status: 403 });
    }
    const parsed = await parseJsonBody(req, agentRunBodySchema);
    if (!parsed.ok) return parsed.response;

    const { workspace } = await getTenantContext(session.user.id);
    const userId = session.user.id;
    const { projectId, tenderType, budget } = parsed.data;
    const locale =
      parsed.data.locale ??
      (session.user.locale === "en" ? "en" : "ar");
    const regenerateMode = parsed.data.regenerateMode;
    const targetProposalId = parsed.data.targetProposalId;

    // The per-project in-progress guard below only stops a second run on the
    // *same* project. A script iterating a workspace's projects clears it every
    // time, so the workspace ceiling has to exist separately.
    const limited = await checkAiRateLimit({
      route: "agents.run",
      identifier: workspace.id,
      limit: 6,
      windowMs: 60_000,
    });
    if (limited) return limited;

    if (regenerateMode && !targetProposalId) {
      return jsonApiFailure("INVALID_REQUEST", {
        status: 400,
        fieldPaths: ["targetProposalId"],
      });
    }
    if (targetProposalId) {
      const target = await db.generatedProposal.findFirst({
        where: { id: targetProposalId, projectId, workspaceId: workspace.id },
      });
      if (!target) {
        return jsonApiFailure("RESOURCE_NOT_FOUND", { status: 404 });
      }
    }

    try {
      await assertOnboardingReady(workspace.id);
    } catch (e) {
      // Only this code carries the step list the console needs. `e.message` is
      // the developer-facing English sentence; the client-facing text comes
      // from the registry instead, so an Arabic reader gets Arabic.
      if (e instanceof ApiError && e.code === "ONBOARDING_INCOMPLETE") {
        const onboarding = await computeOnboardingSteps(workspace.id).catch(
          () => null
        );
        return NextResponse.json(
          {
            ...apiFailure("ONBOARDING_INCOMPLETE"),
            missing: onboarding?.missing ?? undefined,
            readyForProposals: onboarding?.readyForProposals ?? false,
          },
          { status: e.status, headers: { "Cache-Control": "no-store" } }
        );
      }
      throw e;
    }

    // QuotaExceededError reaches toErrorResponse below, which maps it to a
    // bilingual 402 via quotaFailureCode. Catching it here only ever produced
    // a worse body.
    await assertWithinQuota(userId, "proposal");

    let project = await db.tenderProject.findUnique({ where: { id: projectId } });
    if (!project || !assertWorkspaceMatch(project.workspaceId, workspace.id)) {
      return jsonApiFailure("RESOURCE_NOT_FOUND", { status: 404 });
    }

    const documentCount = await db.uploadedDocument.count({
      where: { projectId: project.id },
    });
    const documentPreflight = assertProjectHasDocuments(documentCount);
    if (!documentPreflight.ok) {
      return jsonApiFailure(documentPreflight.code, { status: 422 });
    }

    // Atomic race guard: only one QUEUED/RUNNING run per project.
    // Auto-fail stale runs so a dead serverless invocation cannot block forever.
    const active = await db.agentRun.findFirst({
      where: {
        projectId: project.id,
        status: { in: ["QUEUED", "RUNNING"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (active) {
      const stale = isAgentRunStale({
        status: active.status,
        createdAt: active.createdAt,
        startedAt: active.startedAt,
        updatedAt: active.updatedAt,
        overallProgress: active.overallProgress,
      });
      if (stale) {
        await db.agentRun.updateMany({
          where: {
            id: active.id,
            status: { in: ["QUEUED", "RUNNING"] },
          },
          data: {
            status: "FAILED",
            errorMessage:
              "Agent run timed out without progress (stale serverless invocation). Start a new run.",
            failureKind: "TIMEOUT",
            completedAt: new Date(),
          },
        });
      } else {
        return NextResponse.json(
          {
            ...apiFailure("AGENT_RUN_IN_PROGRESS"),
            runId: active.id,
            status: active.status,
            stale: false,
          },
          { status: 409, headers: { "Cache-Control": "no-store" } }
        );
      }
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
          configJson: JSON.stringify({
            locale,
            workspaceId: workspace.id,
            userId,
            projectId: project.id,
            regenerateMode,
            targetProposalId: targetProposalId ?? null,
          }),
        },
      });
      return { conflict: false as const, run: created };
    });

    if (run.conflict) {
      // This branch previously omitted `code` entirely, so the client's
      // `err.code === "AGENT_RUN_IN_PROGRESS"` check missed the TOCTOU loser
      // and it fell through to the generic error toast. apiFailure sets it.
      return NextResponse.json(
        {
          ...apiFailure("AGENT_RUN_IN_PROGRESS"),
          runId: run.run.id,
          status: run.run.status,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    await audit({
      userId,
      action: AUDIT_ACTIONS.AGENT_RUN,
      resource: "AgentRun",
      resourceId: run.run.id,
      details: {
        projectId: project.id,
        locale,
        regenerateMode: regenerateMode ?? "create",
        targetProposalId: targetProposalId ?? null,
      },
    });

    // The queued run row has committed. One bounded append attempt for the start
    // transition; a failure never changes this response (requirements 4.2, 4.4,
    // 4.5, 4.6).
    await recordAgentRunAnalyticsEvent({
      eventType: "agent_run_started",
      runId: run.run.id,
      origin: analyticsRequestOrigin({
        tenantWorkspaceId: workspace.id,
        actorUserId: userId,
      }),
      metadata: {
        projectId: project.id,
        proposalId: targetProposalId ?? null,
      },
    });

    scheduleAgentPipeline({
      runId: run.run.id,
      projectId: project.id,
      workspaceId: workspace.id,
      userId,
      locale,
      regenerateMode,
      targetProposalId: targetProposalId ?? null,
      logLabel: "[agents/run pipeline]",
    });

    return NextResponse.json({
      runId: run.run.id,
      projectId: project.id,
      status: "QUEUED",
      agentStates,
    });
  } catch (err) {
    return toErrorResponse(err, "[agents/run]");
  }
}
