import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isPrismaMissingTable } from "@/lib/prisma-missing-table";

function calculateTrend(current: number, previous: number): "up" | "down" | "stable" {
  if (previous === 0) return current > 0 ? "up" : "stable";
  const change = (current - previous) / previous;
  if (change > 0.05) return "up";
  if (change < -0.05) return "down";
  return "stable";
}

function buildDegradedAnalyticsResponse(start: string, end: string) {
  return NextResponse.json({
    ok: true,
    degraded: true,
    empty: true,
    summary: {
      period: { start, end },
      metrics: [
        {
          key: "proposals_created",
          label: { ar: "عروض تم إنشاؤها", en: "Proposals Created" },
          value: 0,
          previousValue: 0,
          trend: "stable" as const,
        },
        {
          key: "proposals_exported",
          label: { ar: "عروض تم تصديرها", en: "Proposals Exported" },
          value: 0,
          previousValue: 0,
          trend: "stable" as const,
        },
        {
          key: "templates_used",
          label: { ar: "قوالب مستخدمة", en: "Templates Used" },
          value: 0,
          previousValue: 0,
          trend: "stable" as const,
        },
        {
          key: "proposal_views",
          label: { ar: "مشاهدات العروض", en: "Proposal Views" },
          value: 0,
          previousValue: 0,
          trend: "stable" as const,
        },
      ],
      charts: {
        proposalsOverTime: [],
        exportsByType: [],
        templateUsage: [],
        sectionCompletion: [],
      },
    },
  });
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json({ error: "Missing start/end dates" }, { status: 400 });
  }

  const startDate = new Date(start);
  const endDate = new Date(end);

  try {
    const events = await db.analyticsEvent.findMany({
      where: {
        workspaceId: session.user.workspaceId,
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: "asc" },
    });

    const totalProposalsCreated = events.filter((e) => e.eventType === "proposal_created").length;
    const totalProposalsExported = events.filter((e) => e.eventType === "proposal_exported").length;
    const totalTemplatesUsed = events.filter((e) => e.eventType === "template_used").length;
    const totalViews = events.filter((e) => e.eventType === "proposal_viewed").length;

    const periodMs = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - periodMs);
    const prevEnd = new Date(startDate);

    const prevEvents = await db.analyticsEvent.findMany({
      where: {
        workspaceId: session.user.workspaceId,
        createdAt: { gte: prevStart, lte: prevEnd },
      },
    });

    const prevProposalsCreated = prevEvents.filter((e) => e.eventType === "proposal_created").length;
    const prevProposalsExported = prevEvents.filter((e) => e.eventType === "proposal_exported").length;
    const prevTemplatesUsed = prevEvents.filter((e) => e.eventType === "template_used").length;
    const prevViews = prevEvents.filter((e) => e.eventType === "proposal_viewed").length;

    const proposalsOverTime: { date: string; value: number }[] = [];
    const dailyMap = new Map<string, number>();

    events
      .filter((e) => e.eventType === "proposal_created")
      .forEach((e) => {
        const day = e.createdAt.toISOString().split("T")[0];
        dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
      });

    const current = new Date(startDate);
    while (current <= endDate) {
      const day = current.toISOString().split("T")[0];
      proposalsOverTime.push({ date: day, value: dailyMap.get(day) ?? 0 });
      current.setDate(current.getDate() + 1);
    }

    const exportsByTypeMap = new Map<string, number>();
    events.filter((e) => e.eventType === "proposal_exported").forEach((e) => {
      const type = (e.metadataJson as { exportType?: string } | null)?.exportType ?? "unknown";
      exportsByTypeMap.set(type, (exportsByTypeMap.get(type) ?? 0) + 1);
    });
    const exportsByType = Array.from(exportsByTypeMap.entries()).map(([category, count]) => ({
      category,
      count,
    }));

    const templateUsageMap = new Map<string, number>();
    events.filter((e) => e.eventType === "template_used").forEach((e) => {
      const templateId = e.entityId;
      templateUsageMap.set(templateId, (templateUsageMap.get(templateId) ?? 0) + 1);
    });
    const templateUsage = Array.from(templateUsageMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([category, count]) => ({ category, count }));

    const sectionCompletionMap = new Map<string, number>();
    events.filter((e) => e.eventType === "section_added").forEach((e) => {
      const sectionType = (e.metadataJson as { sectionType?: string } | null)?.sectionType ?? "unknown";
      sectionCompletionMap.set(sectionType, (sectionCompletionMap.get(sectionType) ?? 0) + 1);
    });
    const sectionCompletion = Array.from(sectionCompletionMap.entries()).map(([category, count]) => ({
      category,
      count,
    }));

    return NextResponse.json({
      ok: true,
      summary: {
        period: { start, end },
        metrics: [
          {
            key: "proposals_created",
            label: { ar: "عروض تم إنشاؤها", en: "Proposals Created" },
            value: totalProposalsCreated,
            previousValue: prevProposalsCreated,
            trend: calculateTrend(totalProposalsCreated, prevProposalsCreated),
          },
          {
            key: "proposals_exported",
            label: { ar: "عروض تم تصديرها", en: "Proposals Exported" },
            value: totalProposalsExported,
            previousValue: prevProposalsExported,
            trend: calculateTrend(totalProposalsExported, prevProposalsExported),
          },
          {
            key: "templates_used",
            label: { ar: "قوالب مستخدمة", en: "Templates Used" },
            value: totalTemplatesUsed,
            previousValue: prevTemplatesUsed,
            trend: calculateTrend(totalTemplatesUsed, prevTemplatesUsed),
          },
          {
            key: "proposal_views",
            label: { ar: "مشاهدات العروض", en: "Proposal Views" },
            value: totalViews,
            previousValue: prevViews,
            trend: calculateTrend(totalViews, prevViews),
          },
        ],
        charts: {
          proposalsOverTime,
          exportsByType,
          templateUsage,
          sectionCompletion,
        },
      },
    });
  } catch (error) {
    if (isPrismaMissingTable(error)) {
      return buildDegradedAnalyticsResponse(start, end);
    }
    console.error("Analytics proposals error:", error);
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}
