import { describe, expect, test } from "bun:test";
import { strings, t } from "../../../extensions/arabclue-agent/src/i18n";

describe("extension i18n", () => {
  test("all English keys have Arabic equivalents", () => {
    const enKeys = Object.keys(strings.en);
    const arKeys = Object.keys(strings.ar);
    for (const key of enKeys) {
      expect(arKeys).toContain(key);
    }
  });

  test("all Arabic keys have English equivalents", () => {
    const enKeys = Object.keys(strings.en);
    const arKeys = Object.keys(strings.ar);
    for (const key of arKeys) {
      expect(enKeys).toContain(key);
    }
  });

  test("no empty string values", () => {
    for (const [key, value] of Object.entries(strings.en)) {
      expect(value.length).toBeGreaterThan(0);
    }
    for (const [key, value] of Object.entries(strings.ar)) {
      expect(value.length).toBeGreaterThan(0);
    }
  });

  test("t() interpolates parameters", () => {
    expect(t("scanFound", "en", { count: 5 })).toBe("5 tenders found");
    expect(t("scanFound", "ar", { count: 5 })).toBe("5 مناقصات");
  });

  test("t() falls back to English for missing keys", () => {
    expect(t("appTitle", "en")).toBe("ArabClue Agent");
    expect(t("appTitle", "ar")).toBe("وكيل ArabClue");
  });
});
