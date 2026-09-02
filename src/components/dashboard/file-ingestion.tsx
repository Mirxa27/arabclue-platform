"use client";

import { apiErrorText } from "@/lib/api-failure-message";

import { startTransition } from "react";

import { useState, useCallback, useRef } from "react";
import { useLocale, useUI } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  UploadCloud,
  FileText,
  FileSpreadsheet,
  FileArchive,
  FileCheck2,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DocCategory } from "@/lib/types";
import type { ApiDocument } from "@/lib/api-types";
import { ListSkeleton } from "./loading-skeletons";
import { DocumentFileViewer } from "./document-file-viewer";
import { useEnsureActiveProject } from "@/hooks/use-ensure-active-project";
import { Switch } from "@/components/ui/switch";
import { shouldAutopilotRun, RUN_STARTED_EVENT } from "@/lib/agents/autopilot";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  category: DocCategory;
  progress: number;
  status: "uploading" | "parsing" | "done" | "error";
  documentId?: string;
  summary?: string;
}

const CATEGORIES: { value: DocCategory; labelKey: string; icon: typeof FileText; color: string }[] = [
  { value: "RFP", labelKey: "cat_RFP", icon: FileText, color: "text-chart-1" },
  { value: "TECHNICAL_SPECS", labelKey: "cat_TECHNICAL_SPECS", icon: FileText, color: "text-chart-2" },
  { value: "IT_CONTRACT", labelKey: "cat_IT_CONTRACT", icon: FileText, color: "text-chart-5" },
  { value: "EA_COMPLIANCE", labelKey: "cat_EA_COMPLIANCE", icon: FileText, color: "text-chart-4" },
  { value: "QUALIFICATION", labelKey: "cat_QUALIFICATION", icon: FileText, color: "text-chart-3" },
  { value: "FINANCIAL", labelKey: "cat_FINANCIAL", icon: FileSpreadsheet, color: "text-emerald-600" },
  { value: "BRAND_ASSET", labelKey: "cat_BRAND_ASSET", icon: FileArchive, color: "text-amber-600" },
];

function guessCategory(filename: string): DocCategory {
  const f = filename.toLowerCase();
  if (f.includes("rfp") || f.includes("كراسة") || f.includes("conditions")) return "RFP";
  if (f.includes("tech") || f.includes("spec") || f.includes("فنية")) return "TECHNICAL_SPECS";
  if (f.includes("contract") || f.includes("عقد")) return "IT_CONTRACT";
  if (f.includes("ea") || f.includes("compliance") || f.includes("امتثال")) return "EA_COMPLIANCE";
  if (f.includes("qual") || f.includes("تأهيل")) return "QUALIFICATION";
  if (f.includes("financ") || f.includes("مالية") || f.includes(".xls")) return "FINANCIAL";
  if (f.includes("logo") || f.includes("brand")) return "BRAND_ASSET";
  return "OTHER";
}

function fileIcon(name: string, mime: string) {
  if (mime.includes("sheet") || name.endsWith(".xlsx") || name.endsWith(".xls")) return FileSpreadsheet;
  if (mime.includes("zip") || name.endsWith(".zip")) return FileArchive;
  return FileText;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FileIngestion() {
  const { locale } = useLocale();
  const { activeProjectId, setActiveProjectId, setView, autopilot, setAutopilot, tenderType } =
    useUI();
  // One autopilot run per upload batch, however many files it holds.
  const autopilotKickedRef = useRef(false);
  const { projects, active } = useEnsureActiveProject();
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  // Empty string = Auto (per-file guess). Default keeps files honest instead of
  // stamping every drop with RFP.
  const [selectedCategory, setSelectedCategory] = useState<DocCategory | "">(
    ""
  );
  const [previewDoc, setPreviewDoc] = useState<ApiDocument | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: docsData, isLoading: docsLoading, isError: docsError, error: docsErr, refetch: refetchDocs } = useQuery({
    queryKey: ["documents", activeProjectId],
    queryFn: async () => {
      const url = activeProjectId
        ? `/api/documents?projectId=${activeProjectId}`
        : "/api/documents";
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(apiErrorText(err, locale));
      }
      return res.json() as Promise<{ documents: ApiDocument[] }>;
    },
  });
  const recentDocs = (docsData?.documents ?? []).slice(0, 5);

  const uploadMutation = useMutation({
    mutationFn: async (payload: { file: File; category: DocCategory }) => {
      if (!activeProjectId) {
        throw new Error(
          locale === "ar"
            ? "اختر مشروعاً نشطاً أولاً"
            : "Select an active project first"
        );
      }
      const form = new FormData();
      form.append("file", payload.file);
      form.append("docCategory", payload.category);
      form.append("projectId", activeProjectId);
      const res = await fetch("/api/documents", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(apiErrorText(err, locale));
      }
      return res.json() as Promise<{ document: ApiDocument }>;
    },
  });

  const openDocumentPreview = useCallback(
    (document: ApiDocument) => {
      if (document.storagePath) {
        setPreviewDoc(document);
        return;
      }
      startTransition(() => setView("documents"));
    },
    [setView]
  );

  const startAutopilotRun = useCallback(
    async (projectId: string | null) => {
      if (!projectId) return;
      try {
        const res = await fetch("/api/agents/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, tenderType, locale }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          runId?: string;
          code?: string;
        };
        if (!res.ok) {
          toast({
            title: locale === "ar" ? "لم يبدأ الطيار الآلي" : "Autopilot did not start",
            description: apiErrorText(body, locale),
            variant: body.code === "AGENT_RUN_IN_PROGRESS" ? "default" : "destructive",
          });
          return;
        }
        window.dispatchEvent(
          new CustomEvent(RUN_STARTED_EVENT, { detail: { runId: body.runId, projectId } })
        );
        toast({
          title: locale === "ar" ? "شغّل الطيار الآلي الوكلاء" : "Autopilot started the agents",
          description:
            locale === "ar"
              ? "اجلس وتابع — سيُفتح العطاء عند الانتهاء."
              : "Sit back and watch — the proposal opens when they finish.",
        });
        startTransition(() => setView("agents"));
      } catch (err) {
        console.error("[autopilot] run request failed", err);
        toast({
          title: locale === "ar" ? "لم يبدأ الطيار الآلي" : "Autopilot did not start",
          description: err instanceof Error ? err.message : "error",
          variant: "destructive",
        });
      }
    },
    [locale, setView, tenderType, toast]
  );

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      if (!activeProjectId) {
        toast({
          title: locale === "ar" ? "لا يوجد مشروع نشط" : "No active project",
          description:
            locale === "ar"
              ? "أنشئ أو اختر مشروعاً قبل رفع الملفات"
              : "Create or select a project before uploading",
          variant: "destructive",
        });
        startTransition(() => setView("projects"));
        return;
      }
      const arr = Array.from(fileList);
      autopilotKickedRef.current = false;
      for (const file of arr) {
        const id = `upload-${crypto.randomUUID()}`;
        const category = selectedCategory || guessCategory(file.name);
        const entry: UploadedFile = {
          id,
          name: file.name,
          size: file.size,
          category,
          progress: 0,
          status: "uploading",
        };
        setFiles((prev) => [entry, ...prev]);

        setFiles((prev) =>
          prev.map((f) => (f.id === id ? { ...f, progress: 40 } : f))
        );

        try {
          setFiles((prev) =>
            prev.map((f) => (f.id === id ? { ...f, status: "parsing", progress: 70 } : f))
          );
          const result = await uploadMutation.mutateAsync({
            file,
            category,
          });
          setFiles((prev) =>
            prev.map((f) =>
              f.id === id
                ? {
                    ...f,
                    status: "done",
                    progress: 100,
                    documentId: result.document.id,
                    summary: result.document.parsedSummary ?? undefined,
                    category,
                  }
                : f
            )
          );
          if (result.document.projectId) {
            setActiveProjectId(result.document.projectId);
          }
          if (result.document.storagePath) {
            setPreviewDoc(result.document);
          }
          qc.invalidateQueries({ queryKey: ["documents"] });
          qc.invalidateQueries({ queryKey: ["stats"] });
          toast({
            title: locale === "ar" ? "تم الرفع" : "Uploaded",
            description: file.name,
          });
          // Autopilot: a tender document landed, so the agents start on it.
          // The run route refuses a second live run itself; that answer is
          // shown, not swallowed.
          if (
            !autopilotKickedRef.current &&
            shouldAutopilotRun({
              autopilot,
              docCategory: result.document.docCategory,
              activeRunStatus: null,
            })
          ) {
            autopilotKickedRef.current = true;
            void startAutopilotRun(result.document.projectId ?? activeProjectId);
          }
        } catch (err) {
          setFiles((prev) =>
            prev.map((f) => (f.id === id ? { ...f, status: "error", progress: 100 } : f))
          );
          toast({
            title: locale === "ar" ? "فشل الرفع" : "Upload failed",
            description: err instanceof Error ? err.message : "error",
            variant: "destructive",
          });
        }
      }
    },
    [
      uploadMutation,
      selectedCategory,
      activeProjectId,
      setActiveProjectId,
      setView,
      qc,
      toast,
      locale,
      autopilot,
      startAutopilotRun,
    ]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  return (
    <Card className="p-0 overflow-hidden border-border/60">
      {/* Header */}
      {/* Wraps: in the projects page's one-third column the title broke over
          three lines and the autopilot label stood in a sliver beside it. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-5 py-4 border-b border-border/60 bg-muted/30">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="size-8 shrink-0 rounded-lg bg-chart-1/10 flex items-center justify-center">
            <UploadCloud className="size-4 text-chart-1" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{tr("section_ingestion", locale)}</h3>
            <p className="text-[11px] text-muted-foreground">
              {locale === "ar" ? "منطقة الإسقاط المركزية" : "Central drop zone"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className="flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
            <span className="text-[11px] font-medium text-foreground/80">
              {locale === "ar" ? "الطيار الآلي" : "Autopilot"}
              <span className="hidden 2xl:inline text-muted-foreground font-normal">
                {locale === "ar" ? " — شغّل الوكلاء بعد الرفع" : " — run the agents after upload"}
              </span>
            </span>
            <Switch
              checked={autopilot}
              onCheckedChange={setAutopilot}
              aria-label={locale === "ar" ? "الطيار الآلي" : "Autopilot"}
            />
          </label>
          <Badge variant="outline" className="bg-background text-[10px] max-w-[10rem] truncate">
            {active
              ? active.title
              : locale === "ar"
                ? "اختر مشروعاً"
                : "Select project"}
          </Badge>
        </div>
      </div>

      <div className="mx-5 mt-4 space-y-2">
        {projects.length > 0 ? (
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {locale === "ar" ? "المشروع النشط للرفع" : "Active project for upload"}
            </span>
            <select
              className="w-full h-9 rounded-md border border-border bg-background px-2.5 text-xs"
              value={activeProjectId ?? ""}
              onChange={(e) => setActiveProjectId(e.target.value || null)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
            <span>
              {locale === "ar"
                ? "أنشئ مشروعاً أولاً قبل رفع الملفات."
                : "Create a project before uploading files."}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] shrink-0"
              onClick={() => startTransition(() => setView("projects"))}
            >
              {locale === "ar" ? "المشاريع" : "Projects"}
            </Button>
          </div>
        )}
      </div>

      {docsError && (
        <div className="mx-5 mt-4 flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          <span>
            {docsErr instanceof Error ? docsErr.message : "Failed to load documents"}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 text-[11px]"
            onClick={() => refetchDocs()}
          >
            {locale === "ar" ? "إعادة المحاولة" : "Retry"}
          </Button>
        </div>
      )}

      {/* Category selector */}
      <div
        className="px-5 pt-4 pb-3 flex flex-wrap gap-1.5"
        role="radiogroup"
        aria-label={
          locale === "ar" ? "تصنيف المستند" : "Document category"
        }
      >
        <button
          type="button"
          role="radio"
          aria-checked={selectedCategory === ""}
          onClick={() => setSelectedCategory("")}
          className={cn(
            "text-[11px] font-medium px-2.5 py-1 rounded-md border transition-all",
            selectedCategory === ""
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
          )}
        >
          {tr("cat_AUTO", locale)}
        </button>
        {CATEGORIES.map((c) => {
          const active = selectedCategory === c.value;
          return (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelectedCategory(c.value)}
              className={cn(
                "text-[11px] font-medium px-2.5 py-1 rounded-md border transition-all",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
              )}
            >
              {tr(c.labelKey, locale)}
            </button>
          );
        })}
      </div>

      {/* Drop zone */}
      <div className="px-5 pb-4">
        <div
          role="button"
          tabIndex={0}
          aria-label={tr("ingest_title", locale)}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={cn(
            "relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            dragOver
              ? "border-primary bg-primary/5 scale-[1.01]"
              : "border-border hover:border-primary/40 hover:bg-muted/30"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div
            className={cn(
              "mx-auto size-14 rounded-2xl flex items-center justify-center mb-3 transition-transform",
              dragOver ? "bg-primary text-primary-foreground scale-110" : "bg-primary/10 text-primary"
            )}
          >
            <UploadCloud className="size-7" />
          </div>
          <p className="text-sm font-semibold mb-1">{tr("ingest_title", locale)}</p>
          <p className="text-xs text-muted-foreground mb-3">{tr("ingest_subtitle", locale)}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={(e) => {
              // Parent drop zone already triggers file picker on click.
              // Stop propagation so it only fires once.
              e.stopPropagation();
              inputRef.current?.click();
            }}
          >
            <UploadCloud className="size-3.5" />
            {tr("ingest_browse", locale)}
          </Button>
          <p className="text-[10px] text-muted-foreground mt-3 font-mono">
            {tr("ingest_supported", locale)}
          </p>
        </div>
      </div>

      {/* Upload queue */}
      {files.length > 0 && (
        <div className="px-5 pb-3 space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
          {files.map((f) => {
            const Icon = fileIcon(f.name, "");
            return (
              <div
                key={f.id}
                className="flex items-center gap-3 p-2.5 rounded-lg border border-border/60 bg-background"
              >
                <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                  <Icon className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium truncate">{f.name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{formatBytes(f.size)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Progress value={f.progress} className="h-1" />
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-8 text-end">
                      {f.progress}%
                    </span>
                  </div>
                </div>
                <div className="shrink-0">
                  {f.status === "uploading" && <Loader2 className="size-4 text-chart-2 animate-spin" />}
                  {f.status === "parsing" && (
                    <Badge variant="outline" className="text-[10px] gap-1 bg-chart-4/10 text-chart-4 border-chart-4/20">
                      <Loader2 className="size-2.5 animate-spin" />
                      {tr("status_PARSING", locale)}
                    </Badge>
                  )}
                  {f.status === "done" && (
                    <Badge variant="outline" className="text-[10px] gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                      <CheckCircle2 className="size-2.5" />
                      {tr("status_PARSED", locale)}
                    </Badge>
                  )}
                  {f.status === "error" && <AlertCircle className="size-4 text-destructive" />}
                </div>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={
                    locale === "ar"
                      ? `إزالة ${f.name}`
                      : `Remove ${f.name}`
                  }
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent uploads */}
      {recentDocs.length > 0 && (
        <div className="border-t border-border/60 px-5 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {locale === "ar" ? "أحدث المستندات" : "Recent documents"}
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-thin">
            {recentDocs.map((d) => {
              const Icon = fileIcon(d.originalName, d.mimeType);
              return (
                <button
                  key={d.id}
                  onClick={() => openDocumentPreview(d)}
                  className="w-full flex items-center gap-2.5 p-1.5 rounded-md hover:bg-muted/50 transition-colors text-start"
                >
                  <Icon className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs truncate flex-1">{d.originalName}</span>
                  <Badge variant="outline" className="text-[9px] shrink-0">
                    {tr(`cat_${d.docCategory}`, locale)}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {previewDoc?.storagePath ? (
        <DocumentFileViewer
          open={!!previewDoc}
          onOpenChange={(open) => {
            if (!open) setPreviewDoc(null);
          }}
          locale={locale}
          title={previewDoc.originalName}
          storagePath={previewDoc.storagePath}
          mimeType={previewDoc.mimeType}
          fileName={previewDoc.originalName}
        />
      ) : null}
    </Card>
  );
}
