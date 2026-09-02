"use client";

import { apiErrorText } from "@/lib/api-failure-message";

import { useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Download,
  FileText,
  History,
  Loader2,
  Save,
  Scale,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale, useUI } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { saveBlob } from "@/lib/download-artifact";
import { ApiClientError, apiJson } from "@/lib/api-client";
import { ContractRevisionHistory } from "./contract-revision-history";
import { ContractAiDraftAction } from "@/components/dashboard/ai-assist-actions";
import { ErrorState } from "@/components/patterns";

interface ContractTemplateCatalogItem {
  key: string;
  versionId: string;
  canonicalHash: string;
  lifecycle: "DRAFT";
  legalReviewStatus: "UNREVIEWED";
  counselReviewRequired: true;
  name: { en: string; ar: string };
  summary: { en: string; ar: string };
  disclaimer: { en: string; ar: string };
  sections: Array<{
    key: string;
    title: { en: string; ar: string };
    clauseCount: number;
  }>;
}

interface ContractTemplateCatalogPayload {
  executionAllowed: false;
  templates: ContractTemplateCatalogItem[];
}

interface SavedContractDraft {
  id: string;
  projectId: string | null;
  templateKey: string;
  templateVersionId: string;
  title: string;
  titleAr: string;
  diagnosticCount: number;
  legalReviewStatus: "UNREVIEWED";
  counselReviewRequired: true;
  isExecutable: false;
  createdAt: string;
}

interface SavedContractDraftListPayload {
  executionAllowed: false;
  drafts: SavedContractDraft[];
  nextCursor: string | null;
}

interface SavedContractDraftReadPayload {
  executionAllowed: false;
  draft: {
    summary: SavedContractDraft;
    contentHtml: string;
  };
}

export function ContractTemplateCatalog() {
  const { locale } = useLocale();
  const { activeProjectId } = useUI();
  const ar = locale === "ar";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const retryRequestIds = useRef(new Map<string, string>());
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["contract-template-catalog"],
    queryFn: async () => {
      const response = await fetch("/api/contracts/templates", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`Template catalog failed (${response.status})`);
      }
      return (await response.json()) as ContractTemplateCatalogPayload;
    },
  });
  const {
    data: savedDraftPages,
    isError: savedDraftsError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch: refetchSavedDrafts,
  } = useInfiniteQuery({
    queryKey: ["contract-drafts", activeProjectId],
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ limit: "20" });
      if (activeProjectId) query.set("projectId", activeProjectId);
      if (pageParam) query.set("cursor", pageParam);
      return apiJson<SavedContractDraftListPayload>(
        `/api/contracts/drafts?${query.toString()}`,
        {
          credentials: "include",
          cache: "no-store",
        }
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const savedDrafts =
    savedDraftPages?.pages.flatMap((page) => page.drafts) ?? [];
  const [historyDraftId, setHistoryDraftId] = useState<string | null>(null);

  const deleteDraft = useMutation({
    mutationFn: (draft: SavedContractDraft) =>
      apiJson<{
        deletedId: string;
        releasedStorageBytes: number;
      }>(`/api/contracts/drafts/${encodeURIComponent(draft.id)}`, {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["contract-drafts", activeProjectId],
      });
      toast({
        title: ar ? "تم حذف المسودة" : "Draft deleted",
        description: ar
          ? "تم تحرير سعة المسودات في مساحة العمل."
          : "Workspace draft capacity has been released.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: ar ? "تعذر حذف المسودة" : "Draft deletion failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const saveDraft = useMutation({
    mutationFn: async ({
      template,
      clientRequestId,
    }: {
      template: ContractTemplateCatalogItem;
      clientRequestId: string;
    }) =>
      apiJson<{
        created: boolean;
        draft: SavedContractDraft;
        executionAllowed: false;
      }>("/api/contracts/drafts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateKey: template.key,
          expectedVersionId: template.versionId,
          expectedCanonicalHash: template.canonicalHash,
          clientRequestId,
          mode: "PREVIEW",
          bindings: {},
          projectId: activeProjectId,
        }),
      }),
    onSuccess: (result, variables) => {
      if (
        retryRequestIds.current.get(variables.template.key) ===
        variables.clientRequestId
      ) {
        retryRequestIds.current.delete(variables.template.key);
      }
      void queryClient.invalidateQueries({
        queryKey: ["contract-drafts", activeProjectId],
      });
      toast({
        title: ar ? "تم حفظ مسودة آمنة" : "Safe draft saved",
        description: ar
          ? "المسودة غير مراجعة وغير قابلة للتوقيع حتى إكمال المتغيرات والمراجعة القانونية."
          : "The draft remains unreviewed and non-executable until variables and counsel review are complete.",
      });
    },
    onError: (error: Error, variables) => {
      if (
        error instanceof ApiClientError &&
        error.status < 500 &&
        retryRequestIds.current.get(variables.template.key) ===
          variables.clientRequestId
      ) {
        retryRequestIds.current.delete(variables.template.key);
      }
      toast({
        title: ar ? "تعذر حفظ المسودة" : "Draft save failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function saveTemplateDraft(template: ContractTemplateCatalogItem) {
    const clientRequestId =
      retryRequestIds.current.get(template.key) ?? crypto.randomUUID();
    retryRequestIds.current.set(template.key, clientRequestId);
    saveDraft.mutate({ template, clientRequestId });
  }

  function confirmDeleteSavedDraft(draft: SavedContractDraft) {
    const confirmed = window.confirm(
      ar
        ? "هل تريد حذف هذه المسودة غير المراجعة؟ لا يمكن التراجع عن هذا الإجراء."
        : "Delete this unreviewed draft? This action cannot be undone."
    );
    if (confirmed) deleteDraft.mutate(draft);
  }

  async function downloadPreview(
    template: ContractTemplateCatalogItem,
    format: "html" | "pdf"
  ) {
    const key = `${template.key}:${format}`;
    setBusy(key);
    try {
      const response = await fetch(
        `/api/contracts/templates/${encodeURIComponent(
          template.key
        )}/preview?format=${format}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "PREVIEW", bindings: {} }),
        }
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(apiErrorText(body, locale, `Preview failed (${response.status})`));
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition");
      const filename =
        disposition?.match(/filename="?([^";]+)"?/i)?.[1] ??
        `${template.key}-unreviewed-draft.${format}`;
      saveBlob(blob, filename);
      toast({
        title: ar ? "تم تنزيل المسودة" : "Draft preview downloaded",
        description: filename,
      });
    } catch (error) {
      toast({
        title: ar ? "تعذرت المعاينة" : "Preview unavailable",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  async function downloadSavedDraft(draft: SavedContractDraft) {
    const key = `${draft.id}:stored-html`;
    setBusy(key);
    try {
      const payload = await apiJson<SavedContractDraftReadPayload>(
        `/api/contracts/drafts/${encodeURIComponent(draft.id)}`,
        { credentials: "include", cache: "no-store" }
      );
      const filename = `${draft.templateKey}-${draft.id}-unreviewed-draft.html`;
      saveBlob(
        new Blob([payload.draft.contentHtml], {
          type: "text/html;charset=utf-8",
        }),
        filename
      );
      toast({
        title: ar ? "تم تنزيل المسودة المحفوظة" : "Saved draft downloaded",
        description: filename,
      });
    } catch (error) {
      toast({
        title: ar ? "تعذر تنزيل المسودة" : "Saved draft unavailable",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="contract-template-catalog-heading">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3
            id="contract-template-catalog-heading"
            className="text-sm font-semibold"
          >
            {ar ? "قوالب العقود الثنائية" : "Bilingual contract templates"}
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            {ar
              ? "سبع مسودات منظمة للمعاينة أو الحفظ داخل مساحة العمل. جميعها غير مراجعة وغير قابلة للتوقيع، وتتطلب مراجعة محامٍ سعودي مؤهل."
              : "Seven structured drafts for preview or workspace-safe persistence. Every template is unreviewed, non-executable, and requires qualified Saudi counsel review."}
          </p>
        </div>
        <Badge variant="destructive">
          {ar ? "غير مراجع · غير قابل للتوقيع" : "Unreviewed · non-executable"}
        </Badge>
      </div>

      {isLoading ? (
        <Card className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {ar ? "جاري تحميل القوالب…" : "Loading templates…"}
        </Card>
      ) : isError ? (
        <Card className="border-destructive/40">
          <ErrorState
            message={
              ar ? "تعذر تحميل كتالوج القوالب." : "Could not load template catalog."
            }
            onRetry={() => void refetch()}
            retryLabel={ar ? "إعادة المحاولة" : "Retry"}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data?.templates ?? []).map((template) => (
            <Card key={template.key} className="flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-700 dark:text-teal-300">
                  <Scale className="size-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold">
                    {ar ? template.name.ar : template.name.en}
                  </h4>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {template.versionId} · {template.sections.length}{" "}
                    {ar ? "أقسام" : "sections"}
                  </p>
                </div>
              </div>
              <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                {ar ? template.summary.ar : template.summary.en}
              </p>
              <div className="mt-auto flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null || saveDraft.isPending}
                  onClick={() => void downloadPreview(template, "html")}
                >
                  {busy === `${template.key}:html` ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <FileText className="size-3.5" />
                  )}
                  HTML
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy !== null || saveDraft.isPending}
                  onClick={() => void downloadPreview(template, "pdf")}
                >
                  {busy === `${template.key}:pdf` ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                  PDF
                </Button>
                <Button
                  size="sm"
                  disabled={busy !== null || saveDraft.isPending}
                  onClick={() => saveTemplateDraft(template)}
                >
                  {saveDraft.isPending &&
                  saveDraft.variables?.template.key === template.key ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Save className="size-3.5" />
                  )}
                  {ar ? "حفظ مسودة" : "Save draft"}
                </Button>
                <ContractAiDraftAction
                  locale={locale}
                  templateKey={template.key}
                  projectTitle={ar ? template.name.ar : template.name.en}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      {savedDrafts.length > 0 ? (
        <div className="mt-4" aria-labelledby="saved-contract-drafts-heading">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4
              id="saved-contract-drafts-heading"
              className="text-xs font-semibold"
            >
              {ar ? "المسودات المحفوظة" : "Saved catalog drafts"}
            </h4>
            <span className="text-[11px] text-muted-foreground">
              {activeProjectId
                ? ar
                  ? "للمشروع النشط"
                  : "Active project"
                : ar
                  ? "كل مساحة العمل"
                  : "Entire workspace"}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {savedDrafts.map((draft) => (
              <Card key={draft.id} className="p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">
                      {ar ? draft.titleAr : draft.title}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {draft.templateVersionId} ·{" "}
                      {new Intl.DateTimeFormat(ar ? "ar-SA" : "en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(draft.createdAt))}
                    </p>
                    <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
                      {ar
                        ? `${draft.diagnosticCount} عناصر تحتاج الإكمال · غير قابل للتوقيع`
                        : `${draft.diagnosticCount} completion diagnostics · non-executable`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        busy !== null ||
                        saveDraft.isPending ||
                        deleteDraft.isPending
                      }
                      onClick={() =>
                        setHistoryDraftId((current) =>
                          current === draft.id ? null : draft.id
                        )
                      }
                    >
                      <History className="size-3.5" />
                      {ar ? "السجل" : "History"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        busy !== null ||
                        saveDraft.isPending ||
                        deleteDraft.isPending
                      }
                      onClick={() => void downloadSavedDraft(draft)}
                    >
                      {busy === `${draft.id}:stored-html` ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Download className="size-3.5" />
                      )}
                      HTML
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={
                        busy !== null ||
                        saveDraft.isPending ||
                        deleteDraft.isPending
                      }
                      aria-label={
                        ar
                          ? `حذف ${draft.titleAr}`
                          : `Delete ${draft.title}`
                      }
                      onClick={() => confirmDeleteSavedDraft(draft)}
                    >
                      {deleteDraft.isPending &&
                      deleteDraft.variables?.id === draft.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                      {ar ? "حذف" : "Delete"}
                    </Button>
                  </div>
                </div>
                {historyDraftId === draft.id ? (
                  <ContractRevisionHistory
                    contractId={draft.id}
                    locale={ar ? "ar" : "en"}
                  />
                ) : null}
              </Card>
            ))}
          </div>
          {hasNextPage ? (
            <div className="mt-3 flex justify-center">
              <Button
                size="sm"
                variant="outline"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : null}
                {ar ? "تحميل المزيد" : "Load more"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {savedDraftsError ? (
        <div className="mt-3" role="alert" aria-live="polite">
          <ErrorState
            message={
              ar
                ? "تعذر تحميل المسودات المحفوظة."
                : "Saved drafts could not be loaded."
            }
            onRetry={() => void refetchSavedDrafts()}
            retryLabel={ar ? "إعادة المحاولة" : "Retry"}
            className="py-4"
          />
        </div>
      ) : null}
    </section>
  );
}
