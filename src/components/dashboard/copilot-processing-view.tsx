"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
  Square,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/i18n";
import { formatElapsed, type CopilotProcessingPhase } from "@/lib/copilot-processing";
import type { CopilotProcessingSnapshot } from "@/lib/copilot-processing";
import { Button } from "@/components/ui/button";

const EASE = [0.22, 1, 0.36, 1] as const;

const PHASE_SURFACE: Record<
  CopilotProcessingPhase,
  string
> = {
  idle: "border-zinc-200/70 dark:border-white/[0.08] bg-white/60 dark:bg-zinc-900/40",
  queued:
    "border-amber-500/25 bg-amber-500/[0.06] dark:bg-amber-500/[0.08]",
  streaming:
    "border-teal-500/25 bg-teal-500/[0.06] dark:bg-teal-500/[0.08]",
  generating:
    "border-violet-500/25 bg-violet-500/[0.06] dark:bg-violet-500/[0.08]",
  finalizing:
    "border-sky-500/25 bg-sky-500/[0.06] dark:bg-sky-500/[0.08]",
  error:
    "border-destructive/35 bg-destructive/5",
  completed:
    "border-emerald-500/25 bg-emerald-500/[0.06] dark:bg-emerald-500/[0.08]",
};

function PhaseGlyph({
  phase,
  className,
}: {
  phase: CopilotProcessingPhase;
  className?: string;
}) {
  const c = cn("size-4", className);
  switch (phase) {
    case "queued":
      return <Loader2 className={cn(c, "animate-spin text-amber-600 dark:text-amber-300")} />;
    case "streaming":
      return <Sparkles className={cn(c, "text-teal-600 dark:text-teal-300")} />;
    case "generating":
      return <Loader2 className={cn(c, "animate-spin text-violet-600 dark:text-violet-300")} />;
    case "finalizing":
      return <Loader2 className={cn(c, "animate-spin text-sky-600 dark:text-sky-300")} />;
    case "error":
      return <AlertTriangle className={cn(c, "text-destructive")} />;
    case "completed":
      return <CheckCircle2 className={cn(c, "text-emerald-600 dark:text-emerald-400")} />;
    default:
      return <Sparkles className={cn(c, "text-zinc-400")} />;
  }
}

export function CopilotProcessingView({
  locale,
  snapshot,
  streamPreview,
  restoredFromStorage,
  online,
  onCancel,
  onRetry,
  className,
}: {
  locale: "ar" | "en";
  snapshot: CopilotProcessingSnapshot;
  streamPreview?: string;
  restoredFromStorage?: boolean;
  online: boolean;
  onCancel: () => void;
  onRetry: () => void;
  className?: string;
}) {
  const phase = snapshot.phase;
  const active = phase !== "idle";
  const preview =
    streamPreview && phase !== "idle" && phase !== "error"
      ? streamPreview.slice(-280)
      : "";

  const statusText = tr(snapshot.messageKey, locale);
  const srSummary = [
    statusText,
    active ? tr("copilot_proc_elapsed", locale, { time: formatElapsed(snapshot.elapsedMs) }) : "",
    snapshot.tokenCount > 0
      ? tr("copilot_proc_tokens", locale, { count: String(snapshot.tokenCount) })
      : "",
    active
      ? tr("copilot_proc_progress", locale, { pct: String(snapshot.progress) })
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      data-testid="copilot-processing-view"
      data-phase={phase}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={cn(
        // Reserved layout — prevents jump between idle and active
        "relative flex min-h-[7.5rem] sm:min-h-[8.25rem] flex-col justify-center overflow-hidden rounded-[clamp(0.875rem,2vw,1.125rem)] border px-[clamp(0.75rem,2.5vw,1rem)] py-[clamp(0.625rem,2vw,0.875rem)] backdrop-blur-[14px] transition-colors duration-300",
        "will-change-transform transform-gpu",
        PHASE_SURFACE[phase],
        className
      )}
      aria-labelledby="copilot-processing-title"
    >
      {/* Decorative shimmer — direction-aware via logical inset */}
      {active && phase !== "error" && phase !== "completed" ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent rtl:bg-gradient-to-l"
          animate={{ x: locale === "ar" ? ["100%", "-100%"] : ["-100%", "100%"] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
        />
      ) : null}

      <div className="relative flex flex-col gap-[clamp(0.5rem,1.5vw,0.75rem)]">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border bg-white/80 dark:bg-white/[0.06]",
              phase === "error"
                ? "border-destructive/30"
                : phase === "completed"
                  ? "border-emerald-500/30"
                  : "border-current/10"
            )}
            aria-hidden
          >
            <PhaseGlyph phase={phase} />
            {active && phase !== "error" && phase !== "completed" ? (
              <span className="absolute inset-0 rounded-full border border-teal-500/20 animate-ping opacity-40" />
            ) : null}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2
                id="copilot-processing-title"
                className="text-[clamp(0.7rem,2.2vw,0.75rem)] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
              >
                {tr("copilot_proc_title", locale)}
              </h2>
              {!online ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive">
                  <WifiOff className="size-3" aria-hidden />
                  {tr("copilot_proc_offline_badge", locale)}
                </span>
              ) : null}
              {restoredFromStorage && phase === "idle" ? (
                <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-800 dark:text-amber-200">
                  {tr("copilot_proc_restored", locale)}
                </span>
              ) : null}
            </div>

            <AnimatePresence mode="wait">
              <motion.p
                key={phase + statusText}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: EASE }}
                className={cn(
                  "mt-0.5 text-[clamp(0.8125rem,2.6vw,0.875rem)] font-[550] leading-snug tracking-tight",
                  phase === "error"
                    ? "text-destructive"
                    : "text-zinc-900 dark:text-zinc-50"
                )}
                data-testid="copilot-processing-message"
              >
                {statusText}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Cancel / Retry — persistently visible while long-running */}
          <div className="flex shrink-0 items-center gap-1.5">
            {snapshot.canCancel ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="copilot-processing-cancel"
                className="h-8 rounded-full gap-1.5 px-2.5 text-[11px] focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                onClick={onCancel}
              >
                <Square className="size-3 fill-current" aria-hidden />
                {tr("copilot_proc_cancel", locale)}
              </Button>
            ) : null}
            {(phase === "error" || phase === "completed") && snapshot.canRetry ? (
              <Button
                type="button"
                size="sm"
                variant={phase === "error" ? "default" : "outline"}
                data-testid="copilot-processing-retry"
                className="h-8 rounded-full gap-1.5 px-2.5 text-[11px] focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                onClick={onRetry}
              >
                <RefreshCw className="size-3" aria-hidden />
                {tr("copilot_proc_retry", locale)}
              </Button>
            ) : null}
          </div>
        </div>

        {/* Progress + counters */}
        <div className="space-y-1.5">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={snapshot.progress}
            aria-label={tr("copilot_proc_progress", locale, {
              pct: String(snapshot.progress),
            })}
          >
            <motion.div
              className={cn(
                "h-full rounded-full",
                phase === "error"
                  ? "bg-destructive/80"
                  : phase === "completed"
                    ? "bg-emerald-500"
                    : phase === "generating"
                      ? "bg-violet-500"
                      : phase === "queued"
                        ? "bg-amber-500"
                        : "bg-teal-500"
              )}
              initial={false}
              animate={{ width: `${snapshot.progress}%` }}
              transition={{ duration: 0.35, ease: EASE }}
              style={{
                // Logical start for RTL mirroring of fill growth
                marginInlineStart: 0,
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[clamp(0.625rem,1.8vw,0.6875rem)] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
            <span data-testid="copilot-processing-elapsed">
              {tr("copilot_proc_elapsed", locale, {
                time: formatElapsed(snapshot.elapsedMs),
              })}
            </span>
            <span data-testid="copilot-processing-tokens">
              {tr("copilot_proc_tokens", locale, {
                count: String(snapshot.tokenCount),
              })}
            </span>
            <span data-testid="copilot-processing-progress-label">
              {tr("copilot_proc_progress", locale, {
                pct: String(snapshot.progress),
              })}
            </span>
          </div>
        </div>

        {/* Skeleton / streaming reveal — reserved height */}
        <div
          className="min-h-[2.75rem] rounded-[10px] border border-dashed border-zinc-200/80 dark:border-white/10 bg-white/40 dark:bg-white/[0.03] px-2.5 py-2"
          data-testid="copilot-processing-preview"
        >
          {phase === "queued" || (phase === "generating" && !preview) ? (
            <div className="space-y-1.5" aria-hidden>
              <div className="h-2 w-[88%] animate-pulse rounded bg-zinc-200/90 dark:bg-white/10" />
              <div className="h-2 w-[62%] animate-pulse rounded bg-zinc-200/70 dark:bg-white/[0.07]" />
              <div className="h-2 w-[74%] animate-pulse rounded bg-zinc-200/80 dark:bg-white/[0.08]" />
            </div>
          ) : preview ? (
            <motion.p
              key={preview.slice(-48)}
              initial={{ opacity: 0.45 }}
              animate={{ opacity: 1 }}
              className="line-clamp-3 text-[clamp(0.6875rem,2vw,0.75rem)] leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words"
            >
              {preview}
              {phase === "streaming" ? (
                <span className="ms-0.5 inline-block h-3 w-0.5 translate-y-0.5 animate-pulse bg-teal-500 align-middle" />
              ) : null}
            </motion.p>
          ) : (
            <p className="text-[clamp(0.6875rem,2vw,0.75rem)] text-zinc-400">
              {tr("copilot_proc_preview_empty", locale)}
            </p>
          )}
        </div>
      </div>

      {/* ARIA: polite for progress, assertive for errors */}
      <div
        className="sr-only"
        role="status"
        aria-live={snapshot.assertive ? "assertive" : "polite"}
        aria-atomic="true"
        data-testid="copilot-processing-live"
      >
        {srSummary}
      </div>
      <p className="sr-only" data-testid="copilot-processing-sr-summary">
        {srSummary}
      </p>
    </section>
  );
}
