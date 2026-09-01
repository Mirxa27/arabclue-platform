"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Brain, CheckCircle2, FileText, Loader2, Search, Shield, Workflow } from "lucide-react";
import type { TheaterToolEvent } from "@/lib/agents/platform/mission-tool-parts";
import {
  PIPELINE_STEPS,
  computeCompleted,
  inferActiveStep,
  type PipelineStep,
} from "@/lib/agents/platform/mission-pipeline-steps";

const STEP_ICONS: Record<PipelineStep["key"], typeof Brain> = {
  analyze: Brain,
  delegate: Workflow,
  research: Search,
  draft: FileText,
  review: Shield,
};

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

  // Progress is derived from real tool telemetry only.
  //
  // This component used to run a timer that marched through the step list every
  // 1600ms whenever `tools` was empty, rendering the same checkmarks, "n/5"
  // counter and percentage as a genuine run. An operator could not tell
  // fabricated progress from real progress, which is not acceptable in a
  // compliance product. With no telemetry we now show an honest indeterminate
  // "working" state instead of inventing one.
  const hasTelemetry = Boolean(tools && tools.length > 0);
  const activeStep = useMemo(
    () => (hasTelemetry ? inferActiveStep(tools!) : -1),
    [hasTelemetry, tools]
  );
  const completedSteps = useMemo(
    () => (hasTelemetry ? computeCompleted(tools!) : new Set<number>()),
    [hasTelemetry, tools]
  );

  const shouldRender = performing || hasTelemetry;
  if (!shouldRender) return null;

  const progressPct =
    !hasTelemetry || PIPELINE_STEPS.length === 0
      ? 0
      : Math.round(((completedSteps.size + (activeStep >= 0 && !completedSteps.has(activeStep) ? 0.55 : 0)) / PIPELINE_STEPS.length) * 100);

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
          {PIPELINE_STEPS.map((step, i) => {
            const Icon = STEP_ICONS[step.key];
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
                {i < PIPELINE_STEPS.length - 1 ? (
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
            {hasTelemetry ? (
              <motion.div
                className={cn(
                  "h-full rounded-full bg-gradient-to-r from-teal-500 via-cyan-400 to-emerald-400",
                  performing && "shadow-[0_0_12px_rgba(20,184,166,0.6)]"
                )}
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            ) : (
              // Indeterminate: the agent is working but has not reported a step.
              <motion.div
                className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-teal-500 to-transparent"
                animate={{ x: ["-100%", "300%"] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
              />
            )}
          </div>
          <AnimatePresence mode="popLayout">
            <motion.span
              key={activeStep >= 0 ? PIPELINE_STEPS[activeStep].key : "indeterminate"}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="shrink-0 rounded-full border border-black/10 bg-white/70 dark:border-white/10 dark:bg-white/[0.06] px-2 py-0.5 text-[10px] text-zinc-600 dark:text-zinc-400"
            >
              {/* The bar already carries the fraction. Say what is happening. */}
              {activeStep >= 0
                ? ar
                  ? PIPELINE_STEPS[activeStep].labelAr
                  : PIPELINE_STEPS[activeStep].labelEn
                : ar
                  ? "جارٍ العمل"
                  : "Working"}
            </motion.span>
          </AnimatePresence>
          {performing ? <span className="size-1.5 rounded-full bg-teal-500 animate-pulse shrink-0" /> : null}
        </div>
      </div>
    </div>
  );
}
