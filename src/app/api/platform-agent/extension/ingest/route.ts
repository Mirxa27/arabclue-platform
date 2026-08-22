import { NextRequest, NextResponse } from "next/server";
import { requireSession, canWriteRole } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import { getOrCreateMission } from "@/lib/agents/platform/mission";
import { stageMissionAttachment } from "@/lib/agents/platform/stage-attachment";
import { QuotaExceededError } from "@/lib/quotas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/platform-agent/extension/ingest
 * Chrome extension uplink — stages page/selection/screenshot into Mission Control.
 * Auth: session cookie from arabclue.com (credentials: include).
 */
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized — sign in at arabclue.com first" },
      { status: 401 }
    );
  }

  const tenant = await getTenantContext(session.user.id);
  const locale = session.user.locale === "en" ? "en" : "ar";
  const canWrite = canWriteRole(session.user.role);

  const body = (await req.json().catch(() => ({}))) as {
    mode?: "page" | "selection" | "screenshot" | "tender";
    title?: string;
    url?: string;
    text?: string;
    headings?: string[];
    metaDescription?: string;
    screenshotDataUrl?: string;
    source?: string;
    activeProjectId?: string | null;
    tender?: {
      referenceNumber?: string;
      title?: string;
      titleAr?: string;
      entity?: string;
      entityAr?: string;
      category?: string;
      value?: number;
      currency?: string;
      publishDate?: string;
      closingDate?: string;
      status?: string;
      location?: string;
      url?: string;
      qualifications?: string[];
      localContentRequired?: boolean;
      localContentMinimum?: number;
      documents?: { name: string; type: string; url: string }[];
    };
  };

  const mission = await getOrCreateMission({
    workspaceId: tenant.workspace.id,
    userId: session.user.id,
    locale,
    activeProjectId: body.activeProjectId,
  });

  try {
    // Handle structured Etimad tender data
    if (body.mode === "tender" && body.tender?.referenceNumber) {
      const tenderHeader = [
        `# ${body.tender.titleAr || body.tender.title || "Etimad Tender"}`,
        "",
        `**رقم المنافسة / Reference:** ${body.tender.referenceNumber}`,
        body.tender.entityAr ? `**الجهة / Entity:** ${body.tender.entityAr}` : "",
        body.tender.category ? `**التصنيف / Category:** ${body.tender.category}` : "",
        body.tender.value ? `**القيمة / Value:** SAR ${body.tender.value.toLocaleString()}` : "",
        body.tender.publishDate ? `**تاريخ الطرح / Published:** ${body.tender.publishDate}` : "",
        body.tender.closingDate ? `**آخر موعد / Deadline:** ${body.tender.closingDate}` : "",
        body.tender.status ? `**الحالة / Status:** ${body.tender.status}` : "",
        body.tender.location ? `**الموقع / Location:** ${body.tender.location}` : "",
        body.tender.localContentRequired ? `**محتوى محلي / Local Content:** Required (${body.tender.localContentMinimum || "?"}%)` : "",
        "",
        body.tender.qualifications?.length ? `## المتطلبات / Requirements\n${body.tender.qualifications.map(q => `- ${q}`).join("\n")}` : "",
        "",
        body.tender.documents?.length ? `## المستندات / Documents\n${body.tender.documents.map(d => `- [${d.type}] ${d.name}`).join("\n")}` : "",
        "",
        body.tender.url ? `Source: ${body.tender.url}` : "",
        "",
        (body.text || "").trim(),
      ].filter(Boolean).join("\n");

      const result = await stageMissionAttachment({
        missionId: mission.id,
        workspaceId: tenant.workspace.id,
        userId: session.user.id,
        locale,
        canWrite,
        activeProjectId: body.activeProjectId ?? mission.activeProjectId,
        originalName: `etimad-${slug(body.tender.referenceNumber)}-tender.md`,
        mimeType: "text/markdown",
        bytes: Buffer.from(tenderHeader, "utf8"),
        source: "browser",
        textPreview: tenderHeader.slice(0, 4000),
        autoRoute: true,
        // Browser-captured content is attacker-influenceable: a crafted page
        // can steer the keyword classifier. Stage and classify, but require an
        // explicit human action before it creates a project or runs agents.
        requireConfirmation: true,
      });

      return NextResponse.json({
        ok: true,
        missionId: mission.id,
        message: "Etimad tender ingested into Mission Control",
        tenderRef: body.tender.referenceNumber,
        ...result,
      });
    }

    // Prefer screenshot binary when provided
    if (body.screenshotDataUrl?.startsWith("data:image/")) {
      const comma = body.screenshotDataUrl.indexOf(",");
      const b64 = body.screenshotDataUrl.slice(comma + 1);
      const bytes = Buffer.from(b64, "base64");
      const result = await stageMissionAttachment({
        missionId: mission.id,
        workspaceId: tenant.workspace.id,
        userId: session.user.id,
        locale,
        canWrite,
        activeProjectId: body.activeProjectId ?? mission.activeProjectId,
        originalName: `${slug(body.title || "screenshot")}.png`,
        mimeType: "image/png",
        bytes,
        source: "browser",
        textPreview: [
          body.title,
          body.url,
          body.metaDescription,
          (body.text || "").slice(0, 1500),
        ]
          .filter(Boolean)
          .join("\n"),
        autoRoute: true,
        // Browser-captured content is attacker-influenceable: a crafted page
        // can steer the keyword classifier. Stage and classify, but require an
        // explicit human action before it creates a project or runs agents.
        requireConfirmation: true,
      });
      return NextResponse.json({
        ok: true,
        missionId: mission.id,
        message: "Screenshot staged into Mission Control",
        ...result,
      });
    }

    const text = (body.text || "").trim();
    if (!text) {
      return NextResponse.json(
        { error: "text or screenshotDataUrl is required" },
        { status: 400 }
      );
    }

    const header = [
      `# ${body.title || "Browser capture"}`,
      body.url ? `URL: ${body.url}` : "",
      body.metaDescription ? `Description: ${body.metaDescription}` : "",
      body.headings?.length
        ? `Headings:\n${body.headings.map((h) => `- ${h}`).join("\n")}`
        : "",
      "",
      text,
    ]
      .filter(Boolean)
      .join("\n");

    const mode = body.mode || "page";
    const result = await stageMissionAttachment({
      missionId: mission.id,
      workspaceId: tenant.workspace.id,
      userId: session.user.id,
      locale,
      canWrite,
      activeProjectId: body.activeProjectId ?? mission.activeProjectId,
      originalName: `${slug(body.title || mode)}-${mode}.md`,
      mimeType: "text/markdown",
      bytes: Buffer.from(header, "utf8"),
      source: "browser",
      textPreview: header.slice(0, 4000),
      autoRoute: true,
        // Browser-captured content is attacker-influenceable: a crafted page
        // can steer the keyword classifier. Stage and classify, but require an
        // explicit human action before it creates a project or runs agents.
        requireConfirmation: true,
    });

    return NextResponse.json({
      ok: true,
      missionId: mission.id,
      message:
        mode === "selection"
          ? "Selection beamed into Mission Control"
          : "Page context beamed into Mission Control",
      ...result,
    });
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 402 }
      );
    }
    console.error("[extension ingest]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed" },
      { status: 500 }
    );
  }
}

function slug(input: string) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "capture"
  );
}
