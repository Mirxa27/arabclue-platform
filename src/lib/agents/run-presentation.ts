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
