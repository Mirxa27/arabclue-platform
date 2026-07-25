"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Bot, CheckCircle2, FileText, FolderKanban, Loader2, Mic, Navigation, Search, Shield, Volume2, Workflow, Zap } from "lucide-react";
import { currentAgentAction, isToolDone, type TheaterToolEvent } from "@/lib/agents/platform/mission-tool-parts";

function PhaseIcon({ kind, phase }: { kind: string; phase: string }) {
  const c = "size-[16px]";
  if (phase === "listening") return <Mic className={c} />;
  if (phase === "speaking") return <Volume2 className={c} />;
  if (phase === "thinking") return <Loader2 className={cn(c, "animate-spin")} />;
  if (phase === "idle") return <Bot className={c} />;
  switch (kind) {
    case "navigate":
      return <Navigation className={c} />;
    case "project":
      return <FolderKanban className={c} />;
    case "document":
    case "proposal":
      return <FileText className={c} />;
    case "pipeline":
      return <Workflow className={c} />;
    case "compliance":
      return <Shield className={c} />;
    case "search":
      return <Search className={c} />;
    case "mission":
      return <Zap className={c} />;
    default:
      return <Bot className={c} />;
  }
}

export function MissionActionTicker({
  locale,
  tools,
  listening,
  speaking,
  thinking,
  className,
}: {
  locale: "ar" | "en";
  tools: TheaterToolEvent[];
  listening?: boolean;
  speaking?: boolean;
  thinking?: boolean;
  className?: string;
}) {
  const ar = locale === "ar";
  const action = currentAgentAction({ tools, locale, listening, speaking, thinking });
  const active = action.phase !== "idle";
  const doneCount = tools.filter((t) => isToolDone(t.state) && !t.preliminary).length;
  const runningCount = action.runningCount;
  const totalCount = tools.length;

  const [justDone, setJustDone] = useState(false);
  const prevDone = useRef(doneCount);
  useEffect(() => {
    if (doneCount > prevDone.current) {
      setJustDone(true);
      const id = window.setTimeout(() => setJustDone(false), 1400);
      prevDone.current = doneCount;
      return () => window.clearTimeout(id);
    }
    prevDone.current = doneCount;
  }, [doneCount]);

  const phaseLabel =
    action.phase === "listening"
      ? ar
        ? "يستمع"
        : "Listening"
      : action.phase === "speaking"
        ? ar
          ? "يتحدث"
          : "Speaking"
        : action.phase === "acting"
          ? ar
            ? "ينفذ مباشر"
            : "Executing"
          : action.phase === "thinking"
            ? ar
              ? "يفكر"
              : "Thinking"
            : ar
              ? "جاهز"
              : "Ready";

  return (
    <motion.div
      layout
      className={cn(
        "group/ticker relative overflow-hidden rounded-[14px] sm:rounded-[16px] border px-3 py-2.5 sm:px-3.5 sm:py-3 backdrop-blur-[14px] transition-colors",
        "will-change-transform transform-gpu",
        active
          ? "border-teal-500/25 bg-teal-500/[0.06] dark:bg-teal-500/[0.08] shadow-[0_0_0_1px_rgba(20,184,166,0.10),0_0_24px_-12px_rgba(20,184,166,0.32),0_1px_0_0_rgba(255,255,255,0.6)_inset] dark:shadow-[0_0_0_1px_rgba(20,184,166,0.16),0_0_28px_-14px_rgba(20,184,166,0.42)]"
          : "border-zinc-200/70 dark:border-white/[0.08] bg-white/70 dark:bg-zinc-900/40",
        className
      )}
      role="status"
      aria-live="polite"
    >
      {active ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-400/40 to-transparent" />
          <motion.div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-teal-500/[0.04] to-transparent" animate={{ x: ["-100%", "100%"] }} transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }} />
        </>
      ) : null}

      <div className="relative flex items-center gap-3">
        <span
          className={cn(
            "relative flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-full border backdrop-blur transition-colors duration-300",
            action.phase === "listening"
              ? "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300"
              : action.phase === "speaking"
                ? "border-teal-500/20 bg-teal-500/10 text-teal-700 dark:text-teal-300"
                : active
                  ? "border-teal-500/20 bg-white/80 dark:bg-white/[0.06] text-teal-700 dark:text-teal-200 shadow-sm"
                  : "border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-zinc-500"
          )}
        >
          <PhaseIcon kind={action.kind} phase={action.phase} />
          {active ? <span className="absolute inset-0 rounded-full border border-teal-500/20 animate-ping opacity-50" /> : null}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {phaseLabel}
              {runningCount > 1 ? <span className="ms-1.5 font-mono normal-case tracking-normal text-[10px]">· {runningCount} {ar ? "أدوات" : "tools"}</span> : null}
            </p>
            {active ? <span className="size-1 rounded-full bg-teal-500 animate-pulse shadow-[0_0_6px_rgba(20,184,166,0.8)]" /> : null}
          </div>

          <AnimatePresence mode="wait">
            <motion.p
              key={action.label}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className={cn("truncate text-[13px] sm:text-[13.5px] font-[550] leading-snug tracking-tight", active ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-600 dark:text-zinc-400")}
            >
              {action.label}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <AnimatePresence>
            {active ? (
              <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} className="flex size-6 items-center justify-center rounded-full bg-teal-500/10 border border-teal-500/20">
                <Loader2 className="size-3.5 animate-spin text-teal-700 dark:text-teal-300" />
              </motion.span>
            ) : justDone ? (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex size-6 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              </motion.span>
            ) : null}
          </AnimatePresence>
          {totalCount > 0 ? (
            <span className="hidden sm:inline-flex rounded-full border border-zinc-200/70 dark:border-white/10 bg-white/70 dark:bg-white/[0.05] px-2 py-1 font-mono text-[10px] tabular-nums text-zinc-600 dark:text-zinc-400">
              {runningCount > 0 ? (ar ? `${runningCount} يعمل · ${doneCount} تم` : `${runningCount} live · ${doneCount} done`) : ar ? `${doneCount} مكتمل` : `${doneCount} done`}
            </span>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
