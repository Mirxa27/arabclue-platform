"use client";

import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import {
  FileCheck2,
  Download,
  Loader2,
  Eye,
  FileText,
  FileSpreadsheet,
  Presentation,
  CheckCircle2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

function artifactIcon(type: string) {
  if (type === "PPTX") return Presentation;
  if (type === "XLSX") return FileSpreadsheet;
  return FileText;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ProposalsList() {
  const { locale } = useLocale();

  const { data, isLoading } = useQuery({
    queryKey: ["proposals"],
    queryFn: async () => {
      const res = await fetch("/api/proposals");
      return res.json();
    },
  });

  const proposals = data?.proposals ?? [];

  return (
    <Card className="p-0 overflow-hidden border-border/60">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-chart-3/10 flex items-center justify-center">
            <FileCheck2 className="size-4 text-chart-3" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{tr("nav_proposals", locale)}</h3>
            <p className="text-[11px] text-muted-foreground">
              {locale === "ar" ? "العطاءات المُنشأة" : "Generated proposals"}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] font-mono">
          {proposals.length}
        </Badge>
      </div>

      <ScrollArea className="max-h-96">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            {tr("loading", locale)}
          </div>
        ) : proposals.length === 0 ? (
          <div className="p-8 text-center">
            <FileCheck2 className="size-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              {locale === "ar" ? "شغّل الوكلاء لإنشاء عطاء" : "Run agents to generate a proposal"}
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {proposals.map((p: any) => {
              const artifacts = p.artifacts ?? [];
              return (
                <div key={p.id} className="rounded-lg border border-border/60 p-3 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">
                        {locale === "ar" ? p.titleAr ?? p.title : p.title}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {p.project?.etimadRef} · {timeAgo(p.createdAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
                        <CheckCircle2 className="size-2.5" />
                        {tr(`status_${p.status}`, locale)}
                      </Badge>
                      {p.complianceScore != null && (
                        <Badge variant="outline" className="text-[9px] font-mono">
                          {p.complianceScore}%
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Artifacts */}
                  {artifacts.length > 0 && (
                    <div className="grid grid-cols-2 gap-1.5 mt-2">
                      {artifacts.map((a: any, i: number) => {
                        const Icon = artifactIcon(a.type);
                        const fmt =
                          a.type === "ZIP" ? "zip" :
                          a.type === "PDF" ? "pdf" :
                          a.filename.includes("Compliance") ? "xlsx-matrix" :
                          a.filename.includes("BoQ") ? "xlsx-boq" :
                          a.type === "PPTX" ? "slides" : "zip";
                        return (
                          <a
                            key={i}
                            href={`/api/proposals/${p.id}/download?format=${fmt}`}
                            className="flex items-center gap-1.5 p-1.5 rounded-md bg-muted/40 border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-colors group"
                          >
                            <Icon className="size-3 text-muted-foreground group-hover:text-primary shrink-0" />
                            <span className="text-[10px] truncate flex-1">{a.filename}</span>
                            <Download className="size-2.5 text-muted-foreground group-hover:text-primary shrink-0" />
                          </a>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 mt-2">
                    <a href={`/api/proposals/${p.id}/download?format=zip`}>
                      <Button size="sm" className="h-7 text-[10px] gap-1">
                        <Download className="size-2.5" />
                        {tr("download_zip", locale)}
                      </Button>
                    </a>
                    <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1">
                      <Eye className="size-2.5" />
                      {tr("action_view", locale)}
                    </Button>
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
