import { db } from "@/lib/db";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import {
  extractTextFromBuffer,
  parseTenderText,
  buildIngestionSummary,
} from "@/lib/agents/ingestion";
import { indexDocumentChunks } from "@/lib/document-chunks";
import { saveUpload } from "@/lib/storage";
import { validateUploadAllowlist } from "@/lib/safe-zip";
import { ApiError } from "@/lib/api-failure";
import type { DocCategory } from "@/lib/types";

export type IngestDocumentInput = {
  workspaceId: string;
  userId: string;
  projectId?: string | null;
  originalName: string;
  mimeType: string;
  bytes: Buffer;
  docCategory: DocCategory;
  tenderCategory?: string;
  /** Audit trail tag — documents API vs mission control, etc. */
  via?: string;
};

/**
 * Client-fault conditions throw a typed `ApiError` carrying its own status and
 * stable code.
 *
 * These used to be plain `Error`s, which forced the caller to recover the
 * status by running a regex over the English message — so a rephrased message
 * silently became a 500, and the raw text was echoed to the client either way.
 * Typing them lets the shared failure mapper answer 400 with a bilingual body
 * and no leaked internals.
 */
export async function ingestDocumentForWorkspace(input: IngestDocumentInput) {
  if (!input.bytes.length) {
    throw new ApiError("Uploaded file is empty", 400, "UPLOAD_EMPTY");
  }
  if (input.bytes.length > 50 * 1024 * 1024) {
    throw new ApiError(
      "Uploaded file exceeds the 50MB limit",
      400,
      "UPLOAD_TOO_LARGE"
    );
  }

  const allow = validateUploadAllowlist(input.originalName, input.mimeType);
  if (!allow.ok) {
    throw new ApiError(
      `Upload rejected: ${allow.reason}`,
      400,
      "UPLOAD_TYPE_REJECTED"
    );
  }

  if (input.projectId) {
    const project = await db.tenderProject.findFirst({
      where: { id: input.projectId, workspaceId: input.workspaceId },
    });
    if (!project) {
      throw new ApiError("Project not found", 404, "PROJECT_NOT_FOUND");
    }
  }

  const stored = await saveUpload({
    workspaceId: input.workspaceId,
    originalName: input.originalName,
    bytes: input.bytes,
  });

  const doc = await db.uploadedDocument.create({
    data: {
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      uploadedById: input.userId,
      originalName: input.originalName,
      storagePath: stored.storagePath,
      mimeType: input.mimeType,
      sizeBytes: stored.sizeBytes,
      docCategory: input.docCategory,
      checksum: stored.checksum,
      parseStatus: "PARSING",
      currentVersion: 1,
    },
  });

  const text = await extractTextFromBuffer(
    input.bytes,
    input.mimeType,
    input.originalName
  );
  const { isImageMime } = await import("../ocr-image");
  const imageDoc = isImageMime(input.mimeType, input.originalName);
  const hasText = Boolean(text?.trim());

  let entities;
  let summary: string;
  if (hasText) {
    entities = parseTenderText(text, input.tenderCategory || "IT");
    summary = buildIngestionSummary(entities, [input.originalName]);
  } else if (imageDoc) {
    entities = parseTenderText(
      `Image attachment ${input.originalName} (${input.docCategory}). OCR found no readable text.`,
      input.tenderCategory || "IT"
    );
    summary = `Stored image ${input.originalName} (${input.mimeType}, ${stored.sizeBytes} bytes). OCR completed with no extractable text — file is available for manual review.`;
  } else {
    entities = parseTenderText(
      `Document ${input.originalName} category ${input.docCategory} — no extractable text layer.`,
      input.tenderCategory || "IT"
    );
    summary = `Stored ${input.originalName} (${input.mimeType}, ${stored.sizeBytes} bytes). No extractable text layer — metadata and category-based structure applied.`;
  }
  const entitiesJson = JSON.stringify(entities);

  await db.uploadedDocument.update({
    where: { id: doc.id },
    data: {
      parseStatus: "PARSED",
      parsedSummary: summary,
      extractedEntities: entitiesJson,
    },
  });

  await db.documentVersion.create({
    data: {
      documentId: doc.id,
      version: 1,
      storagePath: stored.storagePath,
      sizeBytes: stored.sizeBytes,
      changeLog: "Initial upload",
      parsedSummary: summary,
      extractedEntities: entitiesJson,
      checksum: stored.checksum,
      createdBy: input.userId,
    },
  });

  const corpusText = text?.trim()
    ? text
    : `${input.originalName}\n${input.docCategory}\n${summary}\n${entities.scope}`;
  const chunkCount = await indexDocumentChunks({
    documentId: doc.id,
    workspaceId: input.workspaceId,
    projectId: input.projectId ?? null,
    text: corpusText,
    title: input.originalName,
  });

  const sub = await db.subscription.findUnique({
    where: { userId: input.userId },
  });
  if (sub) {
    await db.subscription.update({
      where: { id: sub.id },
      data: { documentsUsed: { increment: 1 } },
    });
  }

  await audit({
    userId: input.userId,
    action: AUDIT_ACTIONS.DOC_UPLOAD,
    resource: "UploadedDocument",
    resourceId: doc.id,
    details: {
      originalName: input.originalName,
      docCategory: input.docCategory,
      sizeBytes: stored.sizeBytes,
      projectId: input.projectId,
      ragChunks: chunkCount,
      via: input.via ?? "ingest-document",
    },
  });

  return {
    document: {
      ...doc,
      parseStatus: "PARSED" as const,
      parsedSummary: summary,
      extractedEntities: entitiesJson,
      checksum: stored.checksum,
    },
    textPreview: (text || summary).slice(0, 4000),
    chunkCount,
  };
}
