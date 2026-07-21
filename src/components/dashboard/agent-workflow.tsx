"use client";

import { useState, useEffect, useRef } from "react";
import { useLocale } from "@/lib/store";
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
  Scale,
  Calculator,
  PenLine,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { AgentState, AgentId } from "@/lib/types";

const AGENT_META: Record<AgentId, { icon: typeof Bot; color: string; bg: string }> = {
  INGESTION: { icon: FileSearch, color: "text-chart-2", bg: "bg-chart-2/10" },
  EA_COMPLIANCE: { icon: ShieldCheck, color: "text-emerald-600", bg: "bg-emerald-500/10" },
  LEGAL_REGULATORY: { icon: Scale, color: "text-chart-5", bg: "bg-chart-5/10" },
  FINANCIAL_QUALIFICATION: { icon: Calculator, color: "text-chart-3", bg: "bg-chart-3/10" },
  PROPOSAL_DRAFTING: { icon: PenLine, color: "text-chart-4", bg: "bg-chart-4/10" },
};

export function AgentWorkflow() {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [runId, setRunId] = useState<string | null>(null);
  const [agentStates, setAgentStates] = useState<AgentState[]>([]);
  const [overall, setOverall] = useState(0);
  const [completed, setCompleted] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("run failed");
      return res.json();
    },
    onSuccess: (data) => {
      setRunId(data.runId);
      setCompleted(false);
      setOverall(0);
      setAgentStates(data.agentStates);
      toast({
        title: locale === "ar" ? "بدأ سير عمل الوكلاء" : "Agent workflow started",
        description: locale === "ar" ? "5 وكلاء ذكاء اصطناعي يعملون" : "5 AI agents processing",
      });
      qc.invalidateQueries({ queryKey: ["stats"] });
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
        if (data.status === "COMPLETED") {
          setCompleted(true);
          toast({
            title: locale === "ar" ? "اكتمل إنشاء العطاء" : "Proposal generation complete",
            description: locale === "ar" ? "تم إنشاء 4 ملفات قابلة للتنزيل" : "4 artifacts ready for download",
          });
          qc.invalidateQueries({ queryKey: ["stats"] });
          qc.invalidateQueries({ queryKey: ["proposals"] });
          qc.invalidateQueries({ queryKey: ["compliance"] });
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
              {locale === "ar" ? "5 وكلاء ذكاء اصطناعي متخصصون" : "5 specialized AI agents"}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => runMutation.mutate()}
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
          const meta = AGENT_META[a.id];
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
                <div className={cn("size-9 rounded-lg flex items-center justify-center shrink-0", meta.bg, isRunning && "agent-pulse")}>
                  <Icon className={cn("size-4", meta.color)} />
                </div>
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
                    {isDone && <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />}
                    {isRunning && <Loader2 className="size-3.5 text-primary animate-spin shrink-0" />}
                    {isPending && <CircleDashed className="size-3.5 text-muted-foreground shrink-0" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                    {tr(`agent_${a.id}_desc`, locale)}
                  </p>
                  {(isRunning || isDone) && (
                    <div className="mt-2">
                      <Progress value={a.progress} className="h-1" />
                    </div>
                  )}
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
        <div className="mx-3 mb-3 rounded-lg bg-gradient-to-br from-emerald-500/10 to-chart-3/10 border border-emerald-500/20 p-3 flex items-center gap-3">
          <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {locale === "ar" ? "تم إنشاء العطاء بنجاح" : "Proposal generated successfully"}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {locale === "ar" ? "4 ملفات جاهزة: PPTX, PDF, XLSX×2" : "4 artifacts ready: PPTX, PDF, XLSX×2"}
            </div>
          </div>
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 text-[10px]">
            C1 ✓
          </Badge>
        </div>
      )}
    </Card>
  );
}
