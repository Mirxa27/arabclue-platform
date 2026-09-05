import { describe, expect, test } from "bun:test";
// The default export is the Workflow DevKit wrapper (an async config function);
// the plain object the tests read is the named export.
import {
  nextConfig,
  bilingualFontTraceIncludes,
  pdfRuntimeTraceIncludes,
} from "../../../next.config";
import {
  BILINGUAL_FONT_TRACE_ROUTES,
  REQUIRED_BILINGUAL_FONT_ASSETS,
  REQUIRED_PDF_RUNTIME_ASSETS,
  missingBilingualFontAssets,
  missingPdfRuntimeAssets,
} from "../../../scripts/check-bilingual-font-traces.mjs";

describe("bilingual PDF serverless font tracing", () => {
  test("uses wildcard route matchers for every PDF-producing API", () => {
    const includes = nextConfig.outputFileTracingIncludes as
      | Record<string, readonly string[]>
      | undefined;
    expect(includes).toBeDefined();
    expect(bilingualFontTraceIncludes).toHaveLength(20);
    expect(bilingualFontTraceIncludes).toEqual(
      REQUIRED_BILINGUAL_FONT_ASSETS.map((asset) => `./${asset}`),
    );
    // Fonts for the bilingual layout, plus what the renderer opens through
    // computed paths — production shipped the fonts and not `browsers.json`.
    const pdfRouteIncludes = [
      ...bilingualFontTraceIncludes,
      ...pdfRuntimeTraceIncludes,
    ];
    expect(includes?.["/api/proposals/*/download"]).toEqual(pdfRouteIncludes);
    expect(includes?.["/api/contracts/templates/*/preview"]).toEqual(
      pdfRouteIncludes,
    );
    expect(includes?.["/api/business-profile/export"]).toEqual(pdfRouteIncludes);
    expect(includes?.["/api/proposals/[id]/download"]).toBeUndefined();
    expect(includes?.["/api/contracts/templates/[key]/preview"]).toBeUndefined();
  });

  test("requires all embedded font weights in every emitted route trace", () => {
    expect(BILINGUAL_FONT_TRACE_ROUTES).toHaveLength(3);
    expect(REQUIRED_BILINGUAL_FONT_ASSETS).toHaveLength(20);
    expect(
      missingBilingualFontAssets(
        REQUIRED_BILINGUAL_FONT_ASSETS.map((asset) => `../../../../${asset}`)
      )
    ).toEqual([]);
    expect(
      missingBilingualFontAssets(REQUIRED_BILINGUAL_FONT_ASSETS.slice(1))
    ).toEqual([REQUIRED_BILINGUAL_FONT_ASSETS[0]]);
  });

  test("requires playwright-core's JSON and the Chromium archives in every trace", () => {
    expect(REQUIRED_PDF_RUNTIME_ASSETS).toHaveLength(6);
    expect(REQUIRED_PDF_RUNTIME_ASSETS).toContain(
      "node_modules/playwright-core/browsers.json",
    );
    expect(REQUIRED_PDF_RUNTIME_ASSETS).toContain(
      "node_modules/@sparticuz/chromium/bin/chromium.br",
    );
    expect(
      missingPdfRuntimeAssets(
        REQUIRED_PDF_RUNTIME_ASSETS.map((asset) => `../../../../${asset}`)
      )
    ).toEqual([]);
    // The exact production gap: everything traced except browsers.json.
    expect(
      missingPdfRuntimeAssets(
        REQUIRED_PDF_RUNTIME_ASSETS.filter((a) => !a.endsWith("browsers.json"))
      )
    ).toEqual(["node_modules/playwright-core/browsers.json"]);
    // The config includes must cover every required file, so the two lists
    // cannot drift apart silently.
    expect(pdfRuntimeTraceIncludes).toContain("./node_modules/playwright-core/browsers.json");
    expect(pdfRuntimeTraceIncludes).toContain("./node_modules/playwright-core/package.json");
    expect(pdfRuntimeTraceIncludes.some((g) => g.startsWith("./node_modules/@sparticuz/chromium/bin/"))).toBe(true);
  });
});

describe("document ingestion runtime files are traced", () => {
  test("every ingesting route ships the pdfjs worker and the tesseract runtime", async () => {
    const { nextConfig, ingestionRuntimeTraceIncludes } = await import(
      "../../../next.config"
    );
    const includes = nextConfig.outputFileTracingIncludes as Record<string, string[]>;
    for (const route of [
      "/api/documents",
      "/api/platform-agent/missions/*/attachments",
      "/api/platform-agent/extension/ingest",
      "/.well-known/workflow/v1/step",
    ]) {
      for (const file of ingestionRuntimeTraceIncludes) {
        expect(includes[route]).toContain(file);
      }
    }
    // pdfjs resolves "./pdf.worker.mjs" relative to legacy/build/pdf.mjs.
    expect(ingestionRuntimeTraceIncludes).toContain(
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
    );
    // The parser must stay external, or the worker path is computed inside
    // the bundle where the file does not exist.
    for (const pkg of ["pdf-parse", "pdfjs-dist", "tesseract.js"]) {
      expect(nextConfig.serverExternalPackages).toContain(pkg);
    }
  });
});
