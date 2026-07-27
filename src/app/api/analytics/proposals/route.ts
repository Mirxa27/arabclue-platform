import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonApiFailure, withTenant } from "@/lib/api-controller";
import { t } from "@/lib/i18n";
import {
  ANALYTICS_EVENT_TYPES,
  ANALYTICS_AGENT_TERMINAL_EVENT_TYPES,
  ANALYTICS_AGENT_START_EVENT_TYPE,
  medianDurationMs,
  type AnalyticsEventType,
} from "@/lib/analytics-collector";
import { isPrismaMissingTable } from "@/lib/prisma-missing-table";

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
 * Tenant-scoped activity analytics aggregation — Requirement 4.7, 4.8, 4.10, 4.11.
 *
 * Session, workspace, and range validation run before any read. The date range
 * is treated as [start, end) to prevent overlap between current and preceding
 * windows (design §3.3). A missing `AnalyticsEvent` relation is mapped centrally
 * to HTTP 503 `SCHEMA_MIGRATION_PENDING`; this route never answers with
 * synthesized or degraded metrics (requirements 16.2, 16.7, 19.1).
 *
 * Every reported metric uses only event types from the closed vocabulary
 * `ANALYTICS_EVENT_TYPES` (criterion 4.10). Medians are reported as null when
 * unavailable rather than zero (criterion 4.8).
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

      if (startDate >= endDate) {
        return jsonApiFailure("ANALYTICS_DATE_RANGE_INVALID");
      }

      const diffMs = endDate.getTime() - startDate.getTime();
      const maxMs = 366 * 24 * 60 * 60 * 1000;
      if (diffMs > maxMs) {
        return jsonApiFailure("ANALYTICS_RANGE_TOO_LARGE");
      }

      try {
        // [start, end) — half-open range prevents overlap with preceding window
        const events = await db.analyticsEvent.findMany({
          where: {
            workspaceId: ctx.workspace.id,
            createdAt: { gte: startDate, lt: endDate },
          },
          orderBy: { createdAt: "asc" },
        });

        // Count every vocabulary event type (criterion 4.10)
        const countsByType = new Map<AnalyticsEventType, number>();
        for (const eventType of ANALYTICS_EVENT_TYPES) {
          countsByType.set(eventType, 0);
        }
        for (const event of events) {
          const current = countsByType.get(event.eventType as AnalyticsEventType);
          if (current !== undefined) {
            countsByType.set(event.eventType as AnalyticsEventType, current + 1);
          }
        }

        // Agent run duration pairing: earliest start to earliest terminal per run
        const agentStartTimes = new Map<string, number>();
        const agentTerminalTimes = new Map<string, number>();

        for (const event of events) {
          if (event.eventType === ANALYTICS_AGENT_START_EVENT_TYPE) {
            const existing = agentStartTimes.get(event.entityId);
            if (existing === undefined || event.createdAt.getTime() < existing) {
              agentStartTimes.set(event.entityId, event.createdAt.getTime());
            }
          }
          if (
            (ANALYTICS_AGENT_TERMINAL_EVENT_TYPES as readonly string[]).includes(
              event.eventType
            )
          ) {
            const existing = agentTerminalTimes.get(event.entityId);
            if (existing === undefined || event.createdAt.getTime() < existing) {
              agentTerminalTimes.set(event.entityId, event.createdAt.getTime());
            }
          }
        }

        const agentDurations: number[] = [];
        for (const [runId, startTime] of agentStartTimes) {
          const terminalTime = agentTerminalTimes.get(runId);
          if (terminalTime !== undefined) {
            const duration = Math.round(terminalTime - startTime);
            if (duration >= 0) agentDurations.push(duration);
          }
        }

        // Median reported as null when unavailable (criterion 4.8)
        const medianAgentDuration = medianDurationMs(agentDurations);

        // Previous period: adjacent equal-duration [prevStart, prevEnd)
        const periodMs = endDate.getTime() - startDate.getTime();
        const prevStart = new Date(startDate.getTime() - periodMs);
        const prevEnd = new Date(startDate.getTime());

        const prevEvents = await db.analyticsEvent.findMany({
          where: {
            workspaceId: ctx.workspace.id,
            createdAt: { gte: prevStart, lt: prevEnd },
          },
        });

        const prevCountsByType = new Map<AnalyticsEventType, number>();
        for (const eventType of ANALYTICS_EVENT_TYPES) {
          prevCountsByType.set(eventType, 0);
        }
        for (const event of prevEvents) {
          const current = prevCountsByType.get(event.eventType as AnalyticsEventType);
          if (current !== undefined) {
            prevCountsByType.set(event.eventType as AnalyticsEventType, current + 1);
          }
        }

        // Previous period agent durations
        const prevAgentStartTimes = new Map<string, number>();
        const prevAgentTerminalTimes = new Map<string, number>();
        for (const event of prevEvents) {
          if (event.eventType === ANALYTICS_AGENT_START_EVENT_TYPE) {
            const existing = prevAgentStartTimes.get(event.entityId);
            if (existing === undefined || event.createdAt.getTime() < existing) {
              prevAgentStartTimes.set(event.entityId, event.createdAt.getTime());
            }
          }
          if (
            (ANALYTICS_AGENT_TERMINAL_EVENT_TYPES as readonly string[]).includes(
              event.eventType
            )
          ) {
            const existing = prevAgentTerminalTimes.get(event.entityId);
            if (existing === undefined || event.createdAt.getTime() < existing) {
              prevAgentTerminalTimes.set(event.entityId, event.createdAt.getTime());
            }
          }
        }
        const prevAgentDurations: number[] = [];
        for (const [runId, startTime] of prevAgentStartTimes) {
          const terminalTime = prevAgentTerminalTimes.get(runId);
          if (terminalTime !== undefined) {
            const duration = Math.round(terminalTime - startTime);
            if (duration >= 0) prevAgentDurations.push(duration);
          }
        }
        const prevMedianAgentDuration = medianDurationMs(prevAgentDurations);

        // Proposals over time (daily buckets)
        const proposalsOverTime: { date: string; value: number }[] = [];
        const dailyMap = new Map<string, number>();
        events
          .filter((e) => e.eventType === "proposal_created")
          .forEach((e) => {
            const day = e.createdAt.toISOString().split("T")[0];
            dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
          });
        const current = new Date(startDate);
        while (current < endDate) {
          const day = current.toISOString().split("T")[0];
          proposalsOverTime.push({ date: day, value: dailyMap.get(day) ?? 0 });
          current.setDate(current.getDate() + 1);
        }

        // Exports by type
        const exportsByTypeMap = new Map<string, number>();
        events
          .filter((e) => e.eventType === "proposal_exported")
          .forEach((e) => {
            const type =
              (e.metadataJson as { exportFormat?: string } | null)?.exportFormat ??
              "unknown";
            exportsByTypeMap.set(type, (exportsByTypeMap.get(type) ?? 0) + 1);
          });
        const exportsByType = Array.from(exportsByTypeMap.entries()).map(
          ([category, count]) => ({ category, count })
        );

        // Template usage
        const templateUsageMap = new Map<string, number>();
        events
          .filter((e) => e.eventType === "template_used")
          .forEach((e) => {
            templateUsageMap.set(
              e.entityId,
              (templateUsageMap.get(e.entityId) ?? 0) + 1
            );
          });
        const templateUsage = Array.from(templateUsageMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([category, count]) => ({ category, count }));

        // Section completion
        const sectionCompletionMap = new Map<string, number>();
        events
          .filter((e) => e.eventType === "section_added")
          .forEach((e) => {
            const sectionType =
              (e.metadataJson as { sectionType?: string } | null)?.sectionType ??
              "unknown";
            sectionCompletionMap.set(
              sectionType,
              (sectionCompletionMap.get(sectionType) ?? 0) + 1
            );
          });
        const sectionCompletion = Array.from(sectionCompletionMap.entries()).map(
          ([category, count]) => ({ category, count })
        );

        const isEmpty = events.length === 0;

        // Build metrics from closed vocabulary only (criterion 4.10)
        const proposalsCreated = countsByType.get("proposal_created") ?? 0;
        const proposalsExported = countsByType.get("proposal_exported") ?? 0;
        const templatesUsed = countsByType.get("template_used") ?? 0;
        const agentCompleted = countsByType.get("agent_run_completed") ?? 0;
        const agentFailed = countsByType.get("agent_run_failed") ?? 0;
        const agentCancelled = countsByType.get("agent_run_cancelled") ?? 0;
        const documentsUploaded = countsByType.get("document_uploaded") ?? 0;
        const documentVersionsCreated =
          countsByType.get("document_version_created") ?? 0;

        const prevProposalsCreated = prevCountsByType.get("proposal_created") ?? 0;
        const prevProposalsExported =
          prevCountsByType.get("proposal_exported") ?? 0;
        const prevTemplatesUsed = prevCountsByType.get("template_used") ?? 0;
        const prevAgentCompleted =
          prevCountsByType.get("agent_run_completed") ?? 0;
        const prevAgentFailed = prevCountsByType.get("agent_run_failed") ?? 0;
        const prevAgentCancelled =
          prevCountsByType.get("agent_run_cancelled") ?? 0;
        const prevDocumentsUploaded =
          prevCountsByType.get("document_uploaded") ?? 0;
        const prevDocumentVersionsCreated =
          prevCountsByType.get("document_version_created") ?? 0;

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
                label: localizedLabel(
                  "metric_proposals_created",
                  "عروض تم إنشاؤها",
                  "Proposals Created"
                ),
                value: proposalsCreated,
                previousValue: prevProposalsCreated,
                difference: proposalsCreated - prevProposalsCreated,
                trend: calculateTrend(proposalsCreated, prevProposalsCreated),
              },
              {
                key: "proposals_exported",
                label: localizedLabel(
                  "metric_proposals_exported",
                  "عروض تم تصديرها",
                  "Proposals Exported"
                ),
                value: proposalsExported,
                previousValue: prevProposalsExported,
                difference: proposalsExported - prevProposalsExported,
                trend: calculateTrend(proposalsExported, prevProposalsExported),
              },
              {
                key: "templates_used",
                label: localizedLabel(
                  "metric_templates_used",
                  "قوالب مستخدمة",
                  "Templates Used"
                ),
                value: templatesUsed,
                previousValue: prevTemplatesUsed,
                difference: templatesUsed - prevTemplatesUsed,
                trend: calculateTrend(templatesUsed, prevTemplatesUsed),
              },
              {
                key: "documents_uploaded",
                label: localizedLabel(
                  "metric_documents_uploaded",
                  "مستندات مرفوعة",
                  "Documents Uploaded"
                ),
                value: documentsUploaded,
                previousValue: prevDocumentsUploaded,
                difference: documentsUploaded - prevDocumentsUploaded,
                trend: calculateTrend(documentsUploaded, prevDocumentsUploaded),
              },
              {
                key: "document_versions_created",
                label: localizedLabel(
                  "metric_document_versions_created",
                  "إصدارات مستندات",
                  "Document Versions"
                ),
                value: documentVersionsCreated,
                previousValue: prevDocumentVersionsCreated,
                difference:
                  documentVersionsCreated - prevDocumentVersionsCreated,
                trend: calculateTrend(
                  documentVersionsCreated,
                  prevDocumentVersionsCreated
                ),
              },
              {
                key: "agent_runs_completed",
                label: localizedLabel(
                  "metric_agent_runs_completed",
                  "تشغيلات الوكلاء المكتملة",
                  "Agent Runs Completed"
                ),
                value: agentCompleted,
                previousValue: prevAgentCompleted,
                difference: agentCompleted - prevAgentCompleted,
                trend: calculateTrend(agentCompleted, prevAgentCompleted),
              },
              {
                key: "agent_runs_failed",
                label: localizedLabel(
                  "metric_agent_runs_failed",
                  "تشغيلات فاشلة",
                  "Failed Runs"
                ),
                value: agentFailed,
                previousValue: prevAgentFailed,
                difference: agentFailed - prevAgentFailed,
                trend: calculateTrend(agentFailed, prevAgentFailed),
              },
              {
                key: "agent_runs_cancelled",
                label: localizedLabel(
                  "metric_agent_runs_cancelled",
                  "تشغيلات ملغاة",
                  "Cancelled Runs"
                ),
                value: agentCancelled,
                previousValue: prevAgentCancelled,
                difference: agentCancelled - prevAgentCancelled,
                trend: calculateTrend(agentCancelled, prevAgentCancelled),
              },
              {
                key: "agent_median_duration",
                label: localizedLabel(
                  "metric_agent_median_duration",
                  "متوسط زمن التشغيل",
                  "Median Run Duration"
                ),
                // null when unavailable (criterion 4.8), not zero
                value: medianAgentDuration,
                previousValue: prevMedianAgentDuration,
                difference:
                  medianAgentDuration !== null && prevMedianAgentDuration !== null
                    ? medianAgentDuration - prevMedianAgentDuration
                    : null,
                trend:
                  medianAgentDuration !== null && prevMedianAgentDuration !== null
                    ? calculateTrend(medianAgentDuration, prevMedianAgentDuration)
                    : "stable",
                unit: "ms",
                available: medianAgentDuration !== null,
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
          return jsonApiFailure("SCHEMA_MIGRATION_PENDING", {
            missingTable: "AnalyticsEvent",
          });
        }
        throw error;
      }
    },
    "analytics:proposals"
  );
}
