"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Bot,
  CheckCircle2,
  FileText,
  FolderKanban,
  Loader2,
  Mic,
  Navigation,
  Search,
  Shield,
  Volume2,
  Workflow,
  Zap,
} from "lucide-react";
import {
  currentAgentAction,
  isToolDone,
  type TheaterToolEvent,
} from "@/lib/agents/platform/mission-tool-parts";

function PhaseIcon({ kind, phase }: { kind: string; phase: string }) {
  const c = "size-4";
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

/**
 * Always-visible "what the agent is doing now" status strip.
 */
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
  const action = currentAgentAction({
    tools,
    locale,
    listening,
    speaking,
    thinking,
  });
  const active = action.phase !== "idle";

  const doneCount = tools.filter(
    (t) => isToolDone(t.state) && !t.preliminary
  ).length;
  const runningCount = action.runningCount;
  const totalCount = tools.length;

  const [justDone, setJustDone] = useState(false);
  const prevDone = useRef(doneCount);
  useEffect(() => {
    if (doneCount > prevDone.current) {
      setJustDone(true);
      const id = window.setTimeout(() => setJustDone(false), 1200);
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
            ? "ينفّذ"
            : "Acting"
          : action.phase === "thinking"
            ? ar
              ? "يفكّر"
              : "Thinking"
            : ar
              ? "جاهز"
              : "Ready";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border px-3.5 py-2.5 transition-colors",
        active
          ? "border-teal-600/35 bg-teal-600/[0.07]"
          : "border-border/70 bg-muted/25",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="relative flex items-center gap-3">
        <span
          className={cn(
            "relative flex size-9 shrink-0 items-center justify-center rounded-lg border",
            action.phase === "listening"
              ? "border-rose-400/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
              : action.phase === "speaking"
                ? "border-teal-600/40 bg-teal-600/10 text-teal-800 dark:text-teal-200"
                : active
                  ? "border-teal-600/40 bg-teal-600/10 text-teal-800 dark:text-teal-200"
                  : "border-border bg-background text-muted-foreground"
          )}
        >
          <PhaseIcon kind={action.kind} phase={action.phase} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {phaseLabel}
            {runningCount > 1 ? (
              <span className="ms-1.5 font-mono normal-case tracking-normal">
                · {runningCount} {ar ? "أدوات" : "tools"}
              </span>
            ) : null}
          </p>
          <p
            className={cn(
              "truncate text-sm font-medium transition-opacity",
              active ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {action.label}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {active ? (
            <Loader2 className="size-4 animate-spin text-teal-700 dark:text-teal-300" />
          ) : justDone ? (
            <CheckCircle2 className="size-4 text-emerald-600" />
          ) : null}
          {totalCount > 0 ? (
            <span className="rounded-md border border-border/70 bg-background/80 px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
              {runningCount > 0
                ? ar
                  ? `${runningCount} يعمل · ${doneCount} تم`
                  : `${runningCount} running · ${doneCount} done`
                : ar
                  ? `${doneCount} مكتمل`
                  : `${doneCount} done`}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
