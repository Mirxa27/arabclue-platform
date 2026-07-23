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
  Sparkles,
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
  if (phase === "thinking") return <Sparkles className={c} />;
  if (phase === "idle") return <Sparkles className={c} />;
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
 * Premium, always-visible "what the agent is doing right now" strip.
 * Mirrors how a human would narrate their own clicks, with glitter while active.
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
  const totalCount = tools.length;

  // Freshly completed pulse
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

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border px-3.5 py-2.5 shadow-sm",
        active
          ? "border-cyan-400/50 bg-[linear-gradient(120deg,rgba(13,148,136,0.16),rgba(8,145,178,0.12),transparent)]"
          : "border-teal-500/25 bg-[linear-gradient(120deg,rgba(13,148,136,0.07),rgba(8,145,178,0.05),transparent)]",
        active && "mission-tool-live",
        className
      )}
      role="status"
      aria-live="polite"
    >
      {active ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 mission-tool-glitter opacity-40"
        />
      ) : null}
      <div className="relative flex items-center gap-3">
        <span
          className={cn(
            "relative flex size-9 shrink-0 items-center justify-center rounded-full border",
            action.phase === "listening"
              ? "border-rose-400/50 bg-rose-500/10 text-rose-600 dark:text-rose-300"
              : action.phase === "speaking"
                ? "border-teal-400/50 bg-teal-500/10 text-teal-700 dark:text-teal-200"
                : active
                  ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200"
                  : "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-200"
          )}
        >
          <PhaseIcon kind={action.kind} phase={action.phase} />
          {active ? (
            <span className="absolute inset-0 rounded-full border border-cyan-300/40 animate-ping" />
          ) : null}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {action.phase === "listening"
                ? ar
                  ? "يستمع"
                  : "Listening"
                : action.phase === "speaking"
                  ? ar
                    ? "يتحدث"
                    : "Speaking"
                  : action.phase === "acting"
                    ? ar
                      ? "ينفّذ كإنسان"
                      : "Acting like a human"
                    : action.phase === "thinking"
                      ? ar
                        ? "يفكّر"
                        : "Thinking"
                      : ar
                        ? "جاهز"
                        : "Ready"}
            </span>
            {action.runningCount > 1 ? (
              <span className="rounded-full bg-cyan-500/15 px-1.5 text-[9px] font-mono text-cyan-700 dark:text-cyan-200">
                ×{action.runningCount}
              </span>
            ) : null}
          </div>
          <p
            className={cn(
              "truncate text-sm font-medium",
              active ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {action.label}
            {action.toolName ? (
              <span className="ms-1 font-mono text-[11px] text-cyan-700/80 dark:text-cyan-300/80">
                · {action.toolName}
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {active ? (
            <Loader2 className="size-4 animate-spin text-cyan-600" />
          ) : justDone ? (
            <CheckCircle2 className="size-4 text-emerald-500 mission-tool-sparkle" />
          ) : null}
          {totalCount > 0 ? (
            <span className="rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">
              {doneCount}/{totalCount}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
