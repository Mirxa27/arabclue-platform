import { describe, expect, test } from "bun:test";
import {
  EXTENSION_CATEGORY_CATALOG,
  EXTENSION_DEFAULT_PORTALS,
  buildExtensionMatchDefaults,
  mapSectorsToCategoryIds,
} from "../extension-config";

describe("extension remote config catalog", () => {
  test("exposes Etimad as the default portal without client hardcoding", () => {
    expect(EXTENSION_DEFAULT_PORTALS.length).toBeGreaterThan(0);
    expect(EXTENSION_DEFAULT_PORTALS[0]?.id).toBe("etimad");
    expect(EXTENSION_DEFAULT_PORTALS[0]?.listUrl).toContain("etimad.sa");
  });

  test("maps workspace sectors onto category ids", () => {
    const ids = mapSectorsToCategoryIds(["HEALTH", "cloud software", "تعليم"]);
    expect(ids).toContain("healthcare");
    expect(ids).toContain("IT");
    expect(ids).toContain("education");
  });

  test("builds match defaults from live workspace hints", () => {
    const defaults = buildExtensionMatchDefaults({
      sectors: ["TELECOM"],
      capabilities: ["cloud", "تقنية المعلومات"],
      keywords: ["networking"],
      keywordsAr: ["شبكات"],
    });
    expect(defaults.categories.length).toBeGreaterThan(0);
    expect(defaults.keywords).toContain("networking");
    expect(defaults.keywordsAr).toContain("شبكات");
    expect(defaults.autoStartProposal).toBe(false);
  });

  test("catalog categories include bilingual labels and keywords", () => {
    const it = EXTENSION_CATEGORY_CATALOG.find((c) => c.id === "IT");
    expect(it?.labelAr).toBeTruthy();
    expect(it?.keywords.length).toBeGreaterThan(0);
  });
});
