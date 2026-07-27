"use client";

import { useState } from "react";
import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Scale,
  AlertTriangle,
  Ban,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReconciliationMismatch {
  checkoutId: string;
  workspaceId: string | null;
  amount: number;
  currency: string;
  localState: string;
  providerState: string;
  invoiceId: string | null;
  paymentId: string | null;
  customerReference: string;
  createdAt: string;
  userEmail: string | null;
}

interface ReconciliationReport {
  mismatches: ReconciliationMismatch[];
  scanned: number;
  checkedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSAR(amount: number, locale: "ar" | "en"): string {
  try {
    return amount.toLocaleString(locale === "ar" ? "ar-SA" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return amount.toFixed(2);
  }
}

function sarSuffix(locale: "ar" | "en"): string {
  return locale === "ar" ? "ر.س" : "SAR";
}

function formatDate(iso: string, locale: "ar" | "en"): string {
  try {
    return new Date(iso).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const STATUS_COLORS: Record<string, string> = {
  PAID: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  PENDING: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  FAILED: "bg-red-500/10 text-red-600 border-red-500/20",
  EXPIRED: "bg-muted text-muted-foreground border-border",
  CANCELLED: "bg-muted text-muted-foreground border-border",
  UNKNOWN: "bg-muted text-muted-foreground border-border",
};

// ─── Main Component ──────────────────────────────────────────────────────────

export function AdminBillingReconciliation() {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const {
    data: report,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-reconciliation-report"],
    queryFn: async () => {
      const res = await fetch("/api/admin/billing/reconcile");
      if (res.status === 503) {
        const json = await res.json();
        throw new Error(json.code || "BILLING_PROVIDER_UNCONFIGURED");
      }
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to fetch reconciliation report");
      }
      return (await res.json()) as ReconciliationReport;
    },
    enabled: false, // Only fetch on demand
    retry: false,
  });

  const applyMutation = useMutation({
    mutationFn: async (checkoutId: string) => {
      setApplyingId(checkoutId);
      const res = await fetch("/api/admin/billing/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.code || json.error || "Reconciliation failed");
      }
      return json;
    },
    onSuccess: () => {
      toast({
        title:
          locale === "ar"
            ? "تم تطبيق التسوية بنجاح"
            : "Reconciliation applied successfully",
      });
      qc.invalidateQueries({ queryKey: ["admin-reconciliation-report"] });
      qc.invalidateQueries({ queryKey: ["admin-billing"] });
      refetch();
    },
    onError: (err: Error) => {
      const code = err.message;
      let message = err.message;
      if (code === "RECONCILE_ALREADY_APPLIED") {
        message = tr("reconcile_already_applied", locale);
      } else if (code === "BILLING_PROVIDER_UNCONFIGURED") {
        message = tr("BILLING_PROVIDER_UNCONFIGURED", locale);
      } else if (code === "PROVIDER_NOT_PAID") {
        message =
          locale === "ar"
            ? "حالة مزود الدفع ليست 'مدفوع'"
            : "Provider state is not PAID";
      }
      toast({
        title: locale === "ar" ? "فشل التسوية" : "Reconciliation failed",
        description: message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setApplyingId(null);
    },
  });

  const isUnconfigured = error?.message === "BILLING_PROVIDER_UNCONFIGURED";

  return (
    <Card className="p-0 overflow-hidden border-border/60">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Scale className="size-4 text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">
              {tr("reconcile_title", locale)}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {tr("reconcile_subtitle", locale)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {report && (
            <Badge variant="secondary" className="text-[10px] tabular-nums">
              {locale === "ar"
                ? `${report.mismatches.length} من ${report.scanned}`
                : `${report.mismatches.length} of ${report.scanned}`}
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-[11px]"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            {tr("reconcile_fetch_btn", locale)}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-h-[32rem] overflow-y-auto scrollbar-thin">
        {/* Unconfigured provider state */}
        {isUnconfigured && (
          <div className="p-8 text-center">
            <div className="flex items-center justify-center gap-2 text-amber-600 mb-2">
              <AlertTriangle className="size-5" />
              <span className="font-semibold">
                {locale === "ar" ? "مزود الفوترة غير مُهيأ" : "Provider Not Configured"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {tr("BILLING_PROVIDER_UNCONFIGURED", locale)}
            </p>
          </div>
        )}

        {/* Loading state */}
        {isLoading && !isUnconfigured && (
          <div className="p-10 text-center flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {tr("loading", locale)}
          </div>
        )}

        {/* Initial state — prompt to fetch */}
        {!report && !isLoading && !error && (
          <div className="p-10 text-center text-xs text-muted-foreground">
            <AlertCircle className="size-5 mx-auto mb-2 opacity-50" />
            {tr("reconcile_initial_prompt", locale)}
          </div>
        )}

        {/* Error state (non-unconfigured) */}
        {error && !isUnconfigured && (
          <div className="p-8 text-center">
            <div className="flex items-center justify-center gap-2 text-red-600 mb-2">
              <Ban className="size-5" />
              <span className="font-semibold">
                {locale === "ar" ? "خطأ" : "Error"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{error.message}</p>
          </div>
        )}

        {/* Report results */}
        {report && !isLoading && (
          <>
            {report.mismatches.length === 0 ? (
              <div className="p-10 text-center">
                <CheckCircle2 className="size-8 mx-auto mb-2 text-emerald-500" />
                <p className="text-sm font-semibold text-emerald-600">
                  {tr("reconcile_no_mismatches", locale)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {locale === "ar"
                    ? `تم فحص ${report.scanned} عملية دفع معلّقة`
                    : `Scanned ${report.scanned} pending checkout(s)`}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] h-8">
                      {tr("reconcile_col_checkout", locale)}
                    </TableHead>
                    <TableHead className="text-[10px] h-8">
                      {tr("reconcile_col_workspace", locale)}
                    </TableHead>
                    <TableHead className="text-[10px] h-8 text-end">
                      {tr("reconcile_col_amount", locale)}
                    </TableHead>
                    <TableHead className="text-[10px] h-8">
                      {tr("reconcile_col_local_state", locale)}
                    </TableHead>
                    <TableHead className="text-[10px] h-8">
                      {tr("reconcile_col_provider_state", locale)}
                    </TableHead>
                    <TableHead className="text-[10px] h-8 text-end">
                      {tr("reconcile_col_created", locale)}
                    </TableHead>
                    <TableHead className="text-[10px] h-8">
                      {tr("reconcile_col_action", locale)}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.mismatches.map((m) => (
                    <TableRow key={m.checkoutId} className="text-[11px]">
                      <TableCell className="font-mono text-[10px] truncate max-w-[100px]">
                        {m.checkoutId.slice(0, 12)}...
                      </TableCell>
                      <TableCell className="text-[10px] truncate max-w-[100px]">
                        {m.userEmail ?? m.workspaceId?.slice(0, 8) ?? "—"}
                      </TableCell>
                      <TableCell className="text-end font-mono font-semibold tabular-nums">
                        {formatSAR(m.amount, locale)} {sarSuffix(locale)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px]",
                            STATUS_COLORS[m.localState] ?? STATUS_COLORS.UNKNOWN
                          )}
                        >
                          {m.localState}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px]",
                            STATUS_COLORS[m.providerState] ?? STATUS_COLORS.UNKNOWN
                          )}
                        >
                          {m.providerState}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground text-end font-mono">
                        {formatDate(m.createdAt, locale)}
                      </TableCell>
                      <TableCell>
                        {m.providerState === "PAID" ? (
                          <Button
                            size="sm"
                            variant="default"
                            className="h-6 px-2 text-[10px] gap-1"
                            onClick={() => applyMutation.mutate(m.checkoutId)}
                            disabled={applyingId === m.checkoutId}
                          >
                            {applyingId === m.checkoutId ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="size-3" />
                            )}
                            {tr("reconcile_apply_btn", locale)}
                          </Button>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[9px] bg-muted"
                          >
                            {tr("reconcile_manual_review", locale)}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Report metadata */}
            <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>
                {locale === "ar" ? "آخر فحص:" : "Last checked:"}{" "}
                {formatDate(report.checkedAt, locale)}
              </span>
              <span>
                {locale === "ar"
                  ? `${report.scanned} عملية تم فحصها`
                  : `${report.scanned} checkout(s) scanned`}
              </span>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
