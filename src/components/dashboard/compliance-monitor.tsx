"use client";

import { useLocale, useUI } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Clock,
  XCircle,
  FileWarning,
  Cloud,
  Lock,
  Building2,
  KeyRound,
  Ban,
  Landmark,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { COMPLIANCE_FRAMEWORKS } from "@/lib/constants";
import { ListSkeleton } from "./loading-skeletons";
import { EmptyState, ErrorState } from "@/components/patterns";
import type { ApiComplianceCheck } from "@/lib/api-types";
import { ArrowRight, Upload } from "lucide-react";
const FW_ICONS: Record<string, LucideIcon> = {
  NCA_ECC1: ShieldCheck,
  NCA_CCC1: Cloud,
  PDPL: Lock,
  EA_TP1: Building2,
  EA_SP1: KeyRound,
  EA_SP2: Ban,
  LOCAL_CONTENT: Landmark,
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

type ComplianceSummary = {
  total: number;
  compliant: number;
  partial: number;
  pending: number;
  nonCompliant: number;
  na?: number;
};

type ComplianceResponse = {
  summary?: ComplianceSummary;
  grouped?: Record<string, ApiComplianceCheck[]>;
};

export function ComplianceMonitor() {
  const { locale } = useLocale();
  const { activeProjectId, setView } = useUI();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["compliance", activeProjectId],
    queryFn: async () => {
      const url = activeProjectId
        ? `/api/compliance?projectId=${activeProjectId}`
        : "/api/compliance";
      const res = await fetch(url);
      if (!res.ok) throw new Error("compliance failed");
      return res.json() as Promise<ComplianceResponse>;
    },
    refetchInterval: 4000,
  });

  const summary = data?.summary;
  const grouped = data?.grouped ?? {};
  const total = summary?.total ?? 0;
  const compliant = summary?.compliant ?? 0;
  const pct = total > 0 ? Math.round((compliant / total) * 100) : 0;
  const openActions = Object.values(grouped)
    .flat()
    .filter(
      (c) =>
        c.status === "NON_COMPLIANT" ||
        c.status === "PARTIAL" ||
        c.status === "PENDING"
    )
    .slice(0, 6);
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
            {locale === "ar" ? "نسبة الامتثال" : "Compliance score"}
          </div>
        </div>
      </div>

      {/* Overall progress */}
      <div className="px-5 py-3">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-foreground/70 font-medium">
            {locale === "ar" ? "الضوابط المطابقة" : "Controls compliant"}
          </span>
          <span className="font-mono font-semibold tabular-nums">
            {compliant} / {total}
          </span>
        </div>
        <Progress value={pct} className="h-2.5" />
        {/* Stacked status bar for at-a-glance mix */}
        {total > 0 ? (
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="bg-emerald-500 transition-all"
              style={{ width: `${(compliant / total) * 100}%` }}
              title={`${compliant} compliant`}
            />
            <div
              className="bg-amber-400 transition-all"
              style={{
                width: `${((summary?.partial ?? 0) / total) * 100}%`,
              }}
              title={`${summary?.partial ?? 0} partial`}
            />
            <div
              className="bg-slate-400/80 transition-all"
              style={{
                width: `${((summary?.pending ?? 0) / total) * 100}%`,
              }}
              title={`${summary?.pending ?? 0} pending`}
            />
            <div
              className="bg-destructive transition-all"
              style={{
                width: `${((summary?.nonCompliant ?? 0) / total) * 100}%`,
              }}
              title={`${summary?.nonCompliant ?? 0} non-compliant`}
            />
          </div>
        ) : null}
        <div className="grid grid-cols-4 gap-2 mt-3 text-center">
          <Stat label={tr("status_COMPLIANT", locale)} value={compliant} color="text-emerald-600" bg="bg-emerald-500/10" />
          <Stat label={tr("status_PARTIAL", locale)} value={summary?.partial ?? 0} color="text-amber-600" bg="bg-amber-500/10" />
          <Stat label={tr("status_PENDING", locale)} value={summary?.pending ?? 0} color="text-slate-600 dark:text-slate-300" bg="bg-slate-500/10" />
          <Stat label={tr("status_NON_COMPLIANT", locale)} value={summary?.nonCompliant ?? 0} color="text-destructive" bg="bg-destructive/10" />
        </div>
      </div>

      {/* Remediation next actions */}
      {!isLoading && !isError && openActions.length > 0 ? (
        <div className="px-5 pb-3 space-y-2 border-b border-border/40">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold">
              {locale === "ar" ? "إجراءات التصحيح" : "Remediation actions"}
            </h4>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] gap-1"
              onClick={() => setView("account")}
            >
              <Upload className="size-3" />
              {locale === "ar" ? "رفع أدلة الحساب" : "Upload account evidence"}
            </Button>
          </div>
          <ul className="space-y-1.5">
            {openActions.map((c) => (
              <li
                key={c.id}
                className="flex items-start gap-2 rounded-md border border-border/50 bg-background/60 px-2.5 py-2 text-[11px]"
              >
                <StatusDot status={c.status} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{c.title}</div>
                  <div className="text-muted-foreground font-mono text-[10px]">
                    {c.controlId} · {c.status}
                  </div>
                  <p className="text-muted-foreground mt-0.5">
                    {locale === "ar"
                      ? "اربط شهادة أو سياسة أو إثبات محتوى محلي من إعداد الحساب، ثم أعد تشغيل وكيل الامتثال."
                      : "Attach a certificate, policy, or local-content proof from Account, then re-run the compliance agent."}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 text-[11px] gap-1"
                  onClick={() => setView("agents")}
                >
                  {locale === "ar" ? "وكلاء" : "Agents"}
                  <ArrowRight className="size-3" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Framework breakdown */}
      <div className="px-5 pb-4 space-y-2 max-h-[22rem] overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <ListSkeleton rows={3} className="px-0" />
        ) : isError ? (
          <ErrorState
            message={
              locale === "ar"
                ? "تعذر تحميل الامتثال"
                : "Failed to load compliance"
            }
            onRetry={() => refetch()}
            retryLabel={locale === "ar" ? "إعادة المحاولة" : "Retry"}
          />
        ) : total === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={
              locale === "ar"
                ? "لا ضوابط بعد لهذا المشروع"
                : "No controls for this project yet"
            }
            description={
              locale === "ar"
                ? "اختر مشروعاً وشغّل وكيل الامتثال لبناء مصفوفة الضوابط."
                : "Select a project and run the compliance agent to build the control matrix."
            }
            action={
              <Button size="sm" onClick={() => setView("agents")}>
                {locale === "ar" ? "تشغيل الوكلاء" : "Run agents"}
              </Button>
            }
            className="py-6"
          />
        ) : (
          COMPLIANCE_FRAMEWORKS.map((fw) => {
            const checks = grouped[fw.id] ?? [];
            const fwCompliant = checks.filter(
              (c) => c.status === "COMPLIANT"
            ).length;
            const fwTotal = checks.length;
            const fwPct =
              fwTotal > 0 ? Math.round((fwCompliant / fwTotal) * 100) : 0;
            const color = FW_COLORS[fw.id];
            return (
              <div
                key={fw.id}
                className="rounded-xl border border-border/50 p-3 bg-background/50 hover:border-border transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {(() => {
                      const Icon = FW_ICONS[fw.id] ?? ShieldCheck;
                      return (
                        <span
                          className={cn(
                            "size-7 rounded-md flex items-center justify-center shrink-0 bg-muted/60",
                            color
                          )}
                        >
                          <Icon className="size-3.5" />
                        </span>
                      );
                    })()}
                    <div className="min-w-0">
                      <div className={cn("text-xs font-semibold truncate", color)}>
                        {locale === "ar" ? fw.nameAr : fw.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        <span className="font-mono">{fw.id}</span>
                        {" · "}
                        {fwTotal === 0
                          ? locale === "ar"
                            ? "لا ضوابط بعد"
                            : "No controls yet"
                          : locale === "ar"
                            ? `${fwCompliant} من ${fwTotal} مطابق`
                            : `${fwCompliant} of ${fwTotal} compliant`}
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-mono shrink-0 tabular-nums",
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
                    {/* Deduplicate by controlId — seed races can create repeats */}
                    {Array.from(
                      new Map(checks.map((c) => [c.controlId, c])).values()
                    )
                      .slice(0, 5)
                      .map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-2 text-[11px]"
                      >
                        <StatusDot status={c.status} />
                        <span className="font-mono text-muted-foreground shrink-0">
                          {c.controlId}
                        </span>
                        <span className="truncate flex-1">{c.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
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
