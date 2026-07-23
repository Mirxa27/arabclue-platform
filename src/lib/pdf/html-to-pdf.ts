import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";

/**
 * Shared HTML → PDF via Playwright Chromium.
 * @see https://playwright.dev/docs/api/class-page#page-pdf
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
});

export type HtmlToPdfOptions = z.input<typeof htmlToPdfOptionsSchema>;

export class PdfGenerationError extends Error {
  readonly code = "PDF_UNAVAILABLE" as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PdfGenerationError";
  }
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
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.emulateMedia({ media: "print" });
      await page.setContent(html, {
        waitUntil: "networkidle",
        timeout: options.timeoutMs,
      });
      // Prefer Node timers over deprecated page.waitForTimeout
      if (options.waitMs > 0) {
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
      await browser.close();
    }
  } catch (err) {
    if (err instanceof PdfGenerationError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new PdfGenerationError(
      `PDF generation failed (Playwright/Chromium unavailable): ${message}`,
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
