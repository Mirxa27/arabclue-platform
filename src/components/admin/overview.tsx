"use client";

import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Building2,
  FolderKanban,
  FileCheck2,
  Cpu,
  CreditCard,
  ScrollText,
  Bot,
  TrendingUp,
  Activity,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AdminOverviewResponse, RoleCount, ActionCount } from "@/lib/api-types";

export function AdminOverview() {
  const { locale } = useLocale();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: async () => {
      const res = await fetch("/api/admin/overview");
      if (!res.ok) throw new Error("overview failed");
      return res.json() as Promise<AdminOverviewResponse>;
    },
    refetchInterval: 15000,
  });

  // Real readiness, rather than a hardcoded assurance banner. `/api/ready`
  // reports per-facet state (database, schema migrations, rate limiting,
  // storage, cron, email) and is the same source the deployment probe uses.
  const { data: readiness } = useQuery({
    queryKey: ["platform-readiness"],
    queryFn: async () => {
      const res = await fetch("/api/ready");
      // A failing readiness probe still returns a JSON body describing why.
      return (await res.json()) as {
        ready: boolean;
        checks?: Record<string, { ok: boolean; detail?: string }>;
      };
    },
    refetchInterval: 60_000,
  });

  const k = data?.kpis;
  const charts = data?.charts;
  const usersByRole: RoleCount[] = charts?.usersByRole ?? [];
  const auditByAction: ActionCount[] = charts?.auditByAction ?? [];

  if (isError) {
    return (
      <Card className="p-8 text-center text-xs text-destructive border-border/50">
        {locale === "ar" ? "تعذر تحميل لوحة الإدارة" : "Failed to load admin overview"}
      </Card>
    );
  }

  const kpis = [
    { label: tr("admin_users", locale), value: k?.totalUsers ?? 0, sub: `${k?.activeUsers ?? 0} active`, icon: Users, color: "text-chart-1", bg: "bg-chart-1/10" },
    { label: "Workspaces", value: k?.totalWorkspaces ?? 0, sub: locale === "ar" ? "مساحات عمل" : "tenants", icon: Building2, color: "text-chart-2", bg: "bg-chart-2/10" },
    { label: tr("nav_projects", locale), value: k?.totalProjects ?? 0, sub: locale === "ar" ? "مشاريع مناقصات" : "tender projects", icon: FolderKanban, color: "text-chart-3", bg: "bg-chart-3/10" },
    { label: tr("nav_proposals", locale), value: k?.totalProposals ?? 0, sub: locale === "ar" ? "عطاءات منشأة" : "generated", icon: FileCheck2, color: "text-chart-4", bg: "bg-chart-4/10" },
    { label: tr("nav_admin_ai", locale), value: k?.activeProviders ?? 0, sub: locale === "ar" ? "مزود نشط" : "active", icon: Cpu, color: "text-chart-5", bg: "bg-chart-5/10" },
    { label: tr("admin_usage", locale), value: k?.totalAgentRuns ?? 0, sub: locale === "ar" ? "تشغيل وكلاء" : "agent runs", icon: Bot, color: "text-emerald-600", bg: "bg-emerald-500/10" },
    { label: tr("admin_revenue", locale), value: k?.activeSubscriptions ?? 0, sub: locale === "ar" ? "اشتراك نشط" : "active subs", icon: CreditCard, color: "text-amber-600", bg: "bg-amber-500/10" },
    { label: tr("admin_audit", locale), value: k?.totalAuditLogs ?? 0, sub: `${k?.recentAudit24h ?? 0} / 24h`, icon: ScrollText, color: "text-rose-600", bg: "bg-rose-500/10" },
  ];

  return (
    <div className="space-y-4">
      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="relative overflow-hidden p-4 border-border/60 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-2">
                <div className={cn("size-9 rounded-lg flex items-center justify-center", kpi.bg)}>
                  <Icon className={cn("size-4", kpi.color)} />
                </div>
                <Activity className="size-3 text-muted-foreground/40" />
              </div>
              <div className="text-2xl font-bold tabular-nums">
                {isLoading ? <span className="inline-block h-7 w-12 rounded shimmer align-bottom" /> : kpi.value}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{kpi.label}</div>
              <div className="text-[9px] text-muted-foreground/70 mt-0.5">{kpi.sub}</div>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Users by role */}
        <Card className="p-0 overflow-hidden border-border/60">
          <div className="px-5 py-3.5 border-b border-border/60 bg-muted/30 flex items-center gap-2">
            <div className="size-7 rounded-lg bg-chart-1/10 flex items-center justify-center">
              <Users className="size-3.5 text-chart-1" />
            </div>
            <span className="text-xs font-semibold">{tr("admin_roles", locale)}</span>
          </div>
          <div className="p-4 space-y-2">
            {usersByRole.map((u) => {
              const total = usersByRole.reduce((s, r) => s + r.count, 0) || 1;
              const pct = Math.round((u.count / total) * 100);
              const colors: Record<string, string> = {
                SUPER_ADMIN: "bg-rose-500",
                ADMIN: "bg-amber-500",
                BIDDER: "bg-chart-1",
                REVIEWER: "bg-violet-500",
                FINANCE: "bg-emerald-500",
              };
              return (
                <div key={u.role}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="flex items-center gap-1.5">
                      <span className={cn("size-2 rounded-full", colors[u.role] ?? "bg-muted-foreground")} />
                      {tr(`admin_role_${u.role}`, locale)}
                    </span>
                    <span className="font-mono font-semibold">{u.count} · {pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", colors[u.role] ?? "bg-muted-foreground")} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {!isLoading && usersByRole.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">{tr("no_data", locale)}</p>
            )}
          </div>
        </Card>

        {/* Audit by action */}
        <Card className="p-0 overflow-hidden border-border/60">
          <div className="px-5 py-3.5 border-b border-border/60 bg-muted/30 flex items-center gap-2">
            <div className="size-7 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <ScrollText className="size-3.5 text-rose-600" />
            </div>
            <span className="text-xs font-semibold">{tr("admin_audit", locale)} — {locale === "ar" ? "بالإجراء" : "by Action"}</span>
          </div>
          <div className="p-4 space-y-2">
            {auditByAction.map((a) => {
              const max = Math.max(...auditByAction.map((x) => x.count), 1);
              const pct = Math.round((a.count / max) * 100);
              return (
                <div key={a.action}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-mono">{a.action}</span>
                    <span className="font-mono font-semibold tabular-nums">{a.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-chart-1 to-chart-2 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {!isLoading && auditByAction.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">{tr("no_data", locale)}</p>
            )}
          </div>
        </Card>
      </div>

      {/* Platform readiness — measured via /api/ready, not asserted.
          This card previously rendered a fixed green security-and-regulatory
          assurance banner with no data behind it. A compliance claim the
          product has not computed is worse than no claim at all. */}
      <PlatformReadinessCard locale={locale} readiness={readiness} />
    </div>
  );
}

/** Human labels for the facets `/api/ready` reports. */
const READINESS_LABELS: Record<string, { ar: string; en: string }> = {
  database: { ar: "قاعدة البيانات", en: "Database" },
  schema: { ar: "ترحيلات المخطط", en: "Schema migrations" },
  migrations: { ar: "ترحيلات المخطط", en: "Schema migrations" },
  rateLimit: { ar: "تحديد المعدل", en: "Rate limiting" },
  storage: { ar: "التخزين", en: "Storage" },
  cron: { ar: "المهام المجدولة", en: "Scheduled jobs" },
  email: { ar: "البريد", en: "Email" },
};

function PlatformReadinessCard({
  locale,
  readiness,
}: {
  locale: string;
  readiness?: {
    ready: boolean;
    checks?: Record<string, { ok: boolean; detail?: string }>;
  };
}) {
  const ar = locale === "ar";

  if (!readiness) {
    return (
      <Card className="p-4 border-border/50">
        <div className="text-xs text-muted-foreground">
          {ar ? "جارٍ فحص جاهزية المنصة…" : "Checking platform readiness…"}
        </div>
      </Card>
    );
  }

  const entries = Object.entries(readiness.checks ?? {});
  const failing = entries.filter(([, check]) => !check.ok);
  const ok = readiness.ready && failing.length === 0;

  return (
    <Card
      className={cn(
        "p-4",
        ok
          ? "border-emerald-500/20 bg-emerald-500/5"
          : "border-amber-500/30 bg-amber-500/5"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "size-10 rounded-lg flex items-center justify-center shrink-0",
            ok ? "bg-emerald-500/15" : "bg-amber-500/15"
          )}
        >
          {ok ? (
            <ShieldCheck className="size-5 text-emerald-600" />
          ) : (
            <Activity className="size-5 text-amber-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              "text-sm font-semibold",
              ok
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-amber-700 dark:text-amber-400"
            )}
          >
            {ok
              ? ar
                ? "جميع فحوصات الجاهزية ناجحة"
                : "All readiness checks passing"
              : ar
                ? `${failing.length} من فحوصات الجاهزية تحتاج انتباهًا`
                : `${failing.length} readiness check${failing.length === 1 ? "" : "s"} need attention`}
          </div>
          {entries.length === 0 ? (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {ar ? "لا توجد تفاصيل متاحة" : "No detail reported"}
            </div>
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {entries.map(([key, check]) => (
                <Badge
                  key={key}
                  variant="outline"
                  className={cn(
                    "text-[10px] gap-1",
                    check.ok
                      ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-700 border-amber-500/30"
                  )}
                >
                  {READINESS_LABELS[key]
                    ? ar
                      ? READINESS_LABELS[key].ar
                      : READINESS_LABELS[key].en
                    : key}
                  {check.detail ? (
                    <span className="font-mono opacity-70">{check.detail}</span>
                  ) : null}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
