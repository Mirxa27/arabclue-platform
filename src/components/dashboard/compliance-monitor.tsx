"use client";

import { useLocale, useUI } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  FileWarning,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { COMPLIANCE_FRAMEWORKS } from "@/lib/constants";

const FW_ICONS: Record<string, string> = {
  NCA_ECC1: "🛡️",
  NCA_CCC1: "☁️",
  PDPL: "🔒",
  EA_TP1: "🏗️",
  EA_SP1: "🔐",
  EA_SP2: "🚫",
  LOCAL_CONTENT: "🇸🇦",
};

const FW_COLORS: Record<string, string> = {
  NCA_ECC1: "text-chart-1",
  NCA_CCC1: "text-chart-2",
  PDPL: "text-chart-5",
  EA_TP1: "text-chart-4",
  EA_SP1: "text-emerald-600",
  EA_SP2: "text-rose-600",
  LOCAL_CONTENT: "text-amber-600",
};

export function ComplianceMonitor() {
  const { locale } = useLocale();
  const { activeProjectId } = useUI();

  const { data, isLoading } = useQuery({
    queryKey: ["compliance", activeProjectId],
    queryFn: async () => {
      const url = activeProjectId
        ? `/api/compliance?projectId=${activeProjectId}`
        : "/api/compliance";
      const res = await fetch(url);
      return res.json();
    },
    refetchInterval: 4000,
  });

  const summary = data?.summary;
  const grouped = data?.grouped ?? {};
  const total = summary?.total ?? 0;
  const compliant = summary?.compliant ?? 0;
  const pct = total > 0 ? Math.round((compliant / total) * 100) : 0;

  return (
    <Card className="p-0 overflow-hidden border-border/60">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <ShieldCheck className="size-4 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{tr("section_compliance", locale)}</h3>
            <p className="text-[11px] text-muted-foreground">
              {locale === "ar" ? "تقدم الامتثال في الوقت الفعلي" : "Real-time compliance progress"}
            </p>
          </div>
        </div>
        <div className="text-end">
          <div className={cn("text-2xl font-bold tabular-nums", pct === 100 ? "text-emerald-600" : "text-chart-1")}>
            {isLoading ? "—" : `${pct}%`}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {locale === "ar" ? "مستوى C1" : "Level C1"}
          </div>
        </div>
      </div>

      {/* Overall progress */}
      <div className="px-5 py-3">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-muted-foreground">
            {locale === "ar" ? "إجمالي الضوابط المُتحقَّق منها" : "Total controls verified"}
          </span>
          <span className="font-mono font-semibold tabular-nums">
            {compliant} / {total}
          </span>
        </div>
        <Progress value={pct} className="h-2" />
        <div className="grid grid-cols-4 gap-2 mt-3 text-center">
          <Stat label={tr("status_COMPLIANT", locale)} value={compliant} color="text-emerald-600" bg="bg-emerald-500/10" />
          <Stat label={tr("status_PARTIAL", locale)} value={summary?.partial ?? 0} color="text-chart-4" bg="bg-chart-4/10" />
          <Stat label={tr("status_PENDING", locale)} value={summary?.pending ?? 0} color="text-muted-foreground" bg="bg-muted" />
          <Stat label={tr("status_NON_COMPLIANT", locale)} value={summary?.nonCompliant ?? 0} color="text-destructive" bg="bg-destructive/10" />
        </div>
      </div>

      {/* Framework breakdown */}
      <div className="px-5 pb-4 space-y-2 max-h-[22rem] overflow-y-auto scrollbar-thin">
        {COMPLIANCE_FRAMEWORKS.map((fw) => {
          const checks = grouped[fw.id] ?? [];
          const fwCompliant = checks.filter((c: any) => c.status === "COMPLIANT").length;
          const fwTotal = checks.length;
          const fwPct = fwTotal > 0 ? Math.round((fwCompliant / fwTotal) * 100) : 0;
          const color = FW_COLORS[fw.id];
          return (
            <div
              key={fw.id}
              className="rounded-lg border border-border/60 p-3 bg-background/50"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base shrink-0">{FW_ICONS[fw.id]}</span>
                  <div className="min-w-0">
                    <div className={cn("text-xs font-semibold truncate", color)}>
                      {locale === "ar" ? fw.nameAr : fw.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {fw.id} · {fwCompliant}/{fwTotal}
                    </div>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-mono shrink-0",
                    fwPct === 100
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                      : fwPct > 0
                      ? "bg-chart-4/10 text-chart-4 border-chart-4/20"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {fwPct}%
                </Badge>
              </div>
              {checks.length > 0 && (
                <div className="space-y-1">
                  {checks.slice(0, 4).map((c: any) => (
                    <div key={c.id} className="flex items-center gap-2 text-[11px]">
                      <StatusDot status={c.status} />
                      <span className="font-mono text-muted-foreground shrink-0">{c.controlId}</span>
                      <span className="truncate flex-1">
                        {locale === "ar" ? c.titleAr : c.title}
                      </span>
                      <Badge variant="ghost" className="text-[9px] font-mono px-1 h-4 shrink-0">
                        {c.complianceLevel}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Stat({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={cn("rounded-md py-1.5 px-1", bg)}>
      <div className={cn("text-base font-bold tabular-nums", color)}>{value}</div>
      <div className="text-[9px] text-muted-foreground truncate">{label}</div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  if (status === "COMPLIANT")
    return <CheckCircle2 className="size-3 text-emerald-600 shrink-0" />;
  if (status === "PARTIAL")
    return <FileWarning className="size-3 text-chart-4 shrink-0" />;
  if (status === "NON_COMPLIANT")
    return <XCircle className="size-3 text-destructive shrink-0" />;
  if (status === "NOT_APPLICABLE")
    return <ShieldAlert className="size-3 text-muted-foreground shrink-0" />;
  return <Clock className="size-3 text-muted-foreground shrink-0" />;
}
