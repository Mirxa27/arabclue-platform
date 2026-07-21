"use client";

import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import {
  History,
  GitBranch,
  Loader2,
  RotateCcw,
  FileText,
  FileSpreadsheet,
  FileArchive,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

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

  const { data, isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const res = await fetch("/api/documents");
      return res.json();
    },
  });

  const docs = (data?.documents ?? []).filter((d: any) => (d._count?.versions ?? 0) > 0).slice(0, 6);

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
        <Button variant="ghost" size="sm" className="text-[11px] gap-1">
          <GitBranch className="size-3" />
          {locale === "ar" ? "كل الإصدارات" : "All versions"}
        </Button>
      </div>

      <ScrollArea className="max-h-96">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            {tr("loading", locale)}
          </div>
        ) : docs.length === 0 ? (
          <div className="p-8 text-center">
            <History className="size-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">{tr("no_data", locale)}</p>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {docs.map((d: any) => {
              const Icon = fileIcon(d.originalName);
              return (
                <div key={d.id} className="relative ps-6">
                  {/* timeline line */}
                  <div className="absolute start-2 top-2 bottom-0 w-px bg-border" />
                  {/* node */}
                  <div className="absolute start-0 top-1 size-4 rounded-full bg-card border-2 border-primary flex items-center justify-center">
                    <div className="size-1.5 rounded-full bg-primary" />
                  </div>
                  <div className="mb-2">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Icon className="size-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-semibold truncate">{d.originalName}</span>
                      <Badge variant="outline" className="text-[9px] font-mono shrink-0">
                        v{d.currentVersion}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {tr(`cat_${d.docCategory}`, locale)} · {formatBytes(d.sizeBytes)}
                    </div>
                  </div>
                  {/* version entries would come from /api/documents/[id]/versions; show current */}
                  <div className="space-y-1.5">
                    {Array.from({ length: Math.min(d._count?.versions ?? 1, 3) }).map((_, i) => {
                      const ver = d.currentVersion - i;
                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-2 ps-3 py-1.5 rounded-md hover:bg-muted/40 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[9px] font-mono shrink-0",
                                i === 0 && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              )}
                            >
                              v{ver}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground truncate">
                              {i === 0
                                ? locale === "ar" ? "الإصدار الحالي" : "Current version"
                                : locale === "ar" ? `إصدار سابق` : `Previous version`}
                            </span>
                          </div>
                          {i > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[10px] gap-1 px-2 hover:text-primary"
                            >
                              <RotateCcw className="size-2.5" />
                              {tr("action_revert", locale)}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}
