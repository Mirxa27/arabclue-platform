import { validationFailure } from "@/lib/api-failure";
import { jsonApiFailure, jsonFailure } from "@/lib/api-controller";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, canWriteRole } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import { getOrCreateMission } from "@/lib/agents/platform/mission";
import { stageMissionAttachment } from "@/lib/agents/platform/stage-attachment";
import { fetchUrlAsAttachment } from "@/lib/agents/platform/connectors";
import { normalizeAttachmentSource } from "@/lib/agents/platform/classify-attachment";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import { QuotaExceededError, quotaFailureCode } from "@/lib/quotas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await requireSession();
  if (!session) {
    return jsonApiFailure("AUTHENTICATION_REQUIRED");
  }
  const { id: missionId } = await ctx.params;
  const tenant = await getTenantContext(session.user.id);
  // Every accepted attachment runs `classifyAttachmentWithAi` before it lands,
  // so a loop over a folder is a loop over the provider.
  const limited = await checkAiRateLimit({
    route: "platform-agent.attachments",
    identifier: tenant.workspace.id,
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const locale = session.user.locale === "en" ? "en" : "ar";
  const canWrite = canWriteRole(session.user.role);

  const mission = await getOrCreateMission({
    workspaceId: tenant.workspace.id,
    userId: session.user.id,
    locale,
  });
  if (mission.id !== missionId) {
    return jsonApiFailure("MISSION_NOT_FOUND");
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || !(file instanceof File)) {
        return jsonFailure(validationFailure(["file"]));
      }
      const source = normalizeAttachmentSource(
        String(form.get("source") || "upload"),
        "upload"
      );
      const activeProjectId = form.get("activeProjectId")
        ? String(form.get("activeProjectId"))
        : mission.activeProjectId;
      const bytes = Buffer.from(await file.arrayBuffer());
      const result = await stageMissionAttachment({
        missionId: mission.id,
        workspaceId: tenant.workspace.id,
        userId: session.user.id,
        locale,
        canWrite,
        activeProjectId,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        bytes,
        source,
        autoRoute: true,
      });
      return NextResponse.json(result);
    }

    const body = (await req.json().catch(() => ({}))) as {
      url?: string;
      text?: string;
      fileName?: string;
      source?: string;
      activeProjectId?: string | null;
      mimeType?: string;
    };

    if (body.url) {
      const fetched = await fetchUrlAsAttachment(body.url);
      const result = await stageMissionAttachment({
        missionId: mission.id,
        workspaceId: tenant.workspace.id,
        userId: session.user.id,
        locale,
        canWrite,
        activeProjectId: body.activeProjectId ?? mission.activeProjectId,
        originalName: fetched.originalName,
        mimeType: fetched.mimeType,
        bytes: fetched.bytes,
        source: "url",
        textPreview: fetched.textPreview,
        autoRoute: true,
      });
      return NextResponse.json(result);
    }

    if (body.text && body.text.trim()) {
      const bytes = Buffer.from(body.text, "utf8");
      const result = await stageMissionAttachment({
        missionId: mission.id,
        workspaceId: tenant.workspace.id,
        userId: session.user.id,
        locale,
        canWrite,
        activeProjectId: body.activeProjectId ?? mission.activeProjectId,
        originalName: body.fileName || "pasted-content.txt",
        mimeType: body.mimeType || "text/plain",
        bytes,
        source: normalizeAttachmentSource(body.source, "paste"),
        textPreview: body.text.slice(0, 4000),
        autoRoute: true,
      });
      return NextResponse.json(result);
    }

    return jsonFailure(validationFailure(["file", "url", "text"]));
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return jsonApiFailure(quotaFailureCode(err));
    }
    console.error("[mission attachments]", err);
    return jsonApiFailure("INTERNAL_ERROR");
  }
}
