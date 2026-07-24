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
  DEFAULT_BILINGUAL_CONFIG,
  parseBilingualDocument,
  renderBilingualHTML,
  type BilingualDocumentSpec,
  type PairedBlock,
  type PairedImageBlock,
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
  htmlToPdfOptionsSchema,
  isPdfBuffer,
  resolvePdfContentDimensions,
  type HtmlToPdfOptions,
} from "./pdf/html-to-pdf";
import { BILINGUAL_LAYOUT_READY_SELECTOR } from "./layout-sync";
import { validateAndNormalizeLogoImage } from "./brand-logo";

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
      moduleId: "@fontsource/noto-sans/files/noto-sans-latin-300-normal.woff2",
    },
    {
      family: "Noto Sans",
      weight: 400,
      moduleId: "@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff2",
    },
    {
      family: "Noto Sans",
      weight: 500,
      moduleId: "@fontsource/noto-sans/files/noto-sans-latin-500-normal.woff2",
    },
    {
      family: "Noto Sans",
      weight: 600,
      moduleId: "@fontsource/noto-sans/files/noto-sans-latin-600-normal.woff2",
    },
    {
      family: "Noto Sans",
      weight: 700,
      moduleId: "@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff2",
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
      moduleId: "@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-Light.woff2",
    },
    {
      family: "IBM Plex Sans",
      weight: 400,
      moduleId: "@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-Regular.woff2",
    },
    {
      family: "IBM Plex Sans",
      weight: 500,
      moduleId: "@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-Medium.woff2",
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
      moduleId: "@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-Bold.woff2",
    },
  ],
} as const satisfies Readonly<
  Record<BilingualFontPairId, readonly FontAsset[]>
>;

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
  fontPair: BilingualFontPairId = DEFAULT_BILINGUAL_FONT_PAIR_ID,
): Promise<string> {
  const cached = embeddedFontCssCache.get(fontPair);
  if (cached) return cached;

  resolveFontPair(fontPair);
  const pending = Promise.all(FONT_ASSETS[fontPair].map(loadFontFace)).then(
    (faces) => faces.join("\n\n"),
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
    markerIndex,
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
  | "UNRESOLVED_PUBLIC_IMAGE"
  | "INVALID_IMAGE_ASSET"
  | "IMAGE_PIXEL_LIMIT_EXCEEDED"
  | "IMAGE_RESOLUTION_INSUFFICIENT"
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
        .join("; ")}`,
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
    /<(?:div|span)\b[^>]*\bdata-language="en"/g,
  );
  const arabicCellCount = matchCount(
    html,
    /<(?:div|span)\b[^>]*\bdata-language="ar"/g,
  );
  const embeddedFontFaceCount = matchCount(html, /@font-face\s*\{/g);

  const hasPendingLayoutMarker =
    html.includes('data-bilingual-layout-state="pending"') &&
    html.includes('data-bilingual-layout-ready="false"');
  const hasReadyLayoutMarker =
    html.includes('data-bilingual-layout-state="ready"') &&
    html.includes('data-bilingual-layout-ready="true"');
  if (!hasPendingLayoutMarker && !hasReadyLayoutMarker) {
    issues.push({
      code: "MISSING_LAYOUT_MARKER",
      message:
        "The explicit pending or synchronized bilingual layout marker is missing.",
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
      message:
        "Every semantic pair must contain one English and one Arabic cell.",
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
      message:
        "Remote font requests are not allowed in deterministic PDF output.",
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
  options: BilingualRenderOptions = {},
): Promise<BilingualRenderArtifact> {
  const document = parseBilingualDocument(input);
  const fontPair = options.fontPair ?? DEFAULT_BILINGUAL_FONT_PAIR_ID;
  const fontCss = await getEmbeddedBilingualFontCss(fontPair);
  const baseHtml = renderBilingualHTML(document, {
    target: options.target ?? "screen",
    includeDocumentShell: true,
  });
  const html = injectStyle(
    baseHtml,
    `${fontCss}\n\n${fontOverrideCss(fontPair)}`,
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
  /**
   * Optional trusted resolver for application-relative public image paths.
   * Returned bytes are still magic-checked, decoded, dimension-bounded and
   * re-encoded before Chromium receives them.
   */
  readonly resolvePublicImage?: (path: string) => Promise<Buffer>;
}

export interface BilingualPdfArtifact extends BilingualRenderArtifact {
  readonly pdf: Buffer;
}

const PDF_DATA_IMAGE_PATTERN =
  /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_TOTAL_IMAGE_PIXELS = 30_000_000;

function imageExtension(mime: string): string {
  return mime === "image/jpeg"
    ? ".jpg"
    : mime === "image/webp"
      ? ".webp"
      : ".png";
}

function imageQualityError(
  code:
    | "UNRESOLVED_PUBLIC_IMAGE"
    | "INVALID_IMAGE_ASSET"
    | "IMAGE_PIXEL_LIMIT_EXCEEDED"
    | "IMAGE_RESOLUTION_INSUFFICIENT",
  message: string,
): BilingualPdfQualityError {
  return new BilingualPdfQualityError([{ code, message }]);
}

/**
 * Produce a PDF-only document whose images are entirely self-contained and
 * decoder-verified. Screen HTML can still use safe application-relative paths,
 * but `page.setContent()` has no trusted origin and therefore must not.
 */
export async function prepareBilingualPdfDocument(
  input: unknown,
  options: Pick<GenerateBilingualPdfOptions, "resolvePublicImage"> & {
    readonly pageContentWidthCssPixels?: number;
  } = {},
): Promise<BilingualDocumentSpec> {
  const document = parseBilingualDocument(input);
  let totalPixels = 0;
  const pageContentWidth =
    options.pageContentWidthCssPixels ?? ((210 - 14 - 14) * 96) / 25.4;
  if (
    !Number.isFinite(pageContentWidth) ||
    pageContentWidth < 96 ||
    pageContentWidth > 10_000
  ) {
    throw new RangeError("Bilingual PDF content width is invalid.");
  }
  const layoutMode = document.layout?.mode ?? DEFAULT_BILINGUAL_CONFIG.mode;
  const columnRatio =
    document.layout?.columnRatio ?? DEFAULT_BILINGUAL_CONFIG.columnRatio;
  const widestColumnFraction =
    layoutMode === "parallel" ? Math.max(...columnRatio) / 100 : 1;
  const columnGap = layoutMode === "parallel" ? 24 : 0;
  const maximumColumnWidth =
    (pageContentWidth - columnGap) * widestColumnFraction;
  const maximumImageWidth = Math.max(1, maximumColumnWidth - 32);

  const normalizeImage = async (
    block: PairedImageBlock,
  ): Promise<PairedImageBlock> => {
    let bytes: Buffer;
    let sourceName: string;

    if (block.source.kind === "public") {
      if (!options.resolvePublicImage) {
        throw imageQualityError(
          "UNRESOLVED_PUBLIC_IMAGE",
          `Public image "${block.id}" requires a trusted PDF asset resolver.`,
        );
      }
      try {
        bytes = await options.resolvePublicImage(block.source.path);
      } catch {
        throw imageQualityError(
          "INVALID_IMAGE_ASSET",
          `Public image "${block.id}" could not be resolved.`,
        );
      }
      sourceName = new URL(block.source.path, "https://arabclue.invalid")
        .pathname;
    } else {
      const match = block.source.uri.match(PDF_DATA_IMAGE_PATTERN);
      if (!match || match[2].length % 4 !== 0) {
        throw imageQualityError(
          "INVALID_IMAGE_ASSET",
          `Embedded image "${block.id}" has invalid base64 data.`,
        );
      }
      bytes = Buffer.from(match[2], "base64");
      sourceName = `embedded${imageExtension(`image/${match[1]}`)}`;
    }

    let validated: Awaited<ReturnType<typeof validateAndNormalizeLogoImage>>;
    try {
      validated = await validateAndNormalizeLogoImage(bytes, sourceName);
    } catch {
      throw imageQualityError(
        "INVALID_IMAGE_ASSET",
        `Image "${block.id}" failed MIME, magic-byte, dimension, or decode validation.`,
      );
    }

    totalPixels += validated.width * validated.height;
    if (totalPixels > MAX_TOTAL_IMAGE_PIXELS) {
      throw imageQualityError(
        "IMAGE_PIXEL_LIMIT_EXCEEDED",
        `PDF images exceed the ${String(
          MAX_TOTAL_IMAGE_PIXELS,
        )}-pixel aggregate limit.`,
      );
    }
    const styledWidth = maximumImageWidth * ((block.widthPercent ?? 100) / 100);
    const renderedWidthCssPixels =
      block.widthPercent === undefined
        ? Math.min(validated.width, styledWidth)
        : styledWidth;
    const effectiveDpi =
      (validated.width * 96) / Math.max(1, renderedWidthCssPixels);
    if (effectiveDpi + 0.01 < BILINGUAL_PRINT_PROFILE.targetRasterDpi) {
      throw imageQualityError(
        "IMAGE_RESOLUTION_INSUFFICIENT",
        `Image "${block.id}" provides ${String(
          validated.width,
        )} horizontal pixels for a ${(renderedWidthCssPixels / 96).toFixed(
          2,
        )}-inch rendered width (${effectiveDpi.toFixed(
          1,
        )} DPI); at least ${String(
          BILINGUAL_PRINT_PROFILE.targetRasterDpi,
        )} DPI is required.`,
      );
    }

    return {
      ...block,
      source: {
        kind: "data",
        uri: `data:${validated.mimeType};base64,${validated.bytes.toString(
          "base64",
        )}`,
      },
    };
  };

  const sections: BilingualDocumentSpec["sections"][number][] = [];
  for (const section of document.sections) {
    const blocks: PairedBlock[] = [];
    for (const block of section.blocks) {
      blocks.push(block.type === "image" ? await normalizeImage(block) : block);
    }
    sections.push({ ...section, blocks });
  }

  return parseBilingualDocument({ ...document, sections });
}

/**
 * Generate a font-embedded Chromium PDF from the canonical print artifact.
 */
export async function generateBilingualPdf(
  input: unknown,
  options: GenerateBilingualPdfOptions = {},
): Promise<BilingualPdfArtifact> {
  const pdfOptions: HtmlToPdfOptions = {
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
    readinessTimeoutMs: 10_000,
    ...options.pdf,
    synchronizeBilingualLayout: true,
    readySelector: BILINGUAL_LAYOUT_READY_SELECTOR,
  };
  const parsedPdfOptions = htmlToPdfOptionsSchema.parse(pdfOptions);
  const pdfDimensions = resolvePdfContentDimensions(parsedPdfOptions);
  const document = await prepareBilingualPdfDocument(input, {
    resolvePublicImage: options.resolvePublicImage,
    pageContentWidthCssPixels: pdfDimensions.width,
  });
  const artifact = await renderBilingualArtifact(document, {
    target: "print",
    fontPair: options.fontPair,
  });
  const pdf = await htmlToPdf(artifact.html, pdfOptions);
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
