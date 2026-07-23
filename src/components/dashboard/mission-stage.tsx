"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ListTodo, MessageSquare } from "lucide-react";
import {
  isToolRunning,
  type TheaterToolEvent,
} from "@/lib/agents/platform/mission-tool-parts";
import { MissionActionTicker } from "./mission-action-ticker";
import { MissionToolTheater } from "./mission-tool-theater";

type Tab = "conversation" | "activity";

/**
 * Mission stage: status ticker + conversation | activity panes.
 */
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
  const runningCount = tools.filter(
    (t) => isToolRunning(t.state) || t.preliminary
  ).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <MissionActionTicker
        locale={locale}
        tools={tools}
        listening={listening}
        speaking={speaking}
        thinking={thinking}
      />

      <div className="flex shrink-0 gap-1 rounded-lg border border-border/70 bg-muted/20 p-0.5 lg:hidden">
        <button
          type="button"
          onClick={() => setTab("conversation")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            tab === "conversation"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground"
          )}
        >
          <MessageSquare className="size-3.5" />
          {ar ? "المحادثة" : "Conversation"}
        </button>
        <button
          type="button"
          onClick={() => setTab("activity")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            tab === "activity"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground"
          )}
        >
          <ListTodo className="size-3.5" />
          {ar ? "النشاط" : "Activity"}
          {runningCount > 0 ? (
            <span className="rounded bg-teal-600/15 px-1.5 py-0.5 font-mono text-[10px] text-teal-800 dark:text-teal-200">
              {runningCount}
            </span>
          ) : null}
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        <div
          className={cn(
            "flex min-h-0 flex-col gap-2",
            tab === "conversation" ? "flex" : "hidden lg:flex"
          )}
        >
          {conversation}
          {feed ? (
            <div className="shrink-0 rounded-xl border border-border/60 bg-muted/15 px-3 py-2">
              {feed}
            </div>
          ) : null}
        </div>

        <div
          className={cn(
            "min-h-0",
            tab === "activity" ? "block" : "hidden lg:block"
          )}
        >
          <MissionToolTheater
            locale={locale}
            tools={tools}
            voiceLive={voiceLive}
            isCapturing={listening}
            isSpeaking={speaking}
            className="h-full overflow-y-auto"
          />
        </div>
      </div>
    </div>
  );
}
