"use client";

/**
 * What a completed run produced, as a report — one block, read top to bottom:
 * the headline, the measured numbers, the caveats, the AI review.
 *
 * Every tile shows a value the run wrote into its final artifact or says
 * "Not measured". Coverage is the coverage engine's percent; compliance is the
 * AI reviewer's score out of 100 (a heuristic on the document, labelled as
 * such); export readiness is the validator's verdict; sources are the live
 * research passages actually retrieved. Sections the sectioned draft filled
 * from the deterministic template and requirement ids no section covered are
 * listed by number and id — the bidder has to know before they submit.
 *
 * The actions (open proposal, open contract) are a slot: their enabled state
 * depends on ids the parent owns.
 */

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, Cpu, FileCheck2, Globe, ShieldCheck, Target } from "lucide-react";
import { tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  engineNote,
  sectionFallbackNote,
  uncoveredRequirementsNote,
  type MissionReport as MissionReportData,
} from "@/lib/agents/run-presentation";
import type { Locale } from "@/lib/types";
import { RadialGauge } from "./radial-gauge";

const PRIORITY_CHIP: Record<"HIGH" | "MEDIUM" | "LOW", string> = {
  HIGH: "bg-destructive/10 text-destructive",
  MEDIUM: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  LOW: "bg-muted text-muted-foreground",
};

function Tile({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
  gauge,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  detail?: string | null;
  tone?: "neutral" | "good" | "warn" | "muted";
  gauge?: number | null;
}) {
  return (
    <div
      className={cn(
        "relative flex min-w-0 items-center gap-2.5 rounded-xl border p-2.5",
        tone === "good" && "border-emerald-500/30 bg-emerald-500/[0.07]",
        tone === "warn" && "border-amber-500/35 bg-amber-500/[0.08]",
        tone === "neutral" && "border-border/70 bg-background/60",
        tone === "muted" && "border-dashed border-border/70 bg-transparent",
      )}
    >
      {typeof gauge === "number" ? (
        <RadialGauge
          value={gauge}
          size={40}
          strokeWidth={4}
          className={tone === "warn" ? "text-amber-500" : "text-emerald-500"}
          trackClassName="text-foreground/10"
          ariaLabel={`${label} ${Math.round(gauge)}%`}
        >
          <Icon className="size-3.5 text-foreground/70" aria-hidden />
        </RadialGauge>
      ) : (
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full border",
            tone === "good" && "border-emerald-500/30 text-emerald-600 dark:text-emerald-300",
            tone === "warn" && "border-amber-500/40 text-amber-700 dark:text-amber-300",
            tone === "neutral" && "border-border text-foreground/70",
            tone === "muted" && "border-dashed border-border text-muted-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <p className={cn("truncate text-[13px] font-semibold tabular-nums leading-tight", tone === "muted" && "font-medium text-muted-foreground")}>
          {value}
        </p>
        {detail ? <p className="truncate text-[10px] text-muted-foreground" title={detail}>{detail}</p> : null}
      </div>
    </div>
  );
}

export function MissionReportCard({
  locale,
  report,
  coveragePercent,
  exportReady,
  provider,
  fallback,
  failureKind,
  truncated,
  runDurationLabel,
  hasContract,
  actions,
}: {
  locale: Locale;
  report: MissionReportData | null;
  /** From the status payload when present, else the artifact — the parent already reconciles them. */
  coveragePercent: number | null;
  exportReady: boolean | null;
  provider: string | null;
  fallback: boolean;
  failureKind: string | null;
  truncated: boolean;
  /** Total run time from the agents' stamps, when both ends are known. */
  runDurationLabel: string | null;
  hasContract: boolean;
  actions: ReactNode;
}) {
  const ar = locale === "ar";
  const numberLocale = ar ? "ar-SA" : "en-GB";
  const aiReview = report?.aiReview ?? null;
  const research = report?.liveResearch ?? null;
  const fallbackNote = sectionFallbackNote(report?.sectionFallbacks ?? [], locale);
  const uncoveredNote = uncoveredRequirementsNote(report?.uncoveredRequirementIds ?? [], locale);
  const notMeasured = tr("mission_report_not_measured", locale);

  return (
    <section
      aria-label={tr("mission_report_title", locale)}
      className="relative mx-3 mt-3 overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-card to-teal-500/[0.08] p-3.5 sm:p-4"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg opacity-50 [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />
      <div className="relative">
        <header className="flex flex-wrap items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
            <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-300" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[9.5px] uppercase tracking-[0.16em] text-emerald-700/80 dark:text-emerald-300/80">
              {tr("mission_report_title", locale)}
            </p>
            <h3 className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
              {ar ? "تم إنشاء العطاء ومسودة العقد" : "Proposal & contract draft ready"}
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-foreground/65">
              {hasContract ? <span>{ar ? "عقد ثنائي اللغة" : "Bilingual contract"}</span> : null}
              {runDurationLabel ? (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Clock className="size-3" aria-hidden />
                  {tr("agent_timeline_run_elapsed", locale)} {runDurationLabel}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">{actions}</div>
        </header>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Tile
            icon={Target}
            label={tr("mission_report_coverage", locale)}
            value={coveragePercent != null ? `${coveragePercent.toLocaleString(numberLocale)}%` : notMeasured}
            gauge={coveragePercent}
            tone={coveragePercent == null ? "muted" : coveragePercent >= 80 ? "good" : "warn"}
          />
          <Tile
            icon={ShieldCheck}
            label={tr("mission_report_compliance", locale)}
            value={aiReview ? `${aiReview.compliance.toLocaleString(numberLocale)}/100` : notMeasured}
            gauge={aiReview ? aiReview.compliance : null}
            tone={!aiReview ? "muted" : aiReview.compliance >= 70 ? "good" : "warn"}
            detail={aiReview ? tr(aiReview.fallback ? "mission_report_review_fallback" : "mission_report_review_heuristic", locale) : null}
          />
          <Tile
            icon={FileCheck2}
            label={tr("mission_report_export", locale)}
            value={
              exportReady == null
                ? notMeasured
                : tr(exportReady ? "mission_report_export_ready" : "mission_report_export_review", locale)
            }
            tone={exportReady == null ? "muted" : exportReady ? "good" : "warn"}
          />
          <Tile
            icon={Globe}
            label={tr("mission_report_sources", locale)}
            value={
              research
                ? research.sources.length.toLocaleString(numberLocale)
                : notMeasured
            }
            detail={
              research && research.sources.length === 0 && research.unavailableReason
                ? tr("live_draft_sources_unavailable", locale, {
                    reason: research.unavailableReason.replace(/[_:]+/g, " "),
                  })
                : research && research.queries.length > 0
                  ? `${research.queries.length.toLocaleString(numberLocale)} ${ar ? "استعلامات" : "queries"}`
                  : null
            }
            tone={!research ? "muted" : research.sources.length > 0 ? "neutral" : "warn"}
          />
          <Tile
            icon={Cpu}
            label={tr("mission_report_engine", locale)}
            value={provider ? engineNote(fallback, locale) : notMeasured}
            // The provider id and failure kind stay in the detail's title
            // attribute: useful when reporting a problem, noise in the tile.
            detail={
              provider
                ? [provider, failureKind, !fallback && truncated ? tr("mission_report_truncated", locale) : null]
                    .filter(Boolean)
                    .join(" · ")
                : null
            }
            tone={!provider ? "muted" : fallback ? "warn" : "neutral"}
          />
        </div>

        {fallbackNote || uncoveredNote ? (
          <ul className="mt-2.5 space-y-1.5">
            {fallbackNote ? (
              <li className="flex items-start gap-2 rounded-lg border border-amber-500/35 bg-amber-500/[0.08] px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>{fallbackNote}</span>
              </li>
            ) : null}
            {uncoveredNote ? (
              <li className="flex items-start gap-2 rounded-lg border border-amber-500/35 bg-amber-500/[0.08] px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 break-words [&_code]:font-mono">{uncoveredNote}</span>
              </li>
            ) : null}
          </ul>
        ) : null}

        {aiReview ? (
          <div className="mt-3 rounded-xl border border-border/60 bg-card/70 p-3 text-[11px] backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-xs font-semibold">{tr("mission_report_ai_review", locale)}</span>
              <span className="rounded-md bg-foreground/[0.06] px-1.5 py-px font-mono text-[11px] font-semibold tabular-nums">
                {aiReview.overall.toLocaleString(numberLocale)}/100
              </span>
              <span className="text-muted-foreground tabular-nums">
                {tr("mission_report_review_coverage", locale)} {aiReview.coverage.toLocaleString(numberLocale)} ·{" "}
                {tr("mission_report_review_compliance", locale)} {aiReview.compliance.toLocaleString(numberLocale)} ·{" "}
                {tr("mission_report_review_clarity", locale)} {aiReview.clarity.toLocaleString(numberLocale)} ·{" "}
                {tr("mission_report_review_competitiveness", locale)} {aiReview.competitiveness.toLocaleString(numberLocale)}
              </span>
              <span className="ms-auto text-[10px] text-muted-foreground">
                {tr(aiReview.fallback ? "mission_report_review_fallback" : "mission_report_review_heuristic", locale)}
              </span>
            </div>
            {aiReview.suggestions.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {aiReview.suggestions.slice(0, 3).map((sg, i) => (
                  <li key={`${sg.sectionId}-${i}`} className="flex gap-2">
                    <span className={cn("shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase", PRIORITY_CHIP[sg.priority])}>
                      {sg.priority}
                    </span>
                    <span>
                      {sg.requirementId ? <span className="font-mono">{sg.requirementId} · </span> : null}
                      {ar ? sg.suggestionAr || sg.suggestionEn : sg.suggestionEn || sg.suggestionAr}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
