import { describe, expect, test } from "bun:test";
import {
  assignSectionNumbers,
  BilingualLayoutValidationError,
  generateBilingualCSS,
  renderBilingualHTML,
  type BilingualDocumentSpec,
  type PairedSection,
} from "@/lib/bilingual-layout";

function section(
  id: string,
  titleEn: string | undefined,
  extra: Partial<PairedSection> = {}
): PairedSection {
  return {
    id,
    alignmentKey: id,
    ...(titleEn
      ? {
          title: {
            en: [{ type: "text" as const, text: titleEn }],
            ar: [{ type: "text" as const, text: `عربي ${id}` }],
          },
        }
      : {}),
    blocks: [
      {
        type: "paragraph",
        id: `${id}.p1`,
        content: {
          en: [{ type: "text" as const, text: `Body of ${id}.` }],
          ar: [{ type: "text" as const, text: `نص ${id}.` }],
        },
      },
    ],
    ...extra,
  };
}

const baseDocument: BilingualDocumentSpec = {
  id: "doc-design",
  title: {
    en: [{ type: "text", text: "Design Doc" }],
    ar: [{ type: "text", text: "وثيقة التصميم" }],
  },
  sections: [
    section("s1", "Executive summary"),
    section("untitled", undefined),
    section("s2", "Technical solution"),
  ],
};

describe("section numbering", () => {
  test("numbers titled sections in order and skips untitled ones", () => {
    expect(assignSectionNumbers(baseDocument.sections)).toEqual([
      "1",
      "",
      "2",
    ]);
  });

  test("renders numbers into headings and TOC entries together", () => {
    const html = renderBilingualHTML(baseDocument, {
      tableOfContents: true,
      sectionNumbering: true,
      includeDocumentShell: false,
    });
    // 2 titled sections × 2 languages in headings + 2 entries × 2 language
    // cells in the paired TOC.
    expect((html.match(/bilingual-section-number/gu) ?? []).length).toBe(8);
    expect(html).toContain('href="#s1--heading"');
    expect(html).toContain('href="#s2--heading"');
  });

  test("no numbering markup when disabled (default)", () => {
    const html = renderBilingualHTML(baseDocument, {
      includeDocumentShell: false,
    });
    expect(html).not.toContain("bilingual-section-number");
    expect(html).not.toContain("data-bilingual-toc");
  });
});

describe("table of contents", () => {
  test("emits a bilingual paired TOC with anchors to section headings", () => {
    const html = renderBilingualHTML(baseDocument, {
      tableOfContents: true,
      includeDocumentShell: true,
    });
    expect(html).toContain("Table of contents");
    expect(html).toContain("المحتويات");
    expect(html).toContain("data-bilingual-toc");
    expect(html).toContain('href="#s1--heading"');
  });

  test("omits the TOC for documents with no sections", () => {
    const html = renderBilingualHTML(
      { ...baseDocument, sections: [] },
      { tableOfContents: true, includeDocumentShell: false }
    );
    expect(html).not.toMatch(/<div data-bilingual-toc>/);
  });
});

describe("branded cover page", () => {
  const cover = {
    kicker: { en: "Technical proposal", ar: "عرض فني" },
    subtitle: { en: "Prepared for review", ar: "أُعدّ للمراجعة" },
    bidderName: { en: "Riyadh Systems", ar: "أنظمة الرياض" },
    tenderReference: "ETM-2026-77",
    dateLabel: { en: "2026-08-25", ar: "2026-08-25" },
  };

  test("renders cover chrome before the document body", () => {
    const html = renderBilingualHTML(baseDocument, {
      cover,
      includeDocumentShell: false,
    });
    expect(html.indexOf("data-bilingual-cover")).toBeGreaterThan(-1);
    expect(html).toContain("ETM-2026-77");
    expect(html).toContain("Riyadh Systems");
    expect(html).toContain("أنظمة الرياض");
    expect(html).toContain("Technical proposal");
  });

  test("keeps exactly one semantic h1 and escapes hostile input", () => {
    const hostile = {
      ...cover,
      subtitle: { en: `<script>alert(1)</script>`, ar: `<img src=x>` },
    };
    const html = renderBilingualHTML(baseDocument, {
      cover: hostile,
      includeDocumentShell: true,
    });
    expect((html.match(/<h1\b/gu) ?? []).length).toBe(1);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  test("cover breaks onto its own printed page", () => {
    const css = generateBilingualCSS();
    expect(css).toContain(".bilingual-cover");
    expect(css).toMatch(/\.bilingual-cover\s*\{[^}]*break-after:\s*page/);
  });
});

describe("lifecycle-aware chrome", () => {
  test("default is draft chrome", () => {
    const html = renderBilingualHTML(baseDocument, {
      includeDocumentShell: false,
    });
    expect(html).toContain("Print-ready draft");
    expect(html).toContain("مسودة جاهزة للطباعة");
    expect(html).not.toContain("Authoritative export");
  });

  test("final artifacts say authoritative instead of draft", () => {
    const html = renderBilingualHTML(baseDocument, {
      lifecycle: "final",
      includeDocumentShell: false,
    });
    expect(html).toContain("Authoritative export");
    expect(html).toContain("نسخة معتمدة للتصدير");
    expect(html).not.toContain("Print-ready draft");
    expect(html).toContain('data-lifecycle="final"');
  });
});

describe("brand palette overrides", () => {
  test("valid hex values replace primary, ink-safe secondary, and accent", () => {
    const css = generateBilingualCSS(undefined, {
      primaryColor: "#123456",
      secondaryColor: "#0A0A0A",
      accentColor: "#ABCDEF",
    });
    expect(css).toContain("--bilingual-primary: #123456;");
    // Very dark secondary passes the WCAG check so body ink adopts it.
    expect(css).toContain("--bilingual-ink: #0a0a0a;");
    expect(css).toContain("--bilingual-accent: #abcdef;");
  });

  test("invalid colors keep defaults instead of breaking output", () => {
    const css = generateBilingualCSS(undefined, {
      primaryColor: "javascript:alert(1)",
      secondaryColor: "red; } body { display:none",
      accentColor: null,
    });
    expect(css).toContain("--bilingual-primary: #0F766E;");
    expect(css).toContain("--bilingual-ink: #173F5F;");
    expect(css).toContain("--bilingual-accent: #B45309;");
    expect(css).not.toContain("javascript:");
    expect(css).not.toContain("display:none");
  });

  test("low-contrast brand secondary never becomes body ink", () => {
    const css = generateBilingualCSS(undefined, {
      secondaryColor: "#FFFF00",
    });
    expect(css).toContain("--bilingual-ink: #173F5F;");
  });

  test("three-digit hex expands correctly", () => {
    const css = generateBilingualCSS(undefined, { primaryColor: "#0af" });
    expect(css).toContain("--bilingual-primary: #00aaff;");
  });
});

describe("kpi stat-card block", () => {
  test("renders a bilingual metric grid", () => {
    const doc: BilingualDocumentSpec = {
      ...baseDocument,
      sections: [
        section("kpi-section", "Key indicators", {
          blocks: [
            {
              type: "kpi",
              id: "kpis",
              items: [
                {
                  id: "m-compliance",
                  label: {
                    en: [{ type: "text", text: "Compliance score" }],
                    ar: [{ type: "text", text: "درجة الامتثال" }],
                  },
                  value: {
                    en: [
                      {
                        type: "value",
                        value: { kind: "latin", text: "92%", dir: "ltr" },
                      },
                    ],
                    ar: [
                      {
                        type: "value",
                        value: { kind: "latin", text: "92%", dir: "ltr" },
                      },
                    ],
                  },
                },
                {
                  id: "m-empty",
                  label: {
                    en: [{ type: "text", text: "Local content" }],
                    ar: [{ type: "text", text: "المحتوى المحلي" }],
                  },
                  value: {
                    en: [{ type: "text", text: "Not available" }],
                    ar: [{ type: "text", text: "غير متوفر" }],
                  },
                  hint: {
                    en: [{ type: "text", text: "Awaiting evidence" }],
                    ar: [{ type: "text", text: "بانتظار الدليل" }],
                  },
                },
              ],
            },
          ],
        }),
      ],
    };
    const html = renderBilingualHTML(doc, { includeDocumentShell: false });
    expect(html).toContain("bilingual-kpi-grid");
    expect((html.match(/bilingual-kpi-card/gu) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(html).toContain("data-kpi-id=\"m-compliance\"");
    expect(html).toContain("Compliance score");
    expect(html).toContain("درجة الامتثال");
    expect(html).toContain("Awaiting evidence");
  });

  test("rejects more than six metrics or empty metric lists", () => {
    const sevenMetrics = Array.from({ length: 7 }, (_, i) => ({
      id: `m${i}`,
      label: {
        en: [{ type: "text" as const, text: `Metric ${i}` }],
        ar: [{ type: "text" as const, text: `مقياس ${i}` }],
      },
      value: {
        en: [{ type: "text" as const, text: `${i}` }],
        ar: [{ type: "text" as const, text: `${i}` }],
      },
    }));
    expect(() =>
      renderBilingualHTML(
        {
          ...baseDocument,
          sections: [
            section("bad-kpi", "KPIs", {
              blocks: [{ type: "kpi", id: "too-many", items: sevenMetrics }],
            }),
          ],
        },
        { includeDocumentShell: false }
      )
    ).toThrow(BilingualLayoutValidationError);
  });
});
