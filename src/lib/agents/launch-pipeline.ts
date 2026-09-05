/**
 * The one way an agent run is created.
 *
 * Four entry points queued runs — `POST /api/agents/run`, the platform agent's
 * `startAgentPipeline`/`orchestrateTenderPackage` tools, Mission Control
 * autopilot after an upload, and the extension's autopilot route — and each
 * had drifted: autopilot skipped the onboarding gate when a project was already
 * selected and created its run without the transactional race check the REST
 * route has. They now share this helper, which keeps the REST route's order of
 * refusals and its auto-failing of stale runs, and returns a structured result
 * so every caller reports the same registered code to its client.
 */

import { db } from "../db";
import { audit, AUDIT_ACTIONS } from "../audit";
import { AGENTS } from "../constants";
import { tr, type CompletionErrorCode } from "../i18n";
import { seedComplianceChecks } from "../bootstrap";
import { computeOnboardingSteps } from "../onboarding";
import {
  assertWithinQuota,
  QuotaExceededError,
  QUOTA_FAILURE_CODES,
  quotaFailureCode,
} from "../quotas";
import { isAgentRunStale } from "../proposal-studio";
import { preflightProviders, type LLMFailureKind } from "../llm";
import {
  analyticsRequestOrigin,
  recordAgentRunAnalyticsEvent,
} from "../analytics-collector";
import type { AgentState } from "../types";
import { assertProjectHasDocuments } from "./run-preflight";
import { scheduleAgentPipeline } from "./schedule-pipeline";

/** Engines the six-agent pipeline calls; each falls back to DEFAULT, then any active row. */
const PIPELINE_ENGINES = ["DRAFTING", "DEFAULT"] as const;

export type LaunchPipelineSource =
  | "rest"
  | "platform-agent"
  | "orchestrate"
  | "mission-autopilot"
  | "extension-autopilot";

export type LaunchPipelineInput = {
  workspaceId: string;
  userId: string;
  projectId: string;
  locale: "ar" | "en";
  source: LaunchPipelineSource;
  regenerateMode?: "version" | "fork";
  targetProposalId?: string | null;
  /** Re-categorise the project before the run when the caller named a type. */
  tenderType?: string;
  budget?: number | null;
  /** Extra breadcrumbs stored on the run's configJson and audit row. */
  extra?: Record<string, string | null>;
};

/** The five plan-limit codes, narrowed so callers can discriminate on `code`. */
export type QuotaFailureCode =
  (typeof QUOTA_FAILURE_CODES)[keyof typeof QUOTA_FAILURE_CODES];

export type LaunchPipelineFailure =
  | {
      ok: false;
      code: "ONBOARDING_INCOMPLETE";
      missing: string[];
      readyForProposals: false;
    }
  | {
      ok: false;
      code: "AI_PROVIDER_UNAVAILABLE";
      llmFailureKind: LLMFailureKind;
      provider: string | null;
    }
  | { ok: false; code: QuotaFailureCode }
  | { ok: false; code: "RESOURCE_NOT_FOUND" }
  | { ok: false; code: "NO_DOCUMENTS" }
  | { ok: false; code: "AGENT_RUN_IN_PROGRESS"; runId: string; status: string };

export type LaunchPipelineSuccess = {
  ok: true;
  runId: string;
  projectId: string;
  status: "QUEUED";
  agentStates: AgentState[];
};

export type LaunchPipelineResult = LaunchPipelineSuccess | LaunchPipelineFailure;

/** Every failure code above is a registered completion code. */
export function launchFailureCode(failure: LaunchPipelineFailure): CompletionErrorCode {
  return failure.code;
}

export function initialAgentStates(): AgentState[] {
  return AGENTS.map((a) => ({
    id: a.id,
    name: tr(`agent_${a.id}_name` as Parameters<typeof tr>[0], "en"),
    nameAr: tr(`agent_${a.id}_name` as Parameters<typeof tr>[0], "ar"),
    status: "pending",
    progress: 0,
  }));
}

export async function launchProjectPipeline(
  input: LaunchPipelineInput
): Promise<LaunchPipelineResult> {
  const onboarding = await computeOnboardingSteps(input.workspaceId);
  if (!onboarding.readyForProposals) {
    return {
      ok: false,
      code: "ONBOARDING_INCOMPLETE",
      missing: onboarding.missing,
      readyForProposals: false,
    };
  }

  try {
    await assertWithinQuota(input.userId, "proposal");
    await assertWithinQuota(input.userId, "tokens");
  } catch (e) {
    if (e instanceof QuotaExceededError) {
      return { ok: false, code: quotaFailureCode(e) as QuotaFailureCode };
    }
    throw e;
  }

  // Before a row is written: a workspace with no usable provider is told so
  // now, not after the pipeline has retried a missing key for a minute.
  const providers = await preflightProviders(PIPELINE_ENGINES);
  if (!providers.ok) {
    return {
      ok: false,
      code: "AI_PROVIDER_UNAVAILABLE",
      llmFailureKind: providers.failureKind,
      provider: providers.provider,
    };
  }

  let project = await db.tenderProject.findFirst({
    where: { id: input.projectId, workspaceId: input.workspaceId },
  });
  if (!project) return { ok: false, code: "RESOURCE_NOT_FOUND" };

  const documentPreflight = assertProjectHasDocuments(
    await db.uploadedDocument.count({ where: { projectId: project.id } })
  );
  if (!documentPreflight.ok) return { ok: false, code: documentPreflight.code };

  // Only one QUEUED/RUNNING run per project. A stale one — a dead serverless
  // invocation that never progressed — is failed here so it cannot block forever.
  const active = await db.agentRun.findFirst({
    where: { projectId: project.id, status: { in: ["QUEUED", "RUNNING"] } },
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
    if (!stale) {
      return { ok: false, code: "AGENT_RUN_IN_PROGRESS", runId: active.id, status: active.status };
    }
    await db.agentRun.updateMany({
      where: { id: active.id, status: { in: ["QUEUED", "RUNNING"] } },
      data: {
        status: "FAILED",
        errorMessage:
          "Agent run timed out without progress (stale serverless invocation). Start a new run.",
        failureKind: "TIMEOUT",
        completedAt: new Date(),
      },
    });
  }

  if (input.tenderType && input.tenderType !== project.category) {
    project = await db.tenderProject.update({
      where: { id: project.id },
      data: {
        category: input.tenderType,
        ...(input.budget != null ? { budget: input.budget } : {}),
      },
    });
  }

  await seedComplianceChecks(project.id);
  await db.tenderProject.update({
    where: { id: project.id },
    data: { status: "PARSING" },
  });

  const agentStates = initialAgentStates();
  const projectId = project.id;

  // Create under a transaction and re-check, closing the TOCTOU window between
  // the concurrency check above and the write.
  const run = await db.$transaction(async (tx) => {
    const racing = await tx.agentRun.findFirst({
      where: { projectId, status: { in: ["QUEUED", "RUNNING"] } },
    });
    if (racing) return { conflict: true as const, run: racing };
    const created = await tx.agentRun.create({
      data: {
        projectId,
        triggeredById: input.userId,
        status: "QUEUED",
        overallProgress: 0,
        agentStates: JSON.stringify(agentStates),
        configJson: JSON.stringify({
          locale: input.locale,
          workspaceId: input.workspaceId,
          userId: input.userId,
          projectId,
          regenerateMode: input.regenerateMode ?? null,
          targetProposalId: input.targetProposalId ?? null,
          via: input.source,
          ...(input.extra ?? {}),
        }),
      },
    });
    return { conflict: false as const, run: created };
  });

  if (run.conflict) {
    return { ok: false, code: "AGENT_RUN_IN_PROGRESS", runId: run.run.id, status: run.run.status };
  }

  await audit({
    userId: input.userId,
    action: AUDIT_ACTIONS.AGENT_RUN,
    resource: "AgentRun",
    resourceId: run.run.id,
    details: {
      projectId,
      locale: input.locale,
      regenerateMode: input.regenerateMode ?? "create",
      targetProposalId: input.targetProposalId ?? null,
      via: input.source,
      ...(input.extra ?? {}),
    },
  });

  // The queued row has committed. One bounded append for the start transition;
  // a failure never changes the result.
  await recordAgentRunAnalyticsEvent({
    eventType: "agent_run_started",
    runId: run.run.id,
    origin: analyticsRequestOrigin({
      tenantWorkspaceId: input.workspaceId,
      actorUserId: input.userId,
    }),
    metadata: { projectId, proposalId: input.targetProposalId ?? null },
  });

  await scheduleAgentPipeline({
    runId: run.run.id,
    projectId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    locale: input.locale,
    regenerateMode: input.regenerateMode,
    targetProposalId: input.targetProposalId ?? null,
    logLabel: `[${input.source} pipeline]`,
  });

  return { ok: true, runId: run.run.id, projectId, status: "QUEUED", agentStates };
}
