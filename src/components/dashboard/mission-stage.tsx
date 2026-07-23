"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MessageSquare, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  isToolRunning,
  type TheaterToolEvent,
} from "@/lib/agents/platform/mission-tool-parts";
import { MissionActionTicker } from "./mission-action-ticker";
import { MissionToolTheater } from "./mission-tool-theater";

type Tab = "conversation" | "theater";

/**
 * Unified Mission Control stage: action ticker on top, then a clean two-pane
 * body — conversation and live tool theater. Side-by-side on large screens,
 * tabbed on narrow screens so neither pane is ever cramped.
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
    <div className="flex flex-1 min-h-0 flex-col gap-3">
      <MissionActionTicker
        locale={locale}
        tools={tools}
        listening={listening}
        speaking={speaking}
        thinking={thinking}
      />

      {/* Mobile / narrow: tab switch so panes are never squished */}
      <div className="flex shrink-0 gap-1.5 rounded-full border border-border/60 bg-muted/20 p-0.5 lg:hidden">
        <button
          type="button"
          onClick={() => setTab("conversation")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            tab === "conversation"
              ? "bg-background shadow-sm"
              : "text-muted-foreground"
          )}
        >
          <MessageSquare className="size-3.5" />
          {ar ? "المحادثة" : "Conversation"}
        </button>
        <button
          type="button"
          onClick={() => setTab("theater")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            tab === "theater"
              ? "bg-background shadow-sm"
              : "text-muted-foreground"
          )}
        >
          <Sparkles className="size-3.5" />
          {ar ? "مسرح الأدوات" : "Tool theater"}
          {runningCount > 0 ? (
            <Badge className="h-4 px-1 text-[9px]">{runningCount}</Badge>
          ) : null}
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <div
          className={cn(
            "flex min-h-0 flex-col gap-3",
            tab === "conversation" ? "flex" : "hidden lg:flex"
          )}
        >
          {conversation}
          {feed}
        </div>

        <div
          className={cn(
            "min-h-0",
            tab === "theater" ? "block" : "hidden lg:block"
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
