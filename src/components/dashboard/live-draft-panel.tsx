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
import { PenLine, Scale } from "lucide-react";
import { tr } from "@/lib/i18n";
import { markdownToHtml } from "@/lib/markdown";
import type { Locale } from "@/lib/types";
import {
  initialDraftView,
  reduceDraftChunk,
  type DraftStreamChunk,
  type DraftView,
  type LiveStreamChannel,
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

export function LiveDraftPanel({
  runId,
  locale,
  channel = "draft",
}: {
  runId: string;
  locale: Locale;
  /** Which of the run's documents to follow; the contract streams beside the proposal. */
  channel?: LiveStreamChannel;
}) {
  const reduceMotion = useReducedMotion();
  const titleKey = channel === "contract" ? "live_contract_title" : "live_draft_title";
  const accent = channel === "contract" ? "bg-teal-600" : "bg-violet-500";
  const [view, setView] = useState<DraftView>(initialDraftView);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { text, phase, truncated } = view;

  useEffect(() => {
    setView(initialDraftView());
    const source = new EventSource(
      `/api/agents/runs/${encodeURIComponent(runId)}/stream?channel=${channel}`,
    );
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
  }, [runId, channel]);

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
      aria-label={tr(titleKey, locale)}
      aria-live="polite"
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border shadow-[inset_0_1px_0_0_rgb(255_255_255/0.06)] bg-gradient-to-b via-background to-background",
        channel === "contract"
          ? "border-teal-500/25 from-teal-500/[0.07]"
          : "border-violet-500/25 from-violet-500/[0.07]",
      )}
    >
      <header className={cn("flex items-center gap-2 border-b px-4 py-2.5", channel === "contract" ? "border-teal-500/15" : "border-violet-500/15")}>
        <span className="relative flex size-2" aria-hidden>
          {phase === "writing" && !reduceMotion ? (
            <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", accent)} />
          ) : null}
          <span
            className={cn(
              "relative inline-flex size-2 rounded-full",
              phase === "done" ? "bg-emerald-500" : accent,
            )}
          />
        </span>
        {channel === "contract" ? (
          <Scale className="size-3.5 text-teal-700 dark:text-teal-300" aria-hidden />
        ) : (
          <PenLine className="size-3.5 text-violet-600" aria-hidden />
        )}
        <h4 className="text-xs font-semibold tracking-wide">{tr(titleKey, locale)}</h4>
        <span className="ms-auto text-[11px] tabular-nums text-muted-foreground">{status}</span>
      </header>
      <div ref={scrollRef} className="max-h-72 overflow-y-auto px-4 py-3">
        <div dir="auto" className={DOCUMENT_CLASSES} dangerouslySetInnerHTML={{ __html: html }} />
        {live ? (
          <motion.span
            aria-hidden
            className={cn("mt-1 inline-block h-4 w-[2px]", accent)}
            animate={reduceMotion ? undefined : { opacity: [1, 0, 1] }}
            transition={reduceMotion ? undefined : { duration: 1, repeat: Infinity, ease: "linear" }}
          />
        ) : null}
      </div>
    </section>
  );
}
