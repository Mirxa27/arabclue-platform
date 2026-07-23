"use client";

import { useState } from "react";
import { useLocale, useUI } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  FolderKanban,
  Plus,
  CircleDot,
  FileText,
  FileCheck2,
  Bot,
  ShieldCheck,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Panel,
  EmptyState,
  QueryState,
  ConfirmDialog,
} from "@/components/patterns";
import { apiJson } from "@/lib/api-client";
import { ListSkeleton } from "./loading-skeletons";
import { TenderSetupWizard } from "./tender-setup-wizard";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground border-border",
  PARSING: "bg-chart-4/10 text-chart-4 border-chart-4/20",
  DRAFTING: "bg-chart-5/10 text-chart-5 border-chart-5/20",
  REVIEW: "bg-chart-2/10 text-chart-2 border-chart-2/20",
  SUBMITTED: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  ARCHIVED: "bg-muted text-muted-foreground border-border",
};

type ProjectRow = {
  id: string;
  title: string;
  status: string;
  etimadRef: string;
  category?: string | null;
  complianceScore: number;
  budget?: number | null;
  currency?: string;
  submissionDeadline?: string | null;
  _count?: {
    documents: number;
    agentRuns: number;
    complianceChecks: number;
    proposals: number;
  };
  latestAgentRun?: { status: string; overallProgress: number } | null;
};

export function ProjectsList() {
  const { locale } = useLocale();
  const { setView, setActiveProjectId } = useUI();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiJson<{ projects: ProjectRow[] }>("/api/projects"),
    refetchInterval: 6000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiJson(`/api/projects/${id}`, { method: "DELETE" });
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setActiveProjectId(null);
      setDeleteId(null);
      toast({
        title: locale === "ar" ? "تم حذف المشروع" : "Project deleted",
        description: id.slice(0, 8),
      });
    },
    onError: (err: Error) => {
      toast({
        title: locale === "ar" ? "فشل الحذف" : "Delete failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const projects = data?.projects ?? [];
  const ar = locale === "ar";

  return (
    <>
      <Panel
        icon={FolderKanban}
        tone="primary"
        title={tr("nav_projects", locale)}
        subtitle={ar ? "مشاريع المناقصات النشطة" : "Active tender projects"}
        actions={
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-[11px]"
            onClick={() => setOpen(true)}
          >
            <Plus className="size-3" />
            {ar ? "مناقصة جديدة" : "New tender"}
          </Button>
        }
      >
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          <QueryState
            isLoading={isLoading}
            isError={isError}
            errorMessage={error instanceof Error ? error.message : undefined}
            isEmpty={projects.length === 0}
            onRetry={() => refetch()}
            locale={locale}
            loading={<ListSkeleton rows={3} />}
            empty={
              <EmptyState
                icon={FolderKanban}
                title={tr("no_data", locale)}
                action={
                  <Button size="sm" onClick={() => setOpen(true)}>
                    <Plus className="size-3 me-1" />
                    {ar ? "إعداد أول مناقصة" : "Set up first tender"}
                  </Button>
                }
              />
            }
          >
            <div className="divide-y divide-border/40">
              {projects.map((p) => (
                <div key={p.id} className="relative group">
                  <button
                    onClick={() => {
                      setActiveProjectId(p.id);
                      setView("overview");
                    }}
                    className="w-full p-4 hover:bg-muted/40 transition-colors text-start"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{p.title}</p>
                        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                          {p.etimadRef}
                          {p.category ? ` · ${p.category}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            STATUS_COLORS[p.status] ?? STATUS_COLORS.DRAFT
                          )}
                        >
                          {p.status}
                        </Badge>
                        <ChevronRight className="size-3.5 text-muted-foreground" />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <FileText className="size-3" />
                        {p._count?.documents ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Bot className="size-3" />
                        {p._count?.agentRuns ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <FileCheck2 className="size-3" />
                        {p._count?.proposals ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ShieldCheck className="size-3" />
                        {p._count?.complianceChecks ?? 0}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>{ar ? "الامتثال" : "Compliance"}</span>
                          <span className="font-mono font-semibold">
                            {p.complianceScore}%
                          </span>
                        </div>
                        <Progress value={p.complianceScore} className="h-1" />
                      </div>
                      {p.latestAgentRun ? (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                          <CircleDot
                            className={cn(
                              "size-2",
                              p.latestAgentRun.status === "RUNNING"
                                ? "text-chart-4 animate-pulse"
                                : "text-emerald-500"
                            )}
                          />
                          <span className="font-mono">
                            {p.latestAgentRun.overallProgress}%
                          </span>
                        </div>
                      ) : null}
                    </div>

                    {p.budget ? (
                      <div className="mt-2 text-[10px] text-muted-foreground">
                        <span className="font-mono font-semibold text-foreground">
                          {p.currency} {Number(p.budget).toLocaleString()}
                        </span>
                        {p.submissionDeadline ? (
                          <span className="ms-2">
                            · {ar ? "آخر تقديم" : "Due"}:{" "}
                            {new Date(p.submissionDeadline).toLocaleDateString(
                              ar ? "ar-SA" : "en-US"
                            )}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="absolute top-3 end-3 size-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteId(p.id);
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </QueryState>
        </div>
      </Panel>

      <TenderSetupWizard open={open} onOpenChange={setOpen} />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
        title={ar ? "حذف المشروع" : "Delete project"}
        description={
          ar
            ? "حذف هذا المشروع وجميع بياناته؟ لا يمكن التراجع."
            : "Delete this project and all its data? This cannot be undone."
        }
        confirmLabel={ar ? "حذف" : "Delete"}
        cancelLabel={ar ? "إلغاء" : "Cancel"}
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteId) deleteMutation.mutate(deleteId);
        }}
      />
    </>
  );
}
