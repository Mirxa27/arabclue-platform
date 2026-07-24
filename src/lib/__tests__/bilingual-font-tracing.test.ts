import { describe, expect, test } from "bun:test";
import nextConfig, {
  bilingualFontTraceIncludes,
} from "../../../next.config";
import {
  BILINGUAL_FONT_TRACE_ROUTES,
  REQUIRED_BILINGUAL_FONT_ASSETS,
  missingBilingualFontAssets,
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
    expect(includes?.["/api/proposals/*/download"]).toEqual([
      ...bilingualFontTraceIncludes,
    ]);
    expect(includes?.["/api/contracts/templates/*/preview"]).toEqual([
      ...bilingualFontTraceIncludes,
    ]);
    expect(includes?.["/api/business-profile/export"]).toEqual([
      ...bilingualFontTraceIncludes,
    ]);
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
});
