"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/lib/store";

type ReviewStatus = "UNREVIEWED" | "APPROVED" | "REVOKED";

type EvidenceDocument = {
  id: string;
  originalName: string;
  checksum?: string | null;
  currentVersion: number;
  versions?: Array<{ version: number; checksum?: string | null }>;
};

async function responseError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return payload?.error ?? "Request failed";
}

export function KnowledgeReviewControls({
  endpoint,
  method = "PATCH",
  resourceId,
  reviewStatus,
  queryKeys,
}: {
  endpoint: string;
  method?: "PATCH" | "PUT";
  resourceId: string;
  reviewStatus: ReviewStatus;
  queryKeys: readonly string[];
}) {
  const { locale } = useLocale();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [evidenceId, setEvidenceId] = useState("");
  const [reason, setReason] = useState("");
  const [showRevocation, setShowRevocation] = useState(false);

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

  const updateReview = useMutation({
    mutationFn: async (
      payload:
        | { approved: true; documentId: string }
        | { approved: false; reason: string }
    ) => {
      const body =
        payload.approved === true
          ? {
              id: resourceId,
              approved: true,
              provenance: {
                sourceKind: "UPLOADED_DOCUMENT",
                sourceId: payload.documentId,
              },
            }
          : { id: resourceId, approved: false, reason: payload.reason };
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await responseError(response));
    },
    onSuccess: async () => {
      setReason("");
      setEvidenceId("");
      setShowRevocation(false);
      await Promise.all(
        queryKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey: [queryKey] })
        )
      );
      toast({
        title:
          locale === "ar"
            ? "تم تحديث حالة مراجعة الدليل"
            : "Evidence review status updated",
      });
    },
    onError: (error) => {
      toast({
        title:
          error instanceof Error
            ? error.message
            : locale === "ar"
              ? "تعذر تحديث المراجعة"
              : "Could not update review",
        variant: "destructive",
      });
    },
  });

  const statusLabel =
    reviewStatus === "APPROVED"
      ? locale === "ar"
        ? "دليل معتمد"
        : "Evidence approved"
      : reviewStatus === "REVOKED"
        ? locale === "ar"
          ? "مسحوب"
          : "Revoked"
        : locale === "ar"
          ? "بانتظار مراجعة الدليل"
          : "Awaiting evidence review";

  return (
    <div className="mt-2 space-y-2 rounded-md border border-dashed p-2">
      <Badge
        variant={reviewStatus === "APPROVED" ? "default" : "outline"}
        className="text-[10px]"
      >
        {statusLabel}
      </Badge>
      {!canManage ? (
        <p className="text-[10px] text-muted-foreground">
          {locale === "ar"
            ? "يمكن لمالك مساحة العمل أو المسؤول مراجعة الدليل."
            : "A workspace owner or admin must review the evidence."}
        </p>
      ) : reviewStatus === "APPROVED" ? (
        showRevocation ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={
                locale === "ar" ? "سبب سحب الاعتماد" : "Reason for revocation"
              }
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              variant="destructive"
              disabled={!reason.trim() || updateReview.isPending}
              onClick={() =>
                updateReview.mutate({ approved: false, reason: reason.trim() })
              }
            >
              {locale === "ar" ? "تأكيد السحب" : "Confirm revoke"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowRevocation(false)}
            >
              {locale === "ar" ? "إلغاء" : "Cancel"}
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowRevocation(true)}
          >
            {locale === "ar" ? "سحب الاعتماد" : "Revoke approval"}
          </Button>
        )
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            aria-label={
              locale === "ar" ? "مستند الدليل" : "Evidence document"
            }
            value={evidenceId}
            onChange={(event) => setEvidenceId(event.target.value)}
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">
              {locale === "ar" ? "اختر مستند الدليل" : "Select evidence document"}
            </option>
            {(documentsQuery.data ?? []).map((document) => (
              <option key={document.id} value={document.id}>
                {document.originalName} · v{document.currentVersion}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!evidenceId || updateReview.isPending}
            onClick={() =>
              updateReview.mutate({ approved: true, documentId: evidenceId })
            }
          >
            {locale === "ar" ? "اعتماد الدليل" : "Approve evidence"}
          </Button>
          {documentsQuery.isError ? (
            <p className="text-[10px] text-destructive" role="alert">
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
          ) : !documentsQuery.isLoading &&
            (documentsQuery.data?.length ?? 0) === 0 ? (
            <p className="text-[10px] text-muted-foreground">
              {locale === "ar"
                ? "ارفع مستنداً داعماً في المستندات أولاً."
                : "Upload a supporting document in Documents first."}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
