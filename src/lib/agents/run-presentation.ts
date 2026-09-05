/**
 * Pure presentation helpers for the agent run panel.
 *
 * Extracted from the component because this repo tests with bun's runner and
 * has no DOM environment — logic only gets covered if it lives outside JSX.
 * Type-only imports keep this safe for `"use client"` consumers.
 */

import { DYNAMIC_TRANSLATION_KEY_MANIFEST, tr } from "@/lib/i18n";
import type { AgentOutput } from "@/lib/types";

export type Locale = "ar" | "en";

/** Resolve an agent's finished-step line, or null when there is nothing to show. */
export function agentOutputText(
  output: AgentOutput | undefined,
  locale: Locale
): string | null {
  if (!output) return null;
  const text = typeof output === "string" ? output : output[locale];
  return text.trim() ? text : null;
}

export type RunTone = "live" | "success" | "danger" | "muted";

const HEADLINE: Record<string, { ar: string; en: string; tone: RunTone }> = {
  RUNNING: { ar: "قيد التشغيل", en: "Live", tone: "live" },
  COMPLETED: { ar: "مكتمل", en: "Completed", tone: "success" },
  FAILED: { ar: "فشل", en: "Failed", tone: "danger" },
  CANCELLED: { ar: "ملغي", en: "Cancelled", tone: "muted" },
  QUEUED: { ar: "في الانتظار", en: "Queued", tone: "live" },
};

const IDLE = { ar: "جاهز", en: "Ready", tone: "muted" as RunTone };

/**
 * Headline badge for the run. A cancelled run must not read as idle — the
 * distinction is the difference between "nothing started" and "someone
 * stopped it".
 */
export function runHeadlineBadge(
  run: { running: boolean; completed: boolean; status: string | null },
  locale: Locale
): { label: string; tone: RunTone } {
  if (run.running) {
    const live = HEADLINE.RUNNING;
    return { label: live[locale], tone: live.tone };
  }
  const entry = run.completed && run.status ? HEADLINE[run.status] : undefined;
  if (!entry) return { label: IDLE[locale], tone: IDLE.tone };
  return { label: entry[locale], tone: entry.tone };
}

const STATUS_KEYS = DYNAMIC_TRANSLATION_KEY_MANIFEST.status;
const AGENT_NAME_KEYS = DYNAMIC_TRANSLATION_KEY_MANIFEST.agentName;

/**
 * A run's status in words. Reads the app-wide vocabulary rather than a local
 * map, which is how the agent panel had drifted to calling a queued run
 * something no other surface called it.
 *
 * An unrecognised status shows itself: a new value from the API is better
 * surfaced raw than blanked out.
 */
export function runStatusLabel(status: string, locale: Locale): string {
  const key = STATUS_KEYS[status as keyof typeof STATUS_KEYS];
  return key ? tr(key, locale) : status;
}

const STATUS_TONE: Record<string, RunTone> = {
  QUEUED: "live",
  RUNNING: "live",
  COMPLETED: "success",
  FAILED: "danger",
  CANCELLED: "muted",
};

/** Colour meaning for a status. Cancelled is muted, not a failure. */
export function runStatusTone(status: string): RunTone {
  return STATUS_TONE[status] ?? "muted";
}

/** The run's project name, falling back when the Arabic title was never set. */
export function runProjectTitle(
  run: { projectTitle: string; projectTitleAr: string | null },
  locale: Locale
): string {
  return locale === "ar" ? run.projectTitleAr ?? run.projectTitle : run.projectTitle;
}

/**
 * Name of the agent a run is currently on. Anything not in the pipeline is
 * shown as-is — a retired agent id on an old run should still read as itself
 * rather than as a blank.
 */
export function currentAgentLabel(value: string, locale: Locale): string {
  const key = AGENT_NAME_KEYS[value as keyof typeof AGENT_NAME_KEYS];
  return key ? tr(key, locale) : value;
}

/** Short date for a history row. Day and time only; the year is rarely useful. */
export function formatRunDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/**
 * Plain-language note about what produced a piece of output. Provider ids and
 * internal failure codes are diagnostics, not copy — but the fact that a run
 * fell back to built-in reference material instead of a model is something the
 * bidder has to know before they submit.
 */
export function engineNote(usedFallback: boolean, locale: Locale): string {
  if (usedFallback) {
    return locale === "ar"
      ? "أُنتج من المراجع المدمجة في أرابكلو — مزود الذكاء الاصطناعي غير متاح"
      : "Produced from Arabclue's built-in reference material — the AI provider was unavailable";
  }
  return locale === "ar" ? "أُنتج بالذكاء الاصطناعي" : "Produced by AI";
}

/* -------------------------------------------------------------------------- */
/* The live draft's section rail                                              */
/* -------------------------------------------------------------------------- */

export type DraftSectionOutlineEntry = Readonly<{
  number: number;
  titleEn: string;
  titleAr: string;
}>;

/**
 * The eighteen sections the drafting stage writes, in order, as
 * `PROPOSAL_SECTIONS` in `drafting.ts` numbers and titles them. Mirrored here
 * because `drafting.ts` imports the LLM client and cannot be bundled into a
 * client component; `agent-control-room.test.ts` pins the two lists together.
 */
export const DRAFT_SECTION_OUTLINE: readonly DraftSectionOutlineEntry[] = [
  { number: 1, titleEn: "Executive Summary", titleAr: "الملخص التنفيذي" },
  { number: 2, titleEn: "Project Understanding", titleAr: "فهم المشروع" },
  { number: 3, titleEn: "Evaluation Alignment", titleAr: "مواءمة معايير التقييم" },
  { number: 4, titleEn: "Requirement Coverage Matrix", titleAr: "مصفوفة تغطية المتطلبات" },
  { number: 5, titleEn: "Execution Methodology", titleAr: "منهجية التنفيذ" },
  { number: 6, titleEn: "Solution Architecture & Delivery Model", titleAr: "المعمارية ونموذج التسليم" },
  { number: 7, titleEn: "Governance & Quality", titleAr: "الحوكمة والجودة" },
  { number: 8, titleEn: "Risk Management", titleAr: "إدارة المخاطر" },
  { number: 9, titleEn: "Security & Privacy Response", titleAr: "الأمن والخصوصية" },
  { number: 10, titleEn: "SLA & Service Management", titleAr: "اتفاقيات مستوى الخدمة وإدارة الخدمة" },
  { number: 11, titleEn: "Team & Qualifications", titleAr: "الفريق والمؤهلات" },
  { number: 12, titleEn: "Relevant Experience", titleAr: "الخبرات ذات الصلة" },
  { number: 13, titleEn: "Compliance Commitments", titleAr: "الالتزامات التنظيمية" },
  { number: 14, titleEn: "Training, Transition & Continuity", titleAr: "التدريب والانتقال والاستمرارية" },
  { number: 15, titleEn: "Financial Forms Structure", titleAr: "هيكل النماذج المالية" },
  { number: 16, titleEn: "Assumptions, Exclusions & Clarifications", titleAr: "الافتراضات والاستثناءات والتوضيحات" },
  { number: 17, titleEn: "Vision 2030 Alignment", titleAr: "المواءمة مع رؤية 2030" },
  { number: 18, titleEn: "Closing", titleAr: "الخاتمة" },
];

export const DRAFT_SECTION_COUNT = DRAFT_SECTION_OUTLINE.length;

/** A section's title in the reader's language. Unknown numbers show themselves. */
export function draftSectionTitle(number: number, locale: Locale): string {
  const entry = DRAFT_SECTION_OUTLINE.find((s) => s.number === number);
  if (!entry) return String(number);
  return locale === "ar" ? entry.titleAr : entry.titleEn;
}

const ARABIC_INDIC_DIGITS = /[٠-٩]/g;

/** Arabic-Indic digits as ASCII, so `## ٣.` counts as section 3. */
export function asciiDigits(text: string): string {
  return text.replace(ARABIC_INDIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660));
}

export type DraftSectionProgress = Readonly<{
  /** Section numbers whose heading has streamed, in order of first appearance. */
  seen: readonly number[];
  /** Sections a later heading has closed — or every seen one, once the draft is finished. */
  done: readonly number[];
  /** The section being written: the last heading seen, while the draft is still open. */
  current: number | null;
  doneCount: number;
  total: number;
}>;

const SECTION_HEADING = /^[ \t]*##[ \t]*(\d{1,2})\.(?=\s|$)/gm;

/**
 * Section progress read off the draft as it streams. The drafting stage
 * writes `## N. Title` headings in order, so the rail derives from the text
 * itself — no protocol change, nothing inferred from time. A section is done
 * when the next heading appears, or when the stream reports `done`; the
 * heading being written is `current`. `### 1.1` sub-headings and unnumbered
 * `## Title` lines are not sections, and numbers outside the outline are
 * ignored rather than shown as an nineteenth step.
 */
export function sectionProgressFromDraft(
  text: string,
  opts: { finished?: boolean; total?: number } = {}
): DraftSectionProgress {
  const total = opts.total ?? DRAFT_SECTION_COUNT;
  const seen: number[] = [];
  for (const match of asciiDigits(text).matchAll(SECTION_HEADING)) {
    const n = Number(match[1]);
    if (n < 1 || n > total || seen.includes(n)) continue;
    seen.push(n);
  }
  if (seen.length === 0) {
    return { seen, done: [], current: null, doneCount: 0, total };
  }
  const current = seen[seen.length - 1];
  const done = opts.finished ? seen : seen.slice(0, -1);
  return {
    seen,
    done,
    current: opts.finished ? null : current,
    doneCount: done.length,
    total,
  };
}

/**
 * "7 / 18" when the total is known; "7 sections" when it is not. Never a
 * percentage: the only honest denominator is the outline, and a reader who
 * sees `39%` assumes it measures time, which it does not.
 */
export function draftCompletionLabel(
  doneCount: number,
  total: number | null,
  locale: Locale
): string {
  const n = doneCount.toLocaleString(locale === "ar" ? "ar-SA" : "en-GB");
  if (total == null || total <= 0) {
    return tr("live_draft_sections_unknown_total", locale, { count: n });
  }
  return tr("live_draft_sections", locale, {
    done: n,
    total: total.toLocaleString(locale === "ar" ? "ar-SA" : "en-GB"),
  });
}

/* -------------------------------------------------------------------------- */
/* Time                                                                       */
/* -------------------------------------------------------------------------- */

/** `m:ss` — or `h:mm:ss` past an hour. Negative and non-finite inputs read as zero. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(ms) ? ms / 1000 : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** Milliseconds between two ISO stamps, or null when either is missing or unreadable. */
export function durationBetween(
  startIso: string | null | undefined,
  endIso: string | null | undefined
): number | null {
  if (!startIso || !endIso) return null;
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start;
}

/**
 * How long an agent took, from the stamps the orchestrator writes on its
 * state. Only a finished agent with both stamps gets a duration — a running
 * one shows elapsed time elsewhere, and a queued one has nothing to report.
 */
export function agentDurationLabel(
  agent: { status: string; startedAt?: string; completedAt?: string }
): string | null {
  if (agent.status !== "completed" && agent.status !== "failed") return null;
  const ms = durationBetween(agent.startedAt, agent.completedAt);
  return ms == null ? null : formatElapsed(ms);
}

/** The earliest `startedAt` across the agents: when the run began doing work. */
export function runStartedAt(
  agents: readonly { startedAt?: string }[]
): string | null {
  let earliest: string | null = null;
  for (const a of agents) {
    if (!a.startedAt || !Number.isFinite(Date.parse(a.startedAt))) continue;
    if (earliest == null || Date.parse(a.startedAt) < Date.parse(earliest)) earliest = a.startedAt;
  }
  return earliest;
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/**
 * "3 minutes ago" / "قبل 3 دقائق". Under a minute reads as "just now" — the
 * history list refreshes on every run event, so seconds would only churn.
 */
export function relativeTime(iso: string, locale: Locale, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const seconds = Math.round((at - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar" : "en", { numeric: "auto" });
  // `numeric: "auto"` renders zero seconds as "now" / "الآن".
  if (Math.abs(seconds) < 60) return rtf.format(0, "second");
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(seconds, "second");
}

/** Day-precision date for a retrieved source; the time of day is noise there. */
export function formatRetrievedDate(iso: string, locale: Locale): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return iso;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(at);
}

/* -------------------------------------------------------------------------- */
/* Research sources                                                           */
/* -------------------------------------------------------------------------- */

export type ResearchSourceCard = Readonly<{
  ref: string;
  title: string;
  url: string;
  /** The host shown as a monospace chip — never a favicon fetched from a third party. */
  hostname: string;
  snippet: string | null;
  retrievedAt: string | null;
}>;

/** `www.` dropped, lower-cased; an unparseable URL yields the raw string, trimmed to fit a chip. */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//i, "").split("/")[0].slice(0, 60);
  }
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function sourceCard(raw: Record<string, unknown>, index: number, fallbackRetrievedAt: string | null): ResearchSourceCard | null {
  if (!isHttpUrl(raw.url)) return null;
  const ref =
    str(raw.ref) ??
    (typeof raw.n === "number" ? `S${raw.n}` : `S${index + 1}`);
  return {
    ref,
    title: str(raw.title) ?? raw.url,
    url: raw.url,
    hostname: hostnameOf(raw.url),
    snippet: str(raw.snippet),
    retrievedAt: str(raw.retrievedAt) ?? fallbackRetrievedAt,
  };
}

/** Cards from a `liveResearch.sources` list (the run's final artifact). */
export function researchSourceCards(sources: unknown): ResearchSourceCard[] {
  if (!Array.isArray(sources)) return [];
  return sources
    .map((s, i) => (s && typeof s === "object" ? sourceCard(s as Record<string, unknown>, i, null) : null))
    .filter((s): s is ResearchSourceCard => s !== null);
}

export type SearchSourcesView = Readonly<{
  query: string | null;
  retrievedAt: string | null;
  answer: string | null;
  note: string | null;
  /** `live`, or `unavailable:<reason>` as `researchSaudiLaw` reports it. */
  status: string | null;
  sources: readonly ResearchSourceCard[];
}>;

/**
 * The sources a tool call actually returned — `searchWeb`'s `results`, or
 * `researchSaudiLaw`'s `liveSources` — as cards. Null when the output carries
 * neither, so the theater shows nothing rather than an empty frame. A failed
 * search (`ok: false`) is not a source list; its error text is shown by the
 * caller.
 */
export function extractSearchSources(output: unknown): SearchSourcesView | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  if (o.ok === false) return null;
  const retrievedAt = str(o.retrievedAt);
  const list = Array.isArray(o.results)
    ? o.results
    : Array.isArray(o.liveSources)
      ? o.liveSources
      : null;
  if (!list) return null;
  const sources = list
    .map((s, i) => (s && typeof s === "object" ? sourceCard(s as Record<string, unknown>, i, retrievedAt) : null))
    .filter((s): s is ResearchSourceCard => s !== null);
  return {
    query: str(o.query),
    retrievedAt,
    answer: str(o.answer),
    note: str(o.note),
    status: str(o.liveResearchStatus),
    sources,
  };
}

/* -------------------------------------------------------------------------- */
/* The mission report                                                         */
/* -------------------------------------------------------------------------- */

export type AiReviewSummary = Readonly<{
  overall: number;
  coverage: number;
  compliance: number;
  clarity: number;
  competitiveness: number;
  suggestions: ReadonlyArray<{
    sectionId: string;
    requirementId: string | null;
    suggestionEn: string;
    suggestionAr: string;
    priority: "HIGH" | "MEDIUM" | "LOW";
  }>;
  provider: string;
  fallback: boolean;
  at: string;
}>;

export type LiveResearchSummary = Readonly<{
  sources: readonly ResearchSourceCard[];
  queries: readonly string[];
  unavailableReason: string | null;
}>;

export type MissionReport = Readonly<{
  coveragePercent: number | null;
  exportReady: boolean | null;
  proposalId: string | null;
  contractId: string | null;
  provider: string | null;
  fallback: boolean;
  failureKind: string | null;
  truncated: boolean;
  aiReview: AiReviewSummary | null;
  liveResearch: LiveResearchSummary | null;
  /** Sections the sectioned draft filled from the deterministic template. */
  sectionFallbacks: readonly number[];
  uncoveredRequirementIds: readonly string[];
}>;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function aiReviewOf(value: unknown): AiReviewSummary | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const overall = num(r.overall);
  if (overall == null) return null;
  const suggestions = Array.isArray(r.suggestions)
    ? r.suggestions
        .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
        .map((s) => ({
          sectionId: str(s.sectionId) ?? "",
          requirementId: str(s.requirementId),
          suggestionEn: str(s.suggestionEn) ?? "",
          suggestionAr: str(s.suggestionAr) ?? "",
          priority: (s.priority === "HIGH" || s.priority === "MEDIUM" ? s.priority : "LOW") as
            | "HIGH"
            | "MEDIUM"
            | "LOW",
        }))
        .filter((s) => s.suggestionEn || s.suggestionAr)
    : [];
  return {
    overall,
    coverage: num(r.coverage) ?? 0,
    compliance: num(r.compliance) ?? 0,
    clarity: num(r.clarity) ?? 0,
    competitiveness: num(r.competitiveness) ?? 0,
    suggestions,
    provider: str(r.provider) ?? "",
    fallback: r.fallback === true,
    at: str(r.at) ?? "",
  };
}

function liveResearchOf(value: unknown): LiveResearchSummary | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  return {
    sources: researchSourceCards(r.sources),
    queries: Array.isArray(r.queries) ? r.queries.filter((q): q is string => typeof q === "string") : [],
    unavailableReason: str(r.unavailableReason),
  };
}

/**
 * A completed run's `finalArtifact`, read defensively — it is persisted JSON
 * that older runs wrote with fewer fields — into what the report shows. Every
 * field is null or empty when the artifact does not carry it; the report
 * then says "not measured" rather than inventing a number.
 */
export function missionReportFromArtifact(artifact: unknown): MissionReport {
  const fa = artifact && typeof artifact === "object" ? (artifact as Record<string, unknown>) : {};
  const coverage = fa.coverage && typeof fa.coverage === "object" ? (fa.coverage as Record<string, unknown>) : {};
  return {
    coveragePercent: num(coverage.coveragePercent),
    exportReady: typeof fa.exportReady === "boolean" ? fa.exportReady : null,
    proposalId: str(fa.proposalId),
    contractId: str(fa.contractId),
    provider: str(fa.provider),
    fallback: fa.fallback === true,
    failureKind: str(fa.failureKind),
    truncated: fa.truncated === true,
    aiReview: aiReviewOf(fa.aiReview),
    liveResearch: liveResearchOf(fa.liveResearch),
    sectionFallbacks: Array.isArray(fa.sectionFallbacks)
      ? Array.from(new Set(fa.sectionFallbacks.filter((n): n is number => typeof n === "number" && Number.isInteger(n)))).sort((a, b) => a - b)
      : [],
    uncoveredRequirementIds: Array.isArray(fa.uncoveredRequirementIds)
      ? fa.uncoveredRequirementIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [],
  };
}

/** `Intl.ListFormat`'s Arabic "unit" style separates with spaces; a comma list is what the report wants. */
const listFormat = (items: readonly string[], locale: Locale): string =>
  items.join(locale === "ar" ? "، " : ", ");

/** "Sections 7, 12 used the deterministic template" — or null when every section was live. */
export function sectionFallbackNote(sections: readonly number[], locale: Locale): string | null {
  if (sections.length === 0) return null;
  const list = listFormat(
    sections.map((n) => n.toLocaleString(locale === "ar" ? "ar-SA" : "en-GB")),
    locale
  );
  return tr(sections.length === 1 ? "mission_report_fallback_section" : "mission_report_fallback_sections", locale, {
    list,
  });
}

/** "3 requirements not covered: R-4, R-9, R-12" — the first eight ids, then "+n". */
export function uncoveredRequirementsNote(ids: readonly string[], locale: Locale): string | null {
  if (ids.length === 0) return null;
  const shown = ids.slice(0, 8);
  const rest = ids.length - shown.length;
  const list = listFormat(rest > 0 ? [...shown, `+${rest}`] : shown, locale);
  return tr("mission_report_uncovered", locale, {
    count: ids.length.toLocaleString(locale === "ar" ? "ar-SA" : "en-GB"),
    list,
  });
}

export type LiveDraftOutcome = "live" | "completed" | "failed" | "cancelled";

/**
 * How the live draft panel should treat its stream: as live words while the
 * run is going, or as a recording of a run that ended one of three ways. An
 * unknown terminal status reads as completed — the stream still replays.
 */
export function liveDraftOutcomeFor(status: string | null, running: boolean): LiveDraftOutcome {
  if (running) return "live";
  if (status === "CANCELLED") return "cancelled";
  if (status === "FAILED") return "failed";
  return "completed";
}

/** What the run poller should do with a `/api/agents/status` response. */
export type PollDisposition = "read" | "retry" | "stop";

/**
 * Whether a status response is worth asking about again.
 *
 * The poller reschedules from its own `catch`, so "throw" means "retry in
 * 2.5s, forever". That is correct for a bad gateway and wrong for a 404: a
 * deleted run, another workspace's run, and an expired session never become
 * readable, and each retry repainted a destructive toast. 429 is the single
 * 4xx that does clear on its own, so it retries with the 5xx family.
 */
export function statusPollDisposition(httpStatus: number): PollDisposition {
  if (httpStatus < 400) return "read";
  if (httpStatus === 429 || httpStatus >= 500) return "retry";
  return "stop";
}
