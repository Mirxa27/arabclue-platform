import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toErrorResponse } from "@/lib/api-controller";
import type { DocCategory } from "@/lib/types";
import { requireSession, requireWriter } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { assertWithinQuota, QuotaExceededError } from "@/lib/quotas";
import { ingestDocumentForWorkspace } from "@/lib/agents/platform/ingest-document";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import {
  analyticsRequestOrigin,
  recordDocumentAnalyticsEvent,
} from "@/lib/analytics-collector";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
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
      // Bound to keep response size predictable; the UI shows only recent
      // documents and requests per-project when a project is active.
      take: 200,
      include: {
        uploadedBy: { select: { name: true } },
        versions: { orderBy: { version: "desc" }, take: 10 },
        _count: { select: { versions: true } },
      },
    });

    return NextResponse.json({ documents: docs });
  } catch (err) {
    return toErrorResponse(err, "documents GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireWriter();
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { workspace } = await getTenantContext(session.user.id);
    const userId = session.user.id;

    // Ingestion embeds every chunk, so one upload is many provider calls and a
    // bulk folder drag is a burst of them.
    const limited = await checkAiRateLimit({
      route: "documents.ingest",
      identifier: workspace.id,
      limit: 20,
      windowMs: 60_000,
    });
    if (limited) return limited;

    try {
      await assertWithinQuota(userId, "document");
    } catch (e) {
      if (e instanceof QuotaExceededError) {
        return NextResponse.json(
          { error: e.message, code: e.code },
          { status: 402 }
        );
      }
      throw e;
    }

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "multipart/form-data with file field is required" },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const originalName = file.name;
    const mimeType = file.type || "application/octet-stream";
    const docCategory = String(form.get("docCategory") || "OTHER") as DocCategory;
    const projectId = form.get("projectId")
      ? String(form.get("projectId"))
      : undefined;
    const bytes = Buffer.from(await file.arrayBuffer());

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

    const project = await db.tenderProject.findUnique({ where: { id: projectId } });
    if (!project || !assertWorkspaceMatch(project.workspaceId, workspace.id)) {
      return NextResponse.json({ error: "project not found" }, { status: 404 });
    }

    const ingested = await ingestDocumentForWorkspace({
      workspaceId: workspace.id,
      userId,
      projectId,
      originalName,
      mimeType,
      bytes,
      docCategory,
      tenderCategory: project.category || undefined,
      via: "documents-api",
    });

    // The document row has committed. The persisted document identifier is the
    // mutation reference, so a repeated attempt for the same upload appends no
    // second row and a failure never changes this response (requirements 4.3,
    // 4.4, 4.5, 4.6).
    await recordDocumentAnalyticsEvent({
      eventType: "document_uploaded",
      documentId: ingested.document.id,
      mutationRef: ingested.document.id,
      origin: analyticsRequestOrigin({
        tenantWorkspaceId: workspace.id,
        actorUserId: userId,
      }),
      metadata: { projectId, sizeBytes: bytes.length },
    });

    return NextResponse.json({ document: ingested.document });
  } catch (err) {
    // Status used to be chosen by regex over an English exception message,
    // which broke as soon as a driver phrased something differently and echoed
    // the raw text either way. Ingestion now throws a typed ApiError for the
    // client-fault cases and everything else maps to a generic failure.
    return toErrorResponse(err, "documents POST");
  }
}
