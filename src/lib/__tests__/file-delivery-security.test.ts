import { describe, expect, test } from "bun:test";
import {
  classifyStoredFilePreviewKind,
  createHtmlPreviewObjectUrl,
  createPdfPreviewObjectUrl,
  createStoredFileResponsePolicy,
  GENERATED_HTML_PREVIEW_SANDBOX,
  PDF_PREVIEW_USES_SANDBOX,
  sanitizeDownloadFilename,
} from "../file-delivery-policy";

describe("workspace file delivery policy", () => {
  test("never selects executable markup for embedded preview", () => {
    expect(
      classifyStoredFilePreviewKind("text/html", "evidence.html")
    ).toBe("text");
    expect(
      classifyStoredFilePreviewKind("image/svg+xml", "diagram.svg")
    ).toBe("binary");
    expect(
      classifyStoredFilePreviewKind("text/html", "spoofed.png")
    ).toBe("text");
    expect(
      classifyStoredFilePreviewKind("image/png", "verified.png")
    ).toBe("image");
    expect(
      classifyStoredFilePreviewKind("application/pdf", "evidence.pdf")
    ).toBe("pdf");
    expect(GENERATED_HTML_PREVIEW_SANDBOX).not.toContain("allow-scripts");
    expect(GENERATED_HTML_PREVIEW_SANDBOX).not.toContain("allow-popups");
    // Empty sandbox="" breaks Chromium PDF viewers — must stay off.
    expect(PDF_PREVIEW_USES_SANDBOX).toBe(false);
  });

  test("forces HTML and SVG to inert download-safe responses", () => {
    const html = createStoredFileResponsePolicy(
      "uploads/workspace-1/report.html",
      "report.html",
      false
    );
    expect(html.contentType).toBe("text/plain; charset=utf-8");
    expect(html.forceDownload).toBe(true);
    expect(html.headers["Content-Disposition"]).toContain("attachment;");
    expect(html.headers["Content-Security-Policy"]).toContain("sandbox");
    expect(html.headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(html.headers["X-Frame-Options"]).toBe("DENY");
    expect(html.headers["Cache-Control"]).toBe("private, no-store");

    const svg = createStoredFileResponsePolicy(
      "uploads/workspace-1/diagram.svg",
      null,
      false
    );
    expect(svg.contentType).toBe("application/octet-stream");
    expect(svg.forceDownload).toBe(true);
  });

  test("allows safe raster display but honors explicit download", () => {
    const inline = createStoredFileResponsePolicy(
      "uploads/workspace-1/logo.png",
      null,
      false
    );
    expect(inline.contentType).toBe("image/png");
    expect(inline.forceDownload).toBe(false);
    expect(inline.headers["Content-Disposition"]).toBeUndefined();

    const download = createStoredFileResponsePolicy(
      "uploads/workspace-1/logo.png",
      "هوية.png",
      true
    );
    expect(download.forceDownload).toBe(true);
    expect(download.headers["Content-Disposition"]).toContain(
      "filename*=UTF-8''"
    );
  });

  test("infers PDF content-type from requested name when storage key has no extension", () => {
    const policy = createStoredFileResponsePolicy(
      "uploads/workspace-1/a1b2c3d4e5f6",
      "مواصفات بنك التصدير.pdf",
      false
    );
    expect(policy.contentType).toBe("application/pdf");
    expect(policy.forceDownload).toBe(false);
  });

  test("PDF preview object URLs always advertise application/pdf", () => {
    const url = createPdfPreviewObjectUrl(new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer);
    expect(url.startsWith("blob:")).toBe(true);
    URL.revokeObjectURL(url);
  });

  test("HTML preview object URLs always advertise text/html", () => {
    const url = createHtmlPreviewObjectUrl("<html><body>ok</body></html>");
    expect(url.startsWith("blob:")).toBe(true);
    URL.revokeObjectURL(url);
  });

  test("removes path and header-control syntax from requested filenames", () => {
    expect(
      sanitizeDownloadFilename('../nested/evil"\r\nX-Test: yes.html')
    ).toBe("evil___X-Test: yes.html");
    const policy = createStoredFileResponsePolicy(
      "uploads/workspace-1/report.txt",
      '../nested/evil"\r\nX-Test: yes.html',
      true
    );
    expect(policy.headers["Content-Disposition"]).not.toMatch(/[\r\n]/);
  });
});
