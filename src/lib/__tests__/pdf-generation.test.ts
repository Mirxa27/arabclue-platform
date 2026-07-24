import { describe, expect, test } from "bun:test";
import {
  htmlToPdf,
  htmlToPdfOptionsSchema,
  isPdfBuffer,
  PdfGenerationError,
  waitForPdfReadiness,
  type PdfReadinessPage,
} from "../pdf/html-to-pdf";

describe("htmlToPdfOptionsSchema", () => {
  test("applies A4 defaults", () => {
    const parsed = htmlToPdfOptionsSchema.parse({});
    expect(parsed.format).toBe("A4");
    expect(parsed.printBackground).toBe(true);
    expect(parsed.displayHeaderFooter).toBe(true);
    expect(parsed.waitMs).toBe(400);
    expect(parsed.timeoutMs).toBe(60_000);
    expect(parsed.readySelector).toBeUndefined();
    expect(parsed.readinessTimeoutMs).toBe(5_000);
  });

  test("rejects oversized waitMs", () => {
    expect(() => htmlToPdfOptionsSchema.parse({ waitMs: 9_999 })).toThrow();
  });

  test("accepts Letter with custom margins", () => {
    const parsed = htmlToPdfOptionsSchema.parse({
      format: "Letter",
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
    });
    expect(parsed.format).toBe("Letter");
    expect(parsed.margin?.top).toBe("20mm");
  });

  test("accepts a bounded explicit readiness selector", () => {
    const parsed = htmlToPdfOptionsSchema.parse({
      readySelector: "  [data-bilingual-layout-ready]  ",
      readinessTimeoutMs: 10_000,
    });

    expect(parsed.readySelector).toBe("[data-bilingual-layout-ready]");
    expect(parsed.readinessTimeoutMs).toBe(10_000);
  });

  test("rejects blank or oversized readiness selectors", () => {
    expect(() =>
      htmlToPdfOptionsSchema.parse({ readySelector: "   " })
    ).toThrow();
    expect(() =>
      htmlToPdfOptionsSchema.parse({ readySelector: "x".repeat(513) })
    ).toThrow();
  });

  test("rejects unbounded readiness timeouts", () => {
    expect(() =>
      htmlToPdfOptionsSchema.parse({ readinessTimeoutMs: 99 })
    ).toThrow();
    expect(() =>
      htmlToPdfOptionsSchema.parse({ readinessTimeoutMs: 30_001 })
    ).toThrow();
  });
});

describe("waitForPdfReadiness", () => {
  test("awaits fonts and an explicit marker without a fixed delay", async () => {
    let evaluateCalled = false;
    let selectorCall:
      | {
          selector: string;
          options: { state: "attached"; timeout: number };
        }
      | undefined;
    const page: PdfReadinessPage = {
      evaluate: async () => {
        evaluateCalled = true;
      },
      waitForSelector: async (selector, options) => {
        selectorCall = { selector, options };
        return {};
      },
    };

    const result = await waitForPdfReadiness(page, {
      readySelector: "[data-bilingual-layout-ready]",
      readinessTimeoutMs: 1_000,
      fallbackWaitMs: 5_000,
    });

    expect(evaluateCalled).toBe(true);
    expect(selectorCall).toEqual({
      selector: "[data-bilingual-layout-ready]",
      options: { state: "attached", timeout: 1_000 },
    });
    expect(result).toEqual({
      fontsReady: true,
      selectorReady: true,
      usedFallbackDelay: false,
    });
  });

  test("retains the bounded fallback when no marker is supplied", async () => {
    let selectorCalled = false;
    const page: PdfReadinessPage = {
      evaluate: async () => {},
      waitForSelector: async () => {
        selectorCalled = true;
        return {};
      },
    };

    const result = await waitForPdfReadiness(page, {
      readinessTimeoutMs: 1_000,
      fallbackWaitMs: 1,
    });

    expect(selectorCalled).toBe(false);
    expect(result).toEqual({
      fontsReady: true,
      selectorReady: false,
      usedFallbackDelay: true,
    });
  });

  test("bounds a font readiness promise that never settles", async () => {
    const page: PdfReadinessPage = {
      evaluate: () => new Promise<void>(() => {}),
      waitForSelector: async () => ({}),
    };

    const startedAt = performance.now();
    const result = await waitForPdfReadiness(page, {
      readinessTimeoutMs: 5,
      fallbackWaitMs: 0,
    });

    expect(result.fontsReady).toBe(false);
    expect(result.usedFallbackDelay).toBe(false);
    expect(performance.now() - startedAt).toBeLessThan(200);
  });

  test("surfaces selector failures as stable PDF errors", async () => {
    const page: PdfReadinessPage = {
      evaluate: async () => {},
      waitForSelector: async () => {
        throw new Error("marker missing");
      },
    };

    await expect(
      waitForPdfReadiness(page, {
        readySelector: "[data-bilingual-layout-ready]",
        readinessTimeoutMs: 1_000,
        fallbackWaitMs: 400,
      })
    ).rejects.toBeInstanceOf(PdfGenerationError);
  });

  test("validates direct helper bounds", async () => {
    const page: PdfReadinessPage = {
      evaluate: async () => {},
      waitForSelector: async () => ({}),
    };

    await expect(
      waitForPdfReadiness(page, {
        readinessTimeoutMs: Number.POSITIVE_INFINITY,
        fallbackWaitMs: 0,
      })
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      waitForPdfReadiness(page, {
        readinessTimeoutMs: 1_000,
        fallbackWaitMs: 5_001,
      })
    ).rejects.toBeInstanceOf(RangeError);
  });
});

describe("isPdfBuffer", () => {
  test("detects %PDF magic", () => {
    expect(isPdfBuffer(Buffer.from("%PDF-1.7\n"))).toBe(true);
    expect(isPdfBuffer(Buffer.from("<html>"))).toBe(false);
    expect(isPdfBuffer(Buffer.alloc(0))).toBe(false);
  });
});

describe("PdfGenerationError", () => {
  test("exposes stable code", () => {
    const err = new PdfGenerationError("boom");
    expect(err.code).toBe("PDF_UNAVAILABLE");
    expect(err.name).toBe("PdfGenerationError");
  });
});

describe("htmlToPdf live render", () => {
  const enabled = process.env.PLAYWRIGHT_CHROMIUM === "1";

  test.skipIf(!enabled)(
    "renders a minimal HTML document to a PDF buffer",
    async () => {
      const pdf = await htmlToPdf(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>t</title></head><body data-bilingual-layout-ready><h1>ArabClue PDF smoke</h1><p>مرحبا</p></body></html>`,
        {
          readySelector: "[data-bilingual-layout-ready]",
          waitMs: 5_000,
          displayHeaderFooter: false,
        }
      );
      expect(isPdfBuffer(pdf)).toBe(true);
      expect(pdf.byteLength).toBeGreaterThan(500);
    },
    90_000
  );

  test("rejects empty HTML without launching Chromium", async () => {
    await expect(htmlToPdf("   ")).rejects.toBeInstanceOf(PdfGenerationError);
  });
});
