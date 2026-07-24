/**
 * Shared bilingual HTML/PDF adapter.
 *
 * Preview and PDF are produced from the same validated document AST and HTML
 * renderer. Font files are bundled from installed OFL packages and embedded as
 * data URLs so PDF generation never depends on a remote font service.
 */

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import {
  parseBilingualDocument,
  renderBilingualHTML,
  type BilingualDocumentSpec,
} from "./bilingual-layout";
import {
  DEFAULT_BILINGUAL_FONT_PAIR_ID,
  findUnsafeBidiControls,
  getFontPairStack,
  resolveFontPair,
  type BilingualFontPairId,
  type SupportedFontWeight,
} from "./bilingual-typography";
import {
  htmlToPdf,
  isPdfBuffer,
  type HtmlToPdfOptions,
} from "./pdf/html-to-pdf";

const requireFromHere = createRequire(import.meta.url);

type FontAsset = Readonly<{
  family: string;
  weight: SupportedFontWeight;
  moduleId: string;
}>;

const FONT_ASSETS = {
  "noto-sans": [
    {
      family: "Noto Sans Arabic",
      weight: 300,
      moduleId:
        "@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-300-normal.woff2",
    },
    {
      family: "Noto Sans Arabic",
      weight: 400,
      moduleId:
        "@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff2",
    },
    {
      family: "Noto Sans Arabic",
      weight: 500,
      moduleId:
        "@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-500-normal.woff2",
    },
    {
      family: "Noto Sans Arabic",
      weight: 600,
      moduleId:
        "@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-600-normal.woff2",
    },
    {
      family: "Noto Sans Arabic",
      weight: 700,
      moduleId:
        "@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-700-normal.woff2",
    },
    {
      family: "Noto Sans",
      weight: 300,
      moduleId:
        "@fontsource/noto-sans/files/noto-sans-latin-300-normal.woff2",
    },
    {
      family: "Noto Sans",
      weight: 400,
      moduleId:
        "@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff2",
    },
    {
      family: "Noto Sans",
      weight: 500,
      moduleId:
        "@fontsource/noto-sans/files/noto-sans-latin-500-normal.woff2",
    },
    {
      family: "Noto Sans",
      weight: 600,
      moduleId:
        "@fontsource/noto-sans/files/noto-sans-latin-600-normal.woff2",
    },
    {
      family: "Noto Sans",
      weight: 700,
      moduleId:
        "@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff2",
    },
  ],
  "ibm-plex-sans": [
    {
      family: "IBM Plex Sans Arabic",
      weight: 300,
      moduleId:
        "@ibm/plex-sans-arabic/fonts/complete/woff2/IBMPlexSansArabic-Light.woff2",
    },
    {
      family: "IBM Plex Sans Arabic",
      weight: 400,
      moduleId:
        "@ibm/plex-sans-arabic/fonts/complete/woff2/IBMPlexSansArabic-Regular.woff2",
    },
    {
      family: "IBM Plex Sans Arabic",
      weight: 500,
      moduleId:
        "@ibm/plex-sans-arabic/fonts/complete/woff2/IBMPlexSansArabic-Medium.woff2",
    },
    {
      family: "IBM Plex Sans Arabic",
      weight: 600,
      moduleId:
        "@ibm/plex-sans-arabic/fonts/complete/woff2/IBMPlexSansArabic-SemiBold.woff2",
    },
    {
      family: "IBM Plex Sans Arabic",
      weight: 700,
      moduleId:
        "@ibm/plex-sans-arabic/fonts/complete/woff2/IBMPlexSansArabic-Bold.woff2",
    },
    {
      family: "IBM Plex Sans",
      weight: 300,
      moduleId:
        "@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-Light.woff2",
    },
    {
      family: "IBM Plex Sans",
      weight: 400,
      moduleId:
        "@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-Regular.woff2",
    },
    {
      family: "IBM Plex Sans",
      weight: 500,
      moduleId:
        "@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-Medium.woff2",
    },
    {
      family: "IBM Plex Sans",
      weight: 600,
      moduleId:
        "@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-SemiBold.woff2",
    },
    {
      family: "IBM Plex Sans",
      weight: 700,
      moduleId:
        "@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-Bold.woff2",
    },
  ],
} as const satisfies Readonly<Record<BilingualFontPairId, readonly FontAsset[]>>;

export const BILINGUAL_FONT_LICENSES = Object.freeze({
  "noto-sans": {
    package: "@fontsource/noto-sans + @fontsource/noto-sans-arabic",
    license: "SIL Open Font License 1.1",
    upstream: "https://github.com/google/fonts",
  },
  "ibm-plex-sans": {
    package: "@ibm/plex-sans + @ibm/plex-sans-arabic",
    license: "SIL Open Font License 1.1",
    upstream: "https://github.com/IBM/plex",
  },
} as const);

export const BILINGUAL_PRINT_PROFILE = Object.freeze({
  paper: "A4",
  targetRasterDpi: 300,
  vectorText: true,
  colorMode: "sRGB",
} as const);

export const BILINGUAL_PERFORMANCE_TARGETS = Object.freeze({
  fiftyPageHtmlRenderMs: 2_000,
  fiftyPagePdfRenderMs: 30_000,
  fiftyPageHeapDeltaMiB: 128,
} as const);

const embeddedFontCssCache = new Map<BilingualFontPairId, Promise<string>>();

function escapeCssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function loadFontFace(asset: FontAsset): Promise<string> {
  const resolvedPath = requireFromHere.resolve(asset.moduleId);
  const bytes = await readFile(resolvedPath);
  const dataUrl = `data:font/woff2;base64,${bytes.toString("base64")}`;
  return `@font-face {
  font-family: "${escapeCssString(asset.family)}";
  src: url("${dataUrl}") format("woff2");
  font-style: normal;
  font-weight: ${String(asset.weight)};
  font-display: block;
}`;
}

/**
 * Return deterministic, self-contained font-face CSS for a supported pair.
 * The promise is cached because a 50-page render should read each font once.
 */
export function getEmbeddedBilingualFontCss(
  fontPair: BilingualFontPairId = DEFAULT_BILINGUAL_FONT_PAIR_ID
): Promise<string> {
  const cached = embeddedFontCssCache.get(fontPair);
  if (cached) return cached;

  resolveFontPair(fontPair);
  const pending = Promise.all(FONT_ASSETS[fontPair].map(loadFontFace)).then(
    (faces) => faces.join("\n\n")
  );
  embeddedFontCssCache.set(fontPair, pending);
  return pending;
}

function fontOverrideCss(fontPair: BilingualFontPairId): string {
  const pair = resolveFontPair(fontPair);
  return `.bilingual-document {
  font-kerning: normal;
  font-synthesis: none;
  font-variant-ligatures: common-ligatures contextual;
  text-rendering: optimizeLegibility;
}

.bilingual-document :lang(en) {
  font-family: ${getFontPairStack(fontPair, "en")};
  line-height: ${String(pair.normalizedLineHeight)};
  hyphens: auto;
}

.bilingual-document :lang(ar) {
  font-family: ${getFontPairStack(fontPair, "ar")};
  line-height: ${String(pair.normalizedLineHeight)};
  letter-spacing: normal;
  word-spacing: normal;
  hyphens: none;
}

.bilingual-document bdi {
  unicode-bidi: isolate;
}

@page {
  size: A4 portrait;
}`;
}

function injectStyle(html: string, css: string): string {
  const marker = "</head>";
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) {
    throw new BilingualPdfQualityError([
      {
        code: "DOCUMENT_SHELL_REQUIRED",
        message: "Bilingual PDF rendering requires a complete HTML document.",
      },
    ]);
  }
  return `${html.slice(0, markerIndex)}<style data-bilingual-fonts>${css}</style>\n${html.slice(
    markerIndex
  )}`;
}

export type BilingualPdfQualityCode =
  | "DOCUMENT_SHELL_REQUIRED"
  | "MISSING_LAYOUT_MARKER"
  | "MISSING_LANGUAGE"
  | "UNPAIRED_LANGUAGE_CELLS"
  | "INVALID_HEADING_COUNT"
  | "REMOTE_FONT_REQUEST"
  | "UNSAFE_BIDI_CONTROL"
  | "PDF_SIGNATURE_INVALID";

export interface BilingualPdfQualityIssue {
  readonly code: BilingualPdfQualityCode;
  readonly message: string;
}

export interface BilingualHtmlQualityReport {
  readonly valid: boolean;
  readonly issues: readonly BilingualPdfQualityIssue[];
  readonly pairCount: number;
  readonly englishCellCount: number;
  readonly arabicCellCount: number;
  readonly embeddedFontFaceCount: number;
}

export class BilingualPdfQualityError extends Error {
  readonly issues: readonly BilingualPdfQualityIssue[];

  constructor(issues: readonly BilingualPdfQualityIssue[]) {
    super(
      `Bilingual PDF quality validation failed: ${issues
        .map((issue) => issue.message)
        .join("; ")}`
    );
    this.name = "BilingualPdfQualityError";
    this.issues = issues;
  }
}

function matchCount(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

export function inspectBilingualHtml(html: string): BilingualHtmlQualityReport {
  const issues: BilingualPdfQualityIssue[] = [];
  const pairCount = matchCount(html, /\bdata-bilingual-pair(?:\s|>)/g);
  const englishCellCount = matchCount(
    html,
    /<(?:div|span)\b[^>]*\bdata-language="en"/g
  );
  const arabicCellCount = matchCount(
    html,
    /<(?:div|span)\b[^>]*\bdata-language="ar"/g
  );
  const embeddedFontFaceCount = matchCount(html, /@font-face\s*\{/g);

  if (!html.includes('data-bilingual-layout-ready="true"')) {
    issues.push({
      code: "MISSING_LAYOUT_MARKER",
      message: "The explicit bilingual layout readiness marker is missing.",
    });
  }
  if (englishCellCount === 0 || arabicCellCount === 0) {
    issues.push({
      code: "MISSING_LANGUAGE",
      message: "Both English and Arabic language cells are required.",
    });
  }
  if (
    pairCount === 0 ||
    englishCellCount !== pairCount ||
    arabicCellCount !== pairCount
  ) {
    issues.push({
      code: "UNPAIRED_LANGUAGE_CELLS",
      message: "Every semantic pair must contain one English and one Arabic cell.",
    });
  }
  if (matchCount(html, /<h1(?:\s|>)/g) !== 1) {
    issues.push({
      code: "INVALID_HEADING_COUNT",
      message: "The document must contain exactly one h1.",
    });
  }
  if (/fonts\.(?:googleapis|gstatic)\.com/i.test(html)) {
    issues.push({
      code: "REMOTE_FONT_REQUEST",
      message: "Remote font requests are not allowed in deterministic PDF output.",
    });
  }
  if (findUnsafeBidiControls(html).length > 0) {
    issues.push({
      code: "UNSAFE_BIDI_CONTROL",
      message: "The rendered document contains an unsafe Unicode bidi control.",
    });
  }

  return {
    valid: issues.length === 0,
    issues,
    pairCount,
    englishCellCount,
    arabicCellCount,
    embeddedFontFaceCount,
  };
}

export interface BilingualRenderOptions {
  readonly target?: "screen" | "print";
  readonly fontPair?: BilingualFontPairId;
}

export interface BilingualRenderArtifact {
  readonly document: BilingualDocumentSpec;
  readonly html: string;
  readonly sha256: string;
  readonly fontPair: BilingualFontPairId;
  readonly quality: BilingualHtmlQualityReport;
}

/**
 * Render the canonical HTML artifact used by both preview and PDF.
 */
export async function renderBilingualArtifact(
  input: unknown,
  options: BilingualRenderOptions = {}
): Promise<BilingualRenderArtifact> {
  const document = parseBilingualDocument(input);
  const fontPair =
    options.fontPair ?? DEFAULT_BILINGUAL_FONT_PAIR_ID;
  const fontCss = await getEmbeddedBilingualFontCss(fontPair);
  const baseHtml = renderBilingualHTML(document, {
    target: options.target ?? "screen",
    includeDocumentShell: true,
  });
  const html = injectStyle(
    baseHtml,
    `${fontCss}\n\n${fontOverrideCss(fontPair)}`
  );
  const quality = inspectBilingualHtml(html);
  if (!quality.valid) {
    throw new BilingualPdfQualityError(quality.issues);
  }
  return {
    document,
    html,
    sha256: createHash("sha256").update(html).digest("hex"),
    fontPair,
    quality,
  };
}

const DEFAULT_BILINGUAL_FOOTER = `<div style="box-sizing:border-box;width:100%;padding:0 14mm;color:#64748b;font-size:8px;display:flex;justify-content:center;gap:5px;font-family:Arial,sans-serif;">
  <span>Page</span>
  <span class="pageNumber"></span>
  <span>/</span>
  <span class="totalPages"></span>
  <span dir="rtl">صفحة</span>
</div>`;

export interface GenerateBilingualPdfOptions extends BilingualRenderOptions {
  readonly pdf?: HtmlToPdfOptions;
}

export interface BilingualPdfArtifact extends BilingualRenderArtifact {
  readonly pdf: Buffer;
}

/**
 * Generate a font-embedded Chromium PDF from the canonical print artifact.
 */
export async function generateBilingualPdf(
  input: unknown,
  options: GenerateBilingualPdfOptions = {}
): Promise<BilingualPdfArtifact> {
  const artifact = await renderBilingualArtifact(input, {
    target: "print",
    fontPair: options.fontPair,
  });
  const pdf = await htmlToPdf(artifact.html, {
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: DEFAULT_BILINGUAL_FOOTER,
    margin: {
      top: "16mm",
      bottom: "18mm",
      left: "14mm",
      right: "14mm",
    },
    waitMs: 0,
    readySelector: "[data-bilingual-layout-ready]",
    readinessTimeoutMs: 10_000,
    ...options.pdf,
  });
  if (!isPdfBuffer(pdf)) {
    throw new BilingualPdfQualityError([
      {
        code: "PDF_SIGNATURE_INVALID",
        message: "Chromium returned an artifact without a PDF signature.",
      },
    ]);
  }
  return { ...artifact, pdf };
}
