"use client";

import { useMemo, useState } from "react";
import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { selectApiFailureMessage } from "@/lib/api-failure-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Award,
  Briefcase,
  BookOpen,
  Library,
  Users,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/patterns";

type RecordType =
  | "CERTIFICATE"
  | "PAST_PROJECT"
  | "METHODOLOGY_ASSET"
  | "CONTENT_LIBRARY_ITEM"
  | "STAFF_MEMBER";

type KnowledgeQueueRow = {
  recordType: RecordType;
  id: string;
  titleAr: string;
  titleEn: string;
  submitterId: string | null;
  submitterName: string | null;
  submittedAt: string;
  expiry:
    | { kind: "EXPIRY_DATE"; date: string; expired: boolean }
    | { kind: "NO_EXPIRY"; markerKey: string };
  evidence:
    | { kind: "EVIDENCE_DOCUMENT"; documentId: string; version: number | null }
    | { kind: "NO_EVIDENCE"; markerKey: string };
};

interface EvidenceDocument {
  id: string;
  originalName: string;
  checksum?: string | null;
  currentVersion: number;
  versions?: Array<{ version: number; checksum?: string | null }>;
}

interface PendingApprovalResponse {
  records: KnowledgeQueueRow[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
  counts: Partial<Record<RecordType, number>>;
}

const RECORD_TYPE_ICONS: Record<RecordType, typeof Award> = {
  CERTIFICATE: Award,
  PAST_PROJECT: Briefcase,
  METHODOLOGY_ASSET: BookOpen,
  CONTENT_LIBRARY_ITEM: Library,
  STAFF_MEMBER: Users,
};

const RECORD_TYPE_LABELS: Record<RecordType, { ar: string; en: string }> = {
  CERTIFICATE: { ar: "شهادة", en: "Certificate" },
  PAST_PROJECT: { ar: "مشروع سابق", en: "Past Project" },
  METHODOLOGY_ASSET: { ar: "منهجية", en: "Methodology" },
  CONTENT_LIBRARY_ITEM: { ar: "مكتبة المحتوى", en: "Content Library" },
  STAFF_MEMBER: { ar: "موظف", en: "Staff Member" },
};

async function responseError(response: Response, locale: "ar" | "en"): Promise<string> {
  const payload = await response.json().catch(() => null);
  return (
    selectApiFailureMessage(payload, locale) ??
    (locale === "ar" ? "فشل الطلب" : "Request failed")
  );
}

export function KnowledgeApprovalQueue() {
  const { locale } = useLocale();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [evidenceSelections, setEvidenceSelections] = useState<
    Record<string, string>
  >({});
  const [rejectionReasonsAr, setRejectionReasonsAr] = useState<
    Record<string, string>
  >({});
  const [rejectionReasonsEn, setRejectionReasonsEn] = useState<
    Record<string, string>
  >({});

  const pendingQuery = useInfiniteQuery({
    queryKey: ["knowledge-pending-approval"],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "20" });
      if (pageParam) params.set("cursor", pageParam);
      const response = await fetch(
        `/api/knowledge/pending-approval?${params.toString()}`
      );
      if (!response.ok) throw new Error(await responseError(response, locale));
      return (await response.json()) as PendingApprovalResponse;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : null,
    staleTime: 30_000,
    refetchInterval: 5_000,
  });

  const documentsQuery = useQuery({
    queryKey: ["knowledge-evidence-documents"],
    queryFn: async () => {
      const response = await fetch("/api/documents");
      if (!response.ok) throw new Error(await responseError(response, locale));
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

  const workspaceQuery = useQuery({
    queryKey: ["workspace-review-permissions"],
    queryFn: async () => {
      const response = await fetch("/api/workspaces");
      if (!response.ok) throw new Error(await responseError(response, locale));
      return (await response.json()) as { membershipRole?: string };
    },
    staleTime: 30_000,
  });

  const canManage = ["OWNER", "ADMIN"].includes(
    workspaceQuery.data?.membershipRole ?? ""
  );

  const approveMutation = useMutation({
    mutationFn: async (input: {
      recordType: RecordType;
      recordId: string;
      evidenceDocumentId: string;
    }) => {
      const response = await fetch("/api/knowledge/pending-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordType: input.recordType,
          recordId: input.recordId,
          decision: "APPROVE",
          evidenceDocumentId: input.evidenceDocumentId,
        }),
      });
      if (!response.ok) throw new Error(await responseError(response, locale));
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

  const rejectMutation = useMutation({
    mutationFn: async (input: {
      recordType: RecordType;
      recordId: string;
      reasonAr: string;
      reasonEn: string;
    }) => {
      const response = await fetch("/api/knowledge/pending-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordType: input.recordType,
          recordId: input.recordId,
          decision: "REJECT",
          reasonAr: input.reasonAr,
          reasonEn: input.reasonEn,
        }),
      });
      if (!response.ok) throw new Error(await responseError(response, locale));
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

  const handleApprove = (record: KnowledgeQueueRow) => {
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

  const handleReject = (record: KnowledgeQueueRow) => {
    const key = `${record.recordType}:${record.id}`;
    const reasonAr = rejectionReasonsAr[key]?.trim() ?? "";
    const reasonEn = rejectionReasonsEn[key]?.trim() ?? "";
    if (reasonAr.length < 1 || reasonEn.length < 1) {
      toast({
        title:
          locale === "ar"
            ? "يرجى إدخال سبب الرفض بالعربية والإنجليزية"
            : "Enter rejection reasons in Arabic and English",
        variant: "destructive",
      });
      return;
    }
    if (reasonAr.length > 1000 || reasonEn.length > 1000) {
      toast({
        title:
          locale === "ar"
            ? "سبب الرفض يجب ألا يتجاوز 1000 حرف"
            : "Rejection reason must be at most 1000 characters",
        variant: "destructive",
      });
      return;
    }
    rejectMutation.mutate({
      recordType: record.recordType,
      recordId: record.id,
      reasonAr,
      reasonEn,
    });
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const records = useMemo(
    () => pendingQuery.data?.pages.flatMap((page) => page.records) ?? [],
    [pendingQuery.data]
  );
  const total = pendingQuery.data?.pages[0]?.total ?? 0;
  const counts = pendingQuery.data?.pages[0]?.counts ?? {};
  const hasMore = Boolean(pendingQuery.hasNextPage);

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
      <ErrorState
        message={
          pendingQuery.error instanceof Error
            ? pendingQuery.error.message
            : locale === "ar"
              ? "فشل تحميل السجلات"
              : "Failed to load records"
        }
        onRetry={() => void pendingQuery.refetch()}
        retryLabel={locale === "ar" ? "إعادة المحاولة" : "Retry"}
      />
    );
  }

  const summaryTypes: RecordType[] = [
    "CERTIFICATE",
    "PAST_PROJECT",
    "METHODOLOGY_ASSET",
    "CONTENT_LIBRARY_ITEM",
    "STAFF_MEMBER",
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {summaryTypes.map((type) => {
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
                <div className="text-2xl font-semibold">{counts[type] ?? 0}</div>
                <div className="text-xs text-muted-foreground">
                  {locale === "ar" ? label.ar : label.en}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {workspaceQuery.isError ? (
        <ErrorState
          message={
            locale === "ar"
              ? "تعذر التحقق من صلاحيات مساحة العمل"
              : "Could not verify workspace permissions"
          }
          onRetry={() => void workspaceQuery.refetch()}
          retryLabel={locale === "ar" ? "إعادة المحاولة" : "Retry"}
          className="py-4"
        />
      ) : !workspaceQuery.isLoading && !canManage ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-500" />
          <span>
            {locale === "ar"
              ? "يمكن لمالك مساحة العمل أو المسؤول فقط اعتماد أو رفض السجلات."
              : "Only workspace owner or admin can approve or reject records."}
          </span>
        </div>
      ) : null}

      {records.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <CheckCircle2 className="size-12 mx-auto mb-3 text-emerald-500/50" />
          <p className="text-lg font-medium">
            {locale === "ar"
              ? "لا توجد سجلات بانتظار الاعتماد"
              : "No records pending approval"}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {records.map((record) => {
          const Icon = RECORD_TYPE_ICONS[record.recordType];
          const typeLabel = RECORD_TYPE_LABELS[record.recordType];
          const key = `${record.recordType}:${record.id}`;
          const isExpanded = expandedId === key;
          const expiryDate =
            record.expiry.kind === "EXPIRY_DATE" ? record.expiry.date : null;
          const expired =
            record.expiry.kind === "EXPIRY_DATE" ? record.expiry.expired : false;
          const expiringSoon =
            !!expiryDate &&
            !expired &&
            new Date(expiryDate).getTime() - Date.now() <=
              30 * 24 * 60 * 60 * 1000;

          return (
            <div
              key={key}
              className={cn(
                "rounded-lg border bg-card transition-all",
                isExpanded && "ring-2 ring-primary/20"
              )}
            >
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
                    {locale === "ar" ? record.titleAr : record.titleEn}
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {locale === "ar" ? typeLabel.ar : typeLabel.en}
                    </Badge>
                    <span>{formatDate(record.submittedAt)}</span>
                    {expiryDate && (
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3" />
                        {formatDate(expiryDate)}
                      </span>
                    )}
                  </div>
                </div>
                {expired && (
                  <Badge variant="destructive" className="shrink-0">
                    {locale === "ar" ? "منتهي" : "Expired"}
                  </Badge>
                )}
                {expiringSoon && (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-amber-500 text-amber-500"
                  >
                    {locale === "ar" ? "ينتهي قريباً" : "Expiring Soon"}
                  </Badge>
                )}
              </button>

              {isExpanded && canManage && (
                <div className="px-4 pb-4 pt-2 border-t space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                      {locale === "ar" ? "مستند الدليل" : "Evidence Document"}
                    </label>
                    {documentsQuery.isError ? (
                      <p className="text-xs text-destructive" role="alert">
                        {locale === "ar"
                          ? "تعذر تحميل مستندات الدليل."
                          : "Could not load evidence documents."}{" "}
                        <button
                          type="button"
                          className="underline underline-offset-2"
                          onClick={() => void documentsQuery.refetch()}
                        >
                          {locale === "ar" ? "إعادة المحاولة" : "Retry"}
                        </button>
                      </p>
                    ) : (
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
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                      {locale === "ar"
                        ? "سبب الرفض (إن وجد)"
                        : "Rejection Reason (if rejecting)"}
                    </label>
                    <Input
                      value={rejectionReasonsAr[key] ?? ""}
                      onChange={(e) =>
                        setRejectionReasonsAr((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      placeholder="سبب الرفض بالعربية..."
                      dir="rtl"
                      className="h-9 text-sm"
                      maxLength={1000}
                    />
                    <Input
                      value={rejectionReasonsEn[key] ?? ""}
                      onChange={(e) =>
                        setRejectionReasonsEn((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      placeholder="Rejection reason in English..."
                      dir="ltr"
                      className="h-9 text-sm mt-2"
                      maxLength={1000}
                    />
                  </div>

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
                        !rejectionReasonsAr[key]?.trim() ||
                        !rejectionReasonsEn[key]?.trim() ||
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

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pendingQuery.isFetchingNextPage}
            onClick={() => void pendingQuery.fetchNextPage()}
          >
            {pendingQuery.isFetchingNextPage ? (
              <Loader2 className="size-3.5 animate-spin me-2" />
            ) : null}
            {locale === "ar" ? "تحميل المزيد" : "Load more"}
          </Button>
        </div>
      )}

      {total > 0 && (
        <div className="text-center text-xs text-muted-foreground pt-2">
          {locale === "ar"
            ? `${records.length} من ${total} سجل بانتظار الاعتماد`
            : `${records.length} of ${total} record${total !== 1 ? "s" : ""} pending approval`}
        </div>
      )}
    </div>
  );
}

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
