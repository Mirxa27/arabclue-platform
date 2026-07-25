"use client";

import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Activity, MessageSquare, LayoutGrid, Sparkles } from "lucide-react";
import { isToolRunning, type TheaterToolEvent } from "@/lib/agents/platform/mission-tool-parts";
import { MissionActionTicker } from "./mission-action-ticker";
import { MissionToolTheater } from "./mission-tool-theater";

type Tab = "conversation" | "activity";

export function MissionStage({
  locale,
  tools,
  conversation,
  feed,
  listening,
  speaking,
  thinking,
  voiceLive,
}: {
  locale: "ar" | "en";
  tools: TheaterToolEvent[];
  conversation: ReactNode;
  feed?: ReactNode;
  listening?: boolean;
  speaking?: boolean;
  thinking?: boolean;
  voiceLive?: boolean;
}) {
  const ar = locale === "ar";
  const [tab, setTab] = useState<Tab>("conversation");
  const runningCount = tools.filter((t) => isToolRunning(t.state) || t.preliminary).length;
  const doneCount = tools.filter((t) => !isToolRunning(t.state) && !t.preliminary).length;

  return (
    <div className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col gap-2.5 sm:gap-3">
      <MissionActionTicker locale={locale} tools={tools} listening={listening} speaking={speaking} thinking={thinking} />

      <div className="flex shrink-0 gap-1 rounded-full border border-zinc-200/70 dark:border-white/[0.08] bg-white/70 dark:bg-black/20 backdrop-blur-xl p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:hidden">
        <button
          type="button"
          onClick={() => setTab("conversation")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-[550] tracking-tight transition-all duration-200 will-change-transform",
            tab === "conversation"
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-[0_1px_6px_rgba(0,0,0,0.12)]"
              : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
          )}
        >
          <MessageSquare className="size-3.5" />
          {ar ? "المحادثة" : "Chat"}
        </button>
        <button
          type="button"
          onClick={() => setTab("activity")}
          className={cn(
            "relative flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-[550] tracking-tight transition-all duration-200 will-change-transform",
            tab === "activity" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-[0_1px_6px_rgba(0,0,0,0.12)]" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
          )}
        >
          <Activity className="size-3.5" />
          {ar ? "المعاينات الحية" : "Live previews"}
          {runningCount > 0 ? <span className="absolute -top-1 -end-1 flex size-4 items-center justify-center rounded-full bg-teal-500 text-[9px] font-bold text-white shadow-[0_0_8px_rgba(20,184,166,0.8)] animate-pulse">{runningCount}</span> : doneCount > 0 ? <span className="rounded-full bg-white/15 px-1.5 py-0.5 font-mono text-[10px]">{doneCount}</span> : null}
        </button>
      </div>

      <div className="grid min-h-0 w-full min-w-0 max-w-full flex-1 gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)] lg:gap-3.5 items-start">
        <div className={cn("flex min-h-0 w-full min-w-0 max-w-full flex-col gap-2.5", tab === "conversation" ? "flex" : "hidden lg:flex")}>
          <div className="flex min-h-0 flex-1 flex-col">{conversation}</div>
          {feed ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="shrink-0 rounded-[16px] border border-zinc-200/70 dark:border-white/[0.08] bg-white/70 dark:bg-zinc-900/50 backdrop-blur-md px-3 py-2.5 shadow-sm">
              {feed}
            </motion.div>
          ) : null}
        </div>

        <div className={cn("min-h-0 w-full min-w-0 max-w-full lg:sticky lg:top-0", tab === "activity" ? "block" : "hidden lg:block")}>
          <div className="flex min-h-0 flex-col gap-2">
            <div className="hidden lg:flex items-center gap-2 px-1 py-1">
              <span className="flex size-6 items-center justify-center rounded-full border border-zinc-200 dark:border-white/10 bg-white/70 dark:bg-white/[0.06]">
                <LayoutGrid className="size-3.5 text-zinc-600 dark:text-zinc-400" />
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-600 dark:text-zinc-400">{ar ? "المعاينات الحية" : "Live processing previews"}</span>
              {runningCount > 0 ? <span className="ms-1 size-1.5 rounded-full bg-teal-500 animate-pulse shadow-[0_0_8px_rgba(20,184,166,0.8)]" /> : null}
            </div>

            <MissionToolTheater locale={locale} tools={tools} voiceLive={voiceLive} isCapturing={listening} isSpeaking={speaking} className="h-full min-h-[420px] lg:min-h-[560px] max-h-[min(78dvh,860px)] lg:max-h-[min(72dvh,860px)] overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
