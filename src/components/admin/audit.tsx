"use client";

import { useMemo, useState } from "react";
import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import {
  ScrollText,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Info,
  Check,
  X,
  Filter,
  Lock,
  Loader2,
  ChevronRight,
  KeyRound,
  UserPlus,
  UserX,
  FileText,
  FileCheck2,
  Cpu,
  CreditCard,
  Settings,
  LogIn,
  LogOut,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Severity = "INFO" | "WARN" | "ERROR" | "CRITICAL";

const SEVERITIES: Severity[] = ["INFO", "WARN", "ERROR", "CRITICAL"];

const SEVERITY_TEXT: Record<Severity, string> = {
  INFO: "text-chart-2",
  WARN: "text-chart-4",
  ERROR: "text-destructive",
  CRITICAL: "text-rose-700",
};

const SEVERITY_BG: Record<Severity, string> = {
  INFO: "bg-chart-2/10 border-chart-2/20",
  WARN: "bg-chart-4/10 border-chart-4/20",
  ERROR: "bg-destructive/10 border-destructive/20",
  CRITICAL: "bg-rose-700/10 border-rose-700/20",
};

const SEVERITY_DOT: Record<Severity, string> = {
  INFO: "bg-chart-2",
  WARN: "bg-chart-4",
  ERROR: "bg-destructive",
  CRITICAL: "bg-rose-700",
};

const ACTION_ICONS: Record<string, typeof ScrollText> = {
  LOGIN: LogIn,
  LOGOUT: LogOut,
  LOGIN_FAILED: KeyRound,
  ROLE_CHANGE: ShieldCheck,
  USER_CREATE: UserPlus,
  USER_DEACTIVATE: UserX,
  DOC_UPLOAD: FileText,
  DOC_DELETE: FileText,
  PROPOSAL_GENERATE: FileCheck2,
  ARTIFACT_DOWNLOAD: FileCheck2,
  ENV_UPDATE: Lock,
  ENV_ROTATE: KeyRound,
  CONFIG_CHANGE: Settings,
  AI_PROVIDER_ACTIVATE: Cpu,
  AI_PROVIDER_CREATE: Cpu,
  AI_PROVIDER_UPDATE: Cpu,
  AI_PROVIDER_DELETE: Cpu,
  BILLING_CHANGE: CreditCard,
  PLAN_CREATE: CreditCard,
  PLAN_UPDATE: CreditCard,
  SUBSCRIPTION_UPDATE: CreditCard,
  AGENT_RUN: Cpu,
};

function relativeTime(date: string, locale: "ar" | "en"): string {
  const diff = Date.now() - new Date(date).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return locale === "ar" ? "الآن" : "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return locale === "ar" ? `قبل ${mins}د` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return locale === "ar" ? `قبل ${hrs}س` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return locale === "ar" ? `قبل ${days}ي` : `${days}d ago`;
  const months = Math.floor(days / 30);
  return locale === "ar" ? `قبل ${months}ش` : `${months}mo ago`;
}

interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  resource: string | null;
  resourceId: string | null;
  details: string | null;
  ipAddress: string | null;
  severity: Severity;
  success: boolean;
  createdAt: string;
  user?: { name: string | null; email: string | null; role: string | null } | null;
}

interface AuditSummary {
  total: number;
  byAction: { action: string; count: number }[];
  bySeverity: { severity: Severity; count: number }[];
}

interface AuditResponse {
  logs: AuditLog[];
  summary: AuditSummary;
}

function formatDetails(raw: string | null): string {
  if (!raw) return "—";
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

export function AdminAudit() {
  const { locale } = useLocale();
  const [actionFilter, setActionFilter] = useState<string>("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery<AuditResponse>({
    queryKey: ["admin-audit"],
    queryFn: async () => {
      const res = await fetch("/api/admin/audit?limit=200");
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const logs = data?.logs ?? [];
  const summary = data?.summary ?? {
    total: 0,
    byAction: [],
    bySeverity: [],
  };

  // Client-side secondary filter (summary is global; logs come pre-filtered by query).
  // API ignores unknown filter values, so we also apply client filters for safety.
  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (actionFilter !== "ALL" && l.action !== actionFilter) return false;
      if (severityFilter !== "ALL" && l.severity !== severityFilter) return false;
      return true;
    });
  }, [logs, actionFilter, severityFilter]);

  const last24h = useMemo(
    () =>
      logs.filter(
        (l) => Date.now() - new Date(l.createdAt).getTime() < 24 * 60 * 60 * 1000
      ).length,
    [logs]
  );

  const criticalCount =
    summary.bySeverity.find((s) => s.severity === "CRITICAL")?.count ?? 0;
  const warnCount =
    summary.bySeverity.find((s) => s.severity === "WARN")?.count ?? 0;

  const actionOptions = useMemo(() => {
    const set = new Set<string>();
    summary.byAction.forEach((a) => set.add(a.action));
    logs.forEach((l) => set.add(l.action));
    return Array.from(set).sort();
  }, [summary.byAction, logs]);

  const maxActionCount = Math.max(1, ...summary.byAction.map((a) => a.count));

  return (
    <Card className="p-0 overflow-hidden border-border/60">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-8 rounded-lg bg-chart-5/10 flex items-center justify-center shrink-0">
            <ScrollText className="size-4 text-chart-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">
              {tr("admin_audit", locale)}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {locale === "ar"
                ? "سجل أحداث النظام غير القابل للتعديل — PDPL / NCA"
                : "Tamper-evident system event trail — PDPL / NCA compliant"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge
            variant="outline"
            className="text-[10px] gap-1 bg-rose-700/10 text-rose-700 border-rose-700/20"
          >
            <Lock className="size-2.5" />
            {locale === "ar" ? "غير قابل للتغيير" : "Immutable"}
          </Badge>
          <Badge
            variant="outline"
            className="text-[10px] gap-1 bg-muted text-muted-foreground"
          >
            <ScrollText className="size-2.5" />
            {locale === "ar" ? "إلحاق فقط" : "Append-only"}
          </Badge>
        </div>
      </div>

      {/* Summary cards */}
      <div className="px-5 py-3 grid grid-cols-2 md:grid-cols-4 gap-2 border-b border-border/60 bg-card/40">
        <SummaryStat
          icon={ScrollText}
          label={locale === "ar" ? "إجمالي الأحداث" : "Total Events"}
          value={summary.total}
          color="text-chart-1"
        />
        <SummaryStat
          icon={Info}
          label={locale === "ar" ? "آخر ٢٤ ساعة" : "Last 24h"}
          value={last24h}
          color="text-chart-2"
        />
        <SummaryStat
          icon={AlertOctagon}
          label={locale === "ar" ? "حرجة" : "Critical"}
          value={criticalCount}
          color="text-rose-700"
        />
        <SummaryStat
          icon={AlertTriangle}
          label={locale === "ar" ? "تحذيرات" : "Warnings"}
          value={warnCount}
          color="text-chart-4"
        />
      </div>

      {/* Breakdown */}
      <div className="px-5 py-3 border-b border-border/60 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By action */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
            <Filter className="size-2.5" />
            {locale === "ar" ? "حسب الإجراء" : "By Action"}
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin pe-1">
            {summary.byAction.length === 0 ? (
              <p className="text-[10px] text-muted-foreground py-2 text-center">
                {tr("no_data", locale)}
              </p>
            ) : (
              summary.byAction
                .slice()
                .sort((a, b) => b.count - a.count)
                .map((a) => {
                  const Icon = ACTION_ICONS[a.action] ?? ScrollText;
                  return (
                    <div
                      key={a.action}
                      className="flex items-center gap-2 text-[10px]"
                    >
                      <Icon className="size-2.5 text-muted-foreground shrink-0" />
                      <span className="font-mono w-36 shrink-0 truncate text-muted-foreground">
                        {a.action}
                      </span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-chart-1 rounded-full"
                          style={{
                            width: `${(a.count / maxActionCount) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="font-mono tabular-nums w-8 text-end font-semibold">
                        {a.count}
                      </span>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        {/* By severity */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
            <AlertTriangle className="size-2.5" />
            {locale === "ar" ? "حسب الخطورة" : "By Severity"}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SEVERITIES.map((s) => {
              const count =
                summary.bySeverity.find((b) => b.severity === s)?.count ?? 0;
              return (
                <div
                  key={s}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px]",
                    SEVERITY_BG[s]
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", SEVERITY_DOT[s])} />
                  <span className={cn("font-semibold", SEVERITY_TEXT[s])}>
                    {s}
                  </span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
          <Separator className="my-3" />
          <div className="text-[10px] text-muted-foreground leading-relaxed">
            {locale === "ar"
              ? "يتم تسجيل كل إجراء إداري في جدول AuditLog مع طابع زمني ومستوى خطورة. السجل إلحاقي ولا يمكن تعديله أو حذفه."
              : "Every administrative action is written to the AuditLog table with timestamp and severity. The trail is append-only — no updates or deletes permitted."}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-5 py-2.5 flex flex-wrap items-center gap-2 border-b border-border/60">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground me-1 flex items-center gap-1">
          <Filter className="size-2.5" />
          {locale === "ar" ? "تصفية" : "Filter"}:
        </span>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger size="sm" className="h-7 text-[10px] w-[180px]">
            <SelectValue placeholder={tr("admin_audit_action", locale)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL" className="text-xs">
              {locale === "ar" ? "كل الإجراءات" : "All actions"}
            </SelectItem>
            {actionOptions.map((a) => (
              <SelectItem key={a} value={a} className="text-xs font-mono">
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger size="sm" className="h-7 text-[10px] w-[140px]">
            <SelectValue placeholder={tr("admin_audit_severity", locale)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL" className="text-xs">
              {locale === "ar" ? "كل المستويات" : "All severities"}
            </SelectItem>
            {SEVERITIES.map((s) => (
              <SelectItem key={s} value={s} className="text-xs font-mono">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(actionFilter !== "ALL" || severityFilter !== "ALL") && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[10px] px-2"
            onClick={() => {
              setActionFilter("ALL");
              setSeverityFilter("ALL");
            }}
          >
            <X className="size-2.5" />
            {locale === "ar" ? "مسح" : "Clear"}
          </Button>
        )}
        <span className="ms-auto text-[10px] text-muted-foreground font-mono">
          {filtered.length}/{logs.length}
        </span>
      </div>

      {/* Logs table */}
      <div className="max-h-[32rem] overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            {tr("loading", locale)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <ScrollText className="size-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">{tr("no_data", locale)}</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-wider h-8 w-6" />
                <TableHead className="text-[10px] uppercase tracking-wider h-8">
                  {tr("admin_audit_time", locale)}
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8">
                  {tr("admin_audit_user", locale)}
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8">
                  {tr("admin_audit_action", locale)}
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8 hidden md:table-cell">
                  {tr("admin_audit_resource", locale)}
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8">
                  {tr("admin_audit_severity", locale)}
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8 hidden sm:table-cell">
                  {locale === "ar" ? "نجاح" : "Success"}
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8 hidden lg:table-cell">
                  IP
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((log) => {
                const Icon = ACTION_ICONS[log.action] ?? ScrollText;
                const isOpen = expanded === log.id;
                const hasDetails = !!log.details;
                return (
                  <AuditRowFragment
                    key={log.id}
                    log={log}
                    icon={Icon}
                    isOpen={isOpen}
                    hasDetails={hasDetails}
                    onToggle={() =>
                      setExpanded(isOpen ? null : log.id)
                    }
                    locale={locale}
                  />
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </Card>
  );
}

function AuditRowFragment({
  log,
  icon: Icon,
  isOpen,
  hasDetails,
  onToggle,
  locale,
}: {
  log: AuditLog;
  icon: typeof ScrollText;
  isOpen: boolean;
  hasDetails: boolean;
  onToggle: () => void;
  locale: "ar" | "en";
}) {
  return (
    <>
      <TableRow
        className={cn(
          "group hover:bg-muted/40 cursor-pointer",
          isOpen && "bg-muted/30",
          log.severity === "CRITICAL" && "bg-rose-700/5"
        )}
        onClick={onToggle}
      >
        <TableCell className="py-2 ps-2">
          {hasDetails ? (
            <ChevronRight
              className={cn(
                "size-3 text-muted-foreground transition-transform",
                isOpen && "rotate-90"
              )}
            />
          ) : null}
        </TableCell>
        <TableCell className="py-2">
          <div className="font-mono text-[10px] leading-tight">
            <div>{relativeTime(log.createdAt, locale)}</div>
            <div className="text-muted-foreground text-[9px]">
              {new Date(log.createdAt).toLocaleString(
                locale === "ar" ? "ar-SA" : "en-US",
                {
                  year: "numeric",
                  month: "short",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                }
              )}
            </div>
          </div>
        </TableCell>
        <TableCell className="py-2">
          {log.user ? (
            <div className="min-w-0">
              <div className="text-[11px] font-medium truncate max-w-[140px]">
                {log.user.name ?? "—"}
              </div>
              <div className="text-[9px] text-muted-foreground font-mono truncate max-w-[140px]">
                {log.user.email ?? "—"}
              </div>
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground italic">
              {locale === "ar" ? "النظام" : "system"}
            </span>
          )}
        </TableCell>
        <TableCell className="py-2">
          <Badge
            variant="outline"
            className={cn(
              "text-[9px] gap-1 font-mono",
              SEVERITY_BG[log.severity]
            )}
          >
            <Icon className={cn("size-2.5", SEVERITY_TEXT[log.severity])} />
            {log.action}
          </Badge>
        </TableCell>
        <TableCell className="hidden md:table-cell py-2">
          <span className="text-[10px] font-mono text-muted-foreground">
            {log.resource ?? "—"}
            {log.resourceId && (
              <span className="text-[9px] block text-muted-foreground/70 truncate max-w-[120px]">
                {log.resourceId}
              </span>
            )}
          </span>
        </TableCell>
        <TableCell className="py-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-bold uppercase",
              SEVERITY_TEXT[log.severity]
            )}
          >
            <span
              className={cn("size-1.5 rounded-full", SEVERITY_DOT[log.severity])}
            />
            {log.severity}
          </span>
        </TableCell>
        <TableCell className="hidden sm:table-cell py-2">
          {log.success ? (
            <Check className="size-3.5 text-emerald-600" />
          ) : (
            <X className="size-3.5 text-destructive" />
          )}
        </TableCell>
        <TableCell className="hidden lg:table-cell py-2">
          <span className="text-[10px] font-mono text-muted-foreground">
            {log.ipAddress ?? "—"}
          </span>
        </TableCell>
      </TableRow>
      {isOpen && hasDetails && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={8} className="py-3">
            <div className="rounded-md border border-border/60 bg-background overflow-hidden">
              <div className="px-3 py-1.5 border-b border-border/60 bg-muted/30 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {locale === "ar" ? "تفاصيل الحدث" : "Event Details"}
                </span>
                <span className="text-[9px] font-mono text-muted-foreground">
                  ID: {log.id}
                </span>
              </div>
              <pre className="p-3 text-[10px] font-mono leading-relaxed overflow-x-auto scrollbar-thin text-foreground/90 max-h-60">
                {formatDetails(log.details)}
              </pre>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof ScrollText;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
      <Icon className={cn("size-3.5 shrink-0", color)} />
      <div className="min-w-0">
        <div className="text-sm font-bold tabular-nums leading-none">
          {value}
        </div>
        <div className="text-[9px] text-muted-foreground leading-none mt-0.5 truncate uppercase tracking-wider">
          {label}
        </div>
      </div>
    </div>
  );
}
