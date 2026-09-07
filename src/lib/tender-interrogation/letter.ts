/**
 * The clarification letter: the questions the team kept, numbered, each with
 * the tender reference it rests on, as a formal bilingual inquiry addressed to
 * the procuring entity. Two outputs from one source — Markdown per locale for
 * the Etimad inquiries form, and a paired AR|EN document spec for the
 * platform's HTML/PDF engine — so the exported letter and the pasted text
 * never disagree.
 */

import { createBidiValue } from "../bilingual-typography";
import {
  parseBilingualDocument,
  type BilingualDocumentSpec,
  type BilingualInlineNode,
  type BilingualTableRow,
} from "../bilingual-layout";
import type { Locale } from "../types";
import type { ClarificationQuote } from "./types";

export type LetterItem = Readonly<{
  id: string;
  questionEn: string;
  questionAr: string;
  quotes: readonly ClarificationQuote[];
}>;

export type LetterInput = Readonly<{
  project: Readonly<{ title: string; titleAr: string | null; etimadRef: string | null }>;
  bidder: Readonly<{ name: string; nameAr: string | null }>;
  /** ISO date the letter is dated; today when omitted. */
  dateIso?: string;
  items: readonly LetterItem[];
}>;

export type ClarificationLetter = Readonly<{
  markdown: Readonly<Record<Locale, string>>;
  /** The same letter without Markdown markers — what the Etimad inquiries form accepts. */
  plain: Readonly<Record<Locale, string>>;
  document: BilingualDocumentSpec;
  count: number;
}>;

/** Markdown → plain text: headings lose their hashes, emphasis its asterisks; structure and numbering stay. */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^(\s*)-\s+/gm, "$1• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export class EmptyLetterError extends Error {
  constructor() {
    super("A clarification letter needs at least one kept question.");
    this.name = "EmptyLetterError";
  }
}

const MAX_QUOTE_IN_LETTER = 200;

function inlineText(text: string): readonly BilingualInlineNode[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const nodes: BilingualInlineNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0) nodes.push({ type: "line-break" });
    nodes.push({ type: "text", text: line });
  });
  return nodes;
}

function valueNode(value: string, language: Locale): BilingualInlineNode {
  return { type: "value", value: createBidiValue(value, language), valueKind: "identifier" };
}

function isoDate(dateIso?: string): string {
  const d = dateIso ? new Date(dateIso) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

/** "RFP.pdf, p. 4 — “…quote…”" for the letter's reference column. */
export function referenceLine(quotes: readonly ClarificationQuote[], locale: Locale): string {
  if (quotes.length === 0) return locale === "ar" ? "عام — لا يوجد نص مقتبس" : "General — no quoted passage";
  return quotes
    .slice(0, 2)
    .map((q) => {
      const where = [q.documentName, q.pageRef ? (locale === "ar" ? `ص ${q.pageRef}` : `p. ${q.pageRef}`) : null]
        .filter(Boolean)
        .join(locale === "ar" ? "، " : ", ");
      const text = q.text.length > MAX_QUOTE_IN_LETTER ? `${q.text.slice(0, MAX_QUOTE_IN_LETTER)}…` : q.text;
      return `${where}${where ? " — " : ""}“${text}”`;
    })
    .join(locale === "ar" ? "؛ " : "; ");
}

function opening(locale: Locale, input: LetterInput, date: string): string {
  const ref = input.project.etimadRef ?? (locale === "ar" ? "غير متوفر" : "N/A");
  const title = locale === "ar" ? input.project.titleAr || input.project.title : input.project.title;
  const bidder = locale === "ar" ? input.bidder.nameAr || input.bidder.name : input.bidder.name;
  if (locale === "ar") {
    return [
      `**التاريخ:** ${date}`,
      `**الموضوع:** استفسارات بشأن منافسة «${title}» — رقم المنافسة: ${ref}`,
      "",
      "السادة / الجهة الحكومية المحترمين،",
      "",
      `تحية طيبة وبعد، بالإشارة إلى المنافسة المذكورة أعلاه، يتقدم ${bidder} بالاستفسارات التالية خلال فترة الاستفسارات المحددة، ونرجو التكرم بالإجابة عنها ونشرها لجميع المتنافسين:`,
    ].join("\n");
  }
  return [
    `**Date:** ${date}`,
    `**Subject:** Clarification requests regarding tender "${title}" — Etimad reference: ${ref}`,
    "",
    "To the Procuring Entity,",
    "",
    `With reference to the above tender, ${bidder} respectfully submits the following clarification requests within the inquiries period and kindly asks that the answers be published to all bidders:`,
  ].join("\n");
}

function closing(locale: Locale, bidder: string): string {
  if (locale === "ar") {
    return [
      "نؤكد أن هذه الاستفسارات تهدف إلى فهم متطلبات المنافسة فهماً دقيقاً، وأن إجابات الجهة الحكومية المنشورة عبر منصة اعتماد هي المعتمدة.",
      "",
      "وتفضلوا بقبول فائق الاحترام والتقدير،",
      "",
      bidder,
    ].join("\n");
  }
  return [
    "These requests are made solely to understand the tender requirements precisely; the Entity's answers as published through the Etimad portal shall govern.",
    "",
    "Respectfully,",
    "",
    bidder,
  ].join("\n");
}

function markdownFor(locale: Locale, input: LetterInput, date: string): string {
  const bidder = locale === "ar" ? input.bidder.nameAr || input.bidder.name : input.bidder.name;
  const heading = locale === "ar" ? "## الاستفسارات" : "## Clarification requests";
  const refLabel = locale === "ar" ? "المرجع" : "Reference";
  const body = input.items
    .map((item, i) => {
      const question = locale === "ar" ? item.questionAr : item.questionEn;
      return `${i + 1}. ${question}\n   - **${refLabel}:** ${referenceLine(item.quotes, locale)}`;
    })
    .join("\n\n");
  return `${opening(locale, input, date)}\n\n${heading}\n\n${body}\n\n${closing(locale, bidder)}\n`;
}

/**
 * The letter in both forms. Throws `EmptyLetterError` when there is nothing
 * to ask — an empty letter to a government entity is not a document.
 */
export function composeClarificationLetter(input: LetterInput): ClarificationLetter {
  if (input.items.length === 0) throw new EmptyLetterError();
  const date = isoDate(input.dateIso);
  const ref = input.project.etimadRef ?? "N/A";
  const titleEn = input.project.title;
  const titleAr = input.project.titleAr || input.project.title;
  const bidderEn = input.bidder.name;
  const bidderAr = input.bidder.nameAr || input.bidder.name;

  const rows: BilingualTableRow[] = input.items.map((item, i) => ({
    id: `q-${item.id}`,
    cells: {
      n: { content: { en: inlineText(String(i + 1)), ar: inlineText(String(i + 1)) } },
      ref: {
        content: {
          en: inlineText(referenceLine(item.quotes, "en")),
          ar: inlineText(referenceLine(item.quotes, "ar")),
        },
      },
      q: { content: { en: inlineText(item.questionEn), ar: inlineText(item.questionAr) } },
    },
  }));

  const spec: BilingualDocumentSpec = {
    id: "clarification-letter",
    version: "1",
    title: {
      en: inlineText(`Clarification requests — ${titleEn}`),
      ar: inlineText(`استفسارات المنافسة — ${titleAr}`),
    },
    layout: {
      mode: "parallel",
      columnRatio: [50, 50],
      mobileOrder: "ar-first",
      viewer: { mode: "both", defaultLanguage: "ar" },
    },
    sections: [
      {
        id: "letter-head",
        alignmentKey: "clarifications.head",
        title: { en: inlineText("Letter"), ar: inlineText("الخطاب") },
        blocks: [
          {
            type: "paragraph",
            id: "meta",
            content: {
              en: [
                { type: "text", text: "Date: " },
                valueNode(date, "en"),
                { type: "text", text: " · Etimad reference: " },
                valueNode(ref, "en"),
                { type: "text", text: " · Bidder: " },
                valueNode(bidderEn, "en"),
              ],
              ar: [
                { type: "text", text: "التاريخ: " },
                valueNode(date, "ar"),
                { type: "text", text: " · رقم المنافسة: " },
                valueNode(ref, "ar"),
                { type: "text", text: " · المتنافس: " },
                valueNode(bidderAr, "ar"),
              ],
            },
          },
          {
            type: "paragraph",
            id: "opening",
            content: {
              en: inlineText(
                `To the Procuring Entity: with reference to tender "${titleEn}", ${bidderEn} respectfully submits the following clarification requests within the inquiries period and kindly asks that the answers be published to all bidders.`
              ),
              ar: inlineText(
                `السادة الجهة الحكومية المحترمين: بالإشارة إلى منافسة «${titleAr}»، يتقدم ${bidderAr} بالاستفسارات التالية خلال فترة الاستفسارات المحددة، ونرجو التكرم بالإجابة عنها ونشرها لجميع المتنافسين.`
              ),
            },
          },
        ],
      },
      {
        id: "questions",
        alignmentKey: "clarifications.questions",
        title: { en: inlineText("Clarification requests"), ar: inlineText("الاستفسارات") },
        blocks: [
          {
            type: "table",
            id: "questions-table",
            repeatHeader: true,
            columns: [
              { id: "n", header: { en: inlineText("#"), ar: inlineText("#") }, align: "numeric", widthPercent: 6 },
              { id: "ref", header: { en: inlineText("Tender reference"), ar: inlineText("المرجع في المنافسة") }, widthPercent: 34 },
              { id: "q", header: { en: inlineText("Request"), ar: inlineText("الاستفسار") }, widthPercent: 60 },
            ],
            rows,
          },
        ],
      },
      {
        id: "closing",
        alignmentKey: "clarifications.closing",
        title: { en: inlineText("Closing"), ar: inlineText("الخاتمة") },
        blocks: [
          {
            type: "paragraph",
            id: "governing",
            content: {
              en: inlineText(
                "These requests are made solely to understand the tender requirements precisely; the Entity's answers as published through the Etimad portal shall govern."
              ),
              ar: inlineText(
                "تهدف هذه الاستفسارات إلى فهم متطلبات المنافسة فهماً دقيقاً، وتُعدّ إجابات الجهة الحكومية المنشورة عبر منصة اعتماد هي المعتمدة."
              ),
            },
          },
          {
            type: "paragraph",
            id: "signoff",
            content: {
              en: [{ type: "text", text: "Respectfully, " }, valueNode(bidderEn, "en")],
              ar: [{ type: "text", text: "وتفضلوا بقبول فائق الاحترام، " }, valueNode(bidderAr, "ar")],
            },
          },
        ],
      },
    ],
  };

  const markdown = { en: markdownFor("en", input, date), ar: markdownFor("ar", input, date) };
  return {
    markdown,
    plain: { en: markdownToPlainText(markdown.en), ar: markdownToPlainText(markdown.ar) },
    document: parseBilingualDocument(spec),
    count: input.items.length,
  };
}
