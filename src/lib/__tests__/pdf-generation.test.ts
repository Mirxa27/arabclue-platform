import { describe, expect, test } from "bun:test";
import {
  htmlToPdfOptionsSchema,
  isPdfBuffer,
  PdfGenerationError,
} from "../pdf/html-to-pdf";

describe("htmlToPdfOptionsSchema", () => {
  test("applies A4 defaults", () => {
    const parsed = htmlToPdfOptionsSchema.parse({});
    expect(parsed.format).toBe("A4");
    expect(parsed.printBackground).toBe(true);
    expect(parsed.displayHeaderFooter).toBe(true);
    expect(parsed.waitMs).toBe(400);
    expect(parsed.timeoutMs).toBe(60_000);
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
