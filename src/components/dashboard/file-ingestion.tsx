"use client";

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
  const { setActiveProjectId, setView } = useUI();
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<DocCategory>("RFP");
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: docsData } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const res = await fetch("/api/documents");
      return res.json();
    },
  });
  const recentDocs = (docsData?.documents ?? []).slice(0, 5);

  const uploadMutation = useMutation({
    mutationFn: async (file: { name: string; size: number; mime: string; category: DocCategory }) => {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalName: file.name,
          mimeType: file.mime,
          sizeBytes: file.size,
          docCategory: file.category,
          storagePath: `/uploads/${Date.now()}-${file.name}`,
        }),
      });
      if (!res.ok) throw new Error("upload failed");
      return res.json();
    },
  });

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const arr = Array.from(fileList);
      for (const file of arr) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const category = guessCategory(file.name);
        const entry: UploadedFile = {
          id,
          name: file.name,
          size: file.size,
          category,
          progress: 0,
          status: "uploading",
        };
        setFiles((prev) => [entry, ...prev]);

        // Simulate upload progress
        for (let p = 10; p <= 90; p += 20) {
          await new Promise((r) => setTimeout(r, 80));
          setFiles((prev) =>
            prev.map((f) => (f.id === id ? { ...f, progress: p } : f))
          );
        }

        try {
          entry.status = "parsing";
          setFiles((prev) =>
            prev.map((f) => (f.id === id ? { ...f, status: "parsing", progress: 95 } : f))
          );
          const result = await uploadMutation.mutateAsync({
            name: file.name,
            size: file.size,
            mime: file.type || "application/octet-stream",
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
                    summary: result.document.parsedSummary,
                  }
                : f
            )
          );
          qc.invalidateQueries({ queryKey: ["documents"] });
          qc.invalidateQueries({ queryKey: ["stats"] });
          if (result.document.projectId) setActiveProjectId(result.document.projectId);
          toast({
            title: locale === "ar" ? "تم رفع المستند" : "Document uploaded",
            description: `${file.name} → ${tr(`cat_${category}`, locale)}`,
          });
        } catch (e) {
          setFiles((prev) =>
            prev.map((f) => (f.id === id ? { ...f, status: "error", progress: 100 } : f))
          );
          toast({
            variant: "destructive",
            title: locale === "ar" ? "فشل الرفع" : "Upload failed",
            description: file.name,
          });
        }
      }
    },
    [uploadMutation, qc, locale, toast, setActiveProjectId]
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
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-chart-1/10 flex items-center justify-center">
            <UploadCloud className="size-4 text-chart-1" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{tr("section_ingestion", locale)}</h3>
            <p className="text-[11px] text-muted-foreground">
              {locale === "ar" ? "منطقة الإسقاط المركزية" : "Central drop zone"}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="bg-background text-[10px] font-mono">
          NCA · PDPL · EA
        </Badge>
      </div>

      {/* Category selector */}
      <div className="px-5 pt-4 pb-3 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => {
          const active = selectedCategory === c.value;
          return (
            <button
              key={c.value}
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
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all",
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
          <Button size="sm" variant="outline" className="gap-1.5">
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
                  onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
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
            {recentDocs.map((d: any) => {
              const Icon = fileIcon(d.originalName, d.mimeType);
              return (
                <button
                  key={d.id}
                  onClick={() => setView("documents")}
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
    </Card>
  );
}
