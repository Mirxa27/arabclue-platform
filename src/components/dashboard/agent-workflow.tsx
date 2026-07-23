"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useLocale, useUI } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Bot,
  Play,
  Loader2,
  CheckCircle2,
  CircleDashed,
  FileSearch,
  ShieldCheck,
  Network,
  Calculator,
  PenLine,
  Scale,
  Sparkles,
  ChevronRight,
  Square,
  FolderKanban,
  AlertCircle,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RadialGauge } from "./radial-gauge";
import { cn } from "@/lib/utils";
import { AGENTS } from "@/lib/constants";
import type { AgentState, AgentId } from "@/lib/types";

const AGENT_META: Record<
  AgentId,
  { icon: typeof Bot; color: string; bg: string; ring: string }
> = {
  INGESTION: {
    icon: FileSearch,
    color: "text-sky-600",
    bg: "bg-sky-500/15",
    ring: "text-sky-500",
  },
  COMPLIANCE_REGULATORY: {
    icon: ShieldCheck,
    color: "text-indigo-600",
    bg: "bg-indigo-500/15",
    ring: "text-indigo-500",
  },
  TECHNICAL_ARCHITECT: {
    icon: Network,
    color: "text-violet-600",
    bg: "bg-violet-500/15",
    ring: "text-violet-500",
  },
  FINANCIAL_QUALIFICATION: {
    icon: Calculator,
    color: "text-emerald-600",
    bg: "bg-emerald-500/15",
    ring: "text-emerald-500",
  },
  PROPOSAL_DRAFTING: {
    icon: PenLine,
    color: "text-amber-600",
    bg: "bg-amber-500/15",
    ring: "text-amber-500",
  },
  LAW_CONTRACT: {
    icon: Scale,
    color: "text-teal-700 dark:text-teal-300",
    bg: "bg-teal-500/15",
    ring: "text-teal-600",
  },
};

function idleStates(): AgentState[] {
  return AGENTS.map((a) => ({
    id: a.id,
    name: a.id,
    nameAr: a.id,
    status: "pending" as const,
    progress: 0,
    findings: [],
  }));
}

function normalizeStatus(s: string | undefined): AgentState["status"] {
  const v = (s || "pending").toLowerCase();
  if (v === "running" || v === "completed" || v === "failed" || v === "pending") {
    return v;
  }
  if (v === "done") return "completed";
  if (v === "error") return "failed";
  return "pending";
}

export function AgentWorkflow() {
  const { locale } = useLocale();
  const { tenderType, activeProjectId, setView } = useUI();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [runId, setRunId] = useState<string | null>(null);
  const [agentStates, setAgentStates] = useState<AgentState[]>(idleStates);
  const [overall, setOverall] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [llmFallback, setLlmFallback] = useState(false);
  const [llmProvider, setLlmProvider] = useState<string | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);
  const [coveragePercent, setCoveragePercent] = useState<number | null>(null);
  const [exportReady, setExportReady] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: projectMeta } = useQuery({
    queryKey: ["project-brief", activeProjectId],
    enabled: !!activeProjectId,
    queryFn: async () => {
      const res = await fetch(`/api/projects/${activeProjectId}`);
      if (!res.ok) return null;
      return res.json() as Promise<{
        project?: { title?: string; titleAr?: string; etimadRef?: string | null };
      }>;
    },
  });

  function applyStatusPayload(
    data: {
      runId?: string;
      status?: string;
      overallProgress?: number;
      agentStates?: AgentState[];
      finalArtifact?: {
        fallback?: boolean;
        provider?: string | null;
        proposalId?: string;
        contractId?: string;
        coverage?: { coveragePercent?: number };
        exportReady?: boolean;
      } | null;
      proposalId?: string | null;
      contractId?: string | null;
      coveragePercent?: number | null;
      exportReady?: boolean | null;
      errorMessage?: string | null;
    },
    opts?: { hydrateOnly?: boolean }
  ) {
    if (data.runId) setRunId(data.runId);
    if (Array.isArray(data.agentStates) && data.agentStates.length) {
      const byId = new Map(
        data.agentStates.map((a) => [
          a.id,
          { ...a, status: normalizeStatus(a.status) },
        ])
      );
      setAgentStates(
        AGENTS.map((def) => {
          const live = byId.get(def.id);
          return (
            live ?? {
              id: def.id,
              name: def.id,
              nameAr: def.id,
              status: "pending" as const,
              progress: 0,
              findings: [],
            }
          );
        })
      );
    }
    setOverall(data.overallProgress ?? 0);
    setRunStatus(data.status ?? null);
    setErrorMessage(data.errorMessage ?? null);

    const fa = data.finalArtifact;
    if (fa) {
      setLlmFallback(!!fa.fallback);
      setLlmProvider(fa.provider ?? null);
      setProposalId(data.proposalId ?? fa.proposalId ?? null);
      setContractId(data.contractId ?? fa.contractId ?? null);
      setCoveragePercent(
        data.coveragePercent ?? fa.coverage?.coveragePercent ?? null
      );
      setExportReady(data.exportReady ?? fa.exportReady ?? null);
    }

    const status = data.status;
    if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED") {
      setCompleted(true);
    } else if (status === "RUNNING" || status === "QUEUED") {
      if (!opts?.hydrateOnly) setCompleted(false);
      else setCompleted(false);
    }
  }

  // Hydrate last run for the active project so the pipeline isn't blank.
  useEffect(() => {
    if (!activeProjectId || runId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/agents/status?projectId=${encodeURIComponent(activeProjectId)}`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!data.runId || cancelled) return;
        applyStatusPayload(data, { hydrateOnly: true });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, runId]);

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!activeProjectId) {
        throw new Error(
          locale === "ar"
            ? "اختر مشروعاً نشطاً أولاً"
            : "Select an active project first"
        );
      }
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: activeProjectId, tenderType, locale }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "run failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setRunId(data.runId);
      setCompleted(false);
      setOverall(0);
      setRunStatus("RUNNING");
      setErrorMessage(null);
      setLlmFallback(false);
      setLlmProvider(null);
      setProposalId(null);
      setContractId(null);
      setCoveragePercent(null);
      setExportReady(null);
      if (Array.isArray(data.agentStates) && data.agentStates.length) {
        setAgentStates(data.agentStates);
      } else {
        setAgentStates(idleStates());
      }
      toast({
        title: locale === "ar" ? "بدأ سير عمل الوكلاء" : "Agent workflow started",
        description:
          locale === "ar"
            ? "6 وكلاء يعملون بالتتابع — راقب التقدم أدناه"
            : "6 agents running in sequence — watch live progress below",
      });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (err: Error) => {
      if (err.message.includes("project") || err.message.includes("مشروع")) {
        setView("projects");
      }
      toast({
        title: locale === "ar" ? "تعذر التشغيل" : "Could not start",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!runId) throw new Error("no run");
      const res = await fetch("/api/agents/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "cancel failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setCompleted(true);
      setRunStatus("CANCELLED");
      toast({
        title: locale === "ar" ? "تم الإلغاء" : "Run cancelled",
      });
    },
  });

  useEffect(() => {
    if (!runId || completed) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/agents/status?runId=${runId}`);
        const data = await res.json();
        applyStatusPayload(data);
        if (data.status === "COMPLETED") {
          toast({
            title:
              locale === "ar"
                ? "اكتمل إنشاء العطاء والعقد"
                : "Proposal & contract complete",
            description: data.finalArtifact?.fallback
              ? locale === "ar"
                ? "تم الإنشاء بوضع احتياطي (بدون LLM خارجي)"
                : `Generated via ${data.finalArtifact?.provider ?? "deterministic"} fallback`
              : locale === "ar"
                ? "العطاء + مسودة العقد الثنائية جاهزان للمراجعة"
                : "Proposal + bilingual contract draft ready for review",
          });
          qc.invalidateQueries({ queryKey: ["stats"] });
          qc.invalidateQueries({ queryKey: ["proposals"] });
          qc.invalidateQueries({ queryKey: ["compliance"] });
          return;
        }
        if (data.status === "FAILED" || data.status === "CANCELLED") {
          toast({
            title:
              data.status === "CANCELLED"
                ? locale === "ar"
                  ? "تم إلغاء التشغيل"
                  : "Run cancelled"
                : locale === "ar"
                  ? "فشل سير العمل"
                  : "Agent workflow failed",
            description: data.errorMessage ?? "error",
            variant: data.status === "CANCELLED" ? "default" : "destructive",
          });
          return;
        }
        pollRef.current = setTimeout(poll, 900);
      } catch (e) {
        console.error("poll error", e);
      }
    };
    poll();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
     
  }, [runId, completed, locale, toast, qc]);

  const running = !!runId && !completed && (runStatus === "RUNNING" || runStatus === "QUEUED" || (!runStatus && !!runId && !completed));
  const doneCount = agentStates.filter((a) => a.status === "completed").length;
  const activeAgent = agentStates.find((a) => a.status === "running");

  const projectTitle = useMemo(() => {
    const p = projectMeta?.project;
    if (!p) return null;
    return locale === "ar" ? p.titleAr || p.title : p.title;
  }, [projectMeta, locale]);

  return (
    <Card className="p-0 overflow-hidden border-border/70 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border/60 bg-gradient-to-br from-violet-500/8 via-background to-sky-500/8">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "size-10 rounded-xl flex items-center justify-center bg-violet-500/15 ring-1 ring-violet-500/20",
              running && "agent-pulse"
            )}
          >
            <Bot className="size-5 text-violet-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold">
                {tr("section_agents", locale)}
              </h3>
              {running ? (
                <Badge className="bg-violet-600 hover:bg-violet-600 text-[10px]">
                  {locale === "ar" ? "يعمل الآن" : "Live"}
                </Badge>
              ) : completed && runStatus === "COMPLETED" ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600 text-[10px]">
                  {locale === "ar" ? "مكتمل" : "Completed"}
                </Badge>
              ) : completed && runStatus === "FAILED" ? (
                <Badge variant="destructive" className="text-[10px]">
                  {locale === "ar" ? "فشل" : "Failed"}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  {locale === "ar" ? "جاهز" : "Ready"}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-foreground/70 mt-0.5">
              {running && activeAgent
                ? locale === "ar"
                  ? `يعمل الآن: ${tr(`agent_${activeAgent.id}_name`, locale)} · ${doneCount}/6`
                  : `Now running: ${tr(`agent_${activeAgent.id}_name`, locale)} · ${doneCount}/6`
                : locale === "ar"
                  ? "خط أنابيب من 6 وكلاء — استيعاب → امتثال → فني → مالي → صياغة → عقد"
                  : "6-agent pipeline — ingest → compliance → technical → finance → draft → contract"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="gap-1.5"
            >
              <Square className="size-3.5" />
              {locale === "ar" ? "إيقاف" : "Stop"}
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => {
              if (!activeProjectId) {
                toast({
                  title:
                    locale === "ar" ? "لا يوجد مشروع نشط" : "No active project",
                  description:
                    locale === "ar"
                      ? "أنشئ أو اختر مشروعاً أولاً"
                      : "Create or select a project first",
                  variant: "destructive",
                });
                setView("projects");
                return;
              }
              runMutation.mutate();
            }}
            disabled={running || runMutation.isPending}
            className="gap-1.5"
          >
            {running || runMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            {running
              ? tr("status_RUNNING", locale)
              : completed
                ? locale === "ar"
                  ? "إعادة التشغيل"
                  : "Run again"
                : tr("action_run_agents", locale)}
          </Button>
        </div>
      </div>

      {/* Project context */}
      <div className="px-5 py-2.5 border-b border-border/50 bg-muted/40 flex flex-wrap items-center gap-2 text-[11px]">
        <FolderKanban className="size-3.5 text-muted-foreground" />
        {activeProjectId && projectTitle ? (
          <>
            <span className="font-medium text-foreground truncate max-w-[280px]">
              {projectTitle}
            </span>
            {projectMeta?.project?.etimadRef ? (
              <Badge variant="secondary" className="font-mono text-[10px]">
                {projectMeta.project.etimadRef}
              </Badge>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            onClick={() => setView("projects")}
            className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium hover:underline"
          >
            <AlertCircle className="size-3.5" />
            {locale === "ar"
              ? "اختر مشروعاً نشطاً لتشغيل الوكلاء"
              : "Select an active project to run agents"}
          </button>
        )}
        {(running || (completed && overall > 0)) && (
          <span className="ms-auto font-mono font-bold tabular-nums text-sm text-violet-700 dark:text-violet-300">
            {Math.round(overall)}%
          </span>
        )}
      </div>

      {/* Overall progress — always show when we have a run */}
      {(running || (completed && overall > 0)) && (
        <div className="px-5 py-3 border-b border-border/50 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground/70 flex items-center gap-1.5 font-medium">
              <Sparkles className="size-3.5 text-amber-500" />
              {locale === "ar" ? "التقدم الإجمالي" : "Overall progress"}
            </span>
            <span className="text-muted-foreground">
              {doneCount}/6 {locale === "ar" ? "وكلاء" : "agents"}
            </span>
          </div>
          <Progress value={overall} className="h-2.5 bg-slate-200 dark:bg-slate-700" />
          {/* Mini pipeline strip */}
          <div className="flex items-center gap-1 pt-1">
            {agentStates.map((a, i) => {
              const meta = AGENT_META[a.id];
              const done = a.status === "completed";
              const live = a.status === "running";
              const failed = a.status === "failed";
              return (
                <div key={a.id} className="flex items-center gap-1 flex-1 min-w-0">
                  <div
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition-colors",
                      done && "bg-emerald-500",
                      live && "bg-violet-500 animate-pulse",
                      failed && "bg-destructive",
                      !done && !live && !failed && "bg-slate-200 dark:bg-slate-700"
                    )}
                    title={tr(`agent_${a.id}_name`, locale)}
                  />
                  {i < agentStates.length - 1 ? (
                    <ChevronRight className="size-2.5 text-muted-foreground shrink-0 opacity-50" />
                  ) : null}
                  <span className="sr-only">
                    {meta ? tr(`agent_${a.id}_name`, locale) : a.id}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agent cards — always visible */}
      <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {agentStates.map((a, idx) => {
          const meta = AGENT_META[a.id] ?? {
            icon: Bot,
            color: "text-muted-foreground",
            bg: "bg-muted",
            ring: "text-muted-foreground",
          };
          const Icon = meta.icon;
          const isRunning = a.status === "running";
          const isDone = a.status === "completed";
          const isFailed = a.status === "failed";
          const isPending = a.status === "pending";
          const pct = isDone ? 100 : Math.round(a.progress || 0);

          return (
            <div
              key={a.id}
              className={cn(
                "rounded-xl border p-3.5 transition-all",
                isRunning &&
                  "border-violet-500/50 bg-violet-500/8 shadow-[0_0_0_1px_rgba(139,92,246,0.12)]",
                isDone && "border-emerald-500/35 bg-emerald-500/6",
                isFailed && "border-destructive/40 bg-destructive/5",
                isPending && "border-border/80 bg-card"
              )}
            >
              <div className="flex items-start gap-3">
                <RadialGauge
                  value={pct}
                  size={52}
                  strokeWidth={5}
                  trackClassName={
                    isRunning
                      ? "text-violet-200 dark:text-violet-900"
                      : "text-slate-300 dark:text-slate-600"
                  }
                  className={cn(
                    isDone
                      ? "text-emerald-500"
                      : isRunning
                        ? "text-violet-500"
                        : isFailed
                          ? "text-destructive"
                          : meta.ring + "/40"
                  )}
                  ariaLabel={`${tr(`agent_${a.id}_name`, locale)} ${pct}%`}
                >
                  <div
                    className={cn(
                      "size-9 rounded-full flex items-center justify-center",
                      meta.bg,
                      isRunning && "agent-pulse"
                    )}
                  >
                    <Icon className={cn("size-4", meta.color)} />
                  </div>
                </RadialGauge>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-semibold text-muted-foreground">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <span className="text-xs font-semibold truncate">
                          {tr(`agent_${a.id}_name`, locale)}
                        </span>
                      </div>
                      <p className="text-[11px] text-foreground/65 mt-0.5 line-clamp-2 leading-snug">
                        {isRunning && a.findings?.[0]
                          ? a.findings[0]
                          : tr(`agent_${a.id}_desc`, locale)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={cn(
                          "text-[11px] font-mono font-bold tabular-nums",
                          isDone && "text-emerald-600",
                          isRunning && "text-violet-600",
                          isFailed && "text-destructive",
                          isPending && "text-muted-foreground"
                        )}
                      >
                        {pct}%
                      </span>
                      {isDone && (
                        <CheckCircle2 className="size-3.5 text-emerald-600" />
                      )}
                      {isRunning && (
                        <Loader2 className="size-3.5 text-violet-600 animate-spin" />
                      )}
                      {isFailed && (
                        <XCircle className="size-3.5 text-destructive" />
                      )}
                      {isPending && (
                        <CircleDashed className="size-3.5 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {(isRunning || isDone) && a.findings && a.findings.length > 0 && (
                    <ul className="mt-2 space-y-1 border-t border-border/50 pt-2">
                      {a.findings.slice(0, isDone ? 3 : 2).map((f, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-1.5 text-[10px] text-foreground/70"
                        >
                          <ChevronRight className="size-2.5 mt-0.5 shrink-0 text-violet-500" />
                          <span className="leading-relaxed">{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {a.output && isDone && (
                    <div className="mt-2 text-[10px] text-emerald-800 dark:text-emerald-300 bg-emerald-500/10 rounded-md px-2 py-1.5 border border-emerald-500/20">
                      ✓ {a.output}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {errorMessage && runStatus === "FAILED" && (
        <div className="mx-3 mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          {errorMessage}
        </div>
      )}

      {completed && runStatus === "COMPLETED" && (
        <div className="mx-3 mb-3 rounded-xl bg-gradient-to-br from-emerald-500/12 to-teal-500/10 border border-emerald-500/25 p-3.5 flex flex-wrap items-center gap-3">
          <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              {locale === "ar"
                ? "تم إنشاء العطاء ومسودة العقد"
                : "Proposal & contract draft ready"}
            </div>
            <div className="text-[11px] text-foreground/65 mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
              {coveragePercent != null && (
                <span>
                  {locale === "ar" ? "تغطية" : "Coverage"}: {coveragePercent}%
                </span>
              )}
              {exportReady != null && (
                <span>
                  {exportReady
                    ? locale === "ar"
                      ? "جاهز للتصدير"
                      : "Export-ready"
                    : locale === "ar"
                      ? "يحتاج مراجعة التحقق"
                      : "Needs validation review"}
                </span>
              )}
              {contractId && (
                <span>
                  {locale === "ar" ? "عقد ثنائي اللغة" : "Bilingual contract"}
                </span>
              )}
              {llmProvider && (
                <span className="font-mono">
                  LLM: {llmProvider}
                  {llmFallback
                    ? locale === "ar"
                      ? " (احتياطي)"
                      : " (fallback)"
                    : ""}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-8 text-[11px]"
              onClick={() => setView("proposals")}
              disabled={!proposalId && !completed}
            >
              {locale === "ar" ? "فتح العطاء" : "Open proposal"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[11px] gap-1"
              onClick={() => setView("contracts")}
            >
              <Scale className="size-3" />
              {locale === "ar" ? "العقد" : "Contract"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
