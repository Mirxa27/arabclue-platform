"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  FileText,
  Award,
  Briefcase,
  BookOpen,
  Library,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

type RecordType = "CERTIFICATE" | "PAST_PROJECT" | "METHODOLOGY" | "LIBRARY";

interface PendingRecord {
  id: string;
  recordType: RecordType;
  title: string;
  titleAr: string | null;
  submitterId: string | null;
  submitterName: string | null;
  submittedAt: string;
  expiresAt: string | null;
  evidenceDocumentId: string | null;
  evidenceVersion: number | null;
}

interface EvidenceDocument {
  id: string;
  originalName: string;
  checksum?: string | null;
  currentVersion: number;
  versions?: Array<{ version: number; checksum?: string | null }>;
}

interface PendingApprovalResponse {
  records: PendingRecord[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
  counts: {
    certificates: number;
    pastProjects: number;
    methodologies: number;
    library: number;
  };
}

const RECORD_TYPE_ICONS: Record<RecordType, typeof FileText> = {
  CERTIFICATE: Award,
  PAST_PROJECT: Briefcase,
  METHODOLOGY: BookOpen,
  LIBRARY: Library,
};

const RECORD_TYPE_LABELS: Record<RecordType, { ar: string; en: string }> = {
  CERTIFICATE: { ar: "شهادة", en: "Certificate" },
  PAST_PROJECT: { ar: "مشروع سابق", en: "Past Project" },
  METHODOLOGY: { ar: "منهجية", en: "Methodology" },
  LIBRARY: { ar: "مكتبة المحتوى", en: "Content Library" },
};

async function responseError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    code?: string;
  } | null;
  return payload?.error ?? "Request failed";
}

export function KnowledgeApprovalQueue() {
  const { locale } = useLocale();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [evidenceSelections, setEvidenceSelections] = useState<
    Record<string, string>
  >({});
  const [rejectionReasons, setRejectionReasons] = useState<
    Record<string, string>
  >({});

  // Fetch pending records
  const pendingQuery = useQuery({
    queryKey: ["knowledge-pending-approval"],
    queryFn: async () => {
      const response = await fetch("/api/knowledge/pending-approval");
      if (!response.ok) throw new Error(await responseError(response));
      return (await response.json()) as PendingApprovalResponse;
    },
    staleTime: 30_000,
    refetchInterval: 5000,
  });

  // Fetch available evidence documents
  const documentsQuery = useQuery({
    queryKey: ["knowledge-evidence-documents"],
    queryFn: async () => {
      const response = await fetch("/api/documents");
      if (!response.ok) throw new Error(await responseError(response));
      const payload = (await response.json()) as {
        documents?: EvidenceDocument[];
      };
      return (payload.documents ?? []).filter((document) => {
        const current = document.versions?.find(
          (version) => version.version === document.currentVersion
        );
        return Boolean(current?.checksum ?? document.checksum);
      });
    },
    staleTime: 30_000,
  });

  // Check user permissions
  const workspaceQuery = useQuery({
    queryKey: ["workspace-review-permissions"],
    queryFn: async () => {
      const response = await fetch("/api/workspaces");
      if (!response.ok) throw new Error(await responseError(response));
      return (await response.json()) as { membershipRole?: string };
    },
    staleTime: 30_000,
  });

  const canManage = ["OWNER", "ADMIN"].includes(
    workspaceQuery.data?.membershipRole ?? ""
  );

  // Approval mutation
  const approveMutation = useMutation({
    mutationFn: async ({
      recordType,
      recordId,
      evidenceDocumentId,
    }: {
      recordType: RecordType;
      recordId: string;
      evidenceDocumentId: string;
    }) => {
      const response = await fetch("/api/knowledge/pending-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordType,
          recordId,
          decision: "APPROVE",
          evidenceDocumentId,
        }),
      });
      if (!response.ok) {
        const err = await responseError(response);
        throw new Error(err);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-pending-approval"] });
      toast({
        title: locale === "ar" ? "تم اعتماد السجل" : "Record approved",
      });
      setExpandedId(null);
    },
    onError: (error) => {
      toast({
        title:
          error instanceof Error
            ? error.message
            : locale === "ar"
              ? "فشل الاعتماد"
              : "Approval failed",
        variant: "destructive",
      });
    },
  });

  // Rejection mutation
  const rejectMutation = useMutation({
    mutationFn: async ({
      recordType,
      recordId,
      reason,
    }: {
      recordType: RecordType;
      recordId: string;
      reason: string;
    }) => {
      const response = await fetch("/api/knowledge/pending-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordType,
          recordId,
          decision: "REJECT",
          reason,
        }),
      });
      if (!response.ok) {
        const err = await responseError(response);
        throw new Error(err);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-pending-approval"] });
      toast({
        title: locale === "ar" ? "تم رفض السجل" : "Record rejected",
      });
      setExpandedId(null);
    },
    onError: (error) => {
      toast({
        title:
          error instanceof Error
            ? error.message
            : locale === "ar"
              ? "فشل الرفض"
              : "Rejection failed",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (record: PendingRecord) => {
    const evidenceId = evidenceSelections[`${record.recordType}:${record.id}`];
    if (!evidenceId) {
      toast({
        title:
          locale === "ar"
            ? "يرجى اختيار مستند الدليل"
            : "Please select an evidence document",
        variant: "destructive",
      });
      return;
    }
    approveMutation.mutate({
      recordType: record.recordType,
      recordId: record.id,
      evidenceDocumentId: evidenceId,
    });
  };

  const handleReject = (record: PendingRecord) => {
    const reason = rejectionReasons[`${record.recordType}:${record.id}`];
    if (!reason?.trim()) {
      toast({
        title:
          locale === "ar" ? "يرجى إدخال سبب الرفض" : "Please enter a rejection reason",
        variant: "destructive",
      });
      return;
    }
    rejectMutation.mutate({
      recordType: record.recordType,
      recordId: record.id,
      reason: reason.trim(),
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const isExpiringSoon = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    const expiry = new Date(expiresAt);
    const now = new Date();
    const daysUntilExpiry = Math.ceil(
      (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  if (pendingQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="size-4 animate-spin" />
        <span>{tr("loading", locale)}</span>
      </div>
    );
  }

  if (pendingQuery.error) {
    return (
      <div className="text-center py-8 text-destructive">
        {pendingQuery.error instanceof Error
          ? pendingQuery.error.message
          : locale === "ar"
            ? "فشل تحميل السجلات"
            : "Failed to load records"}
      </div>
    );
  }

  const records = pendingQuery.data?.records ?? [];
  const total = pendingQuery.data?.total ?? 0;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(
          [
            ["CERTIFICATE", pendingQuery.data?.counts.certificates ?? 0],
            ["PAST_PROJECT", pendingQuery.data?.counts.pastProjects ?? 0],
            ["METHODOLOGY", pendingQuery.data?.counts.methodologies ?? 0],
            ["LIBRARY", pendingQuery.data?.counts.library ?? 0],
          ] as const
        ).map(([type, count]) => {
          const Icon = RECORD_TYPE_ICONS[type];
          const label = RECORD_TYPE_LABELS[type];
          return (
            <div
              key={type}
              className="rounded-lg border bg-card p-3 flex items-center gap-3"
            >
              <div className="rounded-full bg-primary/10 p-2">
                <Icon className="size-4 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-semibold">{count}</div>
                <div className="text-xs text-muted-foreground">
                  {locale === "ar" ? label.ar : label.en}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Permission Warning */}
      {!canManage && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-500" />
          <span>
            {locale === "ar"
              ? "يمكن لمالك مساحة العمل أو المسؤول فقط اعتماد أو رفض السجلات."
              : "Only workspace owner or admin can approve or reject records."}
          </span>
        </div>
      )}

      {/* Empty State */}
      {records.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <CheckCircle2 className="size-12 mx-auto mb-3 text-emerald-500/50" />
          <p className="text-lg font-medium">
            {locale === "ar"
              ? "لا توجد سجلات بانتظار الاعتماد"
              : "No records pending approval"}
          </p>
          <p className="text-sm">
            {locale === "ar"
              ? "تم اعتماد جميع سجلات المعرفة"
              : "All knowledge records have been reviewed"}
          </p>
        </div>
      )}

      {/* Records List */}
      <div className="space-y-2">
        {records.map((record) => {
          const Icon = RECORD_TYPE_ICONS[record.recordType];
          const typeLabel = RECORD_TYPE_LABELS[record.recordType];
          const key = `${record.recordType}:${record.id}`;
          const isExpanded = expandedId === key;
          const expiringSoon = isExpiringSoon(record.expiresAt);
          const expired = isExpired(record.expiresAt);

          return (
            <div
              key={key}
              className={cn(
                "rounded-lg border bg-card transition-all",
                isExpanded && "ring-2 ring-primary/20"
              )}
            >
              {/* Header Row */}
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : key)}
                className="w-full px-4 py-3 flex items-center gap-3 text-start hover:bg-muted/50 transition-colors"
              >
                <div className="rounded-full bg-primary/10 p-2 shrink-0">
                  <Icon className="size-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">
                    {locale === "ar" && record.titleAr
                      ? record.titleAr
                      : record.title}
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {locale === "ar" ? typeLabel.ar : typeLabel.en}
                    </Badge>
                    <span>{formatDate(record.submittedAt)}</span>
                    {record.expiresAt && (
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3" />
                        {formatDate(record.expiresAt)}
                      </span>
                    )}
                  </div>
                </div>
                {/* Expiry Badges */}
                {expired && (
                  <Badge variant="destructive" className="shrink-0">
                    {locale === "ar" ? "منتهي" : "Expired"}
                  </Badge>
                )}
                {expiringSoon && !expired && (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-amber-500 text-amber-500"
                  >
                    {locale === "ar" ? "ينتهي قريباً" : "Expiring Soon"}
                  </Badge>
                )}
              </button>

              {/* Expanded Actions */}
              {isExpanded && canManage && (
                <div className="px-4 pb-4 pt-2 border-t space-y-3">
                  {/* Evidence Selector */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                      {locale === "ar" ? "مستند الدليل" : "Evidence Document"}
                    </label>
                    <select
                      value={evidenceSelections[key] ?? ""}
                      onChange={(e) =>
                        setEvidenceSelections((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">
                        {locale === "ar"
                          ? "اختر مستند الدليل..."
                          : "Select evidence document..."}
                      </option>
                      {(documentsQuery.data ?? []).map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.originalName} · v{doc.currentVersion}
                        </option>
                      ))}
                    </select>
                    {documentsQuery.isLoading && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {locale === "ar"
                          ? "جاري تحميل المستندات..."
                          : "Loading documents..."}
                      </p>
                    )}
                    {!documentsQuery.isLoading &&
                      (documentsQuery.data?.length ?? 0) === 0 && (
                        <p className="text-xs text-amber-500 mt-1">
                          {locale === "ar"
                            ? "لا توجد مستندات مع checksum — ارفع مستنداً داعماً أولاً"
                            : "No documents with checksum — upload a supporting document first"}
                        </p>
                      )}
                  </div>

                  {/* Rejection Reason */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                      {locale === "ar" ? "سبب الرفض (إن وجد)" : "Rejection Reason (if rejecting)"}
                    </label>
                    <Input
                      value={rejectionReasons[key] ?? ""}
                      onChange={(e) =>
                        setRejectionReasons((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      placeholder={
                        locale === "ar"
                          ? "أدخل سبب الرفض بالعربية أو الإنجليزية..."
                          : "Enter rejection reason..."
                      }
                      className="h-9 text-sm"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={
                        !evidenceSelections[key] ||
                        approveMutation.isPending ||
                        rejectMutation.isPending
                      }
                      onClick={() => handleApprove(record)}
                    >
                      {approveMutation.isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-3.5" />
                      )}
                      {locale === "ar" ? "اعتماد" : "Approve"}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1.5"
                      disabled={
                        !rejectionReasons[key]?.trim() ||
                        approveMutation.isPending ||
                        rejectMutation.isPending
                      }
                      onClick={() => handleReject(record)}
                    >
                      {rejectMutation.isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <XCircle className="size-3.5" />
                      )}
                      {locale === "ar" ? "رفض" : "Reject"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpandedId(null)}
                    >
                      {locale === "ar" ? "إلغاء" : "Cancel"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Total Count */}
      {total > 0 && (
        <div className="text-center text-xs text-muted-foreground pt-2">
          {locale === "ar"
            ? `${total} سجل بانتظار الاعتماد`
            : `${total} record${total !== 1 ? "s" : ""} pending approval`}
        </div>
      )}
    </div>
  );
}

/**
 * Hook to fetch pending approval count for sidebar badge
 */
export function usePendingApprovalCount() {
  return useQuery({
    queryKey: ["knowledge-pending-approval-count"],
    queryFn: async () => {
      const response = await fetch("/api/knowledge/pending-approval?limit=1");
      if (!response.ok) return 0;
      const data = (await response.json()) as { total?: number };
      return data.total ?? 0;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
