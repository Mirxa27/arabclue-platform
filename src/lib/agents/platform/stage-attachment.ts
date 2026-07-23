import { db } from "@/lib/db";
import { assertWithinQuota, QuotaExceededError } from "@/lib/quotas";
import {
  classifyAttachment,
  type AttachmentSource,
  type ClassificationDecision,
} from "./classify-attachment";
import { ingestDocumentForWorkspace } from "./ingest-document";
import { maybeAutopilotAfterIngest } from "./autopilot";
import {
  completeMissionAction,
  recordMissionAction,
  touchMission,
} from "./mission";

export async function stageMissionAttachment(opts: {
  missionId: string;
  workspaceId: string;
  userId: string;
  locale: "ar" | "en";
  canWrite: boolean;
  activeProjectId?: string | null;
  originalName: string;
  mimeType: string;
  bytes: Buffer;
  source: AttachmentSource;
  textPreview?: string | null;
  autoRoute?: boolean;
}) {
  try {
    await assertWithinQuota(opts.userId, "document");
  } catch (e) {
    if (e instanceof QuotaExceededError) throw e;
    throw e;
  }

  const preliminary = classifyAttachment({
    originalName: opts.originalName,
    mimeType: opts.mimeType,
    textPreview: opts.textPreview,
    source: opts.source,
  });

  const ingested = await ingestDocumentForWorkspace({
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    projectId: opts.activeProjectId,
    originalName: opts.originalName,
    mimeType: opts.mimeType,
    bytes: opts.bytes,
    docCategory: preliminary.category,
    via: "mission-control",
  });

  const decision: ClassificationDecision = classifyAttachment({
    originalName: opts.originalName,
    mimeType: opts.mimeType,
    textPreview: opts.textPreview || ingested.textPreview,
    source: opts.source,
  });

  const attachment = await db.copilotAttachment.create({
    data: {
      missionId: opts.missionId,
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      documentId: ingested.document.id,
      projectId: opts.activeProjectId ?? null,
      source: opts.source,
      originalName: opts.originalName,
      mimeType: opts.mimeType,
      sizeBytes: opts.bytes.length,
      storagePath: ingested.document.storagePath,
      textPreview: (opts.textPreview || ingested.textPreview).slice(0, 4000),
      docCategory: decision.category,
      confidence: decision.confidence,
      routeStatus: "STAGED",
      classificationJson: JSON.stringify(decision),
    },
  });

  const action = await recordMissionAction({
    missionId: opts.missionId,
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    toolName: "stageMissionAttachment",
    status: "RUNNING",
    input: {
      originalName: opts.originalName,
      source: opts.source,
      category: decision.category,
    },
    reversible: true,
  });

  let autopilot = null as Awaited<ReturnType<typeof maybeAutopilotAfterIngest>> | null;
  if (opts.autoRoute !== false) {
    autopilot = await maybeAutopilotAfterIngest({
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      locale: opts.locale,
      attachmentId: attachment.id,
      documentId: ingested.document.id,
      decision,
      activeProjectId: opts.activeProjectId,
      canWrite: opts.canWrite,
    });
  }

  await completeMissionAction(action.id, {
    status: "SUCCEEDED",
    output: { attachmentId: attachment.id, decision, autopilot },
  });
  await touchMission(opts.missionId);

  const refreshed = await db.copilotAttachment.findUniqueOrThrow({
    where: { id: attachment.id },
  });

  return {
    attachment: refreshed,
    document: ingested.document,
    decision,
    autopilot,
  };
}
