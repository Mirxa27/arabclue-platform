"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

type LoosePart = {
  type: string;
  text?: string;
  toolName?: string;
  state?: string;
};

type LooseMessage = {
  id: string;
  role: string;
  parts: LoosePart[];
};

/**
 * Shared conversation transcript for classic + live Mission Control.
 * Renders text bubbles and inline tool chips, auto-scrolls to newest.
 */
export function MissionConversation({
  locale,
  messages,
  interim,
  performing,
  emptyHint,
  assistantLabel,
  className,
}: {
  locale: "ar" | "en";
  messages: LooseMessage[];
  interim?: string;
  performing?: boolean;
  emptyHint: string;
  assistantLabel: string;
  className?: string;
}) {
  const ar = locale === "ar";
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, interim]);

  return (
    <div
      ref={scrollRef}
      className={cn(
        "flex-1 min-h-0 overflow-y-auto rounded-2xl border border-cyan-500/15 bg-gradient-to-b from-background/80 via-teal-500/[0.04] to-background/80 p-4 space-y-3 backdrop-blur-[2px]",
        className
      )}
    >
      {messages.length === 0 ? (
        <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 text-center">
          <span className="flex size-11 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-500/10">
            <Sparkles className="size-5 text-cyan-600 dark:text-cyan-300" />
          </span>
          <p className="max-w-sm text-sm text-muted-foreground leading-relaxed">
            {emptyHint}
          </p>
        </div>
      ) : null}

      {messages.map((message) => {
        const isUser = message.role === "user";
        return (
          <div
            key={message.id}
            className={cn(
              "rounded-xl px-3 py-2 text-sm max-w-[94%] transition-shadow",
              isUser
                ? "ms-auto bg-primary text-primary-foreground"
                : "me-auto bg-card/90 border border-border/70",
              !isUser &&
                performing &&
                "shadow-[0_0_24px_rgba(34,211,238,0.12)]"
            )}
          >
            <div className="mb-1 text-[10px] uppercase tracking-wide opacity-70">
              {isUser ? (ar ? "أنت" : "You") : assistantLabel}
            </div>
            <div className="space-y-2 whitespace-pre-wrap">
              {message.parts.map((part, i) => {
                if (part.type === "text") {
                  return part.text ? <p key={i}>{part.text}</p> : null;
                }
                if (
                  part.type.startsWith("tool-") ||
                  part.type === "dynamic-tool"
                ) {
                  const name =
                    part.type === "dynamic-tool"
                      ? part.toolName || "tool"
                      : part.type.replace(/^tool-/, "");
                  const live =
                    part.state === "input-streaming" ||
                    part.state === "input-available";
                  return (
                    <div
                      key={i}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/5 px-2 py-0.5 text-[10px] font-mono",
                        live && "mission-tool-live border-cyan-300/50"
                      )}
                    >
                      <span className="size-1.5 rounded-full bg-teal-500 animate-pulse" />
                      {name}
                      {part.state ? (
                        <span className="opacity-60">{part.state}</span>
                      ) : null}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        );
      })}

      {interim ? (
        <div className="text-sm italic text-muted-foreground">{interim}…</div>
      ) : null}
    </div>
  );
}
