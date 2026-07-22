"use client";

import { useState } from "react";
import { useLocale, useUI } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  FolderKanban,
  Loader2,
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Panel,
  EmptyState,
  QueryState,
  ConfirmDialog,
} from "@/components/patterns";
import { apiJson } from "@/lib/api-client";
import { ListSkeleton } from "./loading-skeletons";
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
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("IT");
  const [budget, setBudget] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiJson<{ projects: ProjectRow[] }>("/api/projects"),
    refetchInterval: 6000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiJson<{ project?: { id: string } }>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category,
          budget: budget ? Number(budget) : null,
        }),
      });
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setOpen(false);
      setTitle("");
      setBudget("");
      if (data.project?.id) {
        setActiveProjectId(data.project.id);
        setView("overview");
      }
      toast({
        title: locale === "ar" ? "تم إنشاء المشروع" : "Project created",
      });
    },
    onError: (err: Error) => {
      toast({
        title: locale === "ar" ? "فشل الإنشاء" : "Create failed",
        description: err.message,
        variant: "destructive",
      });
    },
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

  return (
    <>
    <Panel
      icon={FolderKanban}
      tone="primary"
      title={tr("nav_projects", locale)}
      subtitle={
        locale === "ar" ? "مشاريع المناقصات النشطة" : "Active tender projects"
      }
      actions={
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-[11px]"
          onClick={() => setOpen(true)}
        >
          <Plus className="size-3" />
          {locale === "ar" ? "مشروع جديد" : "New project"}
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
                  {locale === "ar" ? "إنشاء أول مشروع" : "Create first project"}
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
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold truncate">{p.title}</span>
                      <Badge
                        variant="outline"
                        className={cn("text-[9px] font-mono shrink-0", STATUS_COLORS[p.status])}
                      >
                        {tr(`status_${p.status}`, locale)}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {p.etimadRef} · {p.category ?? "IT"}
                    </div>
                  </div>
                  <ChevronRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 rtl:rotate-180" />
                </div>

                <div className="grid grid-cols-4 gap-2 mb-2">
                  <MiniStat
                    icon={FileText}
                    value={p._count?.documents ?? 0}
                    label={locale === "ar" ? "مستندات" : "docs"}
                    color="text-chart-1"
                  />
                  <MiniStat
                    icon={Bot}
                    value={p._count?.agentRuns ?? 0}
                    label={locale === "ar" ? "تشغيل" : "runs"}
                    color="text-chart-5"
                  />
                  <MiniStat
                    icon={ShieldCheck}
                    value={p._count?.complianceChecks ?? 0}
                    label={locale === "ar" ? "ضوابط" : "ctrl"}
                    color="text-emerald-600"
                  />
                  <MiniStat
                    icon={FileCheck2}
                    value={p._count?.proposals ?? 0}
                    label={locale === "ar" ? "عطاءات" : "props"}
                    color="text-chart-3"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-[10px] mb-0.5">
                      <span className="text-muted-foreground">
                        {locale === "ar" ? "الامتثال" : "Compliance"}
                      </span>
                      <span className="font-mono font-semibold">{p.complianceScore}%</span>
                    </div>
                    <Progress value={p.complianceScore} className="h-1" />
                  </div>
                  {p.latestAgentRun && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                      <CircleDot
                        className={cn(
                          "size-2",
                          p.latestAgentRun.status === "RUNNING"
                            ? "text-chart-4 animate-pulse"
                            : "text-emerald-500"
                        )}
                      />
                      <span className="font-mono">{p.latestAgentRun.overallProgress}%</span>
                    </div>
                  )}
                </div>

                {p.budget && (
                  <div className="mt-2 text-[10px] text-muted-foreground">
                    <span className="font-mono font-semibold text-foreground">
                      {p.currency} {Number(p.budget).toLocaleString()}
                    </span>
                    {p.submissionDeadline && (
                      <span className="ms-2">
                        · {locale === "ar" ? "آخر تقديم" : "Due"}:{" "}
                        {new Date(p.submissionDeadline).toLocaleDateString(
                          locale === "ar" ? "ar-SA" : "en-US"
                        )}
                      </span>
                    )}
                  </div>
                )}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {locale === "ar" ? "إنشاء مشروع مناقصة" : "Create tender project"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>{locale === "ar" ? "عنوان المشروع" : "Project title"}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={locale === "ar" ? "مثلاً: منصة الخدمات الرقمية" : "e.g. Digital Services Platform"}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{locale === "ar" ? "التصنيف" : "Category"}</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{locale === "ar" ? "الميزانية (SAR)" : "Budget (SAR)"}</Label>
              <Input
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="5000000"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {locale === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              disabled={!title.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending && <Loader2 className="size-3.5 animate-spin me-1.5" />}
              {locale === "ar" ? "إنشاء" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
        title={locale === "ar" ? "حذف المشروع" : "Delete project"}
        description={
          locale === "ar"
            ? "حذف هذا المشروع وجميع بياناته؟ لا يمكن التراجع."
            : "Delete this project and all its data? This cannot be undone."
        }
        confirmLabel={locale === "ar" ? "حذف" : "Delete"}
        cancelLabel={locale === "ar" ? "إلغاء" : "Cancel"}
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteId) deleteMutation.mutate(deleteId);
        }}
      />
    </>
  );
}

function MiniStat({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: typeof FileText;
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5 p-1 rounded-md bg-muted/30">
      <Icon className={cn("size-3", color)} />
      <div className="min-w-0">
        <div className="text-[11px] font-bold tabular-nums leading-none">{value}</div>
        <div className="text-[8px] text-muted-foreground leading-none mt-0.5">{label}</div>
      </div>
    </div>
  );
}
