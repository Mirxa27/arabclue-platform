/**
 * Safe adapter from the existing bilingual contract marker format to the
 * structured Phase 2 document model.
 */

import {
  createColumnRatio,
  parseBilingualDocument,
  renderBilingualHTML,
  type BilingualDocumentSpec,
  type BilingualInlineNode,
  type BilingualLayoutMode,
  type PairedParagraphBlock,
} from "./bilingual-layout";
import { createBidiValue } from "./bilingual-typography";
import { generateBilingualPdf } from "./bilingual-pdf";
import { parseContractArticles, type ContractArticle } from "./contract-format";
import { LEGAL_DISCLAIMER } from "./procurement-rules";
import {
  letterheadCompanyName,
  pdfFooterTemplate,
  pdfHeaderTemplate,
  type LetterheadBrand,
  type LetterheadCompany,
} from "./letterhead";

export type ContractLayoutMode =
  | BilingualLayoutMode
  | "side-by-side"
  | "stacked"
  | "tabbed"
  | "legacy";

export interface EnhancedContractExportOpts {
  readonly title: string;
  readonly titleAr?: string | null;
  readonly contentMd: string;
  readonly projectTitle?: string;
  readonly etimadRef?: string | null;
  readonly forPrint?: boolean;
  readonly brand?: LetterheadBrand | null;
  readonly company?: LetterheadCompany | null;
  readonly layoutMode?: ContractLayoutMode;
  /**
   * Either an English fraction (0.3-0.7) or physical percentages
   * `[English, Arabic]`.
   */
  readonly columnRatio?: number | readonly [number, number];
}

export type ContractDocumentDiagnosticCode =
  | "NO_BILINGUAL_ARTICLES"
  | "EMPTY_ENGLISH"
  | "EMPTY_ARABIC"
  | "MISSING_ARABIC_TITLE"
  | "LEGACY_MARKER_ADAPTED";

export interface ContractDocumentDiagnostic {
  readonly code: ContractDocumentDiagnosticCode;
  readonly severity: "error" | "warning";
  readonly path: string;
  readonly message: string;
}

export class ContractBilingualContentError extends Error {
  readonly diagnostics: readonly ContractDocumentDiagnostic[];

  constructor(diagnostics: readonly ContractDocumentDiagnostic[]) {
    super(
      `Contract cannot be compiled as a bilingual document: ${diagnostics
        .map((diagnostic) => diagnostic.message)
        .join("; ")}`
    );
    this.name = "ContractBilingualContentError";
    this.diagnostics = diagnostics;
  }
}

export interface ContractDocumentBuildResult {
  readonly document: BilingualDocumentSpec;
  readonly diagnostics: readonly ContractDocumentDiagnostic[];
  readonly sourceFormat: "canonical-articles" | "legacy-language-blocks";
}

const LEGACY_LANGUAGE_PAIR_PATTERN =
  /:::en\s*\r?\n([\s\S]*?)\r?\n:::\s*\r?\n:::ar\s*\r?\n([\s\S]*?)\r?\n:::/gi;

const ENGLISH_ARTICLE_HEADING =
  /^#{1,6}\s*Article\s+(\d+)\s*(?:—|-)\s*(.+?)\s*$/im;
const ARABIC_ARTICLE_HEADING =
  /^#{1,6}\s*المادة\s+(\d+)\s*(?:—|-)\s*(.+?)\s*$/im;

function inlineText(text: string): readonly BilingualInlineNode[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const nodes: BilingualInlineNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0) nodes.push({ type: "line-break" });
    nodes.push({ type: "text", text: line });
  });
  return nodes;
}

function valueNode(
  value: string,
  language: "en" | "ar",
  valueKind: "identifier" | "technical-term"
): BilingualInlineNode {
  return {
    type: "value",
    value: createBidiValue(value, language),
    valueKind,
  };
}

function stripHeading(value: string, pattern: RegExp): string {
  return value.replace(pattern, "").trim();
}

function parseLegacyArticles(
  markdown: string
): readonly ContractArticle[] {
  const articles: ContractArticle[] = [];
  let match: RegExpExecArray | null;
  LEGACY_LANGUAGE_PAIR_PATTERN.lastIndex = 0;

  while ((match = LEGACY_LANGUAGE_PAIR_PATTERN.exec(markdown)) !== null) {
    const english = match[1].trim();
    const arabic = match[2].trim();
    const englishHeading = english.match(ENGLISH_ARTICLE_HEADING);
    const arabicHeading = arabic.match(ARABIC_ARTICLE_HEADING);
    const number =
      Number(englishHeading?.[1] ?? arabicHeading?.[1]) ||
      articles.length + 1;

    articles.push({
      number,
      titleEn: englishHeading?.[2]?.trim() || `Article ${number}`,
      titleAr: arabicHeading?.[2]?.trim() || `المادة ${number}`,
      bodyEn: stripHeading(english, ENGLISH_ARTICLE_HEADING),
      bodyAr: stripHeading(arabic, ARABIC_ARTICLE_HEADING),
    });
  }

  return articles;
}

function contentParagraphs(value: string): readonly string[] {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  return normalized
    .split(/\n[ \t]*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/**
 * Split two translations into the same number of contiguous fragments without
 * inventing missing text. If paragraph counts differ, multiple source
 * paragraphs are grouped into the corresponding translated fragment.
 */
function partitionParagraphs(
  paragraphs: readonly string[],
  groupCount: number
): readonly string[] {
  if (groupCount <= 0 || paragraphs.length < groupCount) {
    throw new RangeError("Cannot partition paragraphs into empty groups.");
  }

  return Array.from({ length: groupCount }, (_, groupIndex) => {
    const start = Math.floor((groupIndex * paragraphs.length) / groupCount);
    const end = Math.floor(
      ((groupIndex + 1) * paragraphs.length) / groupCount
    );
    return paragraphs.slice(start, end).join("\n\n");
  });
}

function articleBlocks(
  article: ContractArticle,
  articleIndex: number
): readonly PairedParagraphBlock[] {
  const english = contentParagraphs(article.bodyEn);
  const arabic = contentParagraphs(article.bodyAr);
  const fragmentCount = Math.min(english.length, arabic.length);

  if (fragmentCount === 0) return [];

  const englishGroups = partitionParagraphs(english, fragmentCount);
  const arabicGroups = partitionParagraphs(arabic, fragmentCount);
  return englishGroups.map((englishText, fragmentIndex) => ({
    type: "paragraph",
    id: `article-${articleIndex + 1}-paragraph-${fragmentIndex + 1}`,
    content: {
      en: inlineText(englishText),
      ar: inlineText(arabicGroups[fragmentIndex]),
    },
  }));
}

function resolveLayout(opts: EnhancedContractExportOpts): {
  mode: BilingualLayoutMode;
  viewerMode: "both" | "tabs";
} {
  switch (opts.layoutMode) {
    case "serial-ar-first":
    case "stacked":
    case "legacy":
      return { mode: "serial-ar-first", viewerMode: "both" };
    case "serial-en-first":
      return { mode: "serial-en-first", viewerMode: "both" };
    case "tabbed":
      return { mode: "parallel", viewerMode: "tabs" };
    case "parallel":
    case "side-by-side":
    case undefined:
      return { mode: "parallel", viewerMode: "both" };
  }
}

function resolveColumnRatio(
  value: EnhancedContractExportOpts["columnRatio"]
): readonly [number, number] {
  if (Array.isArray(value)) {
    return [value[0], value[1]];
  }
  if (typeof value === "number") {
    const percent = value <= 1 ? value * 100 : value;
    return createColumnRatio(percent);
  }
  return [50, 50];
}

/**
 * Compile existing contract Markdown into the immutable bilingual AST.
 */
export function buildContractBilingualDocument(
  opts: EnhancedContractExportOpts
): ContractDocumentBuildResult {
  const canonicalArticles = parseContractArticles(opts.contentMd);
  const legacyArticles =
    canonicalArticles.length === 0
      ? parseLegacyArticles(opts.contentMd)
      : [];
  const articles =
    canonicalArticles.length > 0 ? canonicalArticles : legacyArticles;
  const diagnostics: ContractDocumentDiagnostic[] = [];

  if (articles.length === 0) {
    throw new ContractBilingualContentError([
      {
        code: "NO_BILINGUAL_ARTICLES",
        severity: "error",
        path: "$.contentMd",
        message:
          "No paired English/Arabic contract articles were found. Final bilingual export is blocked.",
      },
    ]);
  }

  if (legacyArticles.length > 0) {
    diagnostics.push({
      code: "LEGACY_MARKER_ADAPTED",
      severity: "warning",
      path: "$.contentMd",
      message:
        "Legacy :::en/:::ar blocks were compiled through the structured adapter.",
    });
  }

  if (!opts.titleAr?.trim()) {
    diagnostics.push({
      code: "MISSING_ARABIC_TITLE",
      severity: "warning",
      path: "$.titleAr",
      message:
        "No Arabic document title was supplied; the export shows an explicit translation-unavailable label.",
    });
  }

  articles.forEach((article, index) => {
    if (!article.bodyEn.trim()) {
      diagnostics.push({
        code: "EMPTY_ENGLISH",
        severity: "error",
        path: `$.articles[${index}].bodyEn`,
        message: `Article ${article.number} has no English text.`,
      });
    }
    if (!article.bodyAr.trim()) {
      diagnostics.push({
        code: "EMPTY_ARABIC",
        severity: "error",
        path: `$.articles[${index}].bodyAr`,
        message: `Article ${article.number} has no Arabic text.`,
      });
    }
  });

  const blocking = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error"
  );
  if (blocking.length > 0) {
    throw new ContractBilingualContentError(diagnostics);
  }

  const layout = resolveLayout(opts);
  const projectTitle = opts.projectTitle?.trim() || "Not provided";
  const reference = opts.etimadRef?.trim() || "N/A";
  const companyEn = letterheadCompanyName("en", opts.brand, opts.company);
  const companyAr = letterheadCompanyName("ar", opts.brand, opts.company);

  const document: BilingualDocumentSpec = {
    id: "contract-bilingual",
    version: "2",
    title: {
      en: inlineText(opts.title),
      ar: inlineText(opts.titleAr?.trim() || "العنوان العربي غير متاح"),
    },
    layout: {
      mode: layout.mode,
      columnRatio: resolveColumnRatio(opts.columnRatio),
      mobileOrder: "ar-first",
      viewer: {
        mode: layout.viewerMode,
        defaultLanguage: "ar",
      },
    },
    sections: [
      {
        id: "document-control",
        alignmentKey: "contract.document-control",
        title: {
          en: inlineText("Document control"),
          ar: inlineText("ضبط المستند"),
        },
        blocks: [
          {
            type: "paragraph",
            id: "draft-status",
            content: {
              en: inlineText("Draft — not legal advice"),
              ar: inlineText("مسودة — ليست استشارة قانونية"),
            },
          },
          {
            type: "paragraph",
            id: "company",
            content: {
              en: [
                { type: "text", text: "Company: " },
                valueNode(companyEn, "en", "technical-term"),
              ],
              ar: [
                { type: "text", text: "الشركة: " },
                valueNode(companyAr, "ar", "technical-term"),
              ],
            },
          },
          {
            type: "paragraph",
            id: "project-reference",
            content: {
              en: [
                { type: "text", text: "Project: " },
                valueNode(projectTitle, "en", "technical-term"),
                { type: "text", text: " · Reference: " },
                valueNode(reference, "en", "identifier"),
              ],
              ar: [
                { type: "text", text: "المشروع: " },
                valueNode(projectTitle, "ar", "technical-term"),
                { type: "text", text: " · المرجع: " },
                valueNode(reference, "ar", "identifier"),
              ],
            },
          },
        ],
      },
      ...articles.map((article, index) => ({
        id: `article-${index + 1}`,
        alignmentKey: `contract.article.${article.number}`,
        title: {
          en: inlineText(`Article ${article.number} — ${article.titleEn}`),
          ar: inlineText(`المادة ${article.number} — ${article.titleAr}`),
        },
        blocks: articleBlocks(article, index),
      })),
      {
        id: "legal-review",
        alignmentKey: "contract.legal-review",
        title: {
          en: inlineText("Required legal review"),
          ar: inlineText("المراجعة القانونية المطلوبة"),
        },
        blocks: [
          {
            type: "paragraph",
            id: "legal-disclaimer",
            content: {
              en: inlineText(LEGAL_DISCLAIMER),
              ar: inlineText(
                "مسودات العقود والتعليقات التنظيمية أدوات صياغة مساعدة، وليست استشارة قانونية. يلزم مراجعة واعتماد مستشار قانوني بشري مخول قبل التوقيع، ولا يوجد يقين قانوني بنسبة 100%."
              ),
            },
          },
        ],
      },
    ],
  };

  return {
    document: parseBilingualDocument(document),
    diagnostics,
    sourceFormat:
      canonicalArticles.length > 0
        ? "canonical-articles"
        : "legacy-language-blocks",
  };
}

export function buildEnhancedBilingualContractHTML(
  opts: EnhancedContractExportOpts
): string {
  const compiled = buildContractBilingualDocument(opts);
  return renderBilingualHTML(compiled.document, {
    target: opts.forPrint ? "print" : "screen",
  });
}

export function generateEnhancedBilingualContractHTML(
  opts: Omit<EnhancedContractExportOpts, "forPrint">
): Buffer {
  return Buffer.from(
    buildEnhancedBilingualContractHTML({ ...opts, forPrint: false }),
    "utf8"
  );
}

export async function generateEnhancedBilingualContractPDF(
  opts: Omit<EnhancedContractExportOpts, "forPrint">
): Promise<Buffer> {
  const compiled = buildContractBilingualDocument(opts);
  const companyLabel = letterheadCompanyName("en", opts.brand, opts.company);
  const result = await generateBilingualPdf(compiled.document, {
    pdf: {
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: pdfHeaderTemplate({
        companyName: companyLabel,
        etimadRef: opts.etimadRef,
        primaryColor: opts.brand?.primaryColor ?? "#0f766e",
      }),
      footerTemplate: pdfFooterTemplate({
        companyName: companyLabel,
        primaryColor: opts.brand?.primaryColor ?? "#0f766e",
      }),
      margin: {
        top: "18mm",
        bottom: "18mm",
        left: "10mm",
        right: "10mm",
      },
    },
  });
  return result.pdf;
}

export function suggestLayoutMode(contentMd: string): BilingualLayoutMode {
  const articles = parseContractArticles(contentMd);
  const source =
    articles.length > 0 ? articles : parseLegacyArticles(contentMd);
  if (source.length === 0) return "parallel";

  const averageLength =
    source.reduce(
      (total, article) =>
        total + article.bodyEn.length + article.bodyAr.length,
      0
    ) /
    (source.length * 2);
  return averageLength > 2_000 ? "serial-ar-first" : "parallel";
}
