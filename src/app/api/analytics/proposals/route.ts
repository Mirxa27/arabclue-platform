import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonApiFailure, withTenant } from "@/lib/api-controller";
import { t } from "@/lib/i18n";
import { activationFunnelFromCounts } from "@/lib/analytics-collector";
import {
  countByMetadataField,
  countEventsByType,
  dailyCountsForType,
  medianAgentRunDurationMs,
  retentionCutoff,
  sumCounts,
  summaryDayRange,
  topEntitiesForType,
} from "@/lib/analytics-read";
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
        const now = new Date();
        const workspaceId = ctx.workspace.id;

        // Previous period: adjacent equal-duration [prevStart, prevEnd)
        const periodMs = endDate.getTime() - startDate.getTime();
        const prevStart = new Date(startDate.getTime() - periodMs);
        const prevEnd = new Date(startDate.getTime());

        // Every aggregate is a database GROUP BY over the half-open range
        // createdAt: { gte: startDate, lt: endDate } — no raw event row is held
        // in memory — and the per-type counts union the retention summaries
        // for whole days already archived (criteria 4.7, 4.8, 4.10).
        const [
          countsByType,
          prevCountsByType,
          agentDuration,
          prevAgentDuration,
          proposalsByDay,
          exportsByType,
          templateUsage,
          sectionCompletion,
        ] = await Promise.all([
          countEventsByType(db, workspaceId, startDate, endDate, now),
          countEventsByType(db, workspaceId, prevStart, prevEnd, now),
          medianAgentRunDurationMs(db, workspaceId, startDate, endDate),
          medianAgentRunDurationMs(db, workspaceId, prevStart, prevEnd),
          dailyCountsForType(db, workspaceId, "proposal_created", startDate, endDate, now),
          countByMetadataField(db, workspaceId, "proposal_exported", "exportFormat", startDate, endDate),
          topEntitiesForType(db, workspaceId, "template_used", startDate, endDate, 10),
          countByMetadataField(db, workspaceId, "section_added", "sectionType", startDate, endDate),
        ]);
        const medianAgentDuration = agentDuration.medianMs;
        const prevMedianAgentDuration = prevAgentDuration.medianMs;

        // Proposals over time (daily buckets, every day of the range present)
        const proposalsOverTime: { date: string; value: number }[] = [];
        const current = new Date(startDate);
        while (current < endDate) {
          const day = current.toISOString().split("T")[0];
          proposalsOverTime.push({ date: day, value: proposalsByDay.get(day) ?? 0 });
          current.setDate(current.getDate() + 1);
        }

        const isEmpty = sumCounts(countsByType) === 0;

        // Build metrics from closed vocabulary only (criterion 4.10)
        const proposalsCreated = countsByType.proposal_created;
        const proposalsApproved = countsByType.proposal_approved;
        const proposalsRejected = countsByType.proposal_rejected;
        const proposalsExported = countsByType.proposal_exported;
        const templatesUsed = countsByType.template_used;
        const agentCompleted = countsByType.agent_run_completed;
        const agentFailed = countsByType.agent_run_failed;
        const agentCancelled = countsByType.agent_run_cancelled;
        const documentsUploaded = countsByType.document_uploaded;
        const documentVersionsCreated = countsByType.document_version_created;

        const prevProposalsCreated = prevCountsByType.proposal_created;
        const prevProposalsApproved = prevCountsByType.proposal_approved;
        const prevProposalsRejected = prevCountsByType.proposal_rejected;
        const prevProposalsExported = prevCountsByType.proposal_exported;
        const prevTemplatesUsed = prevCountsByType.template_used;
        const prevAgentCompleted = prevCountsByType.agent_run_completed;
        const prevAgentFailed = prevCountsByType.agent_run_failed;
        const prevAgentCancelled = prevCountsByType.agent_run_cancelled;
        const prevDocumentsUploaded = prevCountsByType.document_uploaded;
        const prevDocumentVersionsCreated = prevCountsByType.document_version_created;

        // Activation funnel: registered → verified → first project → first
        // document → first run → first export, as event counts for the period.
        const funnel = activationFunnelFromCounts(countsByType).map((stage) => ({
          ...stage,
          label: localizedLabel(
            `funnel_stage_${stage.key}`,
            stage.eventType,
            stage.eventType
          ),
        }));

        return NextResponse.json({
          ok: true,
          empty: isEmpty,
          summary: {
            period: { start, end },
            range: { start, end },
            empty: isEmpty,
            // Payload breakdowns (export format, template, section type) come
            // from raw events only; archived days carry counts, not payloads.
            archivedDaysIncluded:
              summaryDayRange(startDate, endDate, retentionCutoff(now)) !== null,
            funnel: {
              label: localizedLabel(
                "analytics_funnel_title",
                "مسار التفعيل",
                "Activation funnel"
              ),
              stages: funnel,
            },
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
              // Review outcomes were recorded at PATCH /api/reviews/[id] but
              // never surfaced; without them "created" had no counterpart.
              {
                key: "proposals_approved",
                label: localizedLabel(
                  "metric_proposals_approved",
                  "عروض معتمدة",
                  "Proposals Approved"
                ),
                value: proposalsApproved,
                previousValue: prevProposalsApproved,
                difference: proposalsApproved - prevProposalsApproved,
                trend: calculateTrend(proposalsApproved, prevProposalsApproved),
              },
              {
                key: "proposals_rejected",
                label: localizedLabel(
                  "metric_proposals_rejected",
                  "عروض مرفوضة",
                  "Proposals Rejected"
                ),
                value: proposalsRejected,
                previousValue: prevProposalsRejected,
                difference: proposalsRejected - prevProposalsRejected,
                trend: calculateTrend(proposalsRejected, prevProposalsRejected),
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
