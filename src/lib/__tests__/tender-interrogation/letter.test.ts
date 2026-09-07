import { describe, expect, test } from "bun:test";
import {
  EmptyLetterError,
  composeClarificationLetter,
  referenceLine,
} from "@/lib/tender-interrogation/letter";
import { renderBilingualHTML } from "@/lib/bilingual-layout";

const quote = {
  text: "آخر موعد لتقديم العروض هو 15/03/2026 عبر منصة اعتماد.",
  documentId: "d1",
  documentName: "RFP.pdf",
  pageRef: "2",
  sectionHeading: "التعليمات",
};

const input = {
  project: { title: "Cloud Services Platform", titleAr: "منصة الخدمات السحابية", etimadRef: "ET-2026-001" },
  bidder: { name: "Najm Tech LLC", nameAr: "شركة نجم للتقنية" },
  dateIso: "2026-09-07T10:00:00Z",
  items: [
    {
      id: "c1",
      questionEn: "We kindly request the Entity to confirm the governing submission deadline.",
      questionAr: "نرجو من الجهة الحكومية التكرم بتأكيد الموعد النهائي النافذ لتقديم العروض.",
      quotes: [quote],
    },
    {
      id: "c2",
      questionEn: "We kindly request the Entity to confirm whether the 10 days are working days.",
      questionAr: "نرجو من الجهة الحكومية التكرم بتأكيد ما إذا كانت الأيام العشرة أيام عمل.",
      quotes: [],
    },
  ],
};

describe("clarification letter", () => {
  test("refuses to compose an empty letter", () => {
    expect(() => composeClarificationLetter({ ...input, items: [] })).toThrow(EmptyLetterError);
  });

  test("numbers the questions and cites the tender in both locales", () => {
    const letter = composeClarificationLetter(input);
    expect(letter.count).toBe(2);
    expect(letter.markdown.en).toContain("**Date:** 2026-09-07");
    expect(letter.markdown.en).toContain("Etimad reference: ET-2026-001");
    expect(letter.markdown.en).toContain("1. We kindly request the Entity to confirm the governing submission deadline.");
    expect(letter.markdown.en).toContain("2. We kindly request the Entity to confirm whether the 10 days");
    expect(letter.markdown.en).toContain("RFP.pdf, p. 2 — “آخر موعد");
    expect(letter.markdown.en).toContain("General — no quoted passage");
    expect(letter.markdown.ar).toContain("رقم المنافسة: ET-2026-001");
    expect(letter.markdown.ar).toContain("1. نرجو من الجهة الحكومية التكرم بتأكيد الموعد النهائي");
    expect(letter.markdown.ar).toContain("RFP.pdf، ص 2 — “آخر موعد");
    expect(letter.markdown.ar).toContain("شركة نجم للتقنية");
    expect(letter.markdown.en).toContain("Najm Tech LLC");
  });

  test("falls back to the English title and bidder name when Arabic is missing", () => {
    const letter = composeClarificationLetter({
      ...input,
      project: { ...input.project, titleAr: null },
      bidder: { name: "Najm Tech LLC", nameAr: null },
    });
    expect(letter.markdown.ar).toContain("Cloud Services Platform");
    expect(letter.markdown.ar).toContain("Najm Tech LLC");
  });

  test("the paired document validates and renders one table row per question", () => {
    const letter = composeClarificationLetter(input);
    expect(letter.document.sections.map((s) => s.id)).toEqual(["letter-head", "questions", "closing"]);
    const html = renderBilingualHTML(letter.document, { target: "screen", includeDocumentShell: true });
    expect(html).toContain("Clarification requests");
    expect(html).toContain("الاستفسارات");
    expect(html).toContain("ET-2026-001");
    expect((html.match(/<tr/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test("a long quote is truncated in the reference line", () => {
    const line = referenceLine([{ ...quote, text: "x".repeat(400) }], "en");
    expect(line.length).toBeLessThan(260);
    expect(line.endsWith("…”")).toBe(true);
  });
});

describe("plain-text rendition", () => {
  test("drops Markdown markers but keeps numbering and references", async () => {
    const { composeClarificationLetter: compose, markdownToPlainText } = await import("@/lib/tender-interrogation/letter");
    const letter = compose(input);
    expect(letter.plain.ar).not.toContain("**");
    expect(letter.plain.ar).not.toContain("## ");
    expect(letter.plain.ar).toContain("التاريخ: 2026-09-07");
    expect(letter.plain.ar).toContain("1. نرجو من الجهة الحكومية");
    expect(letter.plain.ar).toContain("• المرجع: RFP.pdf، ص 2");
    expect(markdownToPlainText("## Title\n\n**Bold:** x\n   - item")).toBe("Title\n\nBold: x\n   • item");
  });
});
