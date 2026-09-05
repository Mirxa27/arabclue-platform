import { db } from "@/lib/db";
import { apiFailure } from "@/lib/api-failure";
import { computeOnboardingSteps } from "@/lib/onboarding";
import {
  launchProjectPipeline,
  type LaunchPipelineFailure,
} from "@/lib/agents/launch-pipeline";
import type { IngestionEntities } from "@/lib/types";
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
    }
  | {
      /**
       * The file was staged but the platform refused to act on it: onboarding
       * is incomplete, no AI provider is usable, the plan allowance is spent.
       * `code` is a registered completion code so the attachments route can
       * answer with it (and its bilingual message) instead of a clarifying
       * question that hides the real reason.
       */
      mode: "blocked";
      code: LaunchPipelineFailure["code"];
      message: { ar: string; en: string };
      attachmentId: string;
      projectId: string | null;
      missing?: string[];
    };

function blockedResult(
  failure: LaunchPipelineFailure,
  attachmentId: string,
  projectId: string | null
): AutopilotResult {
  return {
    mode: "blocked",
    code: failure.code,
    message: apiFailure(failure.code).message,
    attachmentId,
    projectId,
    ...(failure.code === "ONBOARDING_INCOMPLETE" ? { missing: failure.missing } : {}),
  };
}

export type AutopilotProjectCreateData = {
  workspaceId: string;
  createdById: string;
  etimadRef: string | null;
  title: string;
  titleAr: string | null;
  category: string;
  budget: number | null;
  currency: string;
  submissionDeadline: Date | null;
  saudizationTarget?: number;
  localContentTarget?: number;
  status: "DRAFT";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNonnegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function percentage(value: unknown): number | null {
  const n = finiteNonnegativeNumber(value);
  return n != null && n <= 100 ? n : null;
}

function dateOrNull(value: unknown): Date | null {
  const raw = nonEmptyString(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseIngestionEntitiesJson(json: string | null | undefined): IngestionEntities | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    return isRecord(parsed) ? (parsed as unknown as IngestionEntities) : null;
  } catch {
    return null;
  }
}

async function loadDocumentEntities(documentId: string): Promise<IngestionEntities | null> {
  const document = await db.uploadedDocument.findUnique({
    where: { id: documentId },
    select: { extractedEntities: true },
  });
  return parseIngestionEntitiesJson(document?.extractedEntities);
}

export function buildAutopilotProjectCreateData(opts: {
  workspaceId: string;
  userId: string;
  decision: Pick<ClassificationDecision, "suggestedTitle">;
  entities?: IngestionEntities | null;
  now?: Date;
}): AutopilotProjectCreateData {
  const project = isRecord(opts.entities?.project) ? opts.entities.project : null;
  const title =
    nonEmptyString(project?.title) ||
    opts.decision.suggestedTitle ||
    `Tender ${(opts.now ?? new Date()).toISOString().slice(0, 10)}`;
  const titleAr = nonEmptyString(project?.titleAr) || title;
  const budget = finiteNonnegativeNumber(project?.budget);
  const submissionDeadline = dateOrNull(project?.submissionDeadline);
  const saudizationTarget = percentage(project?.saudizationTarget);
  const localContentTarget = percentage(project?.localContentTarget);

  const data: AutopilotProjectCreateData = {
    workspaceId: opts.workspaceId,
    createdById: opts.userId,
    etimadRef: nonEmptyString(project?.etimadRef),
    title,
    titleAr,
    category: nonEmptyString(project?.category) || "IT",
    budget,
    currency: nonEmptyString(project?.currency) || "SAR",
    submissionDeadline,
    status: "DRAFT",
  };

  if (saudizationTarget != null) data.saudizationTarget = saudizationTarget;
  if (localContentTarget != null) data.localContentTarget = localContentTarget;

  return data;
}

export async function maybeAutopilotAfterIngest(opts: {
  workspaceId: string;
  userId: string;
  locale: "ar" | "en";
  attachmentId: string;
  documentId: string;
  decision: ClassificationDecision;
  activeProjectId?: string | null;
  canWrite: boolean;
  /**
   * Require an explicit human action before this content creates a project or
   * starts a pipeline.
   *
   * Set for content the platform did not receive from a deliberate in-app
   * action — chiefly pages scraped by the browser extension. That content is
   * attacker-influenceable: a crafted page can steer the keyword classifier,
   * and above the confidence floor the classifier's opinion alone was enough to
   * create a project and run the full six-agent pipeline over it. Staging the
   * attachment is fine; taking privileged action on it is not.
   */
  requireConfirmation?: boolean;
}): Promise<AutopilotResult> {
  if (!opts.canWrite) {
    return {
      mode: "clarify",
      question: "Read-only role: I staged the file but cannot route or run agents.",
      attachmentId: opts.attachmentId,
    };
  }

  if (opts.requireConfirmation) {
    return {
      mode: "clarify",
      question:
        opts.locale === "ar"
          ? "تم حفظ المحتوى من المتصفح. أكّد لإنشاء مشروع وبدء التحليل."
          : "Captured from the browser and staged. Confirm to create a project and start analysis.",
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
      // The launcher below re-checks onboarding before any run, but a project
      // must not be created from an unconfigured workspace either.
      const onboarding = await computeOnboardingSteps(opts.workspaceId);
      if (!onboarding.readyForProposals) {
        return blockedResult(
          {
            ok: false,
            code: "ONBOARDING_INCOMPLETE",
            missing: onboarding.missing,
            readyForProposals: false,
          },
          opts.attachmentId,
          null
        );
      }

      const entities = await loadDocumentEntities(opts.documentId);
      const project = await db.tenderProject.create({
        data: buildAutopilotProjectCreateData({
          workspaceId: opts.workspaceId,
          userId: opts.userId,
          decision: opts.decision,
          entities,
        }),
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

  // Same launcher as `POST /api/agents/run`: onboarding, quota, provider
  // preflight, document preflight, concurrency (with the transactional
  // re-check) and the run row. Autopilot used to create the row itself
  // without the onboarding gate or the race check.
  const launch = await launchProjectPipeline({
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    projectId,
    locale: opts.locale,
    source: "mission-autopilot",
  });

  if (!launch.ok) {
    if (launch.code === "AGENT_RUN_IN_PROGRESS") {
      return {
        mode: "routed",
        projectId,
        message: `File linked. Pipeline already running (${launch.runId}).`,
      };
    }
    return blockedResult(launch, opts.attachmentId, projectId);
  }

  return {
    mode: "autopilot",
    projectId,
    runId: launch.runId,
    message: `Autopilot started pipeline ${launch.runId} for project ${projectId}.`,
  };
}