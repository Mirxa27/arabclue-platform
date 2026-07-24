"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  FileCheck2,
  Download,
  Eye,
  FileText,
  FileSpreadsheet,
  Presentation,
  CheckCircle2,
  Pencil,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Panel, EmptyState, QueryState } from "@/components/patterns";
import { ProposalEditorDialog } from "./proposal-editor";
import { DocumentPreviewFrame } from "./document-preview-frame";
import { apiJson } from "@/lib/api-client";
import type { ApiProposal, ApiProposalArtifact } from "@/lib/api-types";
import { useArtifactDownload } from "@/hooks/use-artifact-download";
import { formatPercent } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ArtifactDownloadFormat } from "@/lib/download-artifact";

function artifactIcon(type: string) {
  if (type === "PPTX" || type === "HTML") return Presentation;
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

function parseArtifacts(p: ApiProposal): ApiProposalArtifact[] {
  if (Array.isArray(p.artifacts)) return p.artifacts;
  if (p.artifactsJson) {
    try {
      const parsed: unknown = JSON.parse(p.artifactsJson);
      return Array.isArray(parsed) ? (parsed as ApiProposalArtifact[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function artifactFormat(a: ApiProposalArtifact): ArtifactDownloadFormat {
  if (a.type === "ZIP") return "zip";
  if (a.type === "PDF") return "pdf";
  if (a.filename.includes("Compliance")) return "xlsx-matrix";
  if (a.filename.includes("BoQ")) return "xlsx-boq";
  if (
    a.type === "PPTX" ||
    a.type === "HTML" ||
    a.filename.includes("Slides")
  ) {
    return "slides";
  }
  if (a.downloadPath?.includes("format=")) {
    const fmt = a.downloadPath.split("format=")[1]?.split("&")[0];
    if (
      fmt === "pdf" ||
      fmt === "html" ||
      fmt === "zip" ||
      fmt === "manifest" ||
      fmt === "xlsx-matrix" ||
      fmt === "xlsx-boq" ||
      fmt === "slides" ||
      fmt === "pptx"
    ) {
      return fmt;
    }
  }
  return "zip";
}

export function ProposalsList() {
  const { locale } = useLocale();
  const { toast } = useToast();
  const [editId, setEditId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const { download, busyFormat } = useArtifactDownload();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["proposals"],
    queryFn: () => apiJson<{ proposals: ApiProposal[] }>("/api/proposals"),
  });

  useEffect(() => {
    if (!isError) return;
    toast({
      title: locale === "ar" ? "فشل التحميل" : "Load failed",
      description: error instanceof Error ? error.message : "error",
      variant: "destructive",
    });
  }, [isError, error, locale, toast]);

  const proposals = (data?.proposals ?? []).filter((p) => p.type !== "CONTRACT");

  return (
    <>
      <Panel
        icon={FileCheck2}
        tone="success"
        title={tr("nav_proposals", locale)}
        subtitle={
          locale === "ar" ? "العطاءات المُنشأة" : "Generated proposals"
        }
        actions={
          <Badge variant="outline" className="text-[10px] font-mono tabular-nums">
            {proposals.length}
          </Badge>
        }
      >
        <ScrollArea className="max-h-96">
          <QueryState
            isLoading={isLoading}
            isError={isError}
            errorMessage={error instanceof Error ? error.message : undefined}
            isEmpty={proposals.length === 0}
            onRetry={() => refetch()}
            locale={locale}
            empty={
              <EmptyState
                icon={FileCheck2}
                title={
                  locale === "ar"
                    ? "شغّل الوكلاء لإنشاء عطاء"
                    : "Run agents to generate a proposal"
                }
              />
            }
          >
            <div className="p-3 space-y-2">
              {proposals.map((p) => {
                const artifacts = parseArtifacts(p);
                return (
                  <div
                    key={p.id}
                    className="rounded-xl border border-border/50 p-3.5 hover:border-border hover:shadow-sm transition-all bg-card"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate tracking-tight">
                          {locale === "ar" ? (p.titleAr ?? p.title) : p.title}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {p.project?.etimadRef} · {timeAgo(p.createdAt)}
                          {p.locale ? ` · ${p.locale}` : ""}
                          {p.version ? ` · v${p.version}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge
                          variant="outline"
                          className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1"
                        >
                          <CheckCircle2 className="size-2.5" />
                          {tr(`status_${p.status}`, locale)}
                        </Badge>
                        {p.status === "APPROVED" || p.status === "EXPORTED" ? (
                          <Badge className="text-[9px] bg-emerald-600">
                            {locale === "ar" ? "جاهز" : "Export-ready"}
                          </Badge>
                        ) : p.status === "IN_REVIEW" ||
                          p.status === "REVIEW" ? (
                          <Badge
                            variant="outline"
                            className="text-[9px] text-amber-700 border-amber-500/30"
                          >
                            {locale === "ar" ? "مراجعة" : "In review"}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[9px] text-muted-foreground"
                          >
                            {locale === "ar" ? "مسودة" : "Not ready"}
                          </Badge>
                        )}
                        {p.complianceScore != null && (
                          <Badge
                            variant="outline"
                            className="text-[9px] font-mono tabular-nums"
                          >
                            {formatPercent(p.complianceScore)}%
                          </Badge>
                        )}
                      </div>
                    </div>

                    {artifacts.length > 0 && (
                      <div className="grid grid-cols-2 gap-1.5 mt-2">
                        {artifacts.map((a, i) => {
                          const Icon = artifactIcon(a.type);
                          const fmt = artifactFormat(a);
                          const busy = busyFormat === fmt;
                          return (
                            <button
                              key={`${a.filename}-${i}`}
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void download({
                                  proposalId: p.id,
                                  format: fmt,
                                  fallbackName: a.filename,
                                  locale,
                                })
                              }
                              className="flex items-center gap-1.5 p-1.5 rounded-lg bg-muted/40 border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-colors group text-start disabled:opacity-60"
                            >
                              <Icon className="size-3 text-muted-foreground group-hover:text-primary shrink-0" />
                              <span className="text-[10px] truncate flex-1">
                                {a.filename}
                              </span>
                              <Download className="size-2.5 text-muted-foreground group-hover:text-primary shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-border/40">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px] gap-1"
                        onClick={() => setEditId(p.id)}
                      >
                        <Pencil className="size-3" />
                        {locale === "ar" ? "تحرير" : "Edit"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px] gap-1"
                        onClick={() => setPreviewId(p.id)}
                      >
                        <Eye className="size-3" />
                        {locale === "ar" ? "معاينة" : "Preview"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px] gap-1 ms-auto"
                        disabled={busyFormat === "zip"}
                        onClick={() =>
                          void download({
                            proposalId: p.id,
                            format: "zip",
                            fallbackName: "Arabclue_Bid_Package.zip",
                            locale,
                          })
                        }
                      >
                        <Download className="size-3" />
                        ZIP
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </QueryState>
        </ScrollArea>
      </Panel>

      {editId && (
        <ProposalEditorDialog
          proposalId={editId}
          open={!!editId}
          onOpenChange={(o) => {
            if (!o) setEditId(null);
          }}
        />
      )}

      <Dialog
        open={Boolean(previewId)}
        onOpenChange={(o) => {
          if (!o) setPreviewId(null);
        }}
      >
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 py-3 border-b border-border/60">
            <DialogTitle>
              {locale === "ar" ? "معاينة المستند" : "Document preview"}
            </DialogTitle>
          </DialogHeader>
          {previewId ? (
            <div className="p-4 overflow-auto">
              <DocumentPreviewFrame
                locale={locale}
                proposalId={previewId}
                defaultMode="html"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
