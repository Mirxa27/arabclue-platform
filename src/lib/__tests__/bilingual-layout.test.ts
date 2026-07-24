import { describe, expect, test } from "bun:test";
import {
  BilingualLayoutEngine,
  BilingualLayoutValidationError,
  DEFAULT_BILINGUAL_CONFIG,
  createColumnRatio,
  generateBilingualCSS,
  parseBilingualDocument,
  renderBilingualHTML,
  renderSafeInline,
  validateBilingualDocument,
  type BilingualDocumentSpec,
  type BilingualInlineNode,
  type PairedImageBlock,
} from "../bilingual-layout";
import { createBidiValue } from "../bilingual-typography";

const text = (value: string): readonly BilingualInlineNode[] => [
  { type: "text", text: value },
];

const sampleDocument: BilingualDocumentSpec = {
  id: "contract-001",
  version: "1",
  title: {
    en: text("Professional Services Agreement"),
    ar: text("اتفاقية الخدمات المهنية"),
  },
  layout: {
    mode: "parallel",
    columnRatio: [55, 45],
    mobileBreakpointPx: 720,
    mobileOrder: "ar-first",
    viewer: { mode: "tabs", defaultLanguage: "ar" },
  },
  sections: [
    {
      id: "scope",
      alignmentKey: "contract.scope",
      title: {
        en: text("Scope"),
        ar: text("النطاق"),
      },
      blocks: [
        {
          type: "heading",
          id: "deliverables-heading",
          level: 3,
          keepWithNext: true,
          content: {
            en: text("Deliverables"),
            ar: text("المخرجات"),
          },
        },
        {
          type: "paragraph",
          id: "scope-paragraph",
          content: {
            en: [
              { type: "text", text: "The provider will deliver order " },
              {
                type: "value",
                valueKind: "identifier",
                value: createBidiValue("PO-2026-س١٢", {
                  baseLocale: "en",
                }),
              },
              { type: "text", text: "." },
            ],
            ar: [
              { type: "text", text: "يسلّم المورّد الطلب " },
              {
                type: "value",
                valueKind: "identifier",
                value: createBidiValue("PO-2026-س١٢", {
                  baseLocale: "ar",
                }),
              },
              { type: "text", text: "." },
            ],
          },
        },
        {
          type: "list",
          id: "deliverables-list",
          ordered: true,
          start: 2,
          items: [
            {
              id: "deliverable-1",
              content: {
                en: text("Implementation"),
                ar: text("التنفيذ"),
              },
              children: [
                {
                  id: "deliverable-1-1",
                  content: {
                    en: text("Configuration"),
                    ar: text("التهيئة"),
                  },
                },
              ],
            },
          ],
        },
        {
          type: "table",
          id: "fees-table",
          caption: {
            en: text("Fees"),
            ar: text("الرسوم"),
          },
          repeatHeader: true,
          columns: [
            {
              id: "item",
              header: { en: text("Item"), ar: text("البند") },
              widthPercent: 60,
            },
            {
              id: "amount",
              header: { en: text("Amount"), ar: text("المبلغ") },
              align: "numeric",
              widthPercent: 40,
            },
          ],
          rows: [
            {
              id: "fee-1",
              cells: {
                item: {
                  content: { en: text("Setup"), ar: text("الإعداد") },
                },
                amount: {
                  content: {
                    en: [
                      {
                        type: "value",
                        valueKind: "currency",
                        value: createBidiValue("SAR 1,000", {
                          baseLocale: "en",
                        }),
                      },
                    ],
                    ar: [
                      {
                        type: "value",
                        valueKind: "currency",
                        value: createBidiValue("١٬٠٠٠ ر.س", {
                          baseLocale: "ar",
                        }),
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
        {
          type: "image",
          id: "process-arrow",
          source: { kind: "public", path: "/documents/process-arrow.png" },
          alt: {
            en: "Delivery process",
            ar: "عملية التسليم",
          },
          caption: {
            en: text("Delivery flow"),
            ar: text("مسار التسليم"),
          },
          visualBehavior: "mirror-in-rtl",
          widthPercent: 70,
        },
      ],
    },
  ],
};

describe("BilingualLayoutEngine structured model", () => {
  test("validates and freezes a complete structured document", () => {
    const result = validateBilingualDocument(sampleDocument);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);

    const parsed = parseBilingualDocument(structuredClone(sampleDocument));
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.sections[0].blocks)).toBe(true);
  });

  test("exposes production-safe defaults", () => {
    expect(DEFAULT_BILINGUAL_CONFIG.mode).toBe("parallel");
    expect(DEFAULT_BILINGUAL_CONFIG.columnRatio).toEqual([50, 50]);
    expect(DEFAULT_BILINGUAL_CONFIG.viewer.mode).toBe("both");
    expect(Object.isFrozen(DEFAULT_BILINGUAL_CONFIG)).toBe(true);
  });

  test("creates validated physical column ratios", () => {
    expect(createColumnRatio(60)).toEqual([60, 40]);
    expect(() => createColumnRatio(75)).toThrow(
      BilingualLayoutValidationError
    );
  });
});

describe("safe HTML rendering", () => {
  test("renders a complete document with no executable inline script", () => {
    const html = renderBilingualHTML(sampleDocument);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("data-bilingual-document");
    expect(html).toContain("Professional Services Agreement");
    expect(html).toContain("اتفاقية الخدمات المهنية");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("addEventListener");
    expect(html).not.toContain("dangerouslySetInnerHTML");
  });

  test("escapes text, code, link labels, attributes, and titles", () => {
    const hostile: BilingualDocumentSpec = {
      ...sampleDocument,
      id: "hostile",
      title: {
        en: text(`<script>alert("title")</script>`),
        ar: text(`<img src=x onerror="alert(1)">`),
      },
      sections: [
        {
          id: "hostile-section",
          alignmentKey: "hostile.section",
          blocks: [
            {
              type: "paragraph",
              id: "hostile-paragraph",
              content: {
                en: [
                  { type: "text", text: `<script>alert("x")</script>` },
                  { type: "code", text: `<img onerror='x'>` },
                  {
                    type: "link",
                    href: "https://example.com/?q=%22safe",
                    children: text(`<b>label</b>`),
                  },
                ],
                ar: text(`<svg onload="x">اختبار</svg>`),
              },
            },
          ],
        },
      ],
    };

    const html = renderBilingualHTML(hostile);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img onerror");
    expect(html).not.toContain("<svg onload");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;label&lt;/b&gt;");
    expect(html).toContain("%22safe");
  });

  test("renders mixed-direction values with semantic bidi isolation", () => {
    const html = renderBilingualHTML(sampleDocument);
    expect(html).toContain('<bdi class="bilingual-value');
    expect(html).toContain("bilingual-value--mixed bilingual-value--identifier");
    expect(html).toContain('dir="ltr">PO-2026-س١٢</bdi>');
    expect(html).toContain('dir="rtl">PO-2026-س١٢</bdi>');
    expect(html).toContain("unicode-bidi: isolate");
  });

  test("keeps the document title valid phrasing content inside one h1", () => {
    const html = renderBilingualHTML(sampleDocument);
    const title = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "";
    expect(title).toContain('<span class="bilingual-cell bilingual-cell--en"');
    expect(title).toContain('<span class="bilingual-cell bilingual-cell--ar"');
    expect(title).not.toContain("<div");
    expect((html.match(/<h1\b/g) ?? [])).toHaveLength(1);
  });

  test("uses automatic strong-direction detection per localized block", () => {
    const document: BilingualDocumentSpec = {
      ...sampleDocument,
      id: "direction-test",
      sections: [
        {
          id: "direction-section",
          alignmentKey: "direction.section",
          blocks: [
            {
              type: "paragraph",
              id: "direction-paragraph",
              content: {
                en: text("مرحبا من حقل إنجليزي"),
                ar: text("Technical term first"),
              },
            },
          ],
        },
      ],
    };

    const html = renderBilingualHTML(document);
    expect(html).toContain('<p dir="rtl">مرحبا من حقل إنجليزي</p>');
    expect(html).toContain('<p dir="ltr">Technical term first</p>');
  });

  test("renders structured lists, tables, and images", () => {
    const html = renderBilingualHTML(sampleDocument);
    expect(html).toContain('<ol start="2">');
    expect(html).toContain('data-list-item-id="deliverable-1"');
    expect(html).toContain("<table");
    expect(html).toContain("<caption>Fees</caption>");
    expect(html).toContain("<thead>");
    expect(html).toContain('data-table-row-id="fee-1"');
    expect(html).toContain('src="/documents/process-arrow.png"');
    expect(html).toContain('alt="عملية التسليم"');
  });

  test("renders validated accessible charts in both paired languages", () => {
    const document: BilingualDocumentSpec = {
      ...sampleDocument,
      id: "chart-test",
      sections: [
        {
          id: "chart-section",
          alignmentKey: "chart.section",
          blocks: [
            {
              type: "chart",
              id: "delivery-chart",
              chart: {
                id: "deliveryProgress",
                type: "bar",
                title: {
                  en: "Delivery progress <script>",
                  ar: "تقدم التنفيذ <script>",
                },
                summary: {
                  en: "Completed work by phase",
                  ar: "الأعمال المكتملة حسب المرحلة",
                },
                categories: [
                  {
                    id: "design",
                    label: { en: "Design", ar: "التصميم" },
                  },
                  {
                    id: "build",
                    label: { en: "Build", ar: "التنفيذ" },
                  },
                ],
                series: [
                  {
                    id: "complete",
                    label: { en: "Complete", ar: "مكتمل" },
                    values: [1, 0.6],
                  },
                ],
                valueFormat: { style: "percent" },
              },
            },
          ],
        },
      ],
    };

    const html = renderBilingualHTML(document);
    expect(html).toContain("<svg");
    expect(html).toContain("<title>");
    expect(html).toContain("document-chart-data-fallback");
    expect(html).toContain("تقدم التنفيذ");
    expect(html).toContain("Delivery progress");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  test("mirrors only explicitly directional visuals", () => {
    const neutralImage: PairedImageBlock = {
      type: "image",
      id: "logo",
      source: { kind: "public", path: "/documents/logo.png" },
      alt: { en: "Logo", ar: "الشعار" },
      visualBehavior: "never",
    };
    const document: BilingualDocumentSpec = {
      ...sampleDocument,
      id: "visual-test",
      sections: [
        {
          id: "visuals",
          alignmentKey: "visuals",
          blocks: [
            sampleDocument.sections[0].blocks[4],
            neutralImage,
          ],
        },
      ],
    };
    const html = renderBilingualHTML(document);
    expect(
      html.match(/bilingual-visual--mirror-in-rtl/g)?.length
    ).toBeGreaterThan(0);
    const neutralFragment = html.slice(
      html.indexOf('data-fragment-id="visuals--logo"')
    );
    expect(neutralFragment.split("</div>", 1)[0]).not.toContain(
      "bilingual-visual--mirror-in-rtl"
    );
    expect(html).not.toContain("[dir=\"rtl\"] img {");
  });
});

describe("layout modes and stable synchronization contract", () => {
  test("keeps English physically before Arabic in parallel mode", () => {
    const html = new BilingualLayoutEngine({
      mode: "parallel",
      viewer: { mode: "both" },
    }).render(sampleDocument, { includeDocumentShell: false });
    const fragment = html.slice(
      html.indexOf('data-fragment-id="contract.scope--scope-paragraph"')
    );
    expect(fragment.indexOf('data-language="en"')).toBeLessThan(
      fragment.indexOf('data-language="ar"')
    );
    const css = generateBilingualCSS({
      ...DEFAULT_BILINGUAL_CONFIG,
      columnRatio: [55, 45],
    });
    expect(css).toContain(
      "grid-template-columns:\n    minmax(0, var(--bilingual-en-column))"
    );
    expect(css).toContain("--bilingual-en-column: 55fr;");
    expect(css).toContain("--bilingual-ar-column: 45fr;");
    expect(css).not.toContain("--bilingual-en-column: 55%;");
  });

  test("renders serial Arabic-first order", () => {
    const html = new BilingualLayoutEngine({
      mode: "serial-ar-first",
    }).render(
      { ...sampleDocument, layout: undefined },
      { includeDocumentShell: false }
    );
    const fragment = html.slice(
      html.indexOf('data-fragment-id="contract.scope--scope-paragraph"')
    );
    expect(fragment.indexOf('data-language="ar"')).toBeLessThan(
      fragment.indexOf('data-language="en"')
    );
  });

  test("renders serial English-first order", () => {
    const html = new BilingualLayoutEngine({
      mode: "serial-en-first",
    }).render(
      { ...sampleDocument, layout: undefined },
      { includeDocumentShell: false }
    );
    const fragment = html.slice(
      html.indexOf('data-fragment-id="contract.scope--scope-paragraph"')
    );
    expect(fragment.indexOf('data-language="en"')).toBeLessThan(
      fragment.indexOf('data-language="ar"')
    );
  });

  test("emits stable section, alignment, and fragment selectors", () => {
    const html = renderBilingualHTML(sampleDocument);
    expect(html).toContain('data-section-id="scope"');
    expect(html).toContain('data-alignment-key="contract.scope"');
    expect(html).toContain(
      'data-fragment-id="contract.scope--scope-paragraph"'
    );
    expect(html).toContain("data-bilingual-pair");
    expect(html).toContain('data-bilingual-layout-ready="true"');
    expect(html).toContain('data-fragment-keep-with-next="true"');
    expect(html).toContain('data-fragment-index="1"');
    expect(html).toContain('data-fragment-count="6"');
    expect(html).toContain("break-after: avoid-page");
  });

  test("emits viewer-tab metadata without hiding either language in print", () => {
    const html = renderBilingualHTML(sampleDocument);
    expect(html).toContain("data-bilingual-viewer-tabs");
    expect(html).toContain('data-viewer-language="en"');
    expect(html).toContain('data-viewer-language="ar"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(
      '[data-viewer-mode="tabs"] [data-language] {\n    display: block !important;'
    );
    expect(html).not.toContain("<script");
  });

  test("print target disables screen-only tab filtering", () => {
    const html = renderBilingualHTML(sampleDocument, { target: "print" });
    expect(html).toContain('data-viewer-mode="both"');
    expect(html).not.toContain("data-bilingual-viewer-tabs");
    expect(html).toContain("The provider will deliver");
    expect(html).toContain("يسلّم المورّد");
  });

  test("uses logical properties and a mobile serial fallback", () => {
    const css = generateBilingualCSS({
      ...DEFAULT_BILINGUAL_CONFIG,
      mobileBreakpointPx: 720,
      mobileOrder: "ar-first",
    });
    expect(css).toContain("padding-inline:");
    expect(css).toContain("margin-block-end:");
    expect(css).toContain("border-block-end:");
    expect(css).toContain("@media (max-width: 720px)");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(css).toContain(".bilingual-cell--ar { order: 1; }");
    expect(css).not.toContain("margin-left:");
    expect(css).not.toContain("border-left:");
  });
});

describe("production validation", () => {
  test("rejects invalid or unreadable column ratios", () => {
    for (const ratio of [
      [80, 20],
      [40, 40],
      [Number.NaN, 50],
    ] as const) {
      expect(() => new BilingualLayoutEngine({ columnRatio: ratio })).toThrow(
        BilingualLayoutValidationError
      );
    }
  });

  test("rejects duplicate IDs and alignment keys", () => {
    const invalid: BilingualDocumentSpec = {
      ...sampleDocument,
      sections: [
        sampleDocument.sections[0],
        {
          ...sampleDocument.sections[0],
          blocks: [
            {
              type: "paragraph",
              id: "scope-paragraph",
              content: { en: text("Again"), ar: text("مرة أخرى") },
            },
          ],
        },
      ],
    };
    const result = validateBilingualDocument(invalid);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "DUPLICATE_ID")).toBe(
      true
    );
    expect(
      result.issues.some(
        (issue) => issue.code === "DUPLICATE_ALIGNMENT_KEY"
      )
    ).toBe(true);
  });

  test("rejects missing or empty localized content", () => {
    const invalid = structuredClone(sampleDocument) as {
      title: { en: BilingualInlineNode[]; ar: BilingualInlineNode[] };
    } & BilingualDocumentSpec;
    invalid.title.ar = [];
    const result = validateBilingualDocument(invalid);
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((issue) => issue.code === "MISSING_CONTENT")
    ).toBe(true);
  });

  test("rejects unsafe Unicode bidi controls", () => {
    const invalid: BilingualDocumentSpec = {
      ...sampleDocument,
      title: {
        en: text("Invoice \u202Ecod.exe"),
        ar: text("فاتورة"),
      },
    };
    const result = validateBilingualDocument(invalid);
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((issue) => issue.code === "UNSAFE_BIDI_CONTROL")
    ).toBe(true);
  });

  test("rejects unsafe link protocols before rendering", () => {
    const invalid: BilingualDocumentSpec = {
      ...sampleDocument,
      sections: [
        {
          id: "links",
          alignmentKey: "links",
          blocks: [
            {
              type: "paragraph",
              id: "unsafe-link",
              content: {
                en: [
                  {
                    type: "link",
                    href: "javascript:alert(1)",
                    children: text("click"),
                  },
                ],
                ar: text("رابط"),
              },
            },
          ],
        },
      ],
    };
    expect(validateBilingualDocument(invalid).issues).toContainEqual(
      expect.objectContaining({ code: "INVALID_LINK" })
    );
    expect(() => renderBilingualHTML(invalid)).toThrow(
      BilingualLayoutValidationError
    );
  });

  test("rejects remote, traversal, and active image sources", () => {
    const sources = [
      { kind: "public", path: "https://attacker.example/logo.png" },
      { kind: "public", path: "/documents/../secret.png" },
      {
        kind: "data",
        uri: "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+",
      },
    ];

    for (const source of sources) {
      const invalid = structuredClone(sampleDocument) as unknown as {
        sections: Array<{
          blocks: Array<Record<string, unknown>>;
        }>;
      };
      invalid.sections[0].blocks[4].source = source;
      const result = validateBilingualDocument(invalid);
      expect(
        result.issues.some((issue) => issue.code === "INVALID_IMAGE")
      ).toBe(true);
    }
  });

  test("rejects table rows that do not match the declared columns", () => {
    const invalid = structuredClone(sampleDocument) as unknown as {
      sections: Array<{
        blocks: Array<{
          type: string;
          rows?: Array<{ cells: Record<string, unknown> }>;
        }>;
      }>;
    };
    const table = invalid.sections[0].blocks[3];
    if (!table.rows) throw new Error("fixture table missing");
    delete table.rows[0].cells.amount;
    const result = validateBilingualDocument(invalid);
    expect(
      result.issues.some((issue) => issue.code === "INVALID_TABLE")
    ).toBe(true);
  });

  test("rejects invalid or non-finite chart data", () => {
    const invalid: BilingualDocumentSpec = {
      ...sampleDocument,
      id: "invalid-chart",
      sections: [
        {
          id: "charts",
          alignmentKey: "charts",
          blocks: [
            {
              type: "chart",
              id: "bad-chart",
              chart: {
                id: "invalidChart",
                type: "line",
                title: { en: "Invalid", ar: "غير صالح" },
                summary: { en: "Invalid data", ar: "بيانات غير صالحة" },
                categories: [
                  { id: "one", label: { en: "One", ar: "واحد" } },
                ],
                series: [
                  {
                    id: "bad",
                    label: { en: "Bad", ar: "سيئ" },
                    values: [Number.NaN],
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const result = validateBilingualDocument(invalid);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("INVALID_CHART");
  });

  test("safe inline renderer never treats text as markup", () => {
    const html = renderSafeInline([
      { type: "strong", children: text("<iframe src=x>") },
      { type: "line-break" },
      { type: "emphasis", children: text("& content") },
    ]);
    expect(html).toBe(
      "<strong>&lt;iframe src=x&gt;</strong><br /><em>&amp; content</em>"
    );
  });
});
