"use client";

/**
 * One agent, in detail, under the timeline: its step, state, how long it took
 * (from the orchestrator's stamps), what it found, and — when it failed — the
 * bilingual reason it recorded. Findings are all real lines the agent wrote;
 * the first three show, the rest expand.
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronDown, ChevronRight, CircleDashed, Clock, Loader2, XCircle } from "lucide-react";
import { tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { agentDurationLabel, agentOutputText, formatElapsed } from "@/lib/agents/run-presentation";
import type { AgentState, Locale } from "@/lib/types";

const FINDINGS_PREVIEW = 3;

export type AgentNodeStatus = AgentState["status"];

export const STATUS_KEY: Record<AgentNodeStatus, string> = {
  pending: "agent_state_pending",
  running: "agent_state_running",
  completed: "agent_state_completed",
  failed: "agent_state_failed",
};

export function StatusGlyph({ status, className }: { status: AgentNodeStatus; className?: string }) {
  const c = cn("size-3.5", className);
  switch (status) {
    case "completed":
      return <CheckCircle2 className={cn(c, "text-emerald-600 dark:text-emerald-400")} aria-hidden />;
    case "running":
      return <Loader2 className={cn(c, "text-violet-600 motion-safe:animate-spin dark:text-violet-300")} aria-hidden />;
    case "failed":
      return <XCircle className={cn(c, "text-destructive")} aria-hidden />;
    default:
      return <CircleDashed className={cn(c, "text-muted-foreground")} aria-hidden />;
  }
}

/** Elapsed for a running agent from its `startedAt`; the recorded duration once it is done. */
export function agentTimeLabel(agent: AgentState, now: number): string | null {
  if (agent.status === "running") {
    const started = agent.startedAt ? Date.parse(agent.startedAt) : NaN;
    return Number.isFinite(started) ? formatElapsed(now - started) : null;
  }
  return agentDurationLabel(agent);
}

export function AgentTimelineDetail({
  locale,
  agent,
  index,
  total,
  now,
  reduceMotion,
}: {
  locale: Locale;
  agent: AgentState;
  index: number;
  total: number;
  now: number;
  reduceMotion: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const numberLocale = locale === "ar" ? "ar-SA" : "en-GB";
  const status = agent.status;
  const findings = agent.findings ?? [];
  const visible = showAll ? findings : findings.slice(0, FINDINGS_PREVIEW);
  const hidden = findings.length - visible.length;
  const outputText = agentOutputText(agent.output, locale);
  const time = agentTimeLabel(agent, now);

  return (
    <motion.div
      key={agent.id}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn(
        "rounded-xl border p-3.5",
        status === "running" && "border-violet-500/40 bg-violet-500/[0.06]",
        status === "completed" && "border-emerald-500/30 bg-emerald-500/[0.05]",
        status === "failed" && "border-destructive/40 bg-destructive/5",
        status === "pending" && "border-border/70 bg-card",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-[10px] font-semibold tabular-nums text-muted-foreground">
          {tr("agent_timeline_step", locale, {
            n: (index + 1).toLocaleString(numberLocale),
            total: total.toLocaleString(numberLocale),
          })}
        </span>
        <h4 className="text-xs font-semibold">{tr(`agent_${agent.id}_name`, locale)}</h4>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-px text-[10px] font-medium",
            status === "running" && "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-200",
            status === "completed" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
            status === "failed" && "border-destructive/40 bg-destructive/10 text-destructive",
            status === "pending" && "border-border text-muted-foreground",
          )}
        >
          <StatusGlyph status={status} className="size-3" />
          {tr(STATUS_KEY[status], locale)}
        </span>
        {time ? (
          <span className="ms-auto inline-flex items-center gap-1 font-mono text-[10.5px] tabular-nums text-muted-foreground" dir="ltr">
            <Clock className="size-3" aria-hidden />
            {time}
          </span>
        ) : null}
      </div>

      <p className="mt-1.5 text-[11px] leading-snug text-foreground/65">{tr(`agent_${agent.id}_desc`, locale)}</p>

      {status !== "pending" ? (
        <div className="mt-2.5 border-t border-border/50 pt-2.5">
          {findings.length > 0 ? (
            <>
              <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
                {tr("agent_timeline_findings", locale, { count: findings.length.toLocaleString(numberLocale) })}
              </p>
              <ul className="mt-1.5 space-y-1">
                <AnimatePresence initial={false}>
                  {visible.map((f, i) => (
                    <motion.li
                      key={`${i}:${f}`}
                      initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      className={cn(
                        "flex items-start gap-1.5 text-[11px] leading-relaxed",
                        status === "failed" ? "text-destructive/90" : "text-foreground/75",
                      )}
                    >
                      <ChevronRight
                        className={cn(
                          "mt-1 size-2.5 shrink-0 rtl:rotate-180",
                          status === "failed" ? "text-destructive" : "text-violet-500",
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 break-words" dir="auto">
                        {f}
                      </span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              {findings.length > FINDINGS_PREVIEW ? (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  aria-expanded={showAll}
                  className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-medium text-violet-700 hover:underline dark:text-violet-300"
                >
                  <ChevronDown className={cn("size-3 transition-transform", showAll && "rotate-180")} aria-hidden />
                  {showAll
                    ? locale === "ar"
                      ? "عرض أقل"
                      : "Show less"
                    : locale === "ar"
                      ? `عرض ${hidden.toLocaleString(numberLocale)} أخرى`
                      : `Show ${hidden.toLocaleString(numberLocale)} more`}
                </button>
              ) : null}
            </>
          ) : status === "running" ? (
            <p className="text-[11px] text-muted-foreground">{tr("agent_timeline_no_findings", locale)}</p>
          ) : null}

          {outputText && status === "failed" ? (
            <p className="mt-2 rounded-md border border-destructive/20 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive" dir="auto">
              {outputText}
            </p>
          ) : null}
          {outputText && status === "completed" ? (
            <p className="mt-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-800 dark:text-emerald-300" dir="auto">
              {outputText}
            </p>
          ) : null}
        </div>
      ) : null}
    </motion.div>
  );
}
