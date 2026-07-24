import { describe, expect, test } from "bun:test";
import { contractTemplateCatalogResponse } from "../../app/api/contracts/templates/route";
import { CONTRACT_TEMPLATE_KEYS } from "../document-templates/contract-templates";

describe("contract template catalog route payload", () => {
  test("exposes every catalog template as an unreviewed non-executable draft", () => {
    const templates = contractTemplateCatalogResponse();

    expect(templates.map((template) => template.key)).toEqual([
      ...CONTRACT_TEMPLATE_KEYS,
    ]);
    expect(templates).toHaveLength(7);
    for (const template of templates) {
      expect(template.lifecycle).toBe("DRAFT");
      expect(template.legalReviewStatus).toBe("UNREVIEWED");
      expect(template.counselReviewRequired).toBe(true);
      expect(template.sections.length).toBeGreaterThan(0);
      expect(template.variables.length).toBeGreaterThan(0);
      expect(template.disclaimer.en.toLowerCase()).toContain("draft");
    }
  });
});

