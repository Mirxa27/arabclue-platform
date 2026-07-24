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

export const pdfMarginSchema = z.object({
  top: z.string().default("16mm"),
  bottom: z.string().default("18mm"),
  left: z.string().default("12mm"),
  right: z.string().default("12mm"),
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
});

export type HtmlToPdfOptions = z.input<typeof htmlToPdfOptionsSchema>;

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

type LaunchablePage = PdfReadinessPage & {
  emulateMedia: (opts: { media: "print" }) => Promise<void>;
  setContent: (
    html: string,
    opts: { waitUntil: "networkidle"; timeout: number }
  ) => Promise<void>;
  pdf: (opts: Record<string, unknown>) => Promise<Buffer | Uint8Array>;
};

type LaunchableBrowser = {
  newPage: () => Promise<LaunchablePage>;
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
    const fontsReadyPromise = waitForDocumentFonts(
      page,
      options.readinessTimeoutMs
    );

    if (options.readySelector) {
      const [fontsReady] = await Promise.all([
        fontsReadyPromise,
        page.waitForSelector(options.readySelector, {
          state: "attached",
          timeout: options.readinessTimeoutMs,
        }),
      ]);
      return {
        fontsReady,
        selectorReady: true,
        usedFallbackDelay: false,
      };
    }

    const fontsReady = await fontsReadyPromise;
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
    }) as Promise<LaunchableBrowser>;
  }

  const { chromium } = await import("playwright");
  return chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  }) as Promise<LaunchableBrowser>;
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

  try {
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.emulateMedia({ media: "print" });
      await page.setContent(html, {
        waitUntil: "networkidle",
        timeout: options.timeoutMs,
      });
      await waitForPdfReadiness(page, {
        readySelector: options.readySelector,
        readinessTimeoutMs: options.readinessTimeoutMs,
        fallbackWaitMs: options.waitMs,
      });
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
