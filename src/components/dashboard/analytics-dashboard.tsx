"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  FileText,
  Download,
  Users,
  Clock,
  Loader2,
  Calendar,
  Layers,
  CheckCircle,
  XCircle,
  Timer,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AnalyticsSummary, AnalyticsMetric, DateRange } from "@/lib/proposal-builder-types";
import { ErrorState, EmptyState } from "@/components/patterns/query-state";
import { AnalyticsCharts } from "./analytics-charts";
import { tr } from "@/lib/i18n";

type Period = "7d" | "30d" | "90d" | "1y";

const PERIOD_OPTIONS: { value: Period; labelAr: string; labelEn: string }[] = [
  { value: "7d", labelAr: "7 أيام", labelEn: "7 days" },
  { value: "30d", labelAr: "30 يوم", labelEn: "30 days" },
  { value: "90d", labelAr: "90 يوم", labelEn: "90 days" },
  { value: "1y", labelAr: "سنة", labelEn: "1 year" },
];

function getDateRange(period: Period): DateRange {
  const end = new Date();
  const start = new Date();
  switch (period) {
    case "7d":
      start.setDate(end.getDate() - 7);
      break;
    case "30d":
      start.setDate(end.getDate() - 30);
      break;
    case "90d":
      start.setDate(end.getDate() - 90);
      break;
    case "1y":
      start.setFullYear(end.getFullYear() - 1);
      break;
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

type AnalyticsResponse = {
  ok: boolean;
  degraded?: boolean;
  empty?: boolean;
  summary?: AnalyticsSummary & { empty?: boolean };
  error?: string;
  code?: string;
};

export function AnalyticsDashboard() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [period, setPeriod] = useState<Period>("30d");

  const dateRange = getDateRange(period);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["analytics-proposals", period, dateRange.start, dateRange.end],
    queryFn: async (): Promise<AnalyticsResponse> => {
      const params = new URLSearchParams({
        start: dateRange.start,
        end: dateRange.end,
      });
      const res = await fetch(`/api/analytics/proposals?${params}`);
      const body = (await res.json().catch(() => ({}))) as AnalyticsResponse;
      if (!res.ok) {
        const code = (body as { code?: string }).code;
        const err = new Error(body.error || "Failed to fetch analytics") as Error & {
          code?: string;
        };
        if (code) err.code = code;
        throw err;
      }
      return body;
    },
  });

  const summary = data?.summary;
  const isDegraded = data?.degraded === true;
  const isEmpty = data?.empty === true || (summary as { empty?: boolean } | undefined)?.empty === true;

  const localizedError = (() => {
    if (!error) return "";
    const code = (error as Error & { code?: string }).code;
    if (code && tr(code, locale) !== code) return tr(code, locale);
    return error instanceof Error
      ? error.message
      : ar
        ? "فشل تحميل التحليلات"
        : "Failed to load analytics";
  })();

  return (
    <div className="flex h-[calc(100dvh-10rem)] flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            {tr("analytics_dashboard_title", locale)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {tr("analytics_dashboard_subtitle", locale)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-muted-foreground" />
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {ar ? opt.labelAr : opt.labelEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <ErrorState
          className="flex flex-1 items-center justify-center"
          message={localizedError}
          onRetry={() => void refetch()}
          retryLabel={ar ? "إعادة المحاولة" : "Retry"}
        />
      ) : isDegraded ? (
        <EmptyState
          className="flex flex-1 items-center justify-center"
          icon={BarChart3}
          title={ar ? "التحليلات غير متوفرة بعد" : "Analytics not available yet"}
          description={
            ar
              ? "لم يتم تفعيل تتبع التحليلات على قاعدة البيانات الحالية. ستظهر الإحصائيات هنا بعد ترحيل الجداول."
              : "Proposal analytics tracking is not enabled on this database yet. Metrics will appear here after the tables are migrated."
          }
        />
      ) : summary ? (
        isEmpty ? (
          <EmptyState
            className="flex flex-1 items-center justify-center"
            icon={BarChart3}
            title={tr("analytics_emptyRange", locale)}
            description={tr("analytics_emptyDescription", locale)}
          />
        ) : (
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {summary.metrics.map((metric) => (
                <MetricCard key={metric.key} metric={metric} locale={locale} />
              ))}
            </div>
            <AnalyticsCharts summary={summary} locale={locale} />
          </div>
        )
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <BarChart3 className="size-12 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">{tr("analytics_emptyRange", locale)}</p>
          <p className="text-xs text-muted-foreground">{tr("analytics_emptyDescription", locale)}</p>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  metric,
  locale,
}: {
  metric: AnalyticsMetric;
  locale: string;
}) {
  const trendIcon =
    metric.trend === "up" ? TrendingUp : metric.trend === "down" ? TrendingDown : Minus;
  const TrendIcon = trendIcon;

  const trendColor =
    metric.trend === "up"
      ? "text-emerald-600"
      : metric.trend === "down"
        ? "text-red-500"
        : "text-muted-foreground";

  const changePercent =
    metric.previousValue !== undefined && metric.previousValue > 0
      ? Math.round(((metric.value - metric.previousValue) / metric.previousValue) * 100)
      : null;

  const iconMap: Record<string, typeof FileText> = {
    proposals_created: FileText,
    proposals_exported: Download,
    templates_used: Layers,
    proposal_views: Users,
    active_users: Users,
    avg_completion_time: Clock,
    agent_runs_completed: CheckCircle,
    agent_runs_failed: XCircle,
    agent_median_duration: Timer,
  };
  const Icon = iconMap[metric.key] ?? BarChart3;

  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-4 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="size-4 text-primary" />
        </div>
        {changePercent !== null && (
          <div className={cn("flex items-center gap-0.5 text-xs font-medium", trendColor)}>
            <TrendIcon className="size-3" />
            {changePercent > 0 ? "+" : ""}
            {changePercent}%
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold tabular-nums">
          {metric.value.toLocaleString()}
          {metric.unit && (
            <span className="ms-1 text-sm font-normal text-muted-foreground">{metric.unit}</span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {metric.label[locale as "ar" | "en"] ?? metric.key}
        </p>
      </div>
    </div>
  );
}
