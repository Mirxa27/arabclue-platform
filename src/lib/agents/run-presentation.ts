/**
 * Pure presentation helpers for the agent run panel.
 *
 * Extracted from the component because this repo tests with bun's runner and
 * has no DOM environment — logic only gets covered if it lives outside JSX.
 * Type-only imports keep this safe for `"use client"` consumers.
 */

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
