"use client";

/**
 * The proposal being written, as it is written — the control-room view.
 *
 * Subscribes to GET /api/agents/runs/[id]/stream — the workflow run's `draft`
 * stream replayed as server-sent events — and lets the words arrive on a
 * sheet of paper set on a dark stage. Beside it, a rail of the eighteen
 * sections the drafting stage writes, read off the text itself: a `## N.`
 * heading marks a section as being written, the next heading marks it done
 * (`sectionProgressFromDraft`). Above, a metrics strip of numbers the stream
 * actually reports — elapsed time since the first words, characters, and
 * sections done out of eighteen. No percentage: the stream carries no total
 * and no token count, and a percent would be read as time remaining.
 *
 * Every motion follows the stream: the dot beats while chunks land, the caret
 * blinks while the model is mid-sentence, the scan line sweeps while the
 * draft is live; all of it stops when `done` arrives, when the run has ended,
 * or when the reader prefers reduced motion. `reset` (a retried attempt)
 * clears the page and says so. EventSource reconnects on its own with
 * Last-Event-ID, so a dropped connection resumes where it left off; a run
 * from before the durable workflow has no stream (404) and the panel says so
 * instead of waiting forever.
 */

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownToLine, Check, ExternalLink, Globe, PenLine, Scale } from "lucide-react";
import { tr } from "@/lib/i18n";
import { markdownToHtml } from "@/lib/markdown";
import type { Locale } from "@/lib/types";
import {
  hideArticleMarkers,
  initialDraftView,
  reduceDraftChunk,
  type DraftStreamChunk,
  type DraftView,
  type LiveStreamChannel,
} from "@/lib/agents/draft-stream";
import {
  DRAFT_SECTION_OUTLINE,
  asciiDigits,
  draftCompletionLabel,
  formatElapsed,
  formatRetrievedDate,
  sectionProgressFromDraft,
  type ResearchSourceCard,
} from "@/lib/agents/run-presentation";
import { cn } from "@/lib/utils";

/**
 * Same presentation as the proposal preview, so the live draft looks like the
 * document it becomes. The paper is light in both themes, so the ink is fixed
 * rather than read from the theme's foreground token.
 */
const DOCUMENT_CLASSES = cn(
  "text-[13px] leading-6",
  "[&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2",
  "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:scroll-mt-3",
  "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5",
  "[&_p]:mb-2.5 [&_ul]:mb-2.5 [&_ol]:mb-2.5 [&_li]:ms-4",
  "[&_table]:w-full [&_table]:border-collapse [&_table]:mb-3 [&_table]:text-[12px]",
  "[&_td]:border [&_td]:border-black/10 [&_td]:px-2 [&_td]:py-1 [&_td]:align-top",
  "[&_th]:border [&_th]:border-black/10 [&_th]:px-2 [&_th]:py-1 [&_th]:text-start [&_th]:bg-black/[0.03]",
  "[&_blockquote]:border-s-2 [&_blockquote]:border-violet-500/40 [&_blockquote]:ps-3",
);

/** A recording has no more chunks after its replay; a run that is over does not keep a connection open. */
const IDLE_CLOSE_AFTER_RUN_ENDED_MS = 8_000;
/** How close to the bottom counts as "reading along" for auto-follow. */
const FOLLOW_THRESHOLD_PX = 32;

export type LiveDraftRunOutcome = "live" | "completed" | "failed" | "cancelled";

/** Scroll `el` into view inside `container` only — never the page. */
function revealWithin(container: HTMLElement, el: HTMLElement, reduceMotion: boolean): void {
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const behavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";
  const top = r.top - c.top + container.scrollTop;
  const left = r.left - c.left + container.scrollLeft;
  const vertical = container.scrollHeight > container.clientHeight + 1;
  if (vertical) {
    if (r.top < c.top || r.bottom > c.bottom) {
      container.scrollTo({ top: top - container.clientHeight / 2 + el.offsetHeight / 2, behavior });
    }
    return;
  }
  if (r.left < c.left || r.right > c.right) {
    container.scrollTo({ left: left - container.clientWidth / 2 + el.offsetWidth / 2, behavior });
  }
}

/** The `<h2>` for section `n` in the rendered draft, whatever the title spelling or digit script. */
function findSectionHeading(root: HTMLElement, n: number): HTMLElement | null {
  const pattern = new RegExp(`^\\s*${n}\\.(?=\\s|$)`);
  for (const h of Array.from(root.querySelectorAll<HTMLElement>("h2"))) {
    if (pattern.test(asciiDigits(h.textContent ?? ""))) return h;
  }
  return null;
}

/** `not_configured` → `not configured`; the reasons are codes the research layer writes. */
function humanizeReason(reason: string): string {
  return reason.replace(/[_:]+/g, " ").trim();
}

export function LiveDraftPanel({
  runId,
  locale,
  channel = "draft",
  runOutcome = "live",
  sources,
  sourcesUnavailableReason = null,
}: {
  runId: string;
  locale: Locale;
  /** Which of the run's documents to follow; the contract streams beside the proposal. */
  channel?: LiveStreamChannel;
  /**
   * The run around this stream. Anything but `live` means the words are a
   * recording: the caret stops, the scan line stops, and a stream that never
   * reached `done` is described as such instead of as still writing.
   */
  runOutcome?: LiveDraftRunOutcome;
  /**
   * Live research sources from the completed run's final artifact. Passing the
   * list (even empty) opens the sources drawer; `undefined` hides it.
   */
  sources?: readonly ResearchSourceCard[] | null;
  /** Why the run retrieved no live sources, as the research layer reported it. */
  sourcesUnavailableReason?: string | null;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const isContract = channel === "contract";
  const titleKey = isContract ? "live_contract_title" : "live_draft_title";
  const accent = isContract ? "bg-teal-500" : "bg-violet-500";
  const accentText = isContract ? "text-teal-600 dark:text-teal-300" : "text-violet-600 dark:text-violet-300";
  const runEnded = runOutcome !== "live";
  // Read inside the stream's handlers, which outlive the render that set it.
  const runEndedRef = useRef(runEnded);
  useEffect(() => {
    runEndedRef.current = runEnded;
  }, [runEnded]);

  const [view, setView] = useState<DraftView>(initialDraftView);
  const [streamUnavailable, setStreamUnavailable] = useState(false);
  // An ended run's stream went quiet: whatever arrived is all there is.
  const [replayEnded, setReplayEnded] = useState(false);
  const [following, setFollowing] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  // When the first words arrived and when `done` did: the elapsed clock's ends.
  const [firstDeltaAt, setFirstDeltaAt] = useState<number | null>(null);
  const [doneAt, setDoneAt] = useState<number | null>(null);
  const armIdleCloseRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const { text, phase, truncated } = view;

  useEffect(() => {
    setView(initialDraftView());
    setStreamUnavailable(false);
    setReplayEnded(false);
    setFollowing(true);
    setFirstDeltaAt(null);
    setDoneAt(null);
    const source = new EventSource(
      `/api/agents/runs/${encodeURIComponent(runId)}/stream?channel=${channel}`,
    );
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const armIdleClose = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
      if (!runEndedRef.current) return;
      idleTimer = setTimeout(() => {
        source.close();
        setReplayEnded(true);
      }, IDLE_CLOSE_AFTER_RUN_ENDED_MS);
    };
    armIdleCloseRef.current = armIdleClose;
    source.onmessage = (event: MessageEvent<string>) => {
      let chunk: DraftStreamChunk;
      try {
        chunk = JSON.parse(event.data) as DraftStreamChunk;
      } catch {
        return;
      }
      const at = Date.now();
      if (chunk.kind === "delta") setFirstDeltaAt((first) => first ?? at);
      if (chunk.kind === "reset") {
        setFirstDeltaAt(null);
        setDoneAt(null);
      }
      if (chunk.kind === "done" && !chunk.continues) setDoneAt(at);
      setView((current) => {
        const next = reduceDraftChunk(current, chunk);
        // A cut-off draft is continued by the workflow on the same stream;
        // only the final `done` ends the connection.
        if (!next.listening) source.close();
        return next;
      });
      armIdleClose();
    };
    // A 5xx reconnects by itself (with Last-Event-ID) and passes through here
    // as CONNECTING; a 404 — a run from before the durable workflow — stays
    // CLOSED, and the panel must not sit on "waiting for the first words".
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) setStreamUnavailable(true);
    };
    armIdleClose();
    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      armIdleCloseRef.current = null;
      source.close();
    };
  }, [runId, channel]);

  // The run ending while the panel is open (a cancel, a failure) arms the
  // idle close; the effect above only sees the value at mount.
  useEffect(() => {
    if (runEnded) armIdleCloseRef.current?.();
  }, [runEnded]);

  const listening = view.listening && !streamUnavailable && !replayEnded;
  const live = listening && !runEnded;
  // A stream that never delivered a word and never will: a 404, or an ended
  // run whose recording is empty.
  const nothingToReplay = streamUnavailable || (replayEnded && !text);

  // The elapsed clock ticks only while words can still arrive.
  useEffect(() => {
    if (!live || firstDeltaAt == null) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [live, firstDeltaAt]);

  // Rendering 28 000 characters of markdown on every chunk would fight the
  // stream for the main thread; the deferred value lets React render the
  // document a beat behind the words while the header count stays live.
  // `markdownToHtml` escapes every span of content before emitting markup —
  // the draft is model output and untrusted.
  const deferredText = useDeferredValue(text);
  const html = useMemo(
    () => markdownToHtml(isContract ? hideArticleMarkers(deferredText) : deferredText),
    [deferredText, isContract],
  );

  // The rail reads the eighteen-section outline off the text. The contract
  // is articles, not sections; it gets the stage without the rail.
  const progress = useMemo(
    () => (isContract ? null : sectionProgressFromDraft(text, { finished: phase === "done" })),
    [text, phase, isContract],
  );

  // Follow the writing: the newest words stay in view — unless the reader has
  // scrolled up to read, or jumped to a section.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && following) el.scrollTop = el.scrollHeight;
  }, [html, following]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_THRESHOLD_PX;
    setFollowing(atBottom);
  }, []);

  // Keep the current section's rail item in view, inside the rail only.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || progress?.current == null) return;
    const el = rail.querySelector<HTMLElement>('[aria-current="step"]');
    if (el) revealWithin(rail, el, reduceMotion);
  }, [progress?.current, reduceMotion]);

  const jumpToSection = useCallback(
    (n: number) => {
      const root = scrollRef.current;
      if (!root) return;
      const heading = findSectionHeading(root, n);
      if (!heading) return;
      setFollowing(false);
      const top = heading.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
      root.scrollTo({ top: Math.max(0, top - 12), behavior: reduceMotion ? "auto" : "smooth" });
    },
    [reduceMotion],
  );

  const numberLocale = locale === "ar" ? "ar-SA" : "en-GB";
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  // Since the first words; frozen at `done`. A run that ended without `done`
  // stops ticking, so the clock freezes where the words did.
  const elapsedMs = firstDeltaAt == null ? null : (doneAt ?? now) - firstDeltaAt;

  const status = nothingToReplay
    ? tr("live_draft_stream_unavailable", locale)
    : phase === "done"
      ? [tr("live_draft_done", locale), truncated ? tr("live_draft_truncated", locale) : null]
          .filter(Boolean)
          .join(" · ")
      : runEnded
        ? runOutcome === "completed" || !text
          ? text
            ? tr("live_draft_recorded", locale)
            : tr("live_draft_waiting", locale)
          : tr("live_draft_run_ended", locale)
        : phase === "continuing"
          ? tr("live_draft_continuing", locale)
          : phase === "retrying"
            ? tr("live_draft_retrying", locale)
            : phase === "writing"
              ? tr("live_draft_words", locale, { count: words.toLocaleString(numberLocale) })
              : tr("live_draft_waiting", locale);

  const dotTone = nothingToReplay
    ? "bg-muted-foreground/60"
    : phase === "done"
      ? "bg-emerald-500"
      : runEnded && runOutcome !== "completed"
        ? "bg-amber-500"
        : accent;

  const otherLocale: Locale = locale === "ar" ? "en" : "ar";

  return (
    // No `aria-live` on the section: it would read the whole growing document
    // aloud. The status line below is the live region.
    <section
      aria-label={tr(titleKey, locale)}
      className={cn(
        "relative min-w-0 overflow-hidden rounded-2xl border bg-card shadow-[inset_0_1px_0_0_rgb(255_255_255/0.06)]",
        isContract ? "border-teal-500/25" : "border-violet-500/25",
        live && (isContract ? "shadow-[0_0_0_1px_rgb(20_184_166/0.10),0_0_40px_-16px_rgb(20_184_166/0.45)]" : "glow-ring"),
      )}
    >
      <header
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3.5 py-2.5 sm:px-4",
          isContract ? "border-teal-500/15" : "border-violet-500/15",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="relative flex size-2" aria-hidden>
            {phase === "writing" && live && !reduceMotion ? (
              <span className={cn("absolute inline-flex size-full motion-safe:animate-ping rounded-full opacity-60", accent)} />
            ) : null}
            <span className={cn("relative inline-flex size-2 rounded-full", dotTone)} />
          </span>
          {isContract ? (
            <Scale className={cn("size-3.5", accentText)} aria-hidden />
          ) : (
            <PenLine className={cn("size-3.5", accentText)} aria-hidden />
          )}
          <h4 className="truncate text-xs font-semibold tracking-wide">{tr(titleKey, locale)}</h4>
        </div>

        {/* Metrics the stream reports, and nothing it does not. */}
        <dl className="ms-auto flex items-center gap-3 sm:gap-4">
          <div className="flex flex-col items-end">
            <dt className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{tr("live_draft_elapsed", locale)}</dt>
            <dd className="font-mono text-[11px] font-semibold tabular-nums leading-tight" dir="ltr">
              {elapsedMs == null ? "–:––" : formatElapsed(elapsedMs)}
            </dd>
          </div>
          <div className="flex flex-col items-end">
            <dt className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{tr("live_draft_characters", locale)}</dt>
            <dd className="font-mono text-[11px] font-semibold tabular-nums leading-tight">
              {text.length.toLocaleString(numberLocale)}
            </dd>
          </div>
          {progress ? (
            <div className="flex flex-col items-end">
              <dt className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{tr("live_draft_sections_label", locale)}</dt>
              <dd className="font-mono text-[11px] font-semibold tabular-nums leading-tight">
                {draftCompletionLabel(progress.doneCount, progress.total, locale)}
              </dd>
            </div>
          ) : null}
        </dl>
        <span className="basis-full text-[11px] text-muted-foreground sm:basis-auto sm:ms-1" role="status">
          {status}
        </span>
      </header>

      <div className={cn("grid grid-cols-1", progress && "md:grid-cols-[13.5rem_minmax(0,1fr)]")}>
        {progress ? (
          <nav
            aria-label={tr("live_draft_section_rail", locale)}
            className="min-w-0 border-b border-border/60 bg-muted/30 md:border-b-0 md:border-e"
          >
            <div
              ref={railRef}
              className="relative flex gap-1 overflow-x-auto p-2 scrollbar-thin md:max-h-[30rem] md:flex-col md:overflow-x-visible md:overflow-y-auto md:p-2.5"
            >
              {DRAFT_SECTION_OUTLINE.map((section) => {
                const isDone = progress.done.includes(section.number);
                const isCurrent = progress.current === section.number;
                const isPending = !isDone && !isCurrent;
                const stateKey = isDone
                  ? "live_draft_section_done"
                  : isCurrent
                    ? "live_draft_section_current"
                    : "live_draft_section_pending";
                const title = locale === "ar" ? section.titleAr : section.titleEn;
                const altTitle = otherLocale === "ar" ? section.titleAr : section.titleEn;
                return (
                  <button
                    key={section.number}
                    type="button"
                    onClick={() => jumpToSection(section.number)}
                    disabled={isPending}
                    aria-current={isCurrent ? "step" : undefined}
                    aria-label={`${tr("live_draft_jump_to", locale, { n: section.number.toLocaleString(numberLocale) })} — ${title} — ${tr(stateKey, locale)}`}
                    className={cn(
                      "group/step flex shrink-0 items-start gap-2 rounded-lg border px-2 py-1.5 text-start transition-colors md:shrink md:w-full",
                      "min-w-[10.5rem] md:min-w-0",
                      isCurrent &&
                        (isContract
                          ? "border-teal-500/40 bg-teal-500/10"
                          : "border-violet-500/40 bg-violet-500/10 shadow-[0_0_24px_-12px_rgb(139_92_246/0.8)]"),
                      isDone && "border-emerald-500/25 bg-emerald-500/[0.06] hover:bg-emerald-500/10",
                      isPending && "border-transparent opacity-45",
                      !isPending && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    )}
                  >
                    <span
                      className={cn(
                        "relative mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px]",
                        isDone && "border-emerald-500 bg-emerald-500 text-white",
                        isCurrent && cn("border-transparent", accentText),
                        isPending && "border-border",
                      )}
                      aria-hidden
                    >
                      {isDone ? (
                        <Check className="size-2.5" strokeWidth={3} />
                      ) : isCurrent ? (
                        <span className={cn("size-2 rounded-full", accent, !reduceMotion && "ops-pulse motion-reduce:animate-none")} />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-mono text-[9.5px] font-semibold tabular-nums text-muted-foreground">
                          {String(section.number).padStart(2, "0")}
                        </span>
                        <span
                          className={cn(
                            "truncate text-[11px] font-medium leading-tight",
                            isCurrent ? "text-foreground" : isDone ? "text-foreground/85" : "text-foreground/70",
                          )}
                        >
                          {title}
                        </span>
                      </span>
                      <span className="block truncate text-[9.5px] leading-tight text-muted-foreground" dir="auto">
                        {altTitle}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        ) : null}

        {/* The stage: dark, with a soft aurora and a scan line while live; the paper carries the words. */}
        <div className="relative min-w-0 overflow-hidden ops-stage">
          <div aria-hidden className="ops-aurora motion-reduce:hidden" />
          <div aria-hidden className="pointer-events-none absolute inset-0 ops-stage-grid" />
          {live && !reduceMotion ? <div aria-hidden className="ops-scanline motion-reduce:hidden" /> : null}
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="relative max-h-[22rem] overflow-y-auto px-3 py-4 scrollbar-thin sm:max-h-[30rem] sm:px-6 sm:py-6"
          >
            <article className="ops-paper mx-auto w-full max-w-[46rem] rounded-[3px] px-4 py-5 sm:px-8 sm:py-8">
              {text ? (
                <div dir="auto" className={DOCUMENT_CLASSES} dangerouslySetInnerHTML={{ __html: html }} />
              ) : (
                <p className="text-[12px] italic text-black/45" dir="auto">
                  {status}
                </p>
              )}
              {live ? (
                <motion.span
                  aria-hidden
                  className={cn("mt-1 inline-block h-4 w-[2px] align-text-bottom", accent)}
                  animate={reduceMotion ? undefined : { opacity: [1, 0, 1] }}
                  transition={reduceMotion ? undefined : { duration: 1, repeat: Infinity, ease: "linear" }}
                />
              ) : null}
            </article>
          </div>
          {!following && live ? (
            <button
              type="button"
              onClick={() => setFollowing(true)}
              className="absolute bottom-3 end-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10.5px] font-medium text-white shadow-lg backdrop-blur transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <ArrowDownToLine className="size-3" aria-hidden />
              {tr("live_draft_follow", locale)}
            </button>
          ) : null}
        </div>
      </div>

      {sources !== undefined ? (
        <details className="group/sources border-t border-border/60">
          <summary className="flex cursor-pointer select-none items-center gap-2 px-3.5 py-2.5 text-[11px] font-semibold hover:bg-muted/40 sm:px-4">
            <Globe className="size-3.5 text-cyan-600 dark:text-cyan-300" aria-hidden />
            {tr("live_draft_sources", locale)}
            <span className="rounded-full border border-border/70 px-1.5 py-px font-mono text-[9.5px] font-medium tabular-nums text-muted-foreground">
              {(sources?.length ?? 0).toLocaleString(numberLocale)}
            </span>
            <span className="ms-auto text-[10px] font-normal text-muted-foreground group-open/sources:hidden">
              {tr("live_draft_sources_count", locale, { count: (sources?.length ?? 0).toLocaleString(numberLocale) })}
            </span>
          </summary>
          <div className="space-y-2 px-3.5 pb-3.5 sm:px-4">
            {sources && sources.length > 0 ? (
              <>
                <p className="text-[10.5px] text-muted-foreground">{tr("live_draft_sources_note", locale)}</p>
                <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {sources.map((s) => (
                    <li
                      key={`${s.ref}-${s.url}`}
                      className="min-w-0 rounded-lg border border-border/70 bg-background/60 p-2.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-cyan-500/10 px-1.5 py-px font-mono text-[9.5px] font-semibold text-cyan-700 dark:text-cyan-200">
                          {s.ref}
                        </span>
                        {/* The host as text — no favicon service, no third-party request per source. */}
                        <span className="truncate rounded border border-border/70 px-1.5 py-px font-mono text-[9.5px] text-muted-foreground" dir="ltr">
                          {s.hostname}
                        </span>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          aria-label={tr("live_draft_open_source", locale)}
                          className="ms-auto inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          <ExternalLink className="size-3" aria-hidden />
                        </a>
                      </div>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-1.5 block truncate text-[11.5px] font-medium leading-snug hover:underline"
                        dir="auto"
                      >
                        {s.title}
                      </a>
                      {s.snippet ? (
                        <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-muted-foreground" dir="auto">
                          {s.snippet}
                        </p>
                      ) : null}
                      {s.retrievedAt ? (
                        <p className="mt-1 text-[9.5px] tabular-nums text-muted-foreground">
                          {tr("live_draft_retrieved", locale, { date: formatRetrievedDate(s.retrievedAt, locale) })}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {sourcesUnavailableReason
                  ? tr("live_draft_sources_unavailable", locale, { reason: humanizeReason(sourcesUnavailableReason) })
                  : tr("live_draft_sources_none", locale)}
              </p>
            )}
          </div>
        </details>
      ) : null}
    </section>
  );
}
