"use client";

import { useState } from "react";
import { useLocale, useUI } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  FileSpreadsheet,
  FileArchive,
  Trash2,
  Eye,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Download,
  Filter,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { DocCategory } from "@/lib/types";
import type { ApiDocument } from "@/lib/api-types";
import { ListSkeleton } from "./loading-skeletons";

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

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function DocumentMatrix() {
  const { locale } = useLocale();
  const { setView, setActiveProjectId } = useUI();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useStateLocal<DocCategory | "ALL">("docFilter", "ALL");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const res = await fetch("/api/documents");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          typeof err.error === "string" ? err.error : "Failed to load documents"
        );
      }
      return res.json() as Promise<{ documents: ApiDocument[] }>;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          typeof err.error === "string" ? err.error : "Delete failed"
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast({ title: locale === "ar" ? "تم الحذف" : "Document deleted" });
    },
    onError: (err: Error) => {
      toast({
        title: locale === "ar" ? "فشل الحذف" : "Delete failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const docs = (data?.documents ?? []).filter(
    (d) => filter === "ALL" || d.docCategory === filter
  );

  const categories: (DocCategory | "ALL")[] = [
    "ALL", "RFP", "TECHNICAL_SPECS", "IT_CONTRACT", "EA_COMPLIANCE", "QUALIFICATION", "FINANCIAL",
  ];

  return (
    <Card className="p-0 overflow-hidden border-border/60">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-chart-1/10 flex items-center justify-center">
            <FileText className="size-4 text-chart-1" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{tr("section_matrix", locale)}</h3>
            <p className="text-[11px] text-muted-foreground">
              {locale === "ar" ? `${docs.length} مستند` : `${docs.length} documents`}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] font-mono gap-1">
          <Filter className="size-2.5" />
          {filter === "ALL" ? (locale === "ar" ? "الكل" : "All") : tr(`cat_${filter}`, locale)}
        </Badge>
      </div>

      {/* Filter chips */}
      <div className="px-5 py-2.5 flex flex-wrap gap-1.5 border-b border-border/60 overflow-x-auto scrollbar-thin">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={cn(
              "text-[10px] font-medium px-2 py-0.5 rounded border whitespace-nowrap transition-colors",
              filter === c
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-primary/40"
            )}
          >
            {c === "ALL" ? (locale === "ar" ? "الكل" : "All") : tr(`cat_${c}`, locale)}
          </button>
        ))}
      </div>

      <div className="max-h-96 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <ListSkeleton rows={4} />
        ) : isError ? (
          <div className="p-8 text-center space-y-2">
            <AlertCircle className="size-8 text-destructive/50 mx-auto" />
            <p className="text-xs text-destructive">
              {error instanceof Error ? error.message : "Error"}
            </p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              {locale === "ar" ? "إعادة المحاولة" : "Retry"}
            </Button>
          </div>
        ) : docs.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="size-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">{tr("no_data", locale)}</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-wider h-8">
                  {locale === "ar" ? "المستند" : "Document"}
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8">
                  {locale === "ar" ? "الفئة" : "Category"}
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8 hidden md:table-cell">
                  {locale === "ar" ? "الحالة" : "Status"}
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8 hidden lg:table-cell">
                  {locale === "ar" ? "الإصدار" : "Version"}
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8 hidden sm:table-cell">
                  {locale === "ar" ? "الحجم" : "Size"}
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8 hidden lg:table-cell">
                  {locale === "ar" ? "منذ" : "Updated"}
                </TableHead>
                <TableHead className="h-8 w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d) => {
                const Icon = fileIcon(d.originalName, d.mimeType);
                return (
                  <TableRow key={d.id} className="group hover:bg-muted/40">
                    <TableCell className="py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="size-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                          <Icon className="size-3.5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate max-w-[200px]">{d.originalName}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{d.uploadedBy?.name}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[9px] font-mono">
                        {tr(`cat_${d.docCategory}` as Parameters<typeof tr>[0], locale)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {d.parseStatus === "PARSED" && (
                        <Badge variant="outline" className="text-[10px] gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          <CheckCircle2 className="size-2.5" />
                          {tr("status_PARSED", locale)}
                        </Badge>
                      )}
                      {d.parseStatus === "PARSING" && (
                        <Badge variant="outline" className="text-[10px] gap-1 bg-chart-4/10 text-chart-4 border-chart-4/20">
                          <Loader2 className="size-2.5 animate-spin" />
                          {tr("status_PARSING", locale)}
                        </Badge>
                      )}
                      {d.parseStatus === "FAILED" && (
                        <Badge variant="outline" className="text-[10px] gap-1 bg-destructive/10 text-destructive border-destructive/20">
                          <AlertCircle className="size-2.5" />
                          {tr("status_FAILED", locale)}
                        </Badge>
                      )}
                      {d.parseStatus === "PENDING" && (
                        <Badge variant="outline" className="text-[10px] gap-1 bg-muted text-muted-foreground">
                          <Clock className="size-2.5" />
                          {tr("status_PENDING", locale)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-[10px] font-mono text-muted-foreground">v{d.currentVersion ?? 1}</span>
                      {(d._count?.versions ?? 0) > 1 && (
                        <span className="text-[9px] text-muted-foreground"> ({d._count?.versions})</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-[10px] font-mono text-muted-foreground">
                      {formatBytes(d.sizeBytes)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-[10px] text-muted-foreground">
                      {timeAgo(d.updatedAt ?? d.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          title={locale === "ar" ? "مصفوفة المتطلبات" : "Requirements matrix"}
                          onClick={() => {
                            if (d.projectId) setActiveProjectId(d.projectId);
                            setView("compliance");
                          }}
                        >
                          <Eye className="size-3" />
                        </Button>
                        {d.storagePath && (
                          <a
                            href={`/api/files?path=${encodeURIComponent(d.storagePath)}&download=1&name=${encodeURIComponent(d.originalName)}`}
                            download={d.originalName}
                          >
                            <Button size="icon" variant="ghost" className="size-7" title={locale === "ar" ? "تنزيل" : "Download"}>
                              <Download className="size-3" />
                            </Button>
                          </a>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 hover:text-destructive"
                          onClick={() => deleteMutation.mutate(d.id)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </Card>
  );
}

// Small localStorage-backed state helper (lazy initial read, no effect)
function useStateLocal<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key);
      if (s) return JSON.parse(s) as T;
    } catch {}
    return initial;
  });
  const set = (nv: T) => {
    setV(nv);
    try {
      localStorage.setItem(key, JSON.stringify(nv));
    } catch {}
  };
  return [v, set];
}
