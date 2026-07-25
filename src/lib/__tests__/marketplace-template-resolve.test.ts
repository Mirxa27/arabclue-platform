import { describe, expect, test } from "bun:test";
import {
  findSystemMarketplaceTemplate,
  mapDbMarketplaceRow,
  resolveMarketplaceTemplateFromCatalog,
} from "../marketplace-template-resolve";
import { SYSTEM_TEMPLATE_CATALOG } from "../template-marketplace-catalog";

describe("marketplace-template-resolve", () => {
  test("finds system templates by id and templateKey", () => {
    const first = SYSTEM_TEMPLATE_CATALOG[0];
    expect(findSystemMarketplaceTemplate(first.id)?.templateKey).toBe(
      first.templateKey
    );
    expect(findSystemMarketplaceTemplate(first.templateKey)?.id).toBe(first.id);
    expect(findSystemMarketplaceTemplate("missing-template")).toBeNull();
  });

  test("catalog resolution sets source system-catalog", () => {
    const first = SYSTEM_TEMPLATE_CATALOG[0];
    const resolved = resolveMarketplaceTemplateFromCatalog(first.id);
    expect(resolved?.source).toBe("system-catalog");
    expect(resolved?.sectionTypes.length).toBeGreaterThan(0);
  });

  test("maps DB rows and rejects malformed JSON", () => {
    const mapped = mapDbMarketplaceRow({
      id: "db-1",
      templateKey: "custom",
      nameJson: { ar: "أ", en: "A" },
      category: "it",
      sectionTypes: ["cover", "pricing"],
    });
    expect(mapped?.source).toBe("database");
    expect(mapped?.sectionTypes).toEqual(["cover", "pricing"]);
    expect(
      mapDbMarketplaceRow({
        id: "bad",
        templateKey: "x",
        nameJson: { en: "only" },
        category: "it",
        sectionTypes: [],
      })
    ).toBeNull();
  });
});
