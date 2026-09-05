"use client";

/**
 * Past agent runs for the workspace.
 *
 * Collapsed by default and mounted below the live pipeline: history is what you
 * consult, not what you watch. It used to sit above the pipeline with a fixed
 * 13rem scroller, which put a nested scroll region and up to fifty rows between
 * the writer and the run they had just started.
 *
 * Each row is one line to scan — status chip, project, when — and one line of
 * what the run has to say for itself: a live run's server-reported progress
 * and current agent, a finished run's duration from its own stamps, a failed
 * run's message. Selecting a row restores that run's report above.
 */

import { ChevronDown, Clock, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { EmptyState, QueryState } from "@/components/patterns";
import { ListSkeleton } from "./loading-skeletons";
import { tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  currentAgentLabel,
  durationBetween,
  formatElapsed,
  formatRunDate,
  relativeTime,
  runProjectTitle,
  runStatusLabel,
  runStatusTone,
  type RunTone,
} from "@/lib/agents/run-presentation";
import { useRunClock } from "./use-run-clock";
import type { Locale } from "@/lib/types";

/** Relative times only change by the minute; the clock ticks that often. */
const RELATIVE_TIME_TICK_MS = 60_000;

export type AgentRunHistoryItem = {
  id: string;
  projectId: string;
  projectTitle: string;
  projectTitleAr: string | null;
  status: string;
  progress: number;
  currentAgent: string | null;
  errorMessage: string | null;
  failureKind: string | null;
  createdAt: string;
  completedAt: string | null;
};

const TONE_CHIP: Record<RunTone, string> = {
  live: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-200",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted/60 text-muted-foreground",
};

const TONE_DOT: Record<RunTone, string> = {
  live: "bg-violet-500",
  success: "bg-emerald-500",
  danger: "bg-destructive",
  muted: "bg-muted-foreground/60",
};

const LIVE_STATUSES = new Set(["QUEUED", "RUNNING"]);

function RunRow({
  run,
  selected,
  locale,
  now,
  onSelect,
}: {
  run: AgentRunHistoryItem;
  selected: boolean;
  locale: Locale;
  now: number;
  onSelect: (run: AgentRunHistoryItem) => void;
}) {
  const tone = runStatusTone(run.status);
  const live = LIVE_STATUSES.has(run.status);
  const failed = run.status === "FAILED";
  const durationMs = live ? null : durationBetween(run.createdAt, run.completedAt);
  const numberLocale = locale === "ar" ? "ar-SA" : "en-GB";
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={tr("run_history_restore", locale)}
      onClick={() => onSelect(run)}
      className={cn(
        "group/run w-full rounded-lg border px-3 py-2 text-start transition-colors hover:bg-muted/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        selected ? "border-violet-500/50 bg-violet-500/[0.07]" : "border-border/70 bg-card"
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-px text-[10px] font-medium",
            TONE_CHIP[tone]
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              TONE_DOT[tone],
              live && "motion-safe:animate-pulse"
            )}
          />
          {runStatusLabel(run.status, locale)}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
          {runProjectTitle(run, locale)}
        </span>
        <time
          dateTime={run.createdAt}
          title={formatRunDate(run.createdAt, locale)}
          className="shrink-0 text-[10px] tabular-nums text-muted-foreground"
        >
          {relativeTime(run.createdAt, locale, now)}
        </time>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
        {live ? (
          <>
            {/* The server's own overall progress for a run still going. */}
            <span className="font-mono tabular-nums text-violet-700 dark:text-violet-300">
              {Math.round(run.progress).toLocaleString(numberLocale)}%
            </span>
            {run.currentAgent ? (
              <span className="truncate">
                {tr("run_history_current", locale, { agent: currentAgentLabel(run.currentAgent, locale) })}
              </span>
            ) : null}
          </>
        ) : null}
        {durationMs != null ? (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Clock className="size-3" aria-hidden />
            {tr("run_history_duration", locale, { duration: formatElapsed(durationMs) })}
          </span>
        ) : null}
        {!live && run.status !== "COMPLETED" && run.progress > 0 && run.progress < 100 ? (
          // How far a stopped or failed run got, as the server recorded it.
          <span className="font-mono tabular-nums">{Math.round(run.progress).toLocaleString(numberLocale)}%</span>
        ) : null}
      </div>
      {failed && run.errorMessage ? (
        <p
          className="mt-1.5 line-clamp-2 rounded-md border border-destructive/25 bg-destructive/5 px-2 py-1 text-[10px] text-destructive"
          dir="auto"
        >
          {run.errorMessage}
        </p>
      ) : null}
    </button>
  );
}

export function AgentRunHistory({
  runs,
  activeRunId,
  locale,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  onSelect,
  onStartRun,
  onUploadDocuments,
}: {
  runs: readonly AgentRunHistoryItem[];
  activeRunId: string | null;
  locale: Locale;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  onRetry: () => void;
  onSelect: (run: AgentRunHistoryItem) => void;
  onStartRun: () => void;
  onUploadDocuments: () => void;
}) {
  const liveCount = runs.filter((r) => LIVE_STATUSES.has(r.status)).length;
  const now = useRunClock(true, RELATIVE_TIME_TICK_MS);
  return (
    <Collapsible className="border-t border-border/50 bg-background/80 group">
      <CollapsibleTrigger className="w-full px-5 py-3 flex items-center justify-between gap-3 text-start hover:bg-muted/40 transition-colors">
        <span className="flex items-center gap-2 min-w-0">
          <History className="size-4 text-muted-foreground shrink-0" />
          <span className="min-w-0">
            <span className="block text-xs font-semibold">
              {locale === "ar" ? "سجل التشغيل" : "Run history"}
            </span>
            <span className="block text-[10px] text-muted-foreground">
              {locale === "ar"
                ? "كل تشغيلات الوكلاء في مساحة العمل"
                : "All agent runs in this workspace"}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {liveCount > 0 ? (
            <Badge className="text-[10px] bg-violet-600 hover:bg-violet-600 gap-1">
              <span aria-hidden className="size-1.5 rounded-full bg-white motion-safe:animate-pulse" />
              {liveCount}
            </Badge>
          ) : null}
          <Badge variant="outline" className="text-[10px] tabular-nums">
            {runs.length}
          </Badge>
          <ChevronDown
            className="size-4 text-muted-foreground transition-transform group-has-[[data-state=open]]:rotate-180"
            aria-hidden
          />
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent className="px-5 pb-4">
        <QueryState
          isLoading={isLoading}
          isError={isError}
          errorMessage={errorMessage}
          isEmpty={runs.length === 0}
          onRetry={onRetry}
          locale={locale}
          loading={<ListSkeleton rows={2} />}
          empty={
            <EmptyState
              icon={History}
              title={tr("agent_run_history_empty_title", locale)}
              description={tr("agent_run_history_empty_description", locale)}
              className="py-5"
              action={
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={onStartRun}>
                    {tr("agent_run_start_action", locale)}
                  </Button>
                  <Button size="sm" variant="outline" onClick={onUploadDocuments}>
                    {tr("agent_run_upload_docs_action", locale)}
                  </Button>
                </div>
              }
            />
          }
        >
          {/* Full list, no inner scroller: the page already scrolls, and a
              nested one hides rows behind a gesture the user has to discover. */}
          <div className="space-y-1.5">
            {runs.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                selected={run.id === activeRunId}
                locale={locale}
                now={now}
                onSelect={onSelect}
              />
            ))}
          </div>
        </QueryState>
      </CollapsibleContent>
    </Collapsible>
  );
}
