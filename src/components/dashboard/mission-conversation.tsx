"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { MessageSquareText, Sparkles } from "lucide-react";

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

export function MissionConversation({
  locale,
  messages,
  interim,
  performing,
  emptyHint,
  assistantLabel,
  processingSlot,
  className,
}: {
  locale: "ar" | "en";
  messages: LooseMessage[];
  interim?: string;
  performing?: boolean;
  emptyHint: string;
  assistantLabel: string;
  /** Reserved processing panel (stable layout; replaces bounce placeholder). */
  processingSlot?: ReactNode;
  className?: string;
}) {
  const ar = locale === "ar";
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: performing ? "auto" : "smooth" });
  }, [messages, interim, performing]);

  return (
    <div
      ref={scrollRef}
      className={cn(
        "relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain rounded-[18px] border bg-white/[0.72] dark:bg-zinc-900/60 backdrop-blur-[16px] shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset]",
        "border-zinc-200/70 dark:border-white/[0.08] p-3 sm:p-4 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-white/10",
        "scroll-smooth will-change-scroll transform-gpu",
        className
      )}
      role="log"
      aria-live="polite"
      aria-label={ar ? "المحادثة" : "Conversation"}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden">
        <div className="absolute inset-0 opacity-[0.025] dark:opacity-[0.05] bg-[radial-gradient(120%_120%_at_20%_0%,rgba(20,184,166,0.22),transparent_50%)]" />
      </div>

      {messages.length === 0 ? (
        <div className="relative flex h-full min-h-[200px] sm:min-h-[260px] flex-col items-center justify-center gap-3 px-4 py-8 text-center">
          <span className="flex size-10 items-center justify-center rounded-full border border-zinc-200 dark:border-white/10 bg-white/80 dark:bg-white/[0.05] shadow-sm">
            <MessageSquareText className="size-5 text-zinc-400 dark:text-zinc-500" />
          </span>
          <p className="max-w-[32ch] text-[13px] sm:text-[13.5px] leading-[1.5] text-zinc-600 dark:text-zinc-400">{emptyHint}</p>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-zinc-200/70 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] px-2.5 py-1 text-[10px] text-zinc-500">
            <Sparkles className="size-3" />
            {ar ? "معاينات حية لكل خطوة" : "Live previews for every step"}
          </span>
        </div>
      ) : null}

      <div className="relative flex flex-col gap-3 sm:gap-3.5">
        <AnimatePresence initial={false}>
          {messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <motion.div
                key={message.id}
                layout
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "group/msg relative max-w-[92%] sm:max-w-[88%] rounded-[16px] sm:rounded-[18px] px-3.5 py-2.5 sm:px-4 sm:py-3 text-[13px] sm:text-[13.5px] leading-[1.5] shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_1px_2px_rgba(0,0,0,0.04)] transition-colors",
                  isUser
                    ? "ms-auto bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "me-auto border border-zinc-200/70 dark:border-white/[0.08] bg-white/90 dark:bg-zinc-800/70 backdrop-blur text-zinc-900 dark:text-zinc-100",
                  !isUser && performing && "border-teal-500/20 shadow-[0_0_0_1px_rgba(20,184,166,0.10),0_0_20px_-12px_rgba(20,184,166,0.28)]"
                )}
              >
                {!isUser && performing ? <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-400/30 to-transparent" /> : null}
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide opacity-60">
                  {isUser ? (ar ? "أنت" : "You") : assistantLabel}
                  {!isUser && performing ? <span className="size-1 rounded-full bg-teal-500 animate-pulse" /> : null}
                </div>
                <div className="space-y-2 whitespace-pre-wrap break-words">
                  {message.parts.map((part, i) => {
                    if (part.type === "text") {
                      return part.text ? <p key={i} className="break-words">{part.text}</p> : null;
                    }
                    if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
                      const name = part.type === "dynamic-tool" ? part.toolName || "tool" : part.type.replace(/^tool-/, "");
                      const live = part.state === "input-streaming" || part.state === "input-available";
                      return (
                        <span key={i} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono", live ? "border-teal-500/25 bg-teal-500/10 text-teal-800 dark:text-teal-200" : "border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-400")}>
                          <span className={cn("size-1 rounded-full", live ? "bg-teal-500 animate-pulse" : "bg-zinc-400")} />
                          {name}
                        </span>
                      );
                    }
                    return null;
                  })}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {interim ? (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="me-auto max-w-[85%] text-[13px] italic text-zinc-500 dark:text-zinc-400">
            {interim}…
          </motion.div>
        ) : null}

      </div>

      {processingSlot ? (
        <div className="relative mt-3 shrink-0" data-testid="copilot-processing-slot">
          {processingSlot}
        </div>
      ) : null}
    </div>
  );
}
