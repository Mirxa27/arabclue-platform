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
import { cn } from "@/lib/utils";

interface Stats {
  kpis: {
    activeProjects: number;
    proposalsGenerated: number;
    avgCompliance: number;
    documentsProcessed: number;
  };
}

export function StatCards() {
  const { locale } = useLocale();
  const { data, isLoading } = useQuery<Stats>({
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
    trend: number;
    color: string;
    bg: string;
  }[] = [
    {
      key: "stat_active_projects",
      value: k?.activeProjects ?? 0,
      icon: FolderKanban,
      trend: 12,
      color: "text-chart-1",
      bg: "bg-chart-1/10",
    },
    {
      key: "stat_proposals_generated",
      value: k?.proposalsGenerated ?? 0,
      icon: FileCheck2,
      trend: 8,
      color: "text-chart-3",
      bg: "bg-chart-3/10",
    },
    {
      key: "stat_compliance_score",
      value: k?.avgCompliance ?? 0,
      suffix: "%",
      icon: ShieldCheck,
      trend: 5,
      color: "text-emerald-600",
      bg: "bg-emerald-500/10",
    },
    {
      key: "stat_documents_processed",
      value: k?.documentsProcessed ?? 0,
      icon: FileText,
      trend: -3,
      color: "text-chart-4",
      bg: "bg-chart-4/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
      {cards.map((c) => {
        const Icon = c.icon;
        const up = c.trend >= 0;
        return (
          <Card
            key={c.key}
            className="relative overflow-hidden p-4 lg:p-5 border-border/60 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={cn("size-10 rounded-lg flex items-center justify-center", c.bg)}>
                <Icon className={cn("size-5", c.color)} />
              </div>
              <span
                className={cn(
                  "flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded",
                  up ? "text-emerald-600 bg-emerald-500/10" : "text-destructive bg-destructive/10"
                )}
              >
                {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                {Math.abs(c.trend)}%
              </span>
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
            {/* decorative bar */}
            <div
              className={cn(
                "absolute bottom-0 inset-x-0 h-0.5 opacity-60 group-hover:opacity-100 transition-opacity",
                c.color.replace("text-", "bg-")
              )}
            />
          </Card>
        );
      })}
    </div>
  );
}
