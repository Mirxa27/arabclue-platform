import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { z } from "zod";

/**
 * Shared HTML → PDF via Playwright Chromium.
 * Local: full `playwright` package + installed Chromium.
 * Vercel: `playwright-core` + `@sparticuz/chromium` (serverless binary).
 * @see https://playwright.dev/docs/api/class-page#page-pdf
 * @see https://github.com/Sparticuz/chromium
 */

const pdfCssLengthSchema = z
  .string()
  .trim()
  .regex(
    /^(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:px|in|cm|mm))$/,
    "Expected a non-negative px, in, cm, or mm length"
  )
  .refine((value) => cssLengthToPixels(value) <= 2_000, {
    message: "PDF length exceeds the supported bound",
  });

export const pdfMarginSchema = z.object({
  top: pdfCssLengthSchema.default("16mm"),
  bottom: pdfCssLengthSchema.default("18mm"),
  left: pdfCssLengthSchema.default("12mm"),
  right: pdfCssLengthSchema.default("12mm"),
});

export const htmlToPdfOptionsSchema = z.object({
  format: z
    .enum(["A4", "Letter", "Legal", "Tabloid", "Ledger", "A3", "A5"])
    .default("A4"),
  printBackground: z.boolean().default(true),
  displayHeaderFooter: z.boolean().default(true),
  headerTemplate: z.string().optional(),
  footerTemplate: z.string().optional(),
  margin: pdfMarginSchema.optional(),
  waitMs: z.number().int().min(0).max(5_000).default(400),
  timeoutMs: z.number().int().min(5_000).max(120_000).default(60_000),
  readySelector: z.string().trim().min(1).max(512).optional(),
  readinessTimeoutMs: z
    .number()
    .int()
    .min(100)
    .max(30_000)
    .default(5_000),
  synchronizeBilingualLayout: z.boolean().default(false),
});

export type HtmlToPdfOptions = z.input<typeof htmlToPdfOptionsSchema>;
type ParsedHtmlToPdfOptions = z.output<typeof htmlToPdfOptionsSchema>;

const PAPER_HEIGHT_PX: Readonly<
  Record<ParsedHtmlToPdfOptions["format"], number>
> = Object.freeze({
  A3: (420 * 96) / 25.4,
  A4: (297 * 96) / 25.4,
  A5: (210 * 96) / 25.4,
  Letter: 11 * 96,
  Legal: 14 * 96,
  Tabloid: 17 * 96,
  Ledger: 11 * 96,
});
const PAPER_WIDTH_PX: Readonly<
  Record<ParsedHtmlToPdfOptions["format"], number>
> = Object.freeze({
  A3: (297 * 96) / 25.4,
  A4: (210 * 96) / 25.4,
  A5: (148 * 96) / 25.4,
  Letter: 8.5 * 96,
  Legal: 8.5 * 96,
  Tabloid: 11 * 96,
  Ledger: 17 * 96,
});

export function cssLengthToPixels(value: string): number {
  const match = value.trim().match(
    /^(0|(?:\d+(?:\.\d+)?|\.\d+))(px|in|cm|mm)?$/
  );
  if (!match) throw new RangeError("Unsupported PDF CSS length");
  const numeric = Number(match[1]);
  switch (match[2] ?? "px") {
    case "in":
      return numeric * 96;
    case "cm":
      return (numeric * 96) / 2.54;
    case "mm":
      return (numeric * 96) / 25.4;
    default:
      return numeric;
  }
}

/** Exact printable block height supplied to the trusted sync engine. */
export function resolvePdfContentHeight(
  options: Pick<ParsedHtmlToPdfOptions, "format" | "margin">
): number {
  return resolvePdfContentDimensions(options).height;
}

export type PdfContentDimensions = {
  readonly width: number;
  readonly height: number;
};

/** Exact printable dimensions after resolving format and all four margins. */
export function resolvePdfContentDimensions(
  options: Pick<ParsedHtmlToPdfOptions, "format" | "margin">
): PdfContentDimensions {
  const margin = options.margin ?? pdfMarginSchema.parse({});
  const height =
    PAPER_HEIGHT_PX[options.format] -
    cssLengthToPixels(margin.top) -
    cssLengthToPixels(margin.bottom);
  const width =
    PAPER_WIDTH_PX[options.format] -
    cssLengthToPixels(margin.left) -
    cssLengthToPixels(margin.right);
  if (!Number.isFinite(height) || height < 96) {
    throw new RangeError("PDF vertical margins leave insufficient page content");
  }
  if (!Number.isFinite(width) || width < 96) {
    throw new RangeError(
      "PDF horizontal margins leave insufficient page content"
    );
  }
  return { width, height };
}

export function resolvePdfLayoutSyncOptions(
  options: Pick<ParsedHtmlToPdfOptions, "format" | "margin">
): {
  readonly pageContentWidth: number;
  readonly pageContentHeight: number;
} {
  const dimensions = resolvePdfContentDimensions(options);
  return {
    pageContentWidth: dimensions.width,
    pageContentHeight: dimensions.height,
  };
}

export class PdfGenerationError extends Error {
  readonly code = "PDF_UNAVAILABLE" as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PdfGenerationError";
  }
}

function shouldUseServerlessChromium(): boolean {
  return Boolean(process.env.VERCEL) || process.env.PDF_ENGINE === "sparticuz";
}

export type PdfReadinessPage = {
  evaluate: (
    pageFunction: () => void | Promise<void>
  ) => Promise<void>;
  waitForSelector: (
    selector: string,
    opts: { state: "attached"; timeout: number }
  ) => Promise<unknown>;
};

type LaunchablePage = Omit<PdfReadinessPage, "evaluate"> & {
  evaluate: {
    <Result>(
      pageFunction: () => Result | Promise<Result>
    ): Promise<Result>;
    <Result, Argument>(
      pageFunction: (argument: Argument) => Result | Promise<Result>,
      argument: Argument
    ): Promise<Result>;
  };
  route: (
    url: "**/*",
    handler: (route: {
      abort: (errorCode: "blockedbyclient") => Promise<void>;
    }) => void | Promise<void>
  ) => Promise<unknown>;
  emulateMedia: (opts: { media: "print" }) => Promise<void>;
  setContent: (
    html: string,
    opts: { waitUntil: "networkidle"; timeout: number }
  ) => Promise<void>;
  pdf: (opts: Record<string, unknown>) => Promise<Buffer | Uint8Array>;
};

type LaunchableBrowser = {
  newContext: (opts: {
    javaScriptEnabled: false;
    serviceWorkers: "block";
    acceptDownloads: false;
  }) => Promise<{
    newPage: () => Promise<LaunchablePage>;
    close: () => Promise<void>;
  }>;
  close: () => Promise<void>;
};

export type PdfReadinessOptions = {
  /** Optional application marker set only after layout synchronization. */
  readySelector?: string;
  /** Bound for font and selector readiness checks. */
  readinessTimeoutMs: number;
  /** Backward-compatible delay used only when no ready selector is supplied. */
  fallbackWaitMs: number;
};

export type PdfReadinessResult = {
  fontsReady: boolean;
  selectorReady: boolean;
  usedFallbackDelay: boolean;
};

async function waitForDocumentFonts(
  page: PdfReadinessPage,
  timeoutMs: number
): Promise<boolean> {
  const fontOperation = page.evaluate(async () => {
    if ("fonts" in document) {
      await document.fonts.ready;
    }
  });

  return new Promise<boolean>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      resolve(false);
    }, timeoutMs);

    fontOperation.then(
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(true);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/** Abort every subresource request before untrusted HTML is installed. */
export async function isolatePdfPageNetwork(
  page: Pick<LaunchablePage, "route">
): Promise<void> {
  await page.route("**/*", async (route) => {
    await route.abort("blockedbyclient");
  });
}

type PdfImageReadiness = {
  readonly total: number;
  readonly failed: readonly string[];
};

async function waitForDocumentImages(
  page: LaunchablePage,
  timeoutMs: number
): Promise<PdfImageReadiness> {
  const operation = page.evaluate(async () => {
    const images = Array.from(document.images);
    await Promise.allSettled(images.map((image) => image.decode()));
    return {
      total: images.length,
      failed: images
        .filter(
          (image) =>
            !image.complete ||
            image.naturalWidth < 1 ||
            image.naturalHeight < 1
        )
        .map((image) => image.getAttribute("src")?.slice(0, 120) || "[empty]"),
    };
  });

  return new Promise<PdfImageReadiness>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error("PDF image readiness timed out"));
    }, timeoutMs);
    operation.then(
      (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Wait for browser-owned font shaping and optional application layout readiness.
 *
 * A selector such as `[data-bilingual-layout-ready]` is an explicit readiness
 * contract and therefore replaces the legacy fixed delay. Without a selector,
 * the bounded fallback delay remains for backward compatibility.
 */
export async function waitForPdfReadiness(
  page: PdfReadinessPage,
  options: PdfReadinessOptions
): Promise<PdfReadinessResult> {
  if (
    !Number.isFinite(options.readinessTimeoutMs) ||
    options.readinessTimeoutMs <= 0 ||
    options.readinessTimeoutMs > 30_000
  ) {
    throw new RangeError(
      "readinessTimeoutMs must be a finite number between 1 and 30000"
    );
  }
  if (
    !Number.isFinite(options.fallbackWaitMs) ||
    options.fallbackWaitMs < 0 ||
    options.fallbackWaitMs > 5_000
  ) {
    throw new RangeError(
      "fallbackWaitMs must be a finite number between 0 and 5000"
    );
  }

  try {
    const fontsReady = await waitForDocumentFonts(
      page,
      options.readinessTimeoutMs
    );
    if (!fontsReady) {
      throw new Error("PDF font readiness timed out");
    }

    if (options.readySelector) {
      await page.waitForSelector(options.readySelector, {
        state: "attached",
        timeout: options.readinessTimeoutMs,
      });
      return {
        fontsReady,
        selectorReady: true,
        usedFallbackDelay: false,
      };
    }

    if (options.fallbackWaitMs > 0) {
      await delay(options.fallbackWaitMs);
    }
    return {
      fontsReady,
      selectorReady: false,
      usedFallbackDelay: options.fallbackWaitMs > 0,
    };
  } catch (error) {
    throw new PdfGenerationError("PDF document readiness check failed", {
      cause: error,
    });
  }
}

async function launchBrowser(): Promise<LaunchableBrowser> {
  if (shouldUseServerlessChromium()) {
    const chromiumMod = await import("@sparticuz/chromium");
    const { chromium } = await import("playwright-core");
    const Sparticuz =
      (chromiumMod as { default: typeof chromiumMod.default }).default;
    Sparticuz.setGraphicsMode = false;
    const executablePath = await Sparticuz.executablePath();
    const execDir = path.dirname(executablePath);
    const existingLd = process.env.LD_LIBRARY_PATH?.trim();
    process.env.LD_LIBRARY_PATH = existingLd
      ? `${execDir}:${existingLd}`
      : execDir;
    return chromium.launch({
      args: Sparticuz.args,
      executablePath,
      headless: true,
    }) as unknown as Promise<LaunchableBrowser>;
  }

  const { chromium } = await import("playwright");
  return chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  }) as unknown as Promise<LaunchableBrowser>;
}

/**
 * Render HTML string to an A4 PDF buffer.
 * Throws PdfGenerationError when Chromium cannot launch or render.
 */
export async function htmlToPdf(
  html: string,
  opts: HtmlToPdfOptions = {}
): Promise<Buffer> {
  if (!html.trim()) {
    throw new PdfGenerationError("Cannot render empty HTML to PDF");
  }

  const options = htmlToPdfOptionsSchema.parse(opts);
  const layoutSyncOptions = resolvePdfLayoutSyncOptions(options);

  try {
    const browser = await launchBrowser();
    try {
      const context = await browser.newContext({
        javaScriptEnabled: false,
        serviceWorkers: "block",
        acceptDownloads: false,
      });
      try {
        const page = await context.newPage();
        await isolatePdfPageNetwork(page);
        await page.emulateMedia({ media: "print" });
        await page.setContent(html, {
          waitUntil: "networkidle",
          timeout: options.timeoutMs,
        });
        const fontsReady = await waitForDocumentFonts(
          page,
          options.readinessTimeoutMs
        );
        if (!fontsReady) {
          throw new PdfGenerationError("PDF font readiness timed out");
        }
        const images = await waitForDocumentImages(
          page,
          options.readinessTimeoutMs
        );
        if (images.failed.length > 0) {
          throw new PdfGenerationError(
            `PDF contains ${images.failed.length} undecoded image${
              images.failed.length === 1 ? "" : "s"
            }`
          );
        }
        if (options.synchronizeBilingualLayout) {
          const {
            BILINGUAL_LAYOUT_READY_SELECTOR,
            synchronizeBilingualLayoutPage,
          } = await import("../layout-sync");
          if (options.readySelector !== BILINGUAL_LAYOUT_READY_SELECTOR) {
            throw new PdfGenerationError(
              "Bilingual PDF synchronization requires the exact ready selector"
            );
          }
          await synchronizeBilingualLayoutPage(page, layoutSyncOptions);
        }
        if (options.readySelector) {
          await page.waitForSelector(options.readySelector, {
            state: "attached",
            timeout: options.readinessTimeoutMs,
          });
        } else if (options.waitMs > 0) {
          await delay(options.waitMs);
        }
        const pdf = await page.pdf({
          format: options.format,
          printBackground: options.printBackground,
          displayHeaderFooter: options.displayHeaderFooter,
          headerTemplate:
            options.headerTemplate ??
            `<div style="font-size:8px;width:100%;text-align:center;color:#94a3b8;padding:0 12mm;">ArabClue</div>`,
          footerTemplate:
            options.footerTemplate ??
            `<div style="font-size:8px;width:100%;text-align:center;color:#94a3b8;padding:0 12mm;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
          margin: options.margin ?? {
            top: "16mm",
            bottom: "18mm",
            left: "12mm",
            right: "12mm",
          },
        });
        return Buffer.from(pdf);
      } finally {
        await context.close();
      }
    } finally {
      await browser.close();
    }
  } catch (err) {
    if (err instanceof PdfGenerationError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    const hint = shouldUseServerlessChromium()
      ? "Ensure @sparticuz/chromium is deployed and AWS_LAMBDA_JS_RUNTIME=nodejs22.x on Vercel."
      : "Run `bun run setup:pdf` (playwright install chromium) locally.";
    throw new PdfGenerationError(
      `PDF generation failed (Playwright/Chromium unavailable): ${message}. ${hint}`,
      { cause: err }
    );
  }
}

/** True when buffer looks like a PDF (%PDF). */
export function isPdfBuffer(bytes: Buffer): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}
