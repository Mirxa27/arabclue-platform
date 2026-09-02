"use client";

import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, MessageSquare, Paperclip, Radio, Sparkles } from "lucide-react";
import { MissionPipelineBar } from "./mission-pipeline-bar";
import type { TheaterToolEvent } from "@/lib/agents/platform/mission-tool-parts";
import { agentStatusLabel, type AgentStatus } from "@/lib/agents/platform/agent-status";

type Mode = "live" | "classic";

type Props = {
  locale: "ar" | "en";
  title: string;
  subtitle: string;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  liveEnabled: boolean;
  liveHint?: string | null;
  liveModelLabel?: string | null;
  /** Raw model id, shown on hover only — it is provenance, not a headline. */
  liveModelDetail?: string | null;
  /** The one status on this screen. Nothing below the header may restate it. */
  status: AgentStatus;
  pipelineTools?: TheaterToolEvent[];
  statusBadges?: ReactNode;
  kit: ReactNode;
  kitMeta?: { files?: number; linked?: boolean };
  children: ReactNode;
  composer?: ReactNode;
};

const STATUS_TONE: Record<AgentStatus, { pill: string; dot: string }> = {
  working: {
    pill: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 shadow-[0_0_12px_-4px_rgba(16,185,129,0.6)]",
    dot: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse",
  },
  connecting: {
    pill: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100",
    dot: "bg-amber-500 animate-pulse",
  },
  ready: {
    pill: "border-black/10 bg-white/70 text-zinc-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-400",
    dot: "bg-teal-500",
  },
  offline: {
    pill: "border-black/10 bg-white/70 text-zinc-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-500",
    dot: "bg-zinc-400",
  },
};

export function MissionControlShell({
  locale,
  title,
  subtitle,
  mode,
  onModeChange,
  liveEnabled,
  liveHint,
  liveModelLabel,
  liveModelDetail,
  status,
  statusBadges,
  kit,
  kitMeta,
  children,
  composer,
  pipelineTools,
}: Props) {
  const ar = locale === "ar";
  const [kitOpen, setKitOpen] = useState(false);
  const performing = status === "working";
  const tone = STATUS_TONE[status];

  return (
    <div
      className={cn(
        "group/shell relative flex w-full min-w-0 max-w-full flex-col overflow-hidden",
        "rounded-[20px] sm:rounded-[24px] border backdrop-blur-[16px] sm:backdrop-blur-[20px]",
        "bg-[radial-gradient(120%_120%_at_0%_0%,rgba(16,185,129,0.08),transparent_48%),radial-gradient(90%_80%_at_100%_0%,rgba(99,102,241,0.10),transparent_55%),radial-gradient(80%_60%_at_50%_100%,rgba(6,182,214,0.08),transparent_60%),linear-gradient(180deg,rgba(255,255,255,0.86),rgba(255,255,255,0.78))] dark:bg-[radial-gradient(120%_120%_at_0%_0%,rgba(16,185,129,0.10),transparent_48%),radial-gradient(90%_80%_at_100%_0%,rgba(99,102,241,0.14),transparent_55%),linear-gradient(180deg,rgba(14,14,18,0.92),rgba(10,10,14,0.88))]",
        "border-white/[0.10] dark:border-white/[0.08] shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_8px_32px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset,0_16px_48px_rgba(0,0,0,0.36),0_0_0_1px_rgba(255,255,255,0.04)_inset]",
        "transition-[border-color,box-shadow] duration-500 ease-out",
        // App-like fixed height only when the viewport is tall enough to hold
        // header, files panel, transcript and composer; on shorter screens the
        // shell grows and the page scrolls. With a fixed height the transcript
        // and the live-session strip were clipped to a sliver behind the files.
        "min-h-[68dvh] sm:min-h-[72dvh] md:min-h-[76dvh] lg:min-h-[calc(100dvh-8rem)] max-h-[none] lg:[@media(min-height:920px)]:max-h-[calc(100dvh-6.5rem)]",
        performing
          ? "border-teal-400/30 dark:border-teal-300/20 shadow-[0_1px_0_0_rgba(255,255,255,0.7)_inset,0_0_0_1px_rgba(20,184,166,0.16),0_0_48px_-8px_rgba(20,184,166,0.32),0_16px_48px_rgba(0,0,0,0.08)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset,0_0_0_1px_rgba(20,184,166,0.22),0_0_64px_-12px_rgba(20,184,166,0.42),0_24px_64px_rgba(0,0,0,0.42)]"
          : ""
      )}
      dir={ar ? "rtl" : "ltr"}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] bg-[linear-gradient(to_right,rgba(0,0,0,0.8)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.8)_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.8)_1px,transparent_1px)] bg-[size:28px_28px]" />
        <motion.div
          className={cn(
            "absolute -top-[48%] start-1/2 h-[90%] w-[140%] -translate-x-1/2 rounded-[100%] blur-[42px] transition-opacity duration-700",
            performing ? "opacity-[0.22]" : "opacity-[0.08]"
          )}
          style={{
            background:
              "radial-gradient(60% 100% at 50% 0%, rgba(20,184,166,0.42), rgba(99,102,241,0.22) 42%, transparent 72%)",
          }}
          animate={
            performing ? { y: [0, 6, 0], scale: [1, 1.02, 1] } : { y: 0, scale: 1 }
          }
          transition={
            performing
              ? { duration: 4, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.6 }
          }
        />
        {performing ? (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-400/60 to-transparent" />
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/70 to-transparent blur-[0.5px]" />
          </motion.div>
        ) : null}
      </div>

      <header className="relative z-[1] shrink-0 border-b border-black/[0.06] dark:border-white/[0.06] px-3 py-3 sm:px-4 sm:py-3.5 md:px-5 md:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <div className="inline-flex items-center gap-2.5">
                <span
                  className={cn(
                    "hidden sm:flex size-[28px] items-center justify-center rounded-full",
                    "border border-black/[0.08] dark:border-white/[0.10] bg-white/80 dark:bg-white/[0.06] backdrop-blur",
                    "shadow-[0_1px_1px_rgba(0,0,0,0.04)]",
                    performing && "border-teal-500/30 bg-teal-500/10"
                  )}
                >
                  <Sparkles className={cn("size-[14px]", performing ? "text-teal-600 dark:text-teal-300" : "text-zinc-500 dark:text-zinc-400")} />
                </span>
                <h1 className="text-[15px] sm:text-[17px] md:text-[19px] font-[650] tracking-tight leading-[1.15] text-zinc-900 dark:text-zinc-50">
                  {title}
                </h1>
              </div>

              <span
                className={cn(
                  "inline-flex items-center gap-[6px] rounded-full border px-[9px] py-[3px] text-[10px] sm:text-[11px] font-medium leading-none tracking-wide transition-colors duration-300",
                  tone.pill
                )}
                role="status"
                aria-live="polite"
              >
                <span className={cn("size-[6px] rounded-full", tone.dot)} />
                {agentStatusLabel(status, locale)}
              </span>
            </div>
            <p className="mt-1.5 max-w-[54ch] text-[12px] sm:text-[13px] leading-[1.45] text-zinc-600 dark:text-zinc-400 line-clamp-2 sm:line-clamp-none">
              {subtitle}
            </p>

            {liveModelLabel || statusBadges ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:gap-2">
                {liveModelLabel ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/60 dark:border-white/10 dark:bg-white/[0.04] px-2.5 py-1 text-[10px] text-zinc-500 dark:text-zinc-400"
                    title={liveModelDetail ?? undefined}
                  >
                    {liveModelLabel}
                  </span>
                ) : null}
                {statusBadges}
              </div>
            ) : null}

            {!liveEnabled && liveHint ? (
              <div className="mt-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2 text-[11px] sm:text-xs leading-relaxed text-amber-900/80 dark:text-amber-100/70">
                <span className="font-medium">{ar ? "ملاحظة: " : "Note: "}</span>
                {liveHint}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-row items-center justify-between gap-2 sm:flex-col sm:items-end sm:justify-start sm:gap-2.5">
            <div
              className="inline-flex rounded-full border border-black/[0.08] dark:border-white/[0.10] bg-white/70 dark:bg-black/20 backdrop-blur-xl p-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              role="group"
              aria-label={ar ? "وضع الصوت" : "Voice mode"}
            >
              <Button
                type="button"
                size="sm"
                variant={mode === "live" ? "default" : "ghost"}
                className={cn(
                  "h-[30px] sm:h-[32px] rounded-full px-3 sm:px-3.5 text-[12px] sm:text-[13px] gap-1 sm:gap-1.5 transition-all duration-200",
                  mode === "live"
                    ? "shadow-[0_1px_6px_rgba(0,0,0,0.08)]"
                    : "shadow-none"
                )}
                disabled={!liveEnabled}
                onClick={() => onModeChange("live")}
                aria-pressed={mode === "live"}
              >
                <Radio className="size-3 sm:size-3.5" />
                {ar ? "مباشر" : "Live"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "classic" ? "default" : "ghost"}
                className={cn(
                  "h-[30px] sm:h-[32px] rounded-full px-3 sm:px-3.5 text-[12px] sm:text-[13px] gap-1 sm:gap-1.5 transition-all duration-200",
                  mode === "classic"
                    ? "shadow-[0_1px_6px_rgba(0,0,0,0.08)]"
                    : "shadow-none"
                )}
                onClick={() => onModeChange("classic")}
                aria-pressed={mode === "classic"}
              >
                <MessageSquare className="size-3 sm:size-3.5" />
                {ar ? "محادثة" : "Chat"}
              </Button>
            </div>
            <p className="hidden sm:block text-[10px] leading-none text-zinc-500 dark:text-zinc-500">
              {liveEnabled ? (ar ? "صوت مباشر مفعّل" : "Live enabled") : ar ? "غير مفعّل" : "Live off"}
            </p>
          </div>
        </div>
      </header>

      <section className="relative z-[1] shrink-0 border-b border-black/[0.06] dark:border-white/[0.06] bg-white/[0.42] dark:bg-black/[0.14] backdrop-blur-[12px]">
        <button
          type="button"
          className="group/kit flex w-full items-center justify-between gap-3 px-3 py-[10px] sm:px-4 sm:py-2.5 text-start transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03] focus-visible:outline-none focus-visible:bg-black/[0.03] dark:focus-visible:bg-white/[0.04]"
          onClick={() => setKitOpen((v) => !v)}
          aria-expanded={kitOpen}
          aria-controls="mission-kit"
        >
          <span className="flex min-w-0 items-center gap-2 text-[12px] sm:text-[13px] font-[550] tracking-tight">
            <span className="flex size-6 items-center justify-center rounded-full border border-black/10 bg-white/80 dark:border-white/10 dark:bg-white/[0.06]">
              <Paperclip className="size-3 text-zinc-600 dark:text-zinc-400" />
            </span>
            <span className="truncate">{ar ? "ملفات المهمة" : "Mission files"}</span>
            <span className="hidden sm:inline text-[11px] font-normal text-zinc-500 dark:text-zinc-500">
              {ar ? "رفع · رابط · مصادر أخرى" : "upload · link · other sources"}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {(kitMeta?.files ?? 0) > 0 ? (
              <Badge variant="outline" className="rounded-full border-black/10 bg-white/70 dark:border-white/10 dark:bg-white/[0.06] text-[10px] px-2 py-0.5">
                {kitMeta?.files} {ar ? "ملف" : "files"}
              </Badge>
            ) : (
              <span className="hidden sm:inline text-[11px] text-zinc-500 dark:text-zinc-500">
                {ar ? "لا ملفات بعد" : "No files yet"}
              </span>
            )}
            <span className="flex size-6 items-center justify-center rounded-full border border-black/10 bg-white/70 dark:border-white/10 dark:bg-white/[0.05] group-hover/kit:bg-white dark:group-hover/kit:bg-white/[0.08] transition-colors">
              {kitOpen ? <ChevronUp className="size-3.5 text-zinc-600 dark:text-zinc-400" /> : <ChevronDown className="size-3.5 text-zinc-600 dark:text-zinc-400" />}
            </span>
          </span>
        </button>

        <AnimatePresence initial={false}>
          {kitOpen ? (
            <motion.div
              id="mission-kit"
              key="kit-panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="max-h-[38dvh] overflow-y-auto overscroll-contain scrollbar-thin border-t border-black/[0.06] dark:border-white/[0.06] px-3 py-3 sm:px-4 sm:py-3.5 space-y-3 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(20,184,166,0.06),transparent)]">
                {kit}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>

      <MissionPipelineBar locale={locale} performing={!!performing} tools={pipelineTools} />

      <div className="relative z-[1] flex min-h-0 flex-1 flex-col bg-white/[0.32] dark:bg-black/[0.10] px-2 py-2 sm:px-3 sm:py-3 md:px-3.5 md:py-3.5">
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>

      {composer ? (
        <div className="relative z-[1] shrink-0 border-t border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-zinc-900/70 backdrop-blur-[16px] px-2 py-2.5 sm:px-3 sm:py-3 md:px-4 supports-[backdrop-filter]:bg-white/70">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-black/10 dark:via-white/10 to-transparent" />
          {composer}
        </div>
      ) : null}
    </div>
  );
}
