import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BilingualFooter,
  BilingualHeader,
  BilingualList,
  BilingualSection,
  BilingualTable,
} from "@/components/documents/bilingual";

describe("bilingual document components", () => {
  test("BilingualSection emits one aligned semantic pair and escapes text", () => {
    const html = renderToStaticMarkup(
      <BilingualSection
        alignmentKey="scope.1"
        title={{ en: "Scope", ar: "النطاق" }}
        english={"Safe <script>alert(1)</script>"}
        arabic="نص آمن"
        columnRatio={[2, 3]}
      />
    );

    expect(html).toContain('data-alignment-key="scope.1"');
    expect(html).toContain('lang="en" dir="ltr"');
    expect(html).toContain('lang="ar" dir="rtl"');
    expect(html).toContain("--bilingual-en-ratio:2");
    expect(html).toContain("--bilingual-ar-ratio:3");
    expect(html).toContain("Safe &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html.match(/<h1/g)).toBeNull();
    expect(html.match(/<h2/g)).toHaveLength(2);
  });

  test("BilingualSection normalizes unsafe ratios and exposes continuation data", () => {
    const html = renderToStaticMarkup(
      <BilingualSection
        alignmentKey="clause-2"
        english="Continued"
        arabic="تابع"
        columnRatio={[0, Number.NaN]}
        continuation={{ fragment: 2, totalFragments: 3 }}
      />
    );

    expect(html).toContain("--bilingual-en-ratio:1");
    expect(html).toContain("--bilingual-ar-ratio:1");
    expect(html).toContain('data-fragment="2"');
    expect(html).toContain("Continued (2/3)");
    expect(html).toContain("تابع (2/3)");
  });

  test("BilingualHeader mirrors language regions without mirroring the brand slot", () => {
    const html = renderToStaticMarkup(
      <BilingualHeader
        eyebrow={{ en: "Proposal", ar: "عرض" }}
        title={{ en: "Cloud Services", ar: "الخدمات السحابية" }}
        subtitle={{ en: "Technical", ar: "فني" }}
      />
    );

    expect(html).toContain("bilingual-header__pair");
    expect(html).toContain("bilingual-header__divider");
    expect(html).toContain("Cloud Services");
    expect(html).toContain("الخدمات السحابية");
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  test("BilingualHeader renders an explicit, unmirrored brand image", () => {
    const html = renderToStaticMarkup(
      <BilingualHeader
        title={{ en: "Service Plan", ar: "خطة الخدمة" }}
        logo={{
          src: "data:image/png;base64,AA==",
          alt: "Example brand",
          width: 120,
          height: 48,
        }}
      />
    );

    expect(html).toContain("bilingual-header__logo");
    expect(html).toContain('alt="Example brand"');
    expect(html).toContain('width="120"');
    expect(html).toContain('height="48"');
    expect(html).not.toContain("bilingual-header__divider");
  });

  test("BilingualTable keeps both languages in a shared row and repeatable head", () => {
    const html = renderToStaticMarkup(
      <BilingualTable
        caption={{ en: "Deliverables", ar: "المخرجات" }}
        columns={[
          { key: "item", header: { en: "Item", ar: "البند" } },
          {
            key: "qty",
            header: { en: "Quantity", ar: "الكمية" },
            numeric: true,
          },
        ]}
        rows={[
          {
            key: "row-1",
            cells: {
              item: { en: "Architecture", ar: "المعمارية" },
              qty: { en: 2, ar: 2 },
            },
          },
        ]}
      />
    );

    expect(html).toContain("<thead>");
    expect(html).toContain('data-alignment-key="row-1"');
    expect(html).toContain("Architecture");
    expect(html).toContain("المعمارية");
    expect(html).toContain("bilingual-table__language-divider");
  });

  test("BilingualTable renders an accessible bilingual empty state", () => {
    const html = renderToStaticMarkup(
      <BilingualTable
        columns={[{ key: "item", header: { en: "Item", ar: "البند" } }]}
        rows={[]}
      />
    );

    expect(html).toContain("No rows");
    expect(html).toContain("لا توجد صفوف");
    expect(html).toContain('colSpan="2"');
  });

  test("BilingualList coordinates item pairs with isolated markers", () => {
    const html = renderToStaticMarkup(
      <BilingualList
        ordered
        start={3}
        items={[
          { key: "one", en: "First", ar: "الأول" },
          { key: "two", en: "Second", ar: "الثاني" },
        ]}
      />
    );

    expect(html).toContain('role="list"');
    expect(html).toContain('data-alignment-key="one"');
    expect(html).toContain(">3</bdi>");
    expect(html).toContain(">4</bdi>");
  });

  test("BilingualFooter renders explicit page numbers in both languages", () => {
    const html = renderToStaticMarkup(
      <BilingualFooter
        company={{ en: "Example Co", ar: "شركة مثال" }}
        notice={{ en: "Confidential", ar: "سري" }}
        pageNumber={2}
        totalPages={8}
      />
    );

    expect(html).toContain("Page");
    expect(html).toContain("صفحة");
    expect(html).toContain("2 / 8");
    expect(html).toContain("Confidential");
    expect(html).toContain("سري");
  });

  test("BilingualFooter supports print counters without fabricated page values", () => {
    const html = renderToStaticMarkup(
      <BilingualFooter useCssPageCounters />
    );

    expect(html).toContain('aria-label="Page number"');
    expect(html).toContain("bilingual-page-number");
    expect(html).toContain("bilingual-total-pages");
    expect(html).toContain('aria-hidden="true"');
  });
});
