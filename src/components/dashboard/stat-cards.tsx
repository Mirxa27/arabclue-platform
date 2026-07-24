"use client";

import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import {
  FolderKanban,
  FileCheck2,
  ShieldCheck,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { resolveTrend } from "@/lib/stats-trends";
import type { StatsResponse } from "@/lib/api-types";

export function StatCards() {
  const { locale } = useLocale();
  const { data, isLoading } = useQuery<StatsResponse>({
    queryKey: ["stats"],
    queryFn: async () => {
      const res = await fetch("/api/stats");
      return res.json();
    },
    refetchInterval: 8000,
  });

  const k = data?.kpis;

  const cards: {
    key: string;
    value: number | string;
    suffix?: string;
    icon: LucideIcon;
    trend: number | null;
    color: string;
    bg: string;
    bar: string;
  }[] = [
    {
      key: "stat_active_projects",
      value: k?.activeProjects ?? 0,
      icon: FolderKanban,
      trend: resolveTrend(data?.trends?.projects),
      color: "text-chart-1",
      bg: "bg-chart-1/10",
      bar: "bg-chart-1",
    },
    {
      key: "stat_proposals_generated",
      value: k?.proposalsGenerated ?? 0,
      icon: FileCheck2,
      trend: resolveTrend(data?.trends?.proposals),
      color: "text-chart-3",
      bg: "bg-chart-3/10",
      bar: "bg-chart-3",
    },
    {
      key: "stat_compliance_score",
      value: k?.avgCompliance ?? 0,
      suffix: "%",
      icon: ShieldCheck,
      trend: resolveTrend(data?.trends?.compliance),
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
      bar: "bg-emerald-500",
    },
    {
      key: "stat_documents_processed",
      value: k?.documentsProcessed ?? 0,
      icon: FileText,
      trend: resolveTrend(data?.trends?.documents),
      color: "text-chart-4",
      bg: "bg-chart-4/10",
      bar: "bg-chart-4",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
      {cards.map((c) => {
        const Icon = c.icon;
        const up = c.trend !== null && c.trend >= 0;
        return (
          <Card
            key={c.key}
            className="relative overflow-hidden p-4 lg:p-5 border-border/60 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={cn("size-10 rounded-lg flex items-center justify-center", c.bg)}>
                <Icon className={cn("size-5", c.color)} />
              </div>
              {c.trend !== null && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded cursor-help",
                        up ? "text-emerald-600 bg-emerald-500/10" : "text-destructive bg-destructive/10"
                      )}
                    >
                      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                      {Math.abs(c.trend)}%
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px]">
                    {tr("stat_trend_tooltip", locale)}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <div className="text-2xl lg:text-3xl font-bold tracking-tight tabular-nums">
              {isLoading ? (
                <span className="inline-block h-8 w-16 rounded shimmer align-bottom" />
              ) : (
                <>
                  {c.value}
                  {c.suffix}
                </>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1 truncate">
              {tr(c.key, locale)}
            </div>
            {c.trend !== null && (
              <div className="text-[10px] text-muted-foreground/80 mt-0.5 truncate">
                {tr("stat_trend_vs_prior_7d", locale)}
              </div>
            )}
            {/* decorative bar — explicit mapping to survive purge */}
            <div
              className={cn(
                "absolute bottom-0 inset-x-0 h-0.5 opacity-60 group-hover:opacity-100 transition-opacity",
                c.bar
              )}
            />
          </Card>
        );
      })}
    </div>
  );
}
