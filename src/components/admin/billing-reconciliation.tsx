"use client";

import { useState, useCallback } from "react";
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
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  unresolved?: number;
  nextCursor?: string | null;
  olderThanMinutes?: number;
  limit?: number;
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

function formatAge(iso: string, locale: "ar" | "en"): string {
  try {
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
    if (locale === "ar") {
      if (minutes < 60) return `${minutes} دقيقة`;
      const hours = Math.floor(minutes / 60);
      return `${hours} ساعة`;
    }
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hr`;
  } catch {
    return "—";
  }
}

const STATUS_COLORS: Record<string, string> = {
  PAID: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  PENDING: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  FAILED: "bg-red-500/10 text-red-600 border-red-500/20",
  EXPIRED: "bg-muted text-muted-foreground border-border",
  CANCELLED: "bg-muted text-muted-foreground border-border",
  UNKNOWN: "bg-muted text-muted-foreground border-border",
  MISMATCH: "bg-red-500/10 text-red-600 border-red-500/20",
};

// ─── Main Component ──────────────────────────────────────────────────────────

export function AdminBillingReconciliation() {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const {
    data: report,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-reconciliation-report", cursor],
    queryFn: async () => {
      const url = new URL("/api/admin/billing/reconcile", window.location.origin);
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await fetch(url.toString());
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
    onSuccess: (_data, checkoutId) => {
      toast({
        title: tr("reconcile_apply_success_single", locale, { checkoutId: checkoutId.slice(0, 8) }),
      });
      qc.invalidateQueries({ queryKey: ["admin-reconciliation-report"] });
      qc.invalidateQueries({ queryKey: ["admin-billing"] });
      refetch();
    },
    onError: (err: Error) => {
      const code = err.message;
      let message = err.message;
      if (code === "RECONCILE_ALREADY_APPLIED") {
        message = tr("reconcile_already_applied_msg", locale);
      } else if (code === "BILLING_PROVIDER_UNCONFIGURED") {
        message = tr("BILLING_PROVIDER_UNCONFIGURED", locale);
      } else if (code === "PROVIDER_NOT_PAID") {
        message = tr("reconcile_provider_not_paid", locale);
      } else if (code === "RECONCILE_PROVIDER_UNRESOLVED") {
        message = tr("reconcile_provider_unresolved_msg", locale);
      } else if (code === "RECONCILE_PROVIDER_MISMATCH") {
        message = tr("reconcile_provider_mismatch_msg", locale);
      } else if (code === "CHECKOUT_NOT_FOUND") {
        message = tr("reconcile_checkout_not_found", locale);
      } else if (code === "NO_INVOICE_ID") {
        message = tr("reconcile_no_invoice_id", locale);
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

  const bulkApplyMutation = useMutation({
    mutationFn: async (checkoutIds: string[]) => {
      const items = checkoutIds.map((id) => ({
        checkoutId: id,
        providerResult: {
          providerState: "PAID" as const,
          invoiceValue: null,
          paidCurrency: null,
          paymentId: null,
          paymentMethod: null,
        },
      }));
      const res = await fetch("/api/admin/billing/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.code || json.error || "Bulk reconciliation failed");
      }
      return json as {
        applied: Array<{ ok: boolean; checkoutId: string; status?: string; code?: string }>;
        errors: Array<{ checkoutId: string; error: string }>;
        alreadyApplied: string[];
      };
    },
    onSuccess: (data) => {
      const appliedCount = data.applied.filter((a) => a.ok).length;
      const errorCount = data.errors.length;
      const alreadyCount = data.alreadyApplied.length;
      toast({
        title: tr("reconcile_bulk_apply_success", locale),
        description: tr("reconcile_bulk_results", locale, {
          applied: appliedCount,
          errors: errorCount,
          already: alreadyCount,
        }),
      });
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["admin-reconciliation-report"] });
      qc.invalidateQueries({ queryKey: ["admin-billing"] });
      refetch();
    },
    onError: () => {
      toast({
        title: tr("reconcile_bulk_apply_error", locale),
        variant: "destructive",
      });
    },
  });

  const isUnconfigured = error?.message === "BILLING_PROVIDER_UNCONFIGURED";

  const mismatches = report?.mismatches ?? [];
  const hasItems = mismatches.length > 0;
  const nextCursor = report?.nextCursor ?? null;
  const hasPrev = cursorStack.length > 0;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === mismatches.length) return new Set();
      return new Set(mismatches.map((m) => m.checkoutId));
    });
  }, [mismatches]);

  const allSelected = hasItems && selectedIds.size === mismatches.length;

  const handleNextPage = () => {
    if (nextCursor) {
      setCursorStack((prev) => [...prev, cursor ?? ""]);
      setCursor(nextCursor);
      refetch();
    }
  };

  const handlePrevPage = () => {
    if (cursorStack.length > 0) {
      const prevCursor = cursorStack[cursorStack.length - 1] || null;
      setCursorStack((prev) => prev.slice(0, -1));
      setCursor(prevCursor);
      refetch();
    }
  };

  const handleBulkApply = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      const allIds = mismatches
        .filter((m) => m.providerState === "PAID")
        .map((m) => m.checkoutId);
      if (allIds.length === 0) return;
      bulkApplyMutation.mutate(allIds);
    } else {
      bulkApplyMutation.mutate(ids);
    }
  };

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
                ? `${mismatches.length} ${tr("reconcile_of_label", locale)} ${report.scanned}`
                : `${mismatches.length} ${tr("reconcile_of_label", locale)} ${report.scanned}`}
            </Badge>
          )}
          {report?.nextCursor !== undefined && report?.unresolved !== undefined && (
            <Badge variant="outline" className="text-[10px] tabular-nums">
              {tr("reconcile_total_pending", locale, { count: report.unresolved ?? 0 })}
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

      {/* Bulk Actions Bar */}
      {hasItems && (
        <div className="flex items-center justify-between gap-2 px-5 py-2 border-b border-border/40 bg-muted/20">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-[10px] h-6"
              onClick={toggleSelectAll}
            >
              {allSelected ? (
                <CheckSquare className="size-3" />
              ) : (
                <Square className="size-3" />
              )}
              {tr("reconcile_select_all", locale)}
            </Button>
            {selectedIds.size > 0 && (
              <Badge variant="secondary" className="text-[10px] tabular-nums">
                {tr("reconcile_selected_count", locale, { count: selectedIds.size })}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <Button
                size="sm"
                variant="default"
                className="gap-1.5 text-[10px] h-6"
                onClick={handleBulkApply}
                disabled={bulkApplyMutation.isPending}
              >
                {bulkApplyMutation.isPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-3" />
                )}
                {tr("reconcile_apply_selected_btn", locale)}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-[10px] h-6"
              onClick={handleBulkApply}
              disabled={bulkApplyMutation.isPending}
            >
              {bulkApplyMutation.isPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3" />
              )}
              {tr("reconcile_bulk_apply_btn", locale)}
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-4 max-h-[32rem] overflow-y-auto scrollbar-thin">
        {/* Unconfigured provider state */}
        {isUnconfigured && (
          <div className="p-8 text-center">
            <div className="flex items-center justify-center gap-2 text-amber-600 mb-2">
              <AlertTriangle className="size-5" />
              <span className="font-semibold">
                {tr("reconcile_unconfigured_msg", locale)}
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
            {tr("reconcile_loading_report", locale)}
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
                {tr("reconcile_error_msg", locale)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{error.message}</p>
          </div>
        )}

        {/* Report results */}
        {report && !isLoading && (
          <>
            {mismatches.length === 0 ? (
              <div className="p-10 text-center">
                <CheckCircle2 className="size-8 mx-auto mb-2 text-emerald-500" />
                <p className="text-sm font-semibold text-emerald-600">
                  {tr("reconcile_no_mismatches", locale)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {tr("reconcile_scanned_label", locale, { count: report.scanned })}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 text-[10px] h-8">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label={tr("reconcile_select_all", locale)}
                      />
                    </TableHead>
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
                      {tr("reconcile_col_currency", locale)}
                    </TableHead>
                    <TableHead className="text-[10px] h-8">
                      {tr("reconcile_col_local_state", locale)}
                    </TableHead>
                    <TableHead className="text-[10px] h-8">
                      {tr("reconcile_col_provider_state", locale)}
                    </TableHead>
                    <TableHead className="text-[10px] h-8 text-end">
                      {tr("reconcile_col_age", locale)}
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
                  {mismatches.map((m) => (
                    <TableRow key={m.checkoutId} className="text-[11px]">
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(m.checkoutId)}
                          onCheckedChange={() => toggleSelect(m.checkoutId)}
                          aria-label={m.checkoutId}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-[10px] truncate max-w-[100px]">
                        {m.checkoutId.slice(0, 12)}...
                      </TableCell>
                      <TableCell className="text-[10px] truncate max-w-[100px]">
                        {m.userEmail ?? m.workspaceId?.slice(0, 8) ?? "—"}
                      </TableCell>
                      <TableCell className="text-end font-mono font-semibold tabular-nums">
                        {formatSAR(m.amount, locale)} {sarSuffix(locale)}
                      </TableCell>
                      <TableCell className="text-[10px] font-mono">
                        {m.currency}
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
                      <TableCell className="text-[10px] text-muted-foreground text-end font-mono tabular-nums">
                        {formatAge(m.createdAt, locale)}
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
                        ) : m.providerState === "FAILED" ||
                          m.providerState === "EXPIRED" ||
                          m.providerState === "CANCELLED" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px] gap-1"
                            onClick={() => applyMutation.mutate(m.checkoutId)}
                            disabled={applyingId === m.checkoutId}
                          >
                            {applyingId === m.checkoutId ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Ban className="size-3" />
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

            {/* Pagination */}
            {(nextCursor || hasPrev) && (
              <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between text-[10px]">
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1 text-[10px] h-6"
                  onClick={handlePrevPage}
                  disabled={!hasPrev}
                >
                  {locale === "ar" ? (
                    <ChevronRight className="size-3" />
                  ) : (
                    <ChevronLeft className="size-3" />
                  )}
                  {tr("reconcile_next_page", locale) === "Next Page"
                    ? locale === "ar"
                      ? "السابق"
                      : "Previous"
                    : tr("reconcile_next_page", locale)}
                </Button>
                <span className="text-muted-foreground">
                  {tr("reconcile_scanned_label", locale, { count: report.scanned })}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1 text-[10px] h-6"
                  onClick={handleNextPage}
                  disabled={!nextCursor}
                >
                  {tr("reconcile_next_page", locale)}
                  {locale === "ar" ? (
                    <ChevronLeft className="size-3" />
                  ) : (
                    <ChevronRight className="size-3" />
                  )}
                </Button>
              </div>
            )}

            {/* Report metadata */}
            <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>
                {tr("reconcile_last_checked", locale)}{" "}
                {formatDate(report.checkedAt, locale)}
              </span>
              <span>
                {tr("reconcile_scanned_label", locale, { count: report.scanned })}
              </span>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
