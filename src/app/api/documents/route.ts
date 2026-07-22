import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { DocCategory } from "@/lib/types";
import { saveUpload } from "@/lib/storage";
import {
  extractTextFromBuffer,
  parseTenderText,
  buildIngestionSummary,
} from "@/lib/agents/ingestion";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { requireSession, requireWriter } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { assertWithinQuota, QuotaExceededError } from "@/lib/quotas";
import { indexDocumentChunks } from "@/lib/document-chunks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspace } = await getTenantContext(session.user.id);
  const projectId = req.nextUrl.searchParams.get("projectId");

  const docs = await db.uploadedDocument.findMany({
    where: {
      workspaceId: workspace.id,
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { select: { name: true } },
      versions: { orderBy: { version: "desc" }, take: 10 },
      _count: { select: { versions: true } },
    },
  });

  return NextResponse.json({ documents: docs });
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireWriter();
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { workspace } = await getTenantContext(session.user.id);
    const userId = session.user.id;

    try {
      await assertWithinQuota(userId, "document");
    } catch (e) {
      if (e instanceof QuotaExceededError) {
        return NextResponse.json({ error: e.message, code: e.code }, { status: 402 });
      }
      throw e;
    }

    const contentType = req.headers.get("content-type") ?? "";
    let originalName: string;
    let mimeType: string;
    let docCategory: DocCategory;
    let projectId: string | undefined;
    let bytes: Buffer;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: "file is required" }, { status: 400 });
      }
      originalName = file.name;
      mimeType = file.type || "application/octet-stream";
      docCategory = String(form.get("docCategory") || "OTHER") as DocCategory;
      projectId = form.get("projectId") ? String(form.get("projectId")) : undefined;
      bytes = Buffer.from(await file.arrayBuffer());
    } else {
      return NextResponse.json(
        { error: "multipart/form-data with file field is required" },
        { status: 400 }
      );
    }

    if (!originalName || !docCategory) {
      return NextResponse.json(
        { error: "originalName and docCategory are required" },
        { status: 400 }
      );
    }
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required — select an active project first" },
        { status: 400 }
      );
    }
    if (bytes.length === 0) {
      return NextResponse.json({ error: "empty file" }, { status: 400 });
    }
    if (bytes.length > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "file too large (max 50MB)" }, { status: 400 });
    }

    const project = await db.tenderProject.findUnique({ where: { id: projectId } });
    if (!project || !assertWorkspaceMatch(project.workspaceId, workspace.id)) {
      return NextResponse.json({ error: "project not found" }, { status: 404 });
    }

    const stored = await saveUpload({
      workspaceId: workspace.id,
      originalName,
      bytes,
    });

    const doc = await db.uploadedDocument.create({
      data: {
        workspaceId: workspace.id,
        projectId,
        uploadedById: userId,
        originalName,
        storagePath: stored.storagePath,
        mimeType,
        sizeBytes: stored.sizeBytes,
        docCategory,
        checksum: stored.checksum,
        parseStatus: "PARSING",
        currentVersion: 1,
      },
    });

    const text = await extractTextFromBuffer(bytes, mimeType, originalName);
    const entities = text
      ? parseTenderText(text, project.category)
      : parseTenderText(
          `Document ${originalName} category ${docCategory} — binary without extractable text layer.`,
          project.category
        );
    const summary = text
      ? buildIngestionSummary(entities, [originalName])
      : `Stored ${originalName} (${mimeType}, ${stored.sizeBytes} bytes). No extractable text layer — metadata and category-based structure applied.`;

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
        createdBy: userId,
      },
    });

    // Vectorize tender text for project-scoped RAG (Technical Architect agent)
    const corpusText = text?.trim()
      ? text
      : `${originalName}\n${docCategory}\n${summary}\n${entities.scope}`;
    const chunkCount = await indexDocumentChunks({
      documentId: doc.id,
      workspaceId: workspace.id,
      projectId,
      text: corpusText,
      title: originalName,
    });

    const sub = await db.subscription.findUnique({ where: { userId } });
    if (sub) {
      await db.subscription.update({
        where: { id: sub.id },
        data: { documentsUsed: { increment: 1 } },
      });
    }

    await audit({
      userId,
      action: AUDIT_ACTIONS.DOC_UPLOAD,
      resource: "UploadedDocument",
      resourceId: doc.id,
      details: {
        originalName,
        docCategory,
        sizeBytes: stored.sizeBytes,
        projectId,
        ragChunks: chunkCount,
      },
    });

    return NextResponse.json({
      document: {
        ...doc,
        parseStatus: "PARSED",
        parsedSummary: summary,
        extractedEntities: entitiesJson,
        checksum: stored.checksum,
      },
    });
  } catch (err) {
    console.error("[documents POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
