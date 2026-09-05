"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/i18n";
import {
  Bot,
  ExternalLink,
  FileText,
  FolderKanban,
  Navigation,
  Radio,
  Search,
  Shield,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";
import {
  extractDelegationPlan,
  extractDocumentPreview,
  extractRegulatoryPreview,
  isComplianceishTool,
  isDocumentishTool,
  isToolDone,
  isToolFailed,
  isToolRunning,
  kindLabel,
  toolDisplayName,
  toolKind,
  type TheaterToolEvent,
  type ToolKind,
} from "@/lib/agents/platform/mission-tool-parts";
import { extractSearchSources, formatRetrievedDate } from "@/lib/agents/run-presentation";
import { MissionRealtimeWorkflow } from "./mission-realtime-workflow";

/** The tools whose output is a list of dated, linked web sources. */
const SEARCH_SOURCE_TOOLS = new Set(["searchWeb", "researchSaudiLaw"]);

function searchQueryOf(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const q = (input as { query?: unknown }).query;
  return typeof q === "string" && q.trim() ? q.trim() : null;
}

function searchErrorOf(tool: TheaterToolEvent): string | null {
  if (typeof tool.errorText === "string" && tool.errorText.trim()) return tool.errorText.trim();
  const o = tool.output;
  if (o && typeof o === "object" && (o as { ok?: unknown }).ok === false) {
    // A tool result, not an API failure body: `error` here is the plain
    // sentence the tool itself returned (see searchWeb in platform/tools.ts).
    const toolResult = o as { error?: unknown };
    const reason = toolResult.error;
    return typeof reason === "string" && reason.trim() ? reason.trim() : "";
  }
  return null;
}

/**
 * Live web search, as source cards. Each card is one result the tool actually
 * returned — its reference, the host as a monospace chip (no favicon service:
 * a per-source request to a third party for a 16px icon is a tracking beacon
 * on a compliance product), the title as a link, the snippet, and the date it
 * was retrieved. `researchSaudiLaw`'s `liveSources` render the same way, with
 * the `liveResearchStatus` it reports.
 */
function SearchSourcesPanel({ locale, tools }: { locale: "ar" | "en"; tools: TheaterToolEvent[] }) {
  const ar = locale === "ar";
  const searchTools = tools.filter((t) => SEARCH_SOURCE_TOOLS.has(t.name));
  if (searchTools.length === 0) return null;
  const latest = searchTools[searchTools.length - 1];
  const running = isToolRunning(latest.state) || !!latest.preliminary;
  const view = latest.output != null ? extractSearchSources(latest.output) : null;
  const failure = !running && !view ? searchErrorOf(latest) : null;
  const query = view?.query ?? searchQueryOf(latest.input);
  // `researchSaudiLaw` without live sources is a registry synthesis, which the
  // regulation panel already shows; nothing to add here.
  if (!running && !failure && (!view || (view.sources.length === 0 && latest.name !== "searchWeb"))) return null;
  const numberLocale = ar ? "ar-SA" : "en-GB";

  return (
    <motion.div
      layout
      className={cn(
        "relative overflow-hidden rounded-[18px] border backdrop-blur-xl",
        "border-sky-500/20 dark:border-sky-400/15 bg-white/70 dark:bg-zinc-900/50",
        running && "shadow-[0_0_0_1px_rgba(14,165,233,0.12),0_0_28px_-10px_rgba(14,165,233,0.35)]"
      )}
      aria-label={tr("search_sources_title", locale)}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(100%_80%_at_90%_0%,rgba(14,165,233,0.12),transparent_50%)]" />
      <div className="relative p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wide uppercase text-sky-900 dark:text-sky-200">
            <span className="flex size-6 items-center justify-center rounded-full border border-sky-500/20 bg-white/80 dark:bg-white/[0.06]">
              <Search className={cn("size-3.5", running && "motion-safe:animate-pulse")} aria-hidden />
            </span>
            {tr("search_sources_title", locale)}
          </div>
          <Badge
            variant="outline"
            className={cn(
              "rounded-full text-[10px] border-sky-500/20 bg-white/60 dark:bg-white/[0.05] tabular-nums",
              running && "motion-safe:animate-pulse",
              failure != null && "border-destructive/40 bg-destructive/10 text-destructive"
            )}
          >
            {running
              ? ar
                ? "يبحث…"
                : "searching…"
              : failure != null
                ? tr("search_sources_failed", locale)
                : tr("live_draft_sources_count", locale, { count: (view?.sources.length ?? 0).toLocaleString(numberLocale) })}
          </Badge>
        </div>

        {query ? (
          <p className="text-[12px] leading-snug" dir="auto">
            <span className="text-zinc-500">{tr("search_sources_query", locale)}: </span>
            <span className="font-medium">{query}</span>
          </p>
        ) : null}

        {running ? (
          <div className="h-1 overflow-hidden rounded-full bg-sky-500/10">
            <div className="h-full w-full text-sky-500/70 ops-shimmer motion-reduce:hidden" aria-hidden />
          </div>
        ) : null}

        {failure != null ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-2.5 text-[11px] leading-relaxed text-destructive" role="alert" dir="auto">
            {failure || tr("search_sources_failed", locale)}
          </p>
        ) : null}

        {view?.answer ? (
          <p className="line-clamp-3 rounded-xl border border-white/60 dark:border-white/10 bg-white/80 dark:bg-black/20 px-2.5 py-2 text-[11px] leading-snug text-zinc-700 dark:text-zinc-300" dir="auto">
            {view.answer}
          </p>
        ) : null}

        {view && view.sources.length > 0 ? (
          <ol className="space-y-1.5">
            {view.sources.map((s) => (
              <li key={`${s.ref}-${s.url}`} className="min-w-0 rounded-xl border border-white/60 dark:border-white/10 bg-white/80 dark:bg-black/20 px-2.5 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-sky-500/10 px-1.5 py-px font-mono text-[9.5px] font-semibold text-sky-700 dark:text-sky-200">{s.ref}</span>
                  <span className="truncate rounded border border-zinc-200/80 dark:border-white/10 px-1.5 py-px font-mono text-[9.5px] text-zinc-500" dir="ltr">
                    {s.hostname}
                  </span>
                  {s.retrievedAt ? (
                    <span className="ms-auto shrink-0 text-[9.5px] tabular-nums text-zinc-500">
                      {tr("live_draft_retrieved", locale, { date: formatRetrievedDate(s.retrievedAt, locale) })}
                    </span>
                  ) : null}
                </div>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-1 flex items-start gap-1 text-[11.5px] font-medium leading-snug hover:underline"
                  dir="auto"
                >
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  <ExternalLink className="mt-0.5 size-3 shrink-0 text-zinc-400" aria-hidden />
                  <span className="sr-only">{tr("live_draft_open_source", locale)}</span>
                </a>
                {s.snippet ? (
                  <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-zinc-600 dark:text-zinc-400" dir="auto">
                    {s.snippet}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : view && !running && failure == null ? (
          <p className="text-[11px] text-zinc-500">
            {view.status && view.status.startsWith("unavailable")
              ? tr("live_draft_sources_unavailable", locale, { reason: view.status.replace(/^unavailable:?/, "").replace(/[_:]+/g, " ").trim() || "unknown" })
              : tr("search_sources_empty", locale)}
          </p>
        ) : null}

        {view?.note ? <p className="text-[10px] leading-snug text-zinc-500" dir="auto">{view.note}</p> : null}
      </div>
    </motion.div>
  );
}

function KindIcon({ kind, className }: { kind: ToolKind; className?: string }) {
  const c = cn("size-3.5", className);
  switch (kind) {
    case "navigate":
      return <Navigation className={c} />;
    case "project":
      return <FolderKanban className={c} />;
    case "document":
    case "proposal":
      return <FileText className={c} />;
    case "pipeline":
      return <Workflow className={c} />;
    case "compliance":
      return <Shield className={c} />;
    case "search":
      return <Search className={c} />;
    case "mission":
      return <Zap className={c} />;
    default:
      return <Bot className={c} />;
  }
}

function DocumentPreviewPanel({ locale, tools }: { locale: "ar" | "en"; tools: TheaterToolEvent[] }) {
  const ar = locale === "ar";
  const docTools = tools.filter((t) => isDocumentishTool(t.name));
  const failed =
    [...docTools].reverse().find((t) => isToolFailed(t.state)) ?? null;
  const active =
    [...docTools].reverse().find((t) => isToolRunning(t.state) || t.preliminary) ||
    [...docTools].reverse().find((t) => isToolDone(t.state) && t.output != null);

  const preview = active?.output ? extractDocumentPreview(active.output) : null;
  const running = active ? isToolRunning(active.state) || !!active.preliminary : false;

  const statusLines = (() => {
    if (preview?.sections?.length) return preview.sections;
    if (!active && !failed) return [];
    if (failed && !active) {
      return [
        ar ? "فشل توليد المستند — راجع رسالة الخطأ أدناه." : "Document generation failed — see error below.",
      ];
    }
    return [ar ? "جارٍ تشغيل أداة المستند…" : "Document tool running…", ar ? "بانتظار معاينة حقيقية من الأداة…" : "Waiting for real tool preview…"];
  })();

  if (!active && !failed) {
    return (
      <div className="relative overflow-hidden rounded-[16px] border border-zinc-200/70 dark:border-white/[0.08] bg-white/60 dark:bg-zinc-900/40 backdrop-blur-md px-3.5 py-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_80%_at_20%_0%,rgba(6,182,212,0.08),transparent)]" />
        <p className="relative text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          {ar
            ? "لا يوجد مستند قيد الكتابة الآن. اطلب عرضاً أو عقداً وسيظهر النص هنا أثناء كتابته."
            : "No document is being written yet. Ask for a proposal or contract and the text appears here as it is written."}
        </p>
      </div>
    );
  }

  const progress =
    typeof preview?.progress === "number"
      ? Math.min(1, Math.max(0, preview.progress))
      : active && isToolDone(active.state)
        ? 1
        : null;
  const progressLabel =
    progress !== null
      ? `${Math.round(progress * 100)}%`
      : running
        ? ar
          ? "جارٍ…"
          : "in progress…"
        : failed
          ? ar
            ? "فشل"
            : "failed"
          : ar
            ? "جاهز"
            : "ready";

  return (
    <motion.div
      layout
      className={cn(
        "relative overflow-hidden rounded-[18px] border backdrop-blur-xl",
        "border-cyan-500/20 dark:border-cyan-400/15 bg-[radial-gradient(120%_80%_at_20%_0%,rgba(16,185,129,0.11),transparent_52%),radial-gradient(90%_70%_at_90%_10%,rgba(6,182,212,0.12),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.68))] dark:bg-[radial-gradient(120%_80%_at_20%_0%,rgba(16,185,129,0.11),transparent_52%),linear-gradient(180deg,rgba(12,20,20,0.92),rgba(8,12,14,0.86))]",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.7)_inset,0_8px_24px_rgba(6,182,212,0.08)]",
        running && "shadow-[0_0_0_1px_rgba(6,182,212,0.12),0_0_36px_-12px_rgba(6,182,212,0.42),0_1px_0_0_rgba(255,255,255,0.7)_inset]"
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] dark:opacity-[0.08] bg-[linear-gradient(to_right,rgba(0,0,0,0.6)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.6)_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.6)_1px,transparent_1px)] bg-[size:20px_20px]" />
      <div className="relative p-3.5 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={cn("flex size-6 items-center justify-center rounded-full border border-cyan-500/20 bg-white/80 dark:bg-white/[0.06] backdrop-blur", running && "border-cyan-500/30 bg-cyan-500/10")}>
              <FileText className={cn("size-3.5 text-cyan-700 dark:text-cyan-300", running && "motion-safe:animate-pulse")} />
            </span>
            <span className="text-[11px] font-semibold tracking-wide uppercase text-cyan-900 dark:text-cyan-200">{ar ? "معاينة المستند" : "Document preview"}</span>
            {running ? <span className="size-1.5 rounded-full bg-cyan-500 motion-safe:animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.8)]" /> : null}
          </div>
          <Badge variant="outline" className={cn(
            "rounded-full text-[10px] px-2 py-0.5 border-cyan-500/20 bg-white/60 dark:bg-white/[0.05]",
            running && "motion-safe:animate-pulse border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
            failed && !running && "border-destructive/40 bg-destructive/10 text-destructive"
          )}>
            {running ? (ar ? "يولد…" : "generating…") : failed && !active ? (ar ? "فشل" : "failed") : ar ? "جاهز" : "ready"}
          </Badge>
        </div>

        <div>
          <p className="text-[13px] font-[550] leading-snug tracking-tight text-zinc-900 dark:text-zinc-50 truncate">
            {preview?.title ||
              toolDisplayName(active?.name || failed?.name || "getProposal", ar)}
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress !== null ? Math.round(progress * 100) : undefined} aria-valuetext={progressLabel} aria-busy={running || undefined}>
            <motion.div
              className={cn(
                "h-full rounded-full",
                failed && !running
                  ? "bg-destructive/70"
                  : "bg-gradient-to-r from-teal-500 via-cyan-400 to-emerald-400",
                progress === null && running && "w-1/3 motion-safe:animate-pulse"
              )}
              initial={{ width: 0 }}
              animate={{
                width:
                  progress !== null
                    ? `${Math.round(progress * 100)}%`
                    : running
                      ? "33%"
                      : failed
                        ? "100%"
                        : "0%",
              }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <p className="mt-1 font-mono text-[10px] text-zinc-500" aria-live="polite">
            {progressLabel}
            {running ? ` · ${ar ? "مباشر" : "live"}` : ""}
          </p>
        </div>

        <div className="space-y-1.5 font-mono text-[11px] leading-relaxed">
          {statusLines.map((line, i) => (
            <div key={`${line}-${i}`} className={cn("flex gap-2", running && i === statusLines.length - 1 ? "text-cyan-800 dark:text-cyan-200" : "text-zinc-700 dark:text-zinc-300")}>
              <span className="text-cyan-600/60 shrink-0" aria-hidden="true">›</span>
              <span className="truncate">{line}</span>
              {running && i === statusLines.length - 1 ? <span className="inline-block h-3 w-1.5 bg-cyan-500 motion-safe:animate-pulse" aria-hidden="true" /> : null}
            </div>
          ))}
        </div>

        {failed && !active ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-2.5 text-[11px] leading-relaxed text-destructive" role="alert">
            {typeof failed.errorText === "string" && failed.errorText.trim()
              ? failed.errorText.slice(0, 400)
              : ar
                ? "فشلت أداة المستند بدون تفاصيل إضافية."
                : "Document tool failed without additional detail."}
          </p>
        ) : null}

        {preview?.body ? (
          <div className="rounded-xl border border-white/60 dark:border-white/10 bg-white/80 dark:bg-black/30 backdrop-blur p-2.5 max-h-[160px] overflow-y-auto text-[11px] leading-relaxed whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
            {preview.body.slice(0, 900)}
            {preview.body.length > 900 ? "…" : ""}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

function DelegationTeam({ locale, tools }: { locale: "ar" | "en"; tools: TheaterToolEvent[] }) {
  const ar = locale === "ar";
  const plan = extractDelegationPlan(tools);
  if (!plan) return null;
  return (
    <motion.div layout className="relative overflow-hidden rounded-[16px] border border-violet-500/15 dark:border-violet-400/15 bg-white/70 dark:bg-zinc-900/50 backdrop-blur-xl p-3.5 shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_15%_0%,rgba(139,92,246,0.10),transparent_60%)]" />
      <div className="relative">
        <div className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-200">
          <Workflow className="size-3.5" />
          {ar ? "خطة العمل" : "Plan of work"}
        </div>
        <ol className="space-y-1.5">
          {plan.map((step) => (
            <li key={step.id} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-violet-500/20 bg-violet-500/10 text-[10px] font-mono text-violet-700 dark:text-violet-200">{step.order}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium leading-snug">{step.label}</p>
                {step.command ? <p className="text-[11px] leading-snug text-zinc-500 line-clamp-2">{step.command}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </motion.div>
  );
}

function RegulationCheckPanel({ locale, tools, voiceLive }: { locale: "ar" | "en"; tools: TheaterToolEvent[]; voiceLive?: boolean }) {
  const ar = locale === "ar";
  const regTools = tools.filter((t) => isComplianceishTool(t.name));
  const active = [...regTools].reverse().find((t) => isToolRunning(t.state) || t.preliminary) || [...regTools].reverse().find((t) => isToolDone(t.state) && t.output != null);
  const preview = active?.output ? extractRegulatoryPreview(active.output) : null;
  const running = active ? isToolRunning(active.state) || !!active.preliminary : false;

  if (!active && !voiceLive) {
    return (
      <div className="relative overflow-hidden rounded-[16px] border border-zinc-200/70 dark:border-white/10 bg-white/60 dark:bg-zinc-900/40 backdrop-blur-md px-3.5 py-4">
        <p className="text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">{ar ? "لم يبدأ فحص الأنظمة بعد. اسأل عن PDPL أو NCA أو NORA وستظهر النتائج هنا." : "No regulation check yet. Ask about PDPL, NCA, or NORA and the findings appear here."}</p>
      </div>
    );
  }

  // Show every finding the tool actually returned. The old code sliced by
  // `1 + (tick % 5)` on a 140ms interval, which pretended findings streamed
  // in one-by-one when they had all arrived in the same tool response.
  const visibleFindings = preview?.findings ?? [];

  return (
    <motion.div layout className={cn("relative overflow-hidden rounded-[18px] border backdrop-blur-xl", "border-emerald-500/15 dark:border-emerald-400/15 bg-white/70 dark:bg-zinc-900/50", running && "shadow-[0_0_0_1px_rgba(16,185,129,0.12),0_0_28px_-10px_rgba(16,185,129,0.35)]")}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(100%_80%_at_10%_0%,rgba(16,185,129,0.12),transparent_50%)]" />
      <div className="relative p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wide uppercase text-emerald-900 dark:text-emerald-200">
            <span className="flex size-6 items-center justify-center rounded-full border border-emerald-500/20 bg-white/80 dark:bg-white/[0.06]"><Shield className={cn("size-3.5", running && "motion-safe:animate-pulse")} /></span>
            {ar ? "فحص الأنظمة" : "Regulation check"}
          </div>
          <Badge variant="outline" className={cn("rounded-full text-[10px] border-emerald-500/20 bg-white/60 dark:bg-white/[0.05]", running && "motion-safe:animate-pulse")}>{running ? (ar ? "يركّب…" : "synthesizing…") : ar ? "مُركّب" : "synthesized"}</Badge>
        </div>
        <p className="text-[13px] font-medium leading-snug">{preview?.title || toolDisplayName(active?.name || "researchSaudiLaw", ar)}</p>
        {preview?.frameworks?.length ? (
          <div className="flex flex-wrap gap-1">
            {preview.frameworks.map((fw) => (
              <Badge key={fw} variant="secondary" className="rounded-full text-[10px] font-mono bg-emerald-500/10">{fw}</Badge>
            ))}
          </div>
        ) : null}
        {visibleFindings.length ? (
          <div className="space-y-2">
            {visibleFindings.map((f, i) => (
              <div key={`${f.topic}-${i}`} className="rounded-xl border border-white/60 dark:border-white/10 bg-white/80 dark:bg-black/20 backdrop-blur px-2.5 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold">{f.topic}</span>
                  <Badge variant="outline" className="rounded-full text-[8px] h-4">{f.certainty}</Badge>
                </div>
                {f.statement ? <p className="mt-1 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400 line-clamp-3">{f.statement}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

export function MissionToolTheater({
  locale,
  tools,
  voiceLive,
  isCapturing,
  isSpeaking,
  className,
}: {
  locale: "ar" | "en";
  tools: TheaterToolEvent[];
  voiceLive?: boolean;
  isCapturing?: boolean;
  isSpeaking?: boolean;
  className?: string;
}) {
  const ar = locale === "ar";
  const runningCount = tools.filter((t) => isToolRunning(t.state) || t.preliminary).length;
  const active = runningCount > 0 || !!isCapturing || !!isSpeaking;
  const kindCounts = useMemo(() => {
    const map = new Map<ToolKind, number>();
    tools.forEach((t) => {
      const k = toolKind(t.name);
      map.set(k, (map.get(k) ?? 0) + 1);
    });
    return Array.from(map.entries());
  }, [tools]);

  return (
    <aside
      className={cn(
        "group/theater flex min-h-0 w-full min-w-0 max-w-full flex-col gap-3 rounded-[18px] sm:rounded-[20px] border bg-white/[0.66] dark:bg-zinc-900/50 backdrop-blur-[18px] p-2.5 sm:p-3 shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-300",
        "border-zinc-200/70 dark:border-white/[0.08]",
        active && "border-teal-500/20 dark:border-teal-400/20 shadow-[0_0_0_1px_rgba(20,184,166,0.12),0_0_32px_-12px_rgba(20,184,166,0.35),0_1px_0_0_rgba(255,255,255,0.6)_inset]",
        className
      )}
      aria-label={ar ? "نشاط الأدوات" : "Tool activity"}
    >
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200/60 dark:border-white/10 pb-2.5 sm:pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn("flex size-7 sm:size-8 items-center justify-center rounded-full border transition-all duration-300 shrink-0", active ? "border-teal-500/30 bg-teal-500/14 text-teal-700 dark:text-teal-200 shadow-[0_0_16px_-6px_rgba(20,184,166,0.6)]" : "border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-zinc-500")}>
            <Sparkles className={cn("size-3.5", active && "motion-safe:animate-pulse")} />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] sm:text-[13.5px] font-[600] tracking-tight leading-none truncate">{ar ? "المعاينات الحية والمعالجة" : "Live previews & processing"}</p>
            <p className="mt-1 hidden sm:block text-[11px] leading-none text-zinc-500 dark:text-zinc-500 truncate">{voiceLive ? (ar ? "جلسة صوت مباشرة" : "Live voice session") : ar ? "يتتبع كل خطوة لحظياً" : "Tracks every step instantly"}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 sm:gap-1.5">
          {/* The action ticker below already counts live/done steps. */}
          {voiceLive ? <Badge variant="secondary" className="rounded-full gap-1 text-[10px] px-2 py-0.5"><Radio className="size-3" />{ar ? "صوت" : "voice"}</Badge> : null}
        </div>
      </div>

      {kindCounts.length > 1 ? (
        <div className="flex flex-wrap gap-1">
          {kindCounts.map(([k, count]) => (
            <span key={k} className="inline-flex items-center gap-1 rounded-full border border-zinc-200/60 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">
              <KindIcon kind={k} className="size-3" />
              {kindLabel(k, ar)} {count}
            </span>
          ))}
        </div>
      ) : null}

      <div className="space-y-3">
        <DelegationTeam locale={locale} tools={tools} />
        <DocumentPreviewPanel locale={locale} tools={tools} />
        <SearchSourcesPanel locale={locale} tools={tools} />
        <RegulationCheckPanel locale={locale} tools={tools} voiceLive={voiceLive} />
        <MissionRealtimeWorkflow locale={locale} tools={tools} />
      </div>
    </aside>
  );
}
