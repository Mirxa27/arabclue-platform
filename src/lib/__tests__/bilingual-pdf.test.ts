import { describe, expect, test } from "bun:test";
import type {
  BilingualDocumentSpec,
  BilingualInlineNode,
} from "../bilingual-layout";
import {
  BILINGUAL_FONT_LICENSES,
  BILINGUAL_PRINT_PROFILE,
  BilingualPdfQualityError,
  generateBilingualPdf,
  getEmbeddedBilingualFontCss,
  inspectBilingualHtml,
  renderBilingualArtifact,
} from "../bilingual-pdf";

const inline = (text: string): readonly BilingualInlineNode[] => [
  { type: "text", text },
];

const fixture: BilingualDocumentSpec = {
  id: "pdf-fixture",
  title: {
    en: inline("Technical Proposal"),
    ar: inline("العرض الفني"),
  },
  sections: [
    {
      id: "scope",
      alignmentKey: "scope",
      title: {
        en: inline("Scope"),
        ar: inline("النطاق"),
      },
      blocks: [
        {
          type: "paragraph",
          id: "scope-body",
          content: {
            en: inline("Delivery reference PO-2026-18."),
            ar: inline("مرجع التسليم PO-2026-18."),
          },
        },
      ],
    },
  ],
};

describe("bilingual PDF font embedding", () => {
  test("embeds every IBM Arabic/Latin weight without a network URL", async () => {
    const css = await getEmbeddedBilingualFontCss("ibm-plex-sans");
    expect(css.match(/@font-face/g)).toHaveLength(10);
    expect(css).toContain('font-family: "IBM Plex Sans Arabic"');
    expect(css).toContain('font-family: "IBM Plex Sans"');
    expect(css).toContain("data:font/woff2;base64,");
    expect(css).not.toContain("http://");
    expect(css).not.toContain("https://");
  });

  test("embeds every Noto Arabic/Latin weight", async () => {
    const css = await getEmbeddedBilingualFontCss("noto-sans");
    expect(css.match(/@font-face/g)).toHaveLength(10);
    expect(css).toContain('font-family: "Noto Sans Arabic"');
    expect(css).toContain('font-family: "Noto Sans"');
  });

  test("declares traceable OFL metadata and a 300 DPI print target", () => {
    expect(BILINGUAL_FONT_LICENSES["ibm-plex-sans"].license).toContain(
      "Open Font License"
    );
    expect(BILINGUAL_FONT_LICENSES["noto-sans"].upstream).toContain(
      "github.com/google/fonts"
    );
    expect(BILINGUAL_PRINT_PROFILE.targetRasterDpi).toBe(300);
    expect(BILINGUAL_PRINT_PROFILE.vectorText).toBe(true);
  });
});

describe("canonical bilingual render artifact", () => {
  test("uses the safe shared renderer and emits a stable hash", async () => {
    const first = await renderBilingualArtifact(fixture);
    const second = await renderBilingualArtifact(fixture);

    expect(first.sha256).toBe(second.sha256);
    expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.html).toContain("data-bilingual-fonts");
    expect(first.html).toContain("Technical Proposal");
    expect(first.html).toContain("العرض الفني");
    expect(first.html).not.toContain("fonts.googleapis.com");
    expect(first.quality.valid).toBe(true);
    expect(first.quality.pairCount).toBe(3);
    expect(first.quality.embeddedFontFaceCount).toBe(10);
  });

  test("print and screen use the same structured source with both languages", async () => {
    const screen = await renderBilingualArtifact(fixture, { target: "screen" });
    const print = await renderBilingualArtifact(fixture, { target: "print" });

    expect(screen.document).toEqual(print.document);
    expect(screen.quality.englishCellCount).toBe(
      print.quality.englishCellCount
    );
    expect(screen.quality.arabicCellCount).toBe(print.quality.arabicCellCount);
  });

  test("quality inspection rejects incomplete renderer output", () => {
    const report = inspectBilingualHtml(
      "<!doctype html><html><head></head><body><h1>Only English</h1></body></html>"
    );
    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain(
      "MISSING_LAYOUT_MARKER"
    );
    expect(report.issues.map((issue) => issue.code)).toContain(
      "MISSING_LANGUAGE"
    );
  });

  test("quality errors retain every machine-readable issue", () => {
    const issues = [
      {
        code: "MISSING_LANGUAGE" as const,
        message: "Both language regions are required.",
      },
      {
        code: "INVALID_HEADING_COUNT" as const,
        message: "Exactly one document heading is required.",
      },
    ];
    const error = new BilingualPdfQualityError(issues);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("BilingualPdfQualityError");
    expect(error.message).toContain(issues[0].message);
    expect(error.message).toContain(issues[1].message);
    expect(error.issues).toEqual(issues);
  });
});

test.skipIf(process.env.PLAYWRIGHT_CHROMIUM !== "1")(
  "live Chromium produces a real bilingual PDF",
  async () => {
    const artifact = await generateBilingualPdf(fixture);
    expect(artifact.pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(artifact.pdf.byteLength).toBeGreaterThan(10_000);
  },
  120_000
);
