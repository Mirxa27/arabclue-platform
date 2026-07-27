import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonApiFailure, withTenant } from "@/lib/api-controller";
import { t } from "@/lib/i18n";
import { calculateMedian } from "@/lib/analytics-collector";

function calculateTrend(current: number, previous: number): "up" | "down" | "stable" {
  if (previous === 0) return current > 0 ? "up" : "stable";
  const change = (current - previous) / previous;
  if (change > 0.05) return "up";
  if (change < -0.05) return "down";
  return "stable";
}

function localizedLabel(key: string, fallbackAr: string, fallbackEn: string) {
  const entry = (t as Record<string, { ar: string; en: string }>)[key];
  if (entry && entry.ar && entry.en) return entry;
  return { ar: fallbackAr, en: fallbackEn };
}

/**
 * Tenant-scoped activity analytics.
 *
 * Session, workspace, and range validation run before any read. A missing
 * `AnalyticsEvent` relation is mapped centrally to HTTP 503
 * `SCHEMA_MIGRATION_PENDING`; this route never answers with synthesized or
 * degraded metrics (requirements 16.2, 16.7, 19.1).
 */
export async function GET(request: NextRequest) {
  return withTenant(
    "session",
    async (ctx) => {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return jsonApiFailure("ANALYTICS_DATE_RANGE_REQUIRED");
  }

  const startDate = new Date(start);
  const endDate = new Date(end);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return jsonApiFailure("ANALYTICS_DATE_INVALID");
  }

  if (startDate > endDate) {
    return jsonApiFailure("ANALYTICS_DATE_RANGE_INVALID");
  }

  const diffMs = endDate.getTime() - startDate.getTime();
  const maxMs = 366 * 24 * 60 * 60 * 1000;
  if (diffMs > maxMs) {
    return jsonApiFailure("ANALYTICS_RANGE_TOO_LARGE");
  }

  {
    const events = await db.analyticsEvent.findMany({
      where: {
        workspaceId: ctx.workspace.id,
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: "asc" },
    });

    const totalProposalsCreated = events.filter((e) => e.eventType === "proposal_created").length;
    const totalProposalsExported = events.filter((e) => e.eventType === "proposal_exported").length;
    const totalTemplatesUsed = events.filter((e) => e.eventType === "template_used").length;
    const totalViews = events.filter((e) => e.eventType === "proposal_viewed").length;
    const totalAgentCompleted = events.filter((e) => e.eventType === "agent_run_completed").length;
    const totalAgentFailed = events.filter((e) => e.eventType === "agent_run_failed").length;

    const agentDurations = events
      .filter((e) => e.eventType === "agent_run_completed")
      .map((e) => {
        const meta = e.metadataJson as { durationMs?: unknown } | null;
        const d = meta?.durationMs;
        return typeof d === "number" && Number.isFinite(d) && d >= 0 ? d : null;
      })
      .filter((v): v is number => v !== null);

    const medianAgentDuration = calculateMedian(agentDurations);

    const periodMs = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - periodMs);
    const prevEnd = new Date(startDate);

    const prevEvents = await db.analyticsEvent.findMany({
      where: {
        workspaceId: ctx.workspace.id,
        createdAt: { gte: prevStart, lte: prevEnd },
      },
    });

    const prevProposalsCreated = prevEvents.filter((e) => e.eventType === "proposal_created").length;
    const prevProposalsExported = prevEvents.filter((e) => e.eventType === "proposal_exported").length;
    const prevTemplatesUsed = prevEvents.filter((e) => e.eventType === "template_used").length;
    const prevViews = prevEvents.filter((e) => e.eventType === "proposal_viewed").length;
    const prevAgentCompleted = prevEvents.filter((e) => e.eventType === "agent_run_completed").length;

    const prevAgentDurations = prevEvents
      .filter((e) => e.eventType === "agent_run_completed")
      .map((e) => {
        const meta = e.metadataJson as { durationMs?: unknown } | null;
        const d = meta?.durationMs;
        return typeof d === "number" && Number.isFinite(d) && d >= 0 ? d : null;
      })
      .filter((v): v is number => v !== null);
    const prevMedianAgentDuration = calculateMedian(prevAgentDurations);

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

    const isEmpty = events.length === 0;

    return NextResponse.json({
      ok: true,
      empty: isEmpty,
      summary: {
        period: { start, end },
        range: { start, end },
        empty: isEmpty,
        metrics: [
          {
            key: "proposals_created",
            label: localizedLabel("metric_proposals_created", "عروض تم إنشاؤها", "Proposals Created"),
            value: totalProposalsCreated,
            previousValue: prevProposalsCreated,
            trend: calculateTrend(totalProposalsCreated, prevProposalsCreated),
          },
          {
            key: "proposals_exported",
            label: localizedLabel("metric_proposals_exported", "عروض تم تصديرها", "Proposals Exported"),
            value: totalProposalsExported,
            previousValue: prevProposalsExported,
            trend: calculateTrend(totalProposalsExported, prevProposalsExported),
          },
          {
            key: "templates_used",
            label: localizedLabel("metric_templates_used", "قوالب مستخدمة", "Templates Used"),
            value: totalTemplatesUsed,
            previousValue: prevTemplatesUsed,
            trend: calculateTrend(totalTemplatesUsed, prevTemplatesUsed),
          },
          {
            key: "proposal_views",
            label: localizedLabel("metric_proposal_views", "مشاهدات العروض", "Proposal Views"),
            value: totalViews,
            previousValue: prevViews,
            trend: calculateTrend(totalViews, prevViews),
          },
          {
            key: "agent_runs_completed",
            label: localizedLabel("metric_agent_runs_completed", "تشغيلات الوكلاء المكتملة", "Agent Runs Completed"),
            value: totalAgentCompleted,
            previousValue: prevAgentCompleted,
            trend: calculateTrend(totalAgentCompleted, prevAgentCompleted),
          },
          {
            key: "agent_runs_failed",
            label: localizedLabel("metric_agent_runs_failed", "تشغيلات فاشلة", "Failed Runs"),
            value: totalAgentFailed,
            previousValue: prevEvents.filter((e) => e.eventType === "agent_run_failed").length,
            trend: calculateTrend(
              totalAgentFailed,
              prevEvents.filter((e) => e.eventType === "agent_run_failed").length
            ),
          },
          {
            key: "agent_median_duration",
            label: localizedLabel("metric_agent_median_duration", "متوسط زمن التشغيل", "Median Run Duration"),
            value: Math.round(medianAgentDuration),
            previousValue: Math.round(prevMedianAgentDuration),
            trend: calculateTrend(medianAgentDuration, prevMedianAgentDuration),
            unit: "ms",
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
  }
    },
    "analytics:proposals"
  );
}
