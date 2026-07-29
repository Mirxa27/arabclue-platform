"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Brain, CheckCircle2, FileText, Loader2, Search, Shield, Workflow } from "lucide-react";
import {
  isToolDone,
  isToolRunning,
  toolKind,
  type TheaterToolEvent,
} from "@/lib/agents/platform/mission-tool-parts";

type PipelineStep = {
  key: string;
  labelEn: string;
  labelAr: string;
  icon: typeof Brain;
  kinds: string[];
  toolNames: string[];
};

const STEPS: PipelineStep[] = [
  {
    key: "analyze",
    labelEn: "Analyzing",
    labelAr: "تحليل",
    icon: Brain,
    kinds: ["general", "mission", "search"],
    toolNames: ["getWorkspaceOverview", "listProjects", "listDocuments", "searchDocumentChunks", "getMissionPulse"],
  },
  {
    key: "delegate",
    labelEn: "Planning",
    labelAr: "تخطيط",
    icon: Workflow,
    kinds: [],
    toolNames: ["explainPlatform", "getMyCapabilities", "orchestrateTenderPackage", "classifyAndRouteAttachment", "stageMissionAttachment"],
  },
  {
    key: "research",
    labelEn: "Research",
    labelAr: "بحث",
    icon: Search,
    kinds: ["compliance", "search"],
    toolNames: ["researchSaudiLaw", "listRegulatoryRegistry", "getCompliance", "listMissionAttachments"],
  },
  {
    key: "draft",
    labelEn: "Drafting",
    labelAr: "صياغة",
    icon: FileText,
    kinds: ["document", "proposal", "pipeline", "project"],
    toolNames: ["getProposal", "listProposals", "startAgentPipeline", "getAgentRunStatus", "createProject", "getProject"],
  },
  {
    key: "review",
    labelEn: "Review",
    labelAr: "مراجعة",
    icon: Shield,
    kinds: ["review", "billing", "admin", "navigate"],
    toolNames: ["navigateToView", "setActiveProject", "listReviews", "decideReview", "getBillingStatus"],
  },
];

function inferActiveStep(tools: TheaterToolEvent[]): number {
  const running = tools.filter((t) => isToolRunning(t.state) || t.preliminary);
  const last = running.length ? running[running.length - 1] : [...tools].reverse().find((t) => isToolRunning(t.state) || t.preliminary) || [...tools].reverse()[0];
  if (!last) return -1;
  const kind = toolKind(last.name);
  for (let i = STEPS.length - 1; i >= 0; i--) {
    const s = STEPS[i];
    if (s.toolNames.includes(last.name) || s.kinds.includes(kind)) return i;
  }
  if (kind === "document" || kind === "proposal" || kind === "pipeline") return 3;
  if (kind === "compliance") return 2;
  return 0;
}

function computeCompleted(tools: TheaterToolEvent[]): Set<number> {
  const doneTools = tools.filter((t) => isToolDone(t.state));
  const completed = new Set<number>();
  STEPS.forEach((step, idx) => {
    const hasDone = doneTools.some((t) => step.toolNames.includes(t.name) || step.kinds.includes(toolKind(t.name)));
    if (hasDone) completed.add(idx);
  });
  return completed;
}

export function MissionPipelineBar({
  locale,
  performing,
  tools,
}: {
  locale: "ar" | "en";
  performing: boolean;
  tools?: TheaterToolEvent[];
}) {
  const ar = locale === "ar";
  const [simStep, setSimStep] = useState(-1);
  const [simDone, setSimDone] = useState<Set<number>>(new Set());

  const realActive = useMemo(() => (tools && tools.length ? inferActiveStep(tools) : -1), [tools]);
  const realDone = useMemo(() => (tools ? computeCompleted(tools) : new Set<number>()), [tools]);

  useEffect(() => {
    if (tools && tools.length > 0) return;
    if (!performing) {
      if (simStep >= 0) {
        setSimDone(new Set(STEPS.map((_, i) => i)));
        const t = setTimeout(() => {
          setSimStep(-1);
          setSimDone(new Set());
        }, 1800);
        return () => clearTimeout(t);
      }
      return;
    }
    let step = 0;
    setSimStep(0);
    const interval = setInterval(() => {
      step += 1;
      if (step >= STEPS.length) {
        setSimDone(new Set(STEPS.map((_, i) => i)));
        setTimeout(() => {
          setSimDone(new Set());
          setSimStep(0);
          step = 0;
        }, 900);
        return;
      }
      setSimDone((prev) => new Set([...prev, step - 1]));
      setSimStep(step);
    }, 1600);
    return () => clearInterval(interval);
  }, [performing, simStep, tools]);

  const activeStep = tools && tools.length ? realActive : simStep;
  const completedSteps = tools && tools.length ? realDone : simDone;

  const shouldRender = performing || activeStep >= 0 || completedSteps.size > 0 || (tools && tools.length > 0);
  if (!shouldRender) return null;

  const progressPct =
    STEPS.length === 0
      ? 0
      : Math.round(((completedSteps.size + (activeStep >= 0 && !completedSteps.has(activeStep) ? 0.55 : 0)) / STEPS.length) * 100);

  return (
    <div className="relative z-[1] shrink-0 overflow-hidden border-y border-black/[0.06] dark:border-white/[0.06] bg-white/[0.55] dark:bg-black/20 backdrop-blur-[14px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_100%_at_20%_0%,rgba(20,184,166,0.08),transparent_60%)]" />
      {performing ? (
        <motion.div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-400/50 to-transparent"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        />
      ) : null}

      <div className="relative flex flex-col gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="hidden items-center gap-1 sm:flex">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isActive = i === activeStep;
            const isDone = completedSteps.has(i);
            return (
              <div key={step.key} className="flex flex-1 items-center gap-1 min-w-0">
                <motion.div
                  layout
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-300 will-change-transform",
                    "shrink-0",
                    isActive
                      ? "border-teal-500/30 bg-teal-500/12 text-teal-900 dark:text-teal-100 shadow-[0_0_16px_-6px_rgba(20,184,166,0.55)]"
                      : isDone
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                        : "border-black/10 bg-white/60 dark:border-white/10 dark:bg-white/[0.04] text-zinc-500 dark:text-zinc-500"
                  )}
                >
                  <span className="flex size-4 items-center justify-center">
                    {isDone && !isActive ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : isActive ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
                  </span>
                  <span className="hidden md:inline tracking-tight">{ar ? step.labelAr : step.labelEn}</span>
                  <span className="md:hidden tracking-tight">{ar ? step.labelAr.slice(0, 4) : step.labelEn.slice(0, 4)}</span>
                </motion.div>
                {i < STEPS.length - 1 ? (
                  <div className="flex flex-1 items-center">
                    <div className={cn("h-px flex-1 transition-colors duration-500", isDone ? "bg-emerald-500/40" : "bg-black/10 dark:bg-white/10")} />
                    <div
                      className={cn(
                        "size-1 rounded-full transition-colors duration-500 ms-1",
                        isDone ? "bg-emerald-500" : isActive ? "bg-teal-500 animate-pulse" : "bg-zinc-300 dark:bg-white/20"
                      )}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex sm:hidden items-center gap-2.5">
          <div className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
            <motion.div
              className={cn(
                "h-full rounded-full bg-gradient-to-r from-teal-500 via-cyan-400 to-emerald-400",
                performing && "shadow-[0_0_12px_rgba(20,184,166,0.6)]"
              )}
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <AnimatePresence mode="popLayout">
            <motion.span
              key={`${completedSteps.size}-${activeStep}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="shrink-0 rounded-full border border-black/10 bg-white/70 dark:border-white/10 dark:bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] tabular-nums text-zinc-600 dark:text-zinc-400"
            >
              {completedSteps.size}/{STEPS.length} · {progressPct}%
            </motion.span>
          </AnimatePresence>
          {performing ? <span className="size-1.5 rounded-full bg-teal-500 animate-pulse shrink-0" /> : null}
        </div>
      </div>
    </div>
  );
}
