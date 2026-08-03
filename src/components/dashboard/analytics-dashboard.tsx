"use client";

import { startTransition, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useUI } from "@/lib/store";
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
import type { Locale } from "@/lib/types";
import { Button } from "@/components/ui/button";

type Period = "7d" | "30d" | "90d" | "1y";

const PERIOD_OPTIONS: { value: Period; labelKey: "analytics_period_7_days" | "analytics_period_30_days" | "analytics_period_90_days" | "analytics_period_1_year" }[] = [
  { value: "7d", labelKey: "analytics_period_7_days" },
  { value: "30d", labelKey: "analytics_period_30_days" },
  { value: "90d", labelKey: "analytics_period_90_days" },
  { value: "1y", labelKey: "analytics_period_1_year" },
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
  empty?: boolean;
  summary?: AnalyticsSummary & { empty?: boolean };
  error?: string;
  code?: string;
};

export function AnalyticsDashboard() {
  const { locale } = useLocale();
  const { setView } = useUI();
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
  const isEmpty = data?.empty === true || (summary as { empty?: boolean } | undefined)?.empty === true;

  const localizedError = (() => {
    if (!error) return "";
    const code = (error as Error & { code?: string }).code;
    if (code && tr(code, locale as Locale) !== code) return tr(code, locale as Locale);
    return error instanceof Error
      ? error.message
      : tr("analytics_load_failed", locale as Locale);
  })();

  return (
    <div className="flex h-[calc(100dvh-10rem)] flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            {tr("analytics_dashboard_title", locale as Locale)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {tr("analytics_dashboard_subtitle", locale as Locale)}
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
                  {tr(opt.labelKey, locale as Locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <span className="sr-only">{tr("analytics_loading", locale as Locale)}</span>
        </div>
      ) : isError ? (
        <ErrorState
          className="flex flex-1 items-center justify-center"
          message={localizedError}
          onRetry={() => void refetch()}
          retryLabel={tr("action_retry", locale as Locale)}
        />
      ) : summary ? (
        isEmpty ? (
          <EmptyState
            className="flex flex-1 items-center justify-center"
            icon={BarChart3}
            title={tr("analytics_emptyRange", locale as Locale)}
            description={tr("analytics_emptyDescription", locale as Locale)}
            action={
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => startTransition(() => setView("proposals"))}
                >
                  {tr("nav_proposals", locale as Locale)}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startTransition(() => setView("marketplace"))}
                >
                  {tr("nav_marketplace", locale as Locale)}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startTransition(() => setView("agents"))}
                >
                  {tr("nav_agents", locale as Locale)}
                </Button>
              </div>
            }
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
          <p className="text-sm text-muted-foreground">{tr("analytics_emptyRange", locale as Locale)}</p>
          <p className="text-xs text-muted-foreground">{tr("analytics_emptyDescription", locale as Locale)}</p>
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
  const loc = locale as Locale;
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
    metric.previousValue !== undefined &&
    metric.previousValue !== null &&
    metric.previousValue > 0 &&
    metric.value !== null
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
    agent_runs_cancelled: XCircle,
    agent_median_duration: Timer,
    documents_uploaded: FileText,
    document_versions_created: FileText,
  };
  const Icon = iconMap[metric.key] ?? BarChart3;

  const isUnavailable = metric.available === false || metric.value === null;
  const displayValue = isUnavailable
    ? tr("analytics_median_unavailable", loc)
    : metric.value!.toLocaleString(loc === "ar" ? "ar-SA" : "en-US");

  const differenceLabel =
    metric.difference !== undefined && metric.difference !== null
      ? metric.difference > 0
        ? `${tr("analytics_difference_increase", loc)} (${metric.difference > 0 ? "+" : ""}${metric.difference.toLocaleString(loc === "ar" ? "ar-SA" : "en-US")})`
        : metric.difference < 0
          ? `${tr("analytics_difference_decrease", loc)} (${metric.difference.toLocaleString(loc === "ar" ? "ar-SA" : "en-US")})`
          : tr("analytics_difference_unchanged", loc)
      : null;

  const unitKey =
    metric.unit === "ms" || metric.unit === "milliseconds"
      ? ("analytics_unit_milliseconds" as const)
      : ("analytics_unit_count" as const);

  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-4 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="size-4 text-primary" />
        </div>
        {changePercent !== null && !isUnavailable && (
          <div className={cn("flex items-center gap-0.5 text-xs font-medium", trendColor)}>
            <TrendIcon className="size-3" />
            {changePercent > 0 ? "+" : ""}
            {changePercent}%
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold tabular-nums">
          {displayValue}
          {metric.unit && !isUnavailable && (
            <span className="ms-1 text-sm font-normal text-muted-foreground">
              {tr(unitKey, loc)}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {metric.label[loc] ?? metric.key}
        </p>
        {differenceLabel && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {differenceLabel}
          </p>
        )}
      </div>
    </div>
  );
}
