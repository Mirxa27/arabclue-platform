"use client";

/**
 * The co-pilot rail — a reviewer sitting beside the editor.
 *
 * It reads the buffer and proposes edits; it never writes one. Every card shows
 * the exact text it would replace and the exact text it would put there, and
 * nothing lands until the user presses Accept. That preview gate is the whole
 * point: an AI that edits a bid document behind the writer's back is a
 * liability, not a feature.
 *
 * Passes are throttled to idle, never per keystroke — a suggestion arriving
 * mid-sentence is noise, and each pass is a model call. The writer can also
 * pause the rail entirely or trigger a pass on demand.
 *
 * The writer can ask for something too ("tighten the delivery clause"), and
 * highlighting a passage first scopes the request to it. An answer comes back
 * as the same anchored cards behind the same Accept gate — asking does not open
 * a second door into the document.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { apiErrorText } from "@/lib/api-failure-message";
import {
  applySuggestion,
  applySuggestions,
  changedChars,
  type CopilotRisk,
  type CopilotSuggestion,
} from "@/lib/ai/copilot-anchors";

/** Long enough that it fires between thoughts, not between words. */
const IDLE_MS = 4000;
/** Below this much changed text, another pass is not worth a model call. */
const MIN_DELTA_CHARS = 40;

/** A pass the writer asked for, rather than one the idle timer fired. */
type Asked = { instruction: string; selection?: string };

type RailState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ready"; provider: string; model: string }
  | { kind: "error"; message: string };

const RISK_STYLE: Record<CopilotRisk, string> = {
  LOW: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  MEDIUM: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  HIGH: "border-destructive/50 text-destructive",
};

function t(locale: "ar" | "en", ar: string, en: string): string {
  return locale === "ar" ? ar : en;
}

function riskLabel(locale: "ar" | "en", risk: CopilotRisk): string {
  if (risk === "LOW") return t(locale, "مراجعة سريعة", "Quick check");
  if (risk === "MEDIUM") return t(locale, "تحتاج مراجعة", "Needs review");
  return t(locale, "قرار المستخدم", "Your call");
}

function kindLabel(locale: "ar" | "en", kind: CopilotSuggestion["kind"]): string {
  switch (kind) {
    case "compliance":
      return t(locale, "امتثال", "Compliance");
    case "evidence":
      return t(locale, "أدلة", "Evidence");
    case "structure":
      return t(locale, "بنية", "Structure");
    default:
      return t(locale, "وضوح", "Clarity");
  }
}

export function CopilotRail({
  proposalId,
  markdown,
  locale,
  onApply,
  className,
}: {
  proposalId: string;
  markdown: string;
  locale: "ar" | "en";
  onApply: (next: string) => void;
  className?: string;
}) {
  const [state, setState] = useState<RailState>({ kind: "idle" });
  const [suggestions, setSuggestions] = useState<CopilotSuggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [paused, setPaused] = useState(false);
  const [ask, setAsk] = useState("");
  // The request the visible cards are answering, so a pass triggered by a
  // question does not look identical to one that fired on idle.
  const [answering, setAnswering] = useState<string | null>(null);
  // What the buffer looked like when the last pass ran, so an idle tick after a
  // trivial edit does not spend another model call.
  const reviewedRef = useRef("");
  const inFlightRef = useRef(false);

  const review = useCallback(async (asked?: Asked) => {
    if (inFlightRef.current || !markdown.trim()) return;
    inFlightRef.current = true;
    reviewedRef.current = markdown;
    setAnswering(asked?.instruction ?? null);
    setState({ kind: "running" });
    try {
      const res = await fetch(`/api/proposals/${proposalId}/copilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentMd: markdown,
          locale,
          ...(asked?.instruction ? { instruction: asked.instruction } : {}),
          ...(asked?.selection ? { selection: asked.selection } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        // The route returns bilingual failure bodies; `apiErrorText` reads the
        // right side of the pair instead of stringifying the object.
        setState({ kind: "error", message: apiErrorText(json, locale) });
        return;
      }
      setSuggestions(json.suggestions ?? []);
      setState({
        kind: "ready",
        provider: json.provider ?? "",
        model: json.model ?? "",
      });
    } catch {
      setState({
        kind: "error",
        message: t(locale, "تعذّر الاتصال.", "Could not reach the co-pilot."),
      });
    } finally {
      inFlightRef.current = false;
    }
  }, [markdown, locale, proposalId]);

  useEffect(() => {
    if (paused) return;
    if (changedChars(markdown, reviewedRef.current) < MIN_DELTA_CHARS) return;
    const timer = setTimeout(() => {
      void review();
    }, IDLE_MS);
    return () => clearTimeout(timer);
  }, [markdown, paused, review]);

  const visible = suggestions.filter((s) => !dismissed.has(s.id));
  const live = visible.filter((s) => markdown.includes(s.anchor));

  const accept = (s: CopilotSuggestion) => {
    const next = applySuggestion(markdown, s);
    if (next === null) return;
    // The co-pilot wrote this text; it does not need to read it back. Without
    // this, every Accept queues a pass that can propose reverting the edit.
    reviewedRef.current = next;
    onApply(next);
    setDismissed((prev) => new Set(prev).add(s.id));
  };

  const acceptAll = () => {
    const result = applySuggestions(markdown, live);
    if (result.applied.length === 0) return;
    reviewedRef.current = result.content;
    onApply(result.content);
    setDismissed((prev) => {
      const next = new Set(prev);
      for (const id of result.applied) next.add(id);
      return next;
    });
  };

  const dismissAll = () => {
    setDismissed((prev) => {
      const next = new Set(prev);
      for (const s of visible) next.add(s.id);
      return next;
    });
  };

  const submitAsk = () => {
    const instruction = ask.trim();
    if (!instruction || state.kind === "running") return;
    // ponytail: the browser already tracks what the writer highlighted, so the
    // scope of a request comes from `window.getSelection()` rather than from
    // reaching into the editor's AST for a cursor position. It has to be text
    // that is actually in the buffer — a selection made in the rail itself, or
    // in any chrome around the editor, is not part of the document.
    const picked = window.getSelection()?.toString().trim() ?? "";
    const selection = picked && markdown.includes(picked) ? picked : undefined;
    setAsk("");
    // An explicit request deserves a fresh answer: without this, a card whose
    // content matches one dismissed earlier stays hidden and the rail looks
    // like it ignored the question.
    setDismissed(new Set());
    void review({ instruction, selection });
  };

  return (
    <aside
      className={cn(
        "w-[19rem] shrink-0 flex flex-col gap-2 border-s ps-2 min-h-0",
        className
      )}
      aria-label={t(locale, "مساعد الكتابة", "Writing co-pilot")}
    >
      <header className="shrink-0 flex items-center gap-1">
        <Sparkles className="size-3.5 text-primary" aria-hidden />
        <h2 className="text-[11px] font-semibold flex-1">
          {t(locale, "المساعد الذكي", "Co-pilot")}
        </h2>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          title={
            paused
              ? t(locale, "استئناف المراجعة التلقائية", "Resume auto-review")
              : t(locale, "إيقاف المراجعة التلقائية", "Pause auto-review")
          }
        >
          {paused ? (
            <Play className="size-3.5" aria-hidden />
          ) : (
            <Pause className="size-3.5" aria-hidden />
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={() => void review()}
          disabled={state.kind === "running"}
          title={t(locale, "راجع الآن", "Review now")}
        >
          {state.kind === "running" ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-3.5" aria-hidden />
          )}
        </Button>
      </header>

      {live.length > 1 && (
        <div className="shrink-0 flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-6 flex-1 text-[10px]"
            onClick={acceptAll}
          >
            {t(locale, `قبول الكل (${live.length})`, `Accept all (${live.length})`)}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 flex-1 text-[10px]"
            onClick={dismissAll}
          >
            {t(locale, "تجاهل الكل", "Dismiss all")}
          </Button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pe-1">
        {answering && (
          <p className="text-[10px] text-muted-foreground border-s-2 border-primary/40 ps-2 leading-relaxed">
            {t(locale, "رداً على", "Answering")}: {answering}
          </p>
        )}

        {state.kind === "error" && (
          <p className="text-[11px] text-destructive border border-destructive/30 rounded-md p-2">
            {state.message}
          </p>
        )}

        {state.kind === "running" && visible.length === 0 && (
          <p className="text-[11px] text-muted-foreground p-2">
            {t(locale, "يقرأ المستند…", "Reading the document…")}
          </p>
        )}

        {state.kind === "idle" && (
          <p className="text-[11px] text-muted-foreground p-2 leading-relaxed">
            {t(
              locale,
              "اكتب، وسيراجع المساعد المستند عندما تتوقف — أو اطلب تعديلاً محدداً بالأسفل. لا يُطبَّق أي تعديل قبل موافقتك.",
              "Keep writing — the co-pilot reviews when you pause, or ask it for something specific below. Nothing is applied until you approve it."
            )}
          </p>
        )}

        {state.kind === "ready" && visible.length === 0 && (
          <p className="text-[11px] text-muted-foreground p-2 leading-relaxed">
            {answering
              ? t(
                  locale,
                  "لم يجد المساعد تعديلاً يقترحه لهذا الطلب. جرّب صياغة أدق، أو حدّد الفقرة المقصودة أولاً.",
                  "The co-pilot had no edit to propose for that. Try a more specific request, or highlight the passage you mean first."
                )
              : t(
                  locale,
                  "لا توجد اقتراحات الآن. راجع المستند بنفسك قبل التقديم.",
                  "Nothing to suggest right now. Review the document yourself before submitting."
                )}
          </p>
        )}

        {visible.map((s) => {
          const stale = !markdown.includes(s.anchor);
          return (
            <article
              key={s.id}
              className={cn(
                "border rounded-md p-2 space-y-1.5 text-[11px] bg-card",
                stale && "opacity-50"
              )}
            >
              <div className="flex items-center gap-1 flex-wrap">
                <Badge
                  variant="outline"
                  className={cn("h-4 px-1 text-[9px]", RISK_STYLE[s.risk])}
                >
                  {riskLabel(locale, s.risk)}
                </Badge>
                <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                  {kindLabel(locale, s.kind)}
                </Badge>
              </div>

              <p className="leading-relaxed">{s.rationale}</p>

              <div className="space-y-1 font-mono text-[10px]">
                <p className="line-through text-muted-foreground break-words">
                  {s.anchor}
                </p>
                <p className="text-emerald-700 dark:text-emerald-400 break-words">
                  {s.replacement}
                </p>
              </div>

              {stale ? (
                <p className="text-[10px] text-muted-foreground">
                  {t(
                    locale,
                    "تغيّر هذا النص — الاقتراح لم يعد ينطبق.",
                    "That text changed — this no longer applies."
                  )}
                </p>
              ) : (
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    className="h-6 flex-1 text-[10px] gap-1"
                    onClick={() => accept(s)}
                  >
                    <Check className="size-3" aria-hidden />
                    {t(locale, "قبول", "Accept")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 flex-1 text-[10px] gap-1"
                    onClick={() =>
                      setDismissed((prev) => new Set(prev).add(s.id))
                    }
                  >
                    <X className="size-3" aria-hidden />
                    {t(locale, "تجاهل", "Dismiss")}
                  </Button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <form
        className="shrink-0 flex items-end gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          submitAsk();
        }}
      >
        <label htmlFor="copilot-ask" className="sr-only">
          {t(locale, "اطلب من المساعد تعديلاً", "Ask the co-pilot for a change")}
        </label>
        <textarea
          id="copilot-ask"
          rows={2}
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submitAsk();
            }
          }}
          placeholder={t(
            locale,
            "اطلب تعديلاً… (حدّد نصاً لحصر الطلب فيه)",
            "Ask for a change… (highlight text to scope it)"
          )}
          className="flex-1 min-w-0 resize-none rounded-md border bg-background px-2 py-1.5 text-[11px] leading-relaxed outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button
          type="submit"
          size="sm"
          className="h-8 w-8 p-0 shrink-0"
          disabled={!ask.trim() || state.kind === "running"}
          title={t(locale, "أرسل الطلب", "Send request")}
        >
          <ArrowUp className="size-3.5" aria-hidden />
          <span className="sr-only">{t(locale, "أرسل", "Send")}</span>
        </Button>
      </form>

      {state.kind === "ready" && state.model && (
        <p
          className="shrink-0 text-[9px] text-muted-foreground truncate"
          title={`${state.provider} · ${state.model}`}
        >
          {t(
            locale,
            "اقتراحات مُولّدة بالذكاء الاصطناعي — تحقّق قبل التقديم.",
            "AI-generated suggestions — verify before submitting."
          )}
        </p>
      )}
    </aside>
  );
}
