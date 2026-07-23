"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { MessageSquareText } from "lucide-react";

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
 * Clean conversation transcript for Mission Control.
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
        "min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl border border-border/70 bg-background/80 p-4",
        className
      )}
    >
      {messages.length === 0 ? (
        <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-3 px-4 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg border border-border/70 bg-muted/40">
            <MessageSquareText className="size-5 text-muted-foreground" />
          </span>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
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
              "max-w-[92%] rounded-xl px-3.5 py-2.5 text-sm transition-colors",
              isUser
                ? "ms-auto bg-primary text-primary-foreground"
                : "me-auto border border-border/70 bg-card",
              !isUser && performing && "border-teal-600/30"
            )}
          >
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide opacity-70">
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
                        "inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] font-mono",
                        live && "border-teal-600/35 bg-teal-600/8"
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          live ? "bg-teal-600 animate-pulse" : "bg-slate-400"
                        )}
                      />
                      {name}
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
