"use client";

/**
 * Past agent runs for the workspace.
 *
 * Collapsed by default and mounted below the live pipeline: history is what you
 * consult, not what you watch. It used to sit above the pipeline with a fixed
 * 13rem scroller, which put a nested scroll region and up to fifty rows between
 * the writer and the run they had just started.
 */

import { ChevronDown, History } from "lucide-react";
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
  formatRunDate,
  runProjectTitle,
  runStatusLabel,
  runStatusTone,
} from "@/lib/agents/run-presentation";
import type { Locale } from "@/lib/types";

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

const TONE_BADGE: Record<string, string> = {
  live: "bg-violet-600 hover:bg-violet-600",
  success: "bg-emerald-600 hover:bg-emerald-600",
  muted: "bg-muted text-foreground hover:bg-muted",
};

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
          <Badge variant="outline" className="text-[10px]">
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
          <div className="space-y-2">
            {runs.map((run) => {
              const selected = run.id === activeRunId;
              const failed = run.status === "FAILED";
              const tone = runStatusTone(run.status);
              return (
                <button
                  key={run.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(run)}
                  className={cn(
                    "w-full rounded-lg border p-3 text-start transition-colors hover:bg-muted/50",
                    selected
                      ? "border-violet-500/50 bg-violet-500/8"
                      : "border-border/70 bg-card"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate text-xs font-semibold">
                          {runProjectTitle(run, locale)}
                        </span>
                        <Badge
                          variant={failed ? "destructive" : "default"}
                          className={cn("text-[9px]", TONE_BADGE[tone])}
                        >
                          {runStatusLabel(run.status, locale)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {formatRunDate(run.createdAt, locale)}
                        {run.currentAgent
                          ? ` · ${locale === "ar" ? "الوكيل الحالي" : "Current"}: ${currentAgentLabel(run.currentAgent, locale)}`
                          : ""}
                      </p>
                    </div>
                    <span className="font-mono text-xs font-bold tabular-nums text-violet-700 dark:text-violet-300">
                      {Math.round(run.progress)}%
                    </span>
                  </div>
                  {failed && run.errorMessage ? (
                    <p className="mt-2 rounded-md border border-destructive/25 bg-destructive/5 px-2 py-1.5 text-[10px] text-destructive">
                      {run.errorMessage}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        </QueryState>
      </CollapsibleContent>
    </Collapsible>
  );
}
