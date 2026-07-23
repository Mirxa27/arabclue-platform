import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { DocCategory } from "@/lib/types";
import { requireSession, requireWriter } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { assertWithinQuota, QuotaExceededError } from "@/lib/quotas";
import { ingestDocumentForWorkspace } from "@/lib/agents/platform/ingest-document";

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

    return NextResponse.json({ document: ingested.document });
  } catch (err) {
    console.error("[documents POST]", err);
    const message = err instanceof Error ? err.message : "unknown";
    const status =
      /rejected|empty file|too large|project not found/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
