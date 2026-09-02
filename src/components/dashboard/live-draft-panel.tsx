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

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PenLine } from "lucide-react";
import { tr } from "@/lib/i18n";
import { markdownToHtml } from "@/lib/markdown";
import type { Locale } from "@/lib/types";
import {
  initialDraftView,
  reduceDraftChunk,
  type DraftStreamChunk,
  type DraftView,
} from "@/lib/agents/draft-stream";
import { cn } from "@/lib/utils";

/** Same presentation as the proposal preview, so the live draft looks like the document it becomes. */
const DOCUMENT_CLASSES = cn(
  "text-[13px] leading-6 text-foreground/90",
  "[&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2",
  "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2",
  "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5",
  "[&_p]:mb-2.5 [&_ul]:mb-2.5 [&_ol]:mb-2.5 [&_li]:ms-4",
  "[&_table]:w-full [&_table]:border-collapse [&_table]:mb-3 [&_table]:text-[12px]",
  "[&_td]:border [&_td]:border-border/50 [&_td]:px-2 [&_td]:py-1 [&_td]:align-top",
  "[&_th]:border [&_th]:border-border/50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-start",
  "[&_blockquote]:border-s-2 [&_blockquote]:border-violet-500/40 [&_blockquote]:ps-3 [&_blockquote]:text-muted-foreground",
);

export function LiveDraftPanel({ runId, locale }: { runId: string; locale: Locale }) {
  const reduceMotion = useReducedMotion();
  const [view, setView] = useState<DraftView>(initialDraftView);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { text, phase, truncated } = view;

  useEffect(() => {
    setView(initialDraftView());
    const source = new EventSource(`/api/agents/runs/${encodeURIComponent(runId)}/stream`);
    source.onmessage = (event: MessageEvent<string>) => {
      let chunk: DraftStreamChunk;
      try {
        chunk = JSON.parse(event.data) as DraftStreamChunk;
      } catch {
        return;
      }
      setView((current) => {
        const next = reduceDraftChunk(current, chunk);
        // A cut-off draft is continued by the workflow on the same stream;
        // only the final `done` ends the connection.
        if (!next.listening) source.close();
        return next;
      });
    };
    // A 5xx reconnects by itself (with Last-Event-ID); a 404 stays closed.
    return () => source.close();
  }, [runId]);

  // Rendering 28 000 characters of markdown on every chunk would fight the
  // stream for the main thread; the deferred value lets React render the
  // document a beat behind the words while the header count stays live.
  // `markdownToHtml` escapes every span of content before emitting markup —
  // the draft is model output and untrusted.
  const deferredText = useDeferredValue(text);
  const html = useMemo(() => markdownToHtml(deferredText), [deferredText]);

  // Follow the writing: the newest words stay in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [html]);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const live = phase !== "done";
  const status =
    phase === "done"
      ? [tr("live_draft_done", locale), truncated ? tr("live_draft_truncated", locale) : null]
          .filter(Boolean)
          .join(" · ")
      : phase === "continuing"
        ? tr("live_draft_continuing", locale)
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
        <div dir="auto" className={DOCUMENT_CLASSES} dangerouslySetInnerHTML={{ __html: html }} />
        {live ? (
          <motion.span
            aria-hidden
            className="mt-1 inline-block h-4 w-[2px] bg-violet-500"
            animate={reduceMotion ? undefined : { opacity: [1, 0, 1] }}
            transition={reduceMotion ? undefined : { duration: 1, repeat: Infinity, ease: "linear" }}
          />
        ) : null}
      </div>
    </section>
  );
}
