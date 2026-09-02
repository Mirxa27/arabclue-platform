"use client";

/**
 * The proposal being written, as it is written.
 *
 * Subscribes to GET /api/agents/runs/[id]/stream — the workflow run's `draft`
 * stream replayed as server-sent events — and lets the words arrive. Every
 * motion here follows the stream: the dot beats while chunks land, the caret
 * blinks while the model is mid-sentence, both stop when `done` arrives or
 * the reader prefers reduced motion. `reset` (a retried attempt) clears the
 * page and says so. EventSource reconnects on its own with Last-Event-ID, so
 * a dropped connection resumes where it left off.
 */

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PenLine } from "lucide-react";
import { tr } from "@/lib/i18n";
import type { Locale } from "@/lib/types";
import type { DraftStreamChunk } from "@/lib/agents/draft-stream";
import { cn } from "@/lib/utils";

type Phase = "waiting" | "writing" | "retrying" | "done";

export function LiveDraftPanel({ runId, locale }: { runId: string; locale: Locale }) {
  const reduceMotion = useReducedMotion();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("waiting");
  const [truncated, setTruncated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText("");
    setPhase("waiting");
    setTruncated(false);
    const source = new EventSource(`/api/agents/runs/${encodeURIComponent(runId)}/stream`);
    source.onmessage = (event: MessageEvent<string>) => {
      let chunk: DraftStreamChunk;
      try {
        chunk = JSON.parse(event.data) as DraftStreamChunk;
      } catch {
        return;
      }
      if (chunk.kind === "reset") {
        setText("");
        setTruncated(false);
        setPhase(chunk.attempt > 1 ? "retrying" : "waiting");
      } else if (chunk.kind === "delta") {
        setText((current) => current + chunk.text);
        setPhase("writing");
      } else if (chunk.kind === "done") {
        setTruncated(chunk.truncated);
        setPhase("done");
        source.close();
      }
    };
    // A 5xx reconnects by itself (with Last-Event-ID); a 404 stays closed.
    return () => source.close();
  }, [runId]);

  // Follow the writing: the newest words stay in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const live = phase === "waiting" || phase === "writing" || phase === "retrying";
  const status =
    phase === "done"
      ? [tr("live_draft_done", locale), truncated ? tr("live_draft_truncated", locale) : null]
          .filter(Boolean)
          .join(" · ")
      : phase === "retrying"
        ? tr("live_draft_retrying", locale)
        : phase === "writing"
          ? tr("live_draft_words", locale, {
              count: words.toLocaleString(locale === "ar" ? "ar-SA" : "en-GB"),
            })
          : tr("live_draft_waiting", locale);

  return (
    <section
      aria-label={tr("live_draft_title", locale)}
      aria-live="polite"
      className="mx-3 mb-3 sm:mx-4 sm:mb-4 overflow-hidden rounded-xl border border-violet-500/25 bg-gradient-to-b from-violet-500/[0.07] via-background to-background shadow-[inset_0_1px_0_0_rgb(255_255_255/0.06)]"
    >
      <header className="flex items-center gap-2 border-b border-violet-500/15 px-4 py-2.5">
        <span className="relative flex size-2" aria-hidden>
          {phase === "writing" && !reduceMotion ? (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-violet-500/60" />
          ) : null}
          <span
            className={cn(
              "relative inline-flex size-2 rounded-full",
              phase === "done" ? "bg-emerald-500" : "bg-violet-500",
            )}
          />
        </span>
        <PenLine className="size-3.5 text-violet-600" aria-hidden />
        <h4 className="text-xs font-semibold tracking-wide">{tr("live_draft_title", locale)}</h4>
        <span className="ms-auto text-[11px] tabular-nums text-muted-foreground">{status}</span>
      </header>
      <div ref={scrollRef} className="max-h-72 overflow-y-auto px-4 py-3">
        <pre
          dir="auto"
          className="whitespace-pre-wrap break-words font-[inherit] text-[13px] leading-6 text-foreground/90"
        >
          {text}
          {live ? (
            <motion.span
              aria-hidden
              className="ms-0.5 inline-block h-4 w-[2px] translate-y-[3px] bg-violet-500"
              animate={reduceMotion ? undefined : { opacity: [1, 0, 1] }}
              transition={reduceMotion ? undefined : { duration: 1, repeat: Infinity, ease: "linear" }}
            />
          ) : null}
        </pre>
      </div>
    </section>
  );
}
