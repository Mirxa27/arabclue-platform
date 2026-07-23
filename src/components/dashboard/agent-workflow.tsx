"use client";

import { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RadialGauge } from "./radial-gauge";
import { cn } from "@/lib/utils";
import type { AgentState, AgentId } from "@/lib/types";

const AGENT_META: Record<AgentId, { icon: typeof Bot; color: string; bg: string }> = {
  INGESTION: { icon: FileSearch, color: "text-chart-2", bg: "bg-chart-2/10" },
  COMPLIANCE_REGULATORY: { icon: ShieldCheck, color: "text-emerald-600", bg: "bg-emerald-500/10" },
  TECHNICAL_ARCHITECT: { icon: Network, color: "text-chart-5", bg: "bg-chart-5/10" },
  FINANCIAL_QUALIFICATION: { icon: Calculator, color: "text-chart-3", bg: "bg-chart-3/10" },
  PROPOSAL_DRAFTING: { icon: PenLine, color: "text-chart-4", bg: "bg-chart-4/10" },
  LAW_CONTRACT: { icon: Scale, color: "text-teal-700 dark:text-teal-300", bg: "bg-teal-500/10" },
};

export function AgentWorkflow() {
  const { locale } = useLocale();
  const { tenderType, activeProjectId, setView } = useUI();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [runId, setRunId] = useState<string | null>(null);
  const [agentStates, setAgentStates] = useState<AgentState[]>([]);
  const [overall, setOverall] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [llmFallback, setLlmFallback] = useState(false);
  const [llmProvider, setLlmProvider] = useState<string | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);
  const [coveragePercent, setCoveragePercent] = useState<number | null>(null);
  const [exportReady, setExportReady] = useState<boolean | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setLlmFallback(false);
      setLlmProvider(null);
      setAgentStates(data.agentStates);
      setProposalId(null);
      setContractId(null);
      toast({
        title: locale === "ar" ? "بدأ سير عمل الوكلاء" : "Agent workflow started",
        description:
          locale === "ar"
            ? "6 وكلاء — بما فيهم القانون والعقود"
            : "6 AI agents — including Law & Contract",
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
      toast({
        title: locale === "ar" ? "تم الإلغاء" : "Run cancelled",
      });
    },
  });

  // Poll status
  useEffect(() => {
    if (!runId || completed) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/agents/status?runId=${runId}`);
        const data = await res.json();
        setAgentStates(data.agentStates ?? []);
        setOverall(data.overallProgress ?? 0);
        if (data.finalArtifact) {
          setLlmFallback(!!data.finalArtifact.fallback);
          setLlmProvider(data.finalArtifact.provider ?? null);
          setProposalId(data.proposalId ?? data.finalArtifact.proposalId ?? null);
          setContractId(
            data.contractId ?? data.finalArtifact.contractId ?? null
          );
          setCoveragePercent(
            data.coveragePercent ??
              data.finalArtifact.coverage?.coveragePercent ??
              null
          );
          setExportReady(
            data.exportReady ?? data.finalArtifact.exportReady ?? null
          );
        }
        if (data.status === "COMPLETED") {
          setCompleted(true);
          const fb = data.finalArtifact?.fallback;
          toast({
            title: locale === "ar" ? "اكتمل إنشاء العطاء والعقد" : "Proposal & contract complete",
            description: fb
              ? locale === "ar"
                ? "تم الإنشاء بوضع احتياطي (بدون LLM خارجي)"
                : `Generated via ${data.finalArtifact?.provider ?? "deterministic"} fallback`
              : locale === "ar"
                ? "العطاء + مسودة العقد الثنائية جاهزان للمراجعة القانونية"
                : "Proposal + bilingual contract draft ready for legal review",
          });
          qc.invalidateQueries({ queryKey: ["stats"] });
          qc.invalidateQueries({ queryKey: ["proposals"] });
          qc.invalidateQueries({ queryKey: ["compliance"] });
          return;
        }
        if (data.status === "FAILED" || data.status === "CANCELLED") {
          setCompleted(true);
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

  const running = !!runId && !completed;

  return (
    <Card className="p-0 overflow-hidden border-border/60">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className={cn("size-8 rounded-lg flex items-center justify-center", running && "agent-pulse", "bg-chart-5/10")}>
            <Bot className="size-4 text-chart-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{tr("section_agents", locale)}</h3>
            <p className="text-[11px] text-muted-foreground">
              {locale === "ar" ? "6 وكلاء ذكاء اصطناعي متخصصون" : "6 specialized AI agents"}
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
            {locale === "ar" ? "إلغاء" : "Cancel"}
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => {
            if (!activeProjectId) {
              toast({
                title: locale === "ar" ? "لا يوجد مشروع نشط" : "No active project",
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
          disabled={running}
          className="gap-1.5"
        >
          {running ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          {running
            ? tr("status_RUNNING", locale)
            : tr("action_run_agents", locale)}
        </Button>
        </div>
      </div>

      {/* Overall progress */}
      {running && (
        <div className="px-5 py-3 border-b border-border/60">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="size-3 text-chart-4" />
              {locale === "ar" ? "التقدم الإجمالي" : "Overall progress"}
            </span>
            <span className="font-mono font-bold tabular-nums">{overall}%</span>
          </div>
          <Progress value={overall} className="h-1.5" />
        </div>
      )}

      {/* Agents list */}
      <div className="p-3 space-y-2">
        {agentStates.length === 0 && !running && (
          <div className="py-8 text-center">
            <div className="mx-auto size-12 rounded-full bg-muted flex items-center justify-center mb-2">
              <Bot className="size-5 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">
              {locale === "ar"
                ? "اضغط تشغيل الوكلاء لبدء معالجة العطاء"
                : "Click Run Agents to start tender processing"}
            </p>
          </div>
        )}
        {agentStates.map((a, idx) => {
          const meta = AGENT_META[a.id] ?? {
            icon: Bot,
            color: "text-muted-foreground",
            bg: "bg-muted",
          };
          const Icon = meta.icon;
          const isRunning = a.status === "running";
          const isDone = a.status === "completed";
          const isPending = a.status === "pending";
          return (
            <div
              key={a.id}
              className={cn(
                "rounded-lg border p-3 transition-all",
                isRunning && "border-primary/40 bg-primary/5",
                isDone && "border-emerald-500/30 bg-emerald-500/5",
                isPending && "border-border/60 opacity-60"
              )}
            >
              <div className="flex items-start gap-3">
                <RadialGauge
                  value={isDone ? 100 : a.progress}
                  size={44}
                  strokeWidth={4}
                  className={cn(
                    isDone
                      ? "text-emerald-500"
                      : isRunning
                        ? "text-primary"
                        : "text-muted-foreground/40"
                  )}
                  ariaLabel={`${tr(`agent_${a.id}_name`, locale)} ${
                    isDone ? 100 : a.progress
                  }%`}
                >
                  <div
                    className={cn(
                      "size-8 rounded-full flex items-center justify-center",
                      meta.bg,
                      isRunning && "agent-pulse"
                    )}
                  >
                    <Icon className={cn("size-4", meta.color)} />
                  </div>
                </RadialGauge>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                        0{idx + 1}
                      </span>
                      <span className="text-xs font-semibold truncate">
                        {tr(`agent_${a.id}_name`, locale)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(isRunning || isDone) && (
                        <span
                          className={cn(
                            "text-[10px] font-mono font-semibold tabular-nums",
                            isDone ? "text-emerald-600" : "text-primary"
                          )}
                        >
                          {isDone ? 100 : a.progress}%
                        </span>
                      )}
                      {isDone && <CheckCircle2 className="size-3.5 text-emerald-600" />}
                      {isRunning && <Loader2 className="size-3.5 text-primary animate-spin" />}
                      {isPending && <CircleDashed className="size-3.5 text-muted-foreground" />}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                    {tr(`agent_${a.id}_desc`, locale)}
                  </p>
                  {a.findings && a.findings.length > 0 && (isRunning || isDone) && (
                    <ul className="mt-2 space-y-0.5">
                      {a.findings.slice(0, isDone ? 4 : 2).map((f, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                          <ChevronRight className="size-2.5 mt-0.5 shrink-0 text-primary" />
                          <span className="leading-relaxed">{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {a.output && isDone && (
                    <div className="mt-2 text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-500/5 rounded px-2 py-1 border border-emerald-500/10">
                      ✓ {a.output}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Completion banner */}
      {completed && (
        <div className="mx-3 mb-3 rounded-lg bg-gradient-to-br from-emerald-500/10 to-chart-3/10 border border-emerald-500/20 p-3 flex flex-wrap items-center gap-3">
          <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {locale === "ar"
                ? "تم إنشاء العطاء ومسودة العقد"
                : "Proposal & contract draft ready"}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {coveragePercent != null && (
                <span className="me-2">
                  {locale === "ar" ? "تغطية" : "Coverage"}: {coveragePercent}%
                </span>
              )}
              {exportReady != null && (
                <span className="me-2">
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
                <span className="me-2">
                  {locale === "ar" ? "· عقد ثنائي اللغة" : "· bilingual contract"}
                </span>
              )}
              {llmProvider && (
                <span>
                  · LLM: {llmProvider}
                  {llmFallback ? (locale === "ar" ? " (احتياطي)" : " (fallback)") : ""}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => setView("proposals")}
            >
              {locale === "ar" ? "العطاء" : "Proposal"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] gap-1"
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
