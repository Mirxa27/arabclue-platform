"use client";

import { useMemo, useState } from "react";
import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  History,
  GitBranch,
  Loader2,
  RotateCcw,
  FileText,
  FileSpreadsheet,
  FileArchive,
  GitCompare,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ApiDocument, ApiDocumentVersion } from "@/lib/api-types";
import { ListSkeleton } from "./loading-skeletons";

function fileIcon(name: string) {
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return FileSpreadsheet;
  if (name.endsWith(".zip")) return FileArchive;
  return FileText;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function VersionHistory() {
  const { locale } = useLocale();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [compare, setCompare] = useState<{
    docId: string;
    a: number;
    b: number;
  } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const res = await fetch("/api/documents");
      if (!res.ok) throw new Error("Failed to load documents");
      return res.json() as Promise<{ documents: ApiDocument[] }>;
    },
  });

  const docs = useMemo(() => {
    const all = data?.documents ?? [];
    const filtered = all.filter((d) =>
      search
        ? d.originalName.toLowerCase().includes(search.toLowerCase())
        : true
    );
    return expanded ? filtered : filtered.slice(0, 6);
  }, [data, search, expanded]);

  const { data: compareData, isLoading: compareLoading } = useQuery({
    queryKey: ["doc-compare", compare?.docId, compare?.a, compare?.b],
    enabled: !!compare,
    queryFn: async () => {
      const res = await fetch(
        `/api/documents/${compare!.docId}/versions/compare?a=${compare!.a}&b=${compare!.b}`
      );
      if (!res.ok) throw new Error("compare failed");
      return res.json();
    },
  });

  const revertMutation = useMutation({
    mutationFn: async ({ docId, version }: { docId: string; version: number }) => {
      const res = await fetch(
        `/api/documents/${docId}/versions/${version}/revert`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "revert failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast({
        title: locale === "ar" ? "تم الاسترجاع" : "Reverted",
      });
    },
    onError: (e: Error) => {
      toast({
        title: locale === "ar" ? "فشل الاسترجاع" : "Revert failed",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Card className="p-0 overflow-hidden border-border/60 h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-chart-4/10 flex items-center justify-center">
            <History className="size-4 text-chart-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{tr("section_versions", locale)}</h3>
            <p className="text-[11px] text-muted-foreground">
              {locale === "ar" ? "سجل إصدارات المستندات" : "Document version timeline"}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-[11px] gap-1"
          onClick={() => setExpanded((v) => !v)}
        >
          <GitBranch className="size-3" />
          {expanded
            ? locale === "ar"
              ? "طي"
              : "Collapse"
            : locale === "ar"
              ? "كل الإصدارات"
              : "All versions"}
        </Button>
      </div>

      {expanded && (
        <div className="px-4 pt-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={locale === "ar" ? "بحث بالاسم..." : "Search by name..."}
            className="h-8 text-xs"
          />
        </div>
      )}

      <ScrollArea className="max-h-96">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            {tr("loading", locale)}
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-xs text-destructive">
            {locale === "ar" ? "تعذر تحميل الإصدارات" : "Failed to load versions"}
          </div>
        ) : docs.length === 0 ? (
          <div className="p-8 text-center">
            <History className="size-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">{tr("no_data", locale)}</p>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {docs.map((d) => {
              const Icon = fileIcon(d.originalName);
              const versions: ApiDocumentVersion[] = d.versions ?? [];
              const fallback: ApiDocumentVersion = {
                id: `${d.id}-current`,
                version: d.currentVersion ?? 1,
                changeLog: "Current",
                sizeBytes: d.sizeBytes,
                createdAt: d.createdAt,
              };
              const rows = versions.length
                ? versions.slice(0, expanded ? 20 : 3)
                : [fallback];
              return (
                <div key={d.id} className="relative ps-6">
                  <div className="absolute start-2 top-2 bottom-0 w-px bg-border" />
                  <div className="absolute start-0 top-1 size-4 rounded-full bg-card border-2 border-primary flex items-center justify-center">
                    <div className="size-1.5 rounded-full bg-primary" />
                  </div>
                  <div className="mb-2">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Icon className="size-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-semibold truncate">{d.originalName}</span>
                      <Badge variant="outline" className="text-[9px] font-mono shrink-0">
                        v{d.currentVersion ?? 1}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {tr(`cat_${d.docCategory}` as Parameters<typeof tr>[0], locale)} ·{" "}
                      {formatBytes(d.sizeBytes)}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {rows.map((v, i) => (
                      <div
                        key={`${d.id}-${v.version}-${i}`}
                        className="flex items-center justify-between gap-2 ps-3 py-1.5 rounded-md hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] font-mono shrink-0",
                              v.version === d.currentVersion &&
                                "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                            )}
                          >
                            v{v.version}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground truncate">
                            {v.changeLog ??
                              (v.version === d.currentVersion
                                ? locale === "ar"
                                  ? "الإصدار الحالي"
                                  : "Current version"
                                : locale === "ar"
                                  ? "إصدار سابق"
                                  : "Previous version")}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {versions.length > 1 && i === 0 && versions[1] && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[10px] gap-1 px-2"
                              onClick={() =>
                                setCompare({
                                  docId: d.id,
                                  a: versions[1].version,
                                  b: versions[0].version,
                                })
                              }
                            >
                              <GitCompare className="size-2.5" />
                              {tr("action_compare", locale)}
                            </Button>
                          )}
                          {v.version !== d.currentVersion && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[10px] gap-1 px-2 hover:text-primary"
                              disabled={revertMutation.isPending}
                              onClick={() =>
                                revertMutation.mutate({
                                  docId: d.id,
                                  version: v.version,
                                })
                              }
                            >
                              <RotateCcw className="size-2.5" />
                              {tr("action_revert", locale)}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <Dialog open={!!compare} onOpenChange={(o) => !o && setCompare(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {tr("action_compare", locale)} v{compare?.a} → v{compare?.b}
            </DialogTitle>
          </DialogHeader>
          {compareLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
              <Loader2 className="size-4 animate-spin" />
              {tr("loading", locale)}
            </div>
          ) : (
            <pre className="text-[10px] font-mono whitespace-pre-wrap bg-muted/40 rounded-md p-3 border border-border/60">
              {(compareData?.summaryDiff ?? []).join("\n") ||
                (locale === "ar" ? "لا فروق في الملخص" : "No summary differences")}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
