/**
 * The clarifications register as the drafting agent reads it: every kept,
 * submitted or answered question with its status, so the proposal's
 * "Assumptions, Exclusions & Clarifications" section states the real open
 * points and cites the entity's answers instead of writing generic caveats.
 * Pure formatting; bounded so it fits a prompt slice.
 */

import type { Locale } from "../types";
import type { ClarificationQuote, ClarificationSeverity, ClarificationStatus } from "./types";

export type RegisterItem = Readonly<{
  id: string;
  severity: ClarificationSeverity;
  status: ClarificationStatus;
  titleEn: string;
  titleAr: string;
  questionEn: string;
  questionAr: string;
  quotes: readonly ClarificationQuote[];
  answerMd: string | null;
  answeredAt: string | null;
  submittedAt: string | null;
}>;

export const REGISTER_MAX_ITEMS = 30;
export const REGISTER_MAX_CHARS = 6_000;

/** Title of the prompt block and of the deterministic subsection. */
export const CLARIFICATIONS_BLOCK_TITLE =
  "Clarifications register (questions the bid team kept for the buyer; open ones are assumptions until answered — cite each answer as the entity's response, never as tender text)";

function day(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function statusLine(item: RegisterItem, locale: Locale): string {
  if (item.status === "ANSWERED") {
    const when = day(item.answeredAt);
    return locale === "ar"
      ? `أجابت الجهة${when ? ` بتاريخ ${when}` : ""}: ${item.answerMd ?? ""}`.trim()
      : `Answered by the entity${when ? ` on ${when}` : ""}: ${item.answerMd ?? ""}`.trim();
  }
  if (item.status === "SUBMITTED") {
    const when = day(item.submittedAt);
    return locale === "ar"
      ? `مُقدَّم للجهة${when ? ` بتاريخ ${when}` : ""} — بانتظار الإجابة (يُعامل كافتراض)`
      : `Submitted to the entity${when ? ` on ${when}` : ""} — awaiting answer (treated as an assumption)`;
  }
  return locale === "ar" ? "مفتوح — لم يُقدَّم بعد (يُعامل كافتراض)" : "Open — not yet submitted (treated as an assumption)";
}

function reference(quotes: readonly ClarificationQuote[]): string {
  const q = quotes[0];
  if (!q) return "";
  const where = [q.documentName, q.pageRef ? `p. ${q.pageRef}` : null].filter(Boolean).join(", ");
  return `${where}${where ? " — " : ""}“${q.text.slice(0, 160)}${q.text.length > 160 ? "…" : ""}”`;
}

/** Plain-text register for the prompt: English labels, both questions, bounded. */
export function formatClarificationsRegister(items: readonly RegisterItem[]): string | null {
  const rows = items.slice(0, REGISTER_MAX_ITEMS);
  if (rows.length === 0) return null;
  const lines: string[] = [];
  rows.forEach((item, i) => {
    lines.push(`[C${i + 1}] ${item.severity} · ${item.titleEn}`);
    lines.push(`  Question (EN): ${item.questionEn}`);
    lines.push(`  Question (AR): ${item.questionAr}`);
    const ref = reference(item.quotes);
    if (ref) lines.push(`  Tender reference: ${ref}`);
    lines.push(`  Status: ${statusLine(item, "en")}`);
  });
  const text = lines.join("\n");
  return text.length > REGISTER_MAX_CHARS ? `${text.slice(0, REGISTER_MAX_CHARS)}…` : text;
}

/** Markdown bullets for the deterministic proposal's section 16, in the document's locale. */
export function clarificationsRegisterMarkdown(items: readonly RegisterItem[], locale: Locale): string {
  const rows = items.slice(0, REGISTER_MAX_ITEMS);
  if (rows.length === 0) return "";
  const heading = locale === "ar" ? "**سجل الاستفسارات المقدَّمة للجهة:**" : "**Clarifications register (questions to the entity):**";
  const bullets = rows.map((item, i) => {
    const q = locale === "ar" ? item.questionAr : item.questionEn;
    return `- **C${i + 1}.** ${q} — ${statusLine(item, locale)}`;
  });
  return [heading, ...bullets].join("\n");
}
