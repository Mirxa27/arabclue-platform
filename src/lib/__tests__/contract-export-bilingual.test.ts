import { describe, expect, test } from "bun:test";
import {
  ContractBilingualContentError,
  buildContractBilingualDocument,
  buildEnhancedBilingualContractHTML,
  suggestLayoutMode,
} from "../contract-export-bilingual";

const CANONICAL = `### Article 1 — Scope | المادة 1 — النطاق
:::en
The supplier delivers PO-2026-18.

Acceptance follows the approved plan.
:::
:::ar
يسلم المورد الطلب PO-2026-18.

يتم القبول وفق الخطة المعتمدة.
:::
`;

const LEGACY = `:::en
## Article 1 — Contractor obligations
The Contractor shall perform the Scope with due care.
:::
:::ar
## المادة 1 — التزامات المقاول
يلتزم المقاول بتنفيذ النطاق بعناية مهنية.
:::`;

describe("structured contract adapter", () => {
  test("compiles canonical articles into aligned immutable input", () => {
    const result = buildContractBilingualDocument({
      title: "Services Agreement",
      titleAr: "اتفاقية خدمات",
      contentMd: CANONICAL,
      projectTitle: "Portal",
      etimadRef: "ET-100",
    });

    expect(result.sourceFormat).toBe("canonical-articles");
    expect(result.diagnostics).toHaveLength(0);
    expect(result.document.sections).toHaveLength(3);
    expect(result.document.sections[1].alignmentKey).toBe(
      "contract.article.1"
    );
    expect(result.document.sections[1].blocks).toHaveLength(2);
  });

  test("adapts the deployed legacy :::en/:::ar shape without raw HTML", () => {
    const result = buildContractBilingualDocument({
      title: "Draft",
      titleAr: "مسودة",
      contentMd: LEGACY,
    });
    const html = buildEnhancedBilingualContractHTML({
      title: "Draft",
      titleAr: "مسودة",
      contentMd: LEGACY,
    });

    expect(result.sourceFormat).toBe("legacy-language-blocks");
    expect(result.diagnostics[0]?.code).toBe("LEGACY_MARKER_ADAPTED");
    expect(html).toContain("Contractor obligations");
    expect(html).toContain("التزامات المقاول");
    expect(html).toContain('data-bilingual-layout-state="pending"');
    expect(html).not.toContain("dangerouslySetInnerHTML");
  });

  test("blocks a final bilingual export with no language pairs", () => {
    expect(() =>
      buildContractBilingualDocument({
        title: "Draft",
        contentMd: "English only",
      })
    ).toThrow(ContractBilingualContentError);
  });

  test("never presents an English title as an Arabic translation", () => {
    const result = buildContractBilingualDocument({
      title: "English-only title",
      contentMd: CANONICAL,
    });
    const arabicTitle = result.document.title.ar[0];

    expect(arabicTitle).toEqual({
      type: "text",
      text: "العنوان العربي غير متاح",
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "MISSING_ARABIC_TITLE"
    );
  });

  test("maps compatibility layout aliases to canonical print modes", () => {
    const tabbed = buildContractBilingualDocument({
      title: "Draft",
      contentMd: CANONICAL,
      layoutMode: "tabbed",
      columnRatio: 0.6,
    });
    const stacked = buildContractBilingualDocument({
      title: "Draft",
      contentMd: CANONICAL,
      layoutMode: "stacked",
    });

    expect(tabbed.document.layout?.mode).toBe("parallel");
    expect(tabbed.document.layout?.viewer?.mode).toBe("tabs");
    expect(tabbed.document.layout?.columnRatio).toEqual([60, 40]);
    expect(stacked.document.layout?.mode).toBe("serial-ar-first");
  });

  test("suggests serial layout only for very long paired articles", () => {
    expect(suggestLayoutMode(CANONICAL)).toBe("parallel");
    const long = CANONICAL.replace(
      "The supplier delivers PO-2026-18.",
      "A".repeat(2_100)
    ).replace("يسلم المورد الطلب PO-2026-18.", "ب".repeat(2_100));
    expect(suggestLayoutMode(long)).toBe("serial-ar-first");
  });
});
