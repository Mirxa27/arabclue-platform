"use client";

import { useLocale, useUI } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import {
  FolderKanban,
  Loader2,
  Plus,
  CircleDot,
  FileText,
  FileCheck2,
  Bot,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground border-border",
  PARSING: "bg-chart-4/10 text-chart-4 border-chart-4/20",
  DRAFTING: "bg-chart-5/10 text-chart-5 border-chart-5/20",
  REVIEW: "bg-chart-2/10 text-chart-2 border-chart-2/20",
  SUBMITTED: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  ARCHIVED: "bg-muted text-muted-foreground border-border",
};

export function ProjectsList() {
  const { locale } = useLocale();
  const { setView, setActiveProjectId } = useUI();

  const { data, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      return res.json();
    },
    refetchInterval: 6000,
  });

  const projects = data?.projects ?? [];

  return (
    <Card className="p-0 overflow-hidden border-border/60">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-chart-1/10 flex items-center justify-center">
            <FolderKanban className="size-4 text-chart-1" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{tr("nav_projects", locale)}</h3>
            <p className="text-[11px] text-muted-foreground">
              {locale === "ar" ? "مشاريع المناقصات النشطة" : "Active tender projects"}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 text-[11px]">
          <Plus className="size-3" />
          {tr("nav_projects", locale)}
        </Button>
      </div>

      <div className="max-h-96 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            {tr("loading", locale)}
          </div>
        ) : projects.length === 0 ? (
          <div className="p-8 text-center">
            <FolderKanban className="size-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">{tr("no_data", locale)}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {projects.map((p: any) => (
              <button
                key={p.id}
                onClick={() => {
                  setActiveProjectId(p.id);
                  setView("overview");
                }}
                className="w-full p-4 hover:bg-muted/40 transition-colors text-start group"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold truncate">{p.title}</span>
                      <Badge variant="outline" className={cn("text-[9px] font-mono shrink-0", STATUS_COLORS[p.status])}>
                        {tr(`status_${p.status}`, locale)}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {p.etimadRef} · {p.category ?? "IT"}
                    </div>
                  </div>
                  <ChevronRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 rtl:rotate-180" />
                </div>

                {/* Quick stats row */}
                <div className="grid grid-cols-4 gap-2 mb-2">
                  <MiniStat icon={FileText} value={p._count?.documents ?? 0} label={locale === "ar" ? "مستندات" : "docs"} color="text-chart-1" />
                  <MiniStat icon={Bot} value={p._count?.agentRuns ?? 0} label={locale === "ar" ? "تشغيل" : "runs"} color="text-chart-5" />
                  <MiniStat icon={ShieldCheck} value={p._count?.complianceChecks ?? 0} label={locale === "ar" ? "ضوابط" : "ctrl"} color="text-emerald-600" />
                  <MiniStat icon={FileCheck2} value={p._count?.proposals ?? 0} label={locale === "ar" ? "عطاءات" : "props"} color="text-chart-3" />
                </div>

                {/* Compliance progress */}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-[10px] mb-0.5">
                      <span className="text-muted-foreground">{locale === "ar" ? "الامتثال" : "Compliance"}</span>
                      <span className="font-mono font-semibold">{p.complianceScore}%</span>
                    </div>
                    <Progress value={p.complianceScore} className="h-1" />
                  </div>
                  {p.latestAgentRun && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                      <CircleDot className={cn("size-2", p.latestAgentRun.status === "RUNNING" ? "text-chart-4 animate-pulse" : "text-emerald-500")} />
                      <span className="font-mono">{p.latestAgentRun.overallProgress}%</span>
                    </div>
                  )}
                </div>

                {p.budget && (
                  <div className="mt-2 text-[10px] text-muted-foreground">
                    <span className="font-mono font-semibold text-foreground">
                      {p.currency} {Number(p.budget).toLocaleString()}
                    </span>
                    {p.submissionDeadline && (
                      <span className="ms-2">
                        · {locale === "ar" ? "آخر تقديم" : "Due"}:{" "}
                        {new Date(p.submissionDeadline).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US")}
                      </span>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function MiniStat({ icon: Icon, value, label, color }: { icon: typeof FileText; value: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5 p-1 rounded-md bg-muted/30">
      <Icon className={cn("size-3", color)} />
      <div className="min-w-0">
        <div className="text-[11px] font-bold tabular-nums leading-none">{value}</div>
        <div className="text-[8px] text-muted-foreground leading-none mt-0.5">{label}</div>
      </div>
    </div>
  );
}
