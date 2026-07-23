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
import type { ClassificationDecision } from "./classify-attachment";
import { AUTOPILOT_CONFIDENCE } from "./classify-attachment";

export type AutopilotResult =
  | {
      mode: "autopilot";
      projectId: string;
      runId: string;
      message: string;
    }
  | {
      mode: "clarify";
      question: string;
      attachmentId: string;
    }
  | {
      mode: "routed";
      projectId: string | null;
      message: string;
    };

export async function maybeAutopilotAfterIngest(opts: {
  workspaceId: string;
  userId: string;
  locale: "ar" | "en";
  attachmentId: string;
  documentId: string;
  decision: ClassificationDecision;
  activeProjectId?: string | null;
  canWrite: boolean;
}): Promise<AutopilotResult> {
  if (!opts.canWrite) {
    return {
      mode: "clarify",
      question: "Read-only role: I staged the file but cannot route or run agents.",
      attachmentId: opts.attachmentId,
    };
  }

  if (
    opts.decision.confidence < AUTOPILOT_CONFIDENCE ||
    opts.decision.clarifyingQuestion
  ) {
    return {
      mode: "clarify",
      question:
        opts.decision.clarifyingQuestion ||
        "Where should this attachment be filed?",
      attachmentId: opts.attachmentId,
    };
  }

  let projectId = opts.activeProjectId ?? null;

  if (opts.decision.createProject || opts.decision.category === "RFP") {
    if (!projectId) {
      try {
        await assertOnboardingReady(opts.workspaceId);
      } catch (e) {
        if (e instanceof ApiError) {
          return {
            mode: "clarify",
            question: e.message,
            attachmentId: opts.attachmentId,
          };
        }
        throw e;
      }

      const title =
        opts.decision.suggestedTitle ||
        `Tender ${new Date().toISOString().slice(0, 10)}`;
      const project = await db.tenderProject.create({
        data: {
          workspaceId: opts.workspaceId,
          createdById: opts.userId,
          title,
          titleAr: title,
          category: "IT",
          status: "DRAFT",
        },
      });
      projectId = project.id;
    }
  }

  if (projectId) {
    await db.uploadedDocument.update({
      where: { id: opts.documentId },
      data: { projectId },
    });
    await db.documentChunk.updateMany({
      where: { documentId: opts.documentId },
      data: { projectId },
    });
    await db.copilotAttachment.update({
      where: { id: opts.attachmentId },
      data: {
        projectId,
        routeStatus: opts.decision.runPipeline ? "AUTOPILOT" : "ROUTED",
      },
    });
  }

  if (!opts.decision.runPipeline || !projectId) {
    return {
      mode: "routed",
      projectId,
      message: projectId
        ? `Routed to project ${projectId} as ${opts.decision.category}.`
        : `Classified as ${opts.decision.category} and staged in the mission.`,
    };
  }

  try {
    await assertWithinQuota(opts.userId, "proposal");
  } catch (e) {
    if (e instanceof QuotaExceededError) {
      return {
        mode: "clarify",
        question: e.message,
        attachmentId: opts.attachmentId,
      };
    }
    throw e;
  }

  const active = await db.agentRun.findFirst({
    where: {
      projectId,
      status: { in: ["QUEUED", "RUNNING"] },
    },
  });
  if (active) {
    return {
      mode: "routed",
      projectId,
      message: `File linked. Pipeline already running (${active.id}).`,
    };
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
      triggeredById: opts.userId,
      status: "QUEUED",
      overallProgress: 0,
      agentStates: JSON.stringify(agentStates),
      configJson: JSON.stringify({
        locale: opts.locale,
        workspaceId: opts.workspaceId,
        userId: opts.userId,
        projectId,
        regenerateMode: null,
        targetProposalId: null,
        via: "mission-autopilot",
      }),
    },
  });

  await audit({
    userId: opts.userId,
    action: AUDIT_ACTIONS.AGENT_RUN,
    resource: "AgentRun",
    resourceId: run.id,
    details: { projectId, via: "mission-autopilot" },
  });

  void runAgentPipeline({
    runId: run.id,
    projectId,
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    locale: opts.locale,
    targetProposalId: null,
  }).catch((err) => {
    console.error("[mission-autopilot]", err);
  });

  return {
    mode: "autopilot",
    projectId,
    runId: run.id,
    message: `Autopilot started pipeline ${run.id} for project ${projectId}.`,
  };
}
