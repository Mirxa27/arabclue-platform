/**
 * Markdown → Word (.docx).
 *
 * The studio's other deliverables are final: a PDF is signed, an HTML preview is
 * read. Word is the one a procurement officer edits, redlines and sends back, so
 * this has to be a real OOXML package with real headings, real tables and real
 * numbering — not paragraphs wearing bullet characters.
 *
 * Blocks come from `markdownBlocks` for the same reason the PDF does: the Word
 * file and the PDF are supposed to be the same document, and two scanners drift.
 * `docx` builds the package, matching how the repo already handles the other
 * Office formats (`exceljs` for xlsx, `pptxgenjs` for pptx).
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  DEFAULT_DOCUMENT_BRAND_COLORS,
  normalizeDocumentBrandColor,
} from "./brand-policy";
import { markdownBlocks, type MarkdownBlock } from "./markdown";
import type { Locale } from "./types";

export type DocxRenderOptions = {
  /** Document title, used for the Word metadata pane. */
  title: string;
  locale: Locale;
  brand?: { primaryColor?: string | null; accentColor?: string | null };
  /** Shown above the body, the way the PDF letterhead does. */
  companyName?: string | null;
};

/** Word wants colours as bare RRGGBB. */
function hex(color: string): string {
  return color.replace(/^#/, "").toUpperCase();
}

const BULLET_REF = "arabclue-bullet";
const NUMBER_REF = "arabclue-number";

/** Half-points, which is how Word sizes text. */
const HEADING_SIZE: Record<number, number> = { 1: 32, 2: 26, 3: 22, 4: 20 };

type Inline = { text: string; bold?: boolean; italic?: boolean; code?: boolean };

/**
 * Split inline markers into runs. Deliberately the same four constructs the
 * HTML renderer understands — `**`/`__` strong, `*` emphasis, backtick code —
 * so a sentence does not come out bold in the PDF and plain in Word.
 *
 * Unmatched markers stay as literal text, which is what the author typed.
 */
export function inlineRuns(text: string): Inline[] {
  const pattern = /\*\*(.+?)\*\*|__(.+?)__|\*([^*\n]+)\*|`([^`]+)`/g;
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start) });
    if (m[1] !== undefined) out.push({ text: m[1], bold: true });
    else if (m[2] !== undefined) out.push({ text: m[2], bold: true });
    else if (m[3] !== undefined) out.push({ text: m[3], italic: true });
    else out.push({ text: m[4], code: true });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length > 0 ? out : [{ text }];
}

function runs(
  text: string,
  rtl: boolean,
  extra?: { bold?: boolean; color?: string; size?: number }
): TextRun[] {
  return inlineRuns(text).map(
    (r) =>
      new TextRun({
        text: r.text,
        bold: r.bold || extra?.bold,
        italics: r.italic,
        font: r.code ? "Courier New" : undefined,
        color: extra?.color,
        size: extra?.size,
        // Set per run, not per paragraph: an Arabic paragraph quoting an English
        // clause reference needs the paragraph bidi and the run direction to be
        // decided separately, and Word honours the run.
        rightToLeft: rtl,
      })
  );
}

function cell(text: string, rtl: boolean, header: boolean, shade: string) {
  return new TableCell({
    shading: header
      ? { type: ShadingType.CLEAR, color: "auto", fill: shade }
      : undefined,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [
      new Paragraph({
        bidirectional: rtl,
        alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: runs(text, rtl, { bold: header, size: 20 }),
      }),
    ],
  });
}

function renderBlock(
  b: MarkdownBlock,
  rtl: boolean,
  primary: string,
  accent: string
): (Paragraph | Table)[] {
  switch (b.kind) {
    case "heading":
      return [
        new Paragraph({
          heading: (
            {
              1: HeadingLevel.HEADING_1,
              2: HeadingLevel.HEADING_2,
              3: HeadingLevel.HEADING_3,
              4: HeadingLevel.HEADING_4,
            } as const
          )[b.level],
          bidirectional: rtl,
          alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
          spacing: { before: 240, after: 120 },
          // Word's built-in heading styles are blue; brand colour wins.
          children: runs(b.text, rtl, {
            bold: true,
            color: hex(primary),
            size: HEADING_SIZE[b.level],
          }),
        }),
      ];

    case "paragraph":
      return [
        new Paragraph({
          bidirectional: rtl,
          alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
          spacing: { after: 120, line: 300 },
          children: runs(b.text, rtl),
        }),
      ];

    case "quote":
      return [
        new Paragraph({
          bidirectional: rtl,
          alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
          spacing: { before: 120, after: 120 },
          indent: rtl ? { right: 360 } : { left: 360 },
          border: {
            [rtl ? "right" : "left"]: {
              style: BorderStyle.SINGLE,
              size: 12,
              color: hex(accent),
              space: 8,
            },
          },
          children: runs(b.text, rtl, { color: "334155" }),
        }),
      ];

    case "rule":
      return [new Paragraph({ thematicBreak: true, spacing: { after: 200 } })];

    case "code":
      // One paragraph per line: a single run with newlines collapses in Word.
      return b.text.split("\n").map(
        (line) =>
          new Paragraph({
            shading: { type: ShadingType.CLEAR, color: "auto", fill: "F1F5F9" },
            spacing: { after: 0 },
            children: [
              new TextRun({ text: line, font: "Courier New", size: 18 }),
            ],
          })
      );

    case "list":
      return b.items.map(
        (item) =>
          new Paragraph({
            bidirectional: rtl,
            alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            numbering: {
              reference: b.ordered ? NUMBER_REF : BULLET_REF,
              level: 0,
            },
            spacing: { after: 60 },
            children: runs(item, rtl),
          })
      );

    case "table": {
      const width = { size: 100, type: WidthType.PERCENTAGE };
      const border = {
        style: BorderStyle.SINGLE,
        size: 4,
        color: "E2E8F0",
      };
      return [
        new Table({
          width,
          visuallyRightToLeft: rtl,
          borders: {
            top: border,
            bottom: border,
            left: border,
            right: border,
            insideHorizontal: border,
            insideVertical: border,
          },
          rows: [
            new TableRow({
              tableHeader: true,
              children: b.header.map((c) => cell(c, rtl, true, "F1F5F9")),
            }),
            ...b.rows.map(
              (row) =>
                new TableRow({
                  children: row.map((c) => cell(c, rtl, false, "FFFFFF")),
                })
            ),
          ],
        }),
        // Word merges adjacent tables that are not separated by a paragraph.
        new Paragraph({ spacing: { after: 120 }, children: [] }),
      ];
    }
  }
}

/**
 * Render a proposal or contract body to a .docx package.
 *
 * Returns the bytes rather than writing anywhere: the caller decides whether
 * this is a download response or a stored artifact.
 */
export async function markdownToDocx(
  md: string,
  opts: DocxRenderOptions
): Promise<Buffer> {
  const rtl = opts.locale === "ar";
  const primary = normalizeDocumentBrandColor(
    opts.brand?.primaryColor,
    DEFAULT_DOCUMENT_BRAND_COLORS.primaryColor
  );
  const accent = normalizeDocumentBrandColor(
    opts.brand?.accentColor,
    DEFAULT_DOCUMENT_BRAND_COLORS.accentColor
  );

  const body: (Paragraph | Table)[] = [];
  if (opts.companyName?.trim()) {
    body.push(
      new Paragraph({
        bidirectional: rtl,
        alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
        spacing: { after: 240 },
        border: {
          bottom: {
            style: BorderStyle.SINGLE,
            size: 12,
            color: hex(accent),
            space: 6,
          },
        },
        children: runs(opts.companyName.trim(), rtl, {
          bold: true,
          color: hex(primary),
          size: 24,
        }),
      })
    );
  }
  for (const block of markdownBlocks(md)) {
    body.push(...renderBlock(block, rtl, primary, accent));
  }
  // Word treats a body with no block-level content as damaged.
  if (body.length === 0) body.push(new Paragraph({ children: [] }));

  const doc = new Document({
    title: opts.title,
    creator: "ArabClue",
    description: opts.title,
    numbering: {
      config: [
        {
          reference: BULLET_REF,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 480, hanging: 240 } } },
            },
          ],
        },
        {
          reference: NUMBER_REF,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 480, hanging: 240 } } },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: {
            // Cairo covers Arabic and Latin; Word falls back on its own if the
            // reviewer's machine lacks it.
            font: rtl ? "Cairo" : "Calibri",
            size: 22,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } },
        },
        children: body,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
