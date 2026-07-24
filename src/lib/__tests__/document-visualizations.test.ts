import { describe, expect, test } from "bun:test";
import {
  CHART_PATTERN_KEYS,
  DOCUMENT_VISUALIZATION_LIMITS,
  DocumentVisualizationError,
  formatDocumentNumber,
  prepareDocumentTable,
  renderDocumentChart,
  renderDocumentTable,
  type DocumentChartDefinition,
  type DocumentTableDefinition,
} from "../document-visualizations";

const labels = (en: string, ar = `عربي ${en}`) => ({ ar, en });

function makeTable(
  overrides: Partial<DocumentTableDefinition> = {}
): DocumentTableDefinition {
  return {
    id: "pricing-table",
    title: labels("Pricing", "الأسعار"),
    summary: labels("Commercial breakdown", "التفاصيل التجارية"),
    columns: [
      { id: "item", label: labels("Item", "البند"), kind: "text" },
      {
        id: "amount",
        label: labels("Amount", "المبلغ"),
        kind: "number",
        format: {
          style: "currency",
          currency: "SAR",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        },
      },
      {
        id: "ratio",
        label: labels("Completion", "الإنجاز"),
        kind: "number",
        format: {
          style: "percent",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        },
      },
      {
        id: "approved",
        label: labels("Approved", "معتمد"),
        kind: "boolean",
      },
    ],
    rows: [
      {
        id: "mobilization",
        cells: {
          item: "Mobilization",
          amount: 1250.5,
          ratio: 0.25,
          approved: true,
        },
      },
      {
        id: "delivery",
        cells: {
          item: "Delivery",
          amount: 4400,
          ratio: 0.75,
          approved: false,
        },
      },
      {
        id: "retention",
        cells: {
          item: "Retention",
          amount: null,
          ratio: 0,
          approved: null,
        },
      },
    ],
    ...overrides,
  };
}

function makeChart(
  overrides: Partial<DocumentChartDefinition> = {}
): DocumentChartDefinition {
  return {
    id: "quarterly-performance",
    type: "bar",
    title: labels("Quarterly performance", "الأداء الربعي"),
    summary: labels(
      "Revenue and cost by quarter",
      "الإيرادات والتكلفة حسب الربع"
    ),
    categories: [
      { id: "q1", label: labels("Q1", "الربع ١") },
      { id: "q2", label: labels("Q2", "الربع ٢") },
      { id: "q3", label: labels("Q3", "الربع ٣") },
    ],
    series: [
      {
        id: "revenue",
        label: labels("Revenue", "الإيرادات"),
        values: [10, 25, 40],
        color: "#0F766E",
        pattern: "solid",
      },
      {
        id: "cost",
        label: labels("Cost", "التكلفة"),
        values: [6, 15, 22],
        color: "#B45309",
        pattern: "crosshatch",
      },
    ],
    valueFormat: {
      style: "number",
      maximumFractionDigits: 1,
    },
    ...overrides,
  };
}

function unsafeChart(
  value: unknown
): DocumentChartDefinition {
  return value as DocumentChartDefinition;
}

function unsafeTable(
  value: unknown
): DocumentTableDefinition {
  return value as DocumentTableDefinition;
}

describe("formatDocumentNumber", () => {
  test("formats numbers, integers, percentages, and currencies explicitly", () => {
    expect(
      formatDocumentNumber(1234.56, "en", {
        style: "number",
        minimumFractionDigits: 2,
      })
    ).toBe("1,234.56");
    expect(
      formatDocumentNumber(12.8, "en", { style: "integer" })
    ).toBe("13");
    expect(
      formatDocumentNumber(0.255, "en", {
        style: "percent",
        maximumFractionDigits: 1,
      })
    ).toBe("25.5%");
    expect(
      formatDocumentNumber(99, "en", {
        style: "currency",
        currency: "SAR",
      })
    ).toContain("SAR");
  });

  test("uses Arabic digits and supports grouping control", () => {
    const arabic = formatDocumentNumber(1234, "ar", {
      style: "number",
      useGrouping: false,
    });
    expect(arabic).toContain("١٢٣٤");
    expect(arabic).not.toMatch(
      /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u206f]/u
    );
    expect(arabic).not.toContain(",");
  });

  test("rejects non-finite and excessive values", () => {
    for (const value of [Number.NaN, Infinity, -Infinity]) {
      expect(() => formatDocumentNumber(value, "en")).toThrow(
        DocumentVisualizationError
      );
    }
    expect(() =>
      formatDocumentNumber(
        DOCUMENT_VISUALIZATION_LIMITS.maxAbsoluteValue + 1,
        "en"
      )
    ).toThrow(DocumentVisualizationError);
  });

  test("rejects invalid locale and malformed formats at runtime", () => {
    expect(() =>
      formatDocumentNumber(1, "fr" as "en", { style: "number" })
    ).toThrow("locale");
    expect(() =>
      formatDocumentNumber(1, "en", {
        style: "currency",
        currency: "sar",
      })
    ).toThrow("currency");
    expect(() =>
      formatDocumentNumber(1, "en", {
        style: "number",
        minimumFractionDigits: 4,
        maximumFractionDigits: 2,
      })
    ).toThrow("minimumFractionDigits");
    expect(() =>
      formatDocumentNumber(
        1,
        "en",
        {
          style: "number",
          currency: "SAR",
        } as never
      )
    ).toThrow("only allowed");
  });
});

describe("prepareDocumentTable", () => {
  test("validates, localizes, formats, and chunks rows deterministically", () => {
    const first = prepareDocumentTable(makeTable(), {
      locale: "en",
      rowsPerPage: 2,
    });
    const second = prepareDocumentTable(makeTable(), {
      locale: "en",
      rowsPerPage: 2,
    });

    expect(first).toEqual(second);
    expect(first.direction).toBe("ltr");
    expect(first.totalRows).toBe(3);
    expect(first.pages).toHaveLength(2);
    expect(first.pages[0]?.rows.map((row) => row.id)).toEqual([
      "mobilization",
      "delivery",
    ]);
    expect(first.pages[1]?.rows.map((row) => row.id)).toEqual(["retention"]);
    expect(first.pages[0]?.headers).toBe(first.headers);
    expect(first.pages[1]?.headers).toBe(first.headers);
    expect(first.pages[0]?.rows[0]?.cells[1]?.formattedValue).toContain(
      "SAR"
    );
    expect(first.pages[0]?.rows[0]?.cells[2]?.formattedValue).toBe("25%");
    expect(first.pages[0]?.rows[0]?.cells[3]?.formattedValue).toBe("Yes");
    expect(first.pages[0]?.rows[1]?.cells[3]?.formattedValue).toBe("No");
    expect(first.pages[1]?.rows[0]?.cells[1]?.formattedValue).toBe("—");
  });

  test("uses Arabic labels, direction, digits, and custom boolean labels", () => {
    const table = makeTable({
      columns: [
        { id: "item", label: labels("Item", "البند"), kind: "text" },
        {
          id: "count",
          label: labels("Count", "العدد"),
          kind: "number",
          format: { style: "integer" },
        },
        {
          id: "valid",
          label: labels("Valid", "صالح"),
          kind: "boolean",
          trueLabel: labels("Accepted", "مقبول"),
          falseLabel: labels("Rejected", "مرفوض"),
        },
      ],
      rows: [
        {
          cells: { item: "اختبار", count: 12.4, valid: false },
        },
      ],
    });
    const prepared = prepareDocumentTable(table, { locale: "ar" });

    expect(prepared.direction).toBe("rtl");
    expect(prepared.headers.map((header) => header.displayLabel)).toEqual([
      "البند",
      "العدد",
      "صالح",
    ]);
    expect(prepared.pages[0]?.rows[0]?.id).toBe("row-1");
    expect(prepared.pages[0]?.rows[0]?.cells[1]?.formattedValue).toBe("١٢");
    expect(prepared.pages[0]?.rows[0]?.cells[2]?.formattedValue).toBe("مرفوض");
  });

  test("always returns one empty page so headers can render", () => {
    const prepared = prepareDocumentTable(makeTable({ rows: [] }));
    expect(prepared.pages).toHaveLength(1);
    expect(prepared.pages[0]?.pageNumber).toBe(1);
    expect(prepared.pages[0]?.pageCount).toBe(1);
    expect(prepared.pages[0]?.rows).toEqual([]);
  });

  test("recommends portrait for a compact table", () => {
    const prepared = prepareDocumentTable(
      makeTable({
        columns: [
          { id: "name", label: labels("Name", "الاسم"), kind: "text" },
          {
            id: "score",
            label: labels("Score", "النتيجة"),
            kind: "number",
          },
        ],
        rows: [{ cells: { name: "A", score: 1 } }],
      })
    );
    expect(prepared.recommendedOrientation).toBe("portrait");
    expect(prepared.orientationReasons).toEqual([]);
  });

  test("explains deterministic landscape recommendations", () => {
    const columns = Array.from({ length: 7 }, (_, index) => ({
      id: `column-${index}`,
      label: labels(
        `Very detailed heading ${index}`,
        `عنوان تفصيلي طويل للغاية ${index}`
      ),
      kind: "text" as const,
      widthWeight: 2,
    }));
    const cells = Object.fromEntries(
      columns.map((column) => [column.id, "value"])
    );
    const prepared = prepareDocumentTable(
      makeTable({ columns, rows: [{ cells }] })
    );

    expect(prepared.recommendedOrientation).toBe("landscape");
    expect(prepared.estimatedWidthUnits).toBe(14);
    expect(prepared.orientationReasons).toEqual([
      "column-count",
      "estimated-width",
      "long-bilingual-header",
    ]);
  });

  test("rejects invalid and duplicate identifiers", () => {
    expect(() =>
      prepareDocumentTable(makeTable({ id: "bad id" }))
    ).toThrow("table.id");
    expect(() =>
      prepareDocumentTable(
        makeTable({
          columns: [
            { id: "same", label: labels("A"), kind: "text" },
            { id: "same", label: labels("B"), kind: "text" },
          ],
          rows: [],
        })
      )
    ).toThrow("duplicate column id");
    expect(() =>
      prepareDocumentTable(
        makeTable({
          columns: [
            { id: "value", label: labels("Value"), kind: "text" },
          ],
          rows: [
            { id: "same", cells: { value: "a" } },
            { id: "same", cells: { value: "b" } },
          ],
        })
      )
    ).toThrow("duplicate row id");
  });

  test("requires an exact primitive cell map", () => {
    expect(() =>
      prepareDocumentTable(
        makeTable({
          columns: [
            { id: "known", label: labels("Known"), kind: "text" },
          ],
          rows: [{ cells: {} }],
        })
      )
    ).toThrow("is required");
    expect(() =>
      prepareDocumentTable(
        makeTable({
          columns: [
            { id: "known", label: labels("Known"), kind: "text" },
          ],
          rows: [{ cells: { known: "ok", extra: "no" } }],
        })
      )
    ).toThrow("unknown column");
    expect(() =>
      prepareDocumentTable(
        makeTable({
          columns: [
            { id: "known", label: labels("Known"), kind: "text" },
          ],
          rows: [{ cells: { known: 7 } }],
        })
      )
    ).toThrow("string");
    expect(() =>
      prepareDocumentTable(
        makeTable({
          columns: [
            { id: "known", label: labels("Known"), kind: "boolean" },
          ],
          rows: [{ cells: { known: "yes" } }],
        })
      )
    ).toThrow("boolean");
  });

  test("rejects non-finite table values and oversized text", () => {
    expect(() =>
      prepareDocumentTable(
        makeTable({
          columns: [
            { id: "value", label: labels("Value"), kind: "number" },
          ],
          rows: [{ cells: { value: Number.NaN } }],
        })
      )
    ).toThrow("finite number");
    expect(() =>
      prepareDocumentTable(
        makeTable({
          columns: [
            { id: "value", label: labels("Value"), kind: "text" },
          ],
          rows: [
            {
              cells: {
                value: "x".repeat(
                  DOCUMENT_VISUALIZATION_LIMITS.maxLabelLength + 1
                ),
              },
            },
          ],
        })
      )
    ).toThrow(DocumentVisualizationError);
  });

  test("enforces column, row, and page-size limits", () => {
    expect(() =>
      prepareDocumentTable(makeTable({ columns: [] }))
    ).toThrow("must not be empty");
    const excessColumns = Array.from(
      { length: DOCUMENT_VISUALIZATION_LIMITS.maxTableColumns + 1 },
      (_, index) => ({
        id: `col-${index}`,
        label: labels(`Column ${index}`),
        kind: "text" as const,
      })
    );
    expect(() =>
      prepareDocumentTable(makeTable({ columns: excessColumns, rows: [] }))
    ).toThrow(DocumentVisualizationError);
    const base = makeTable();
    const excessRows = Array.from(
      { length: DOCUMENT_VISUALIZATION_LIMITS.maxTableRows + 1 },
      () => base.rows[0]!
    );
    expect(() =>
      prepareDocumentTable(makeTable({ rows: excessRows }))
    ).toThrow(DocumentVisualizationError);
    expect(() =>
      prepareDocumentTable(makeTable(), { rowsPerPage: 0 })
    ).toThrow("rowsPerPage");
    expect(() =>
      prepareDocumentTable(makeTable(), {
        rowsPerPage: DOCUMENT_VISUALIZATION_LIMITS.maxRowsPerPage + 1,
      })
    ).toThrow("rowsPerPage");
  });

  test("validates column configuration and bilingual labels", () => {
    expect(() =>
      prepareDocumentTable(
        unsafeTable({
          ...makeTable(),
          title: { ar: " ", en: "Title" },
        })
      )
    ).toThrow("table.title.ar");
    expect(() =>
      prepareDocumentTable(
        unsafeTable({
          ...makeTable(),
          columns: [
            {
              id: "value",
              label: labels("Value"),
              kind: "text",
              format: { style: "number" },
            },
          ],
          rows: [],
        })
      )
    ).toThrow("only allowed");
    expect(() =>
      prepareDocumentTable(
        unsafeTable({
          ...makeTable(),
          columns: [
            {
              id: "value",
              label: labels("Value"),
              kind: "other",
            },
          ],
          rows: [],
        })
      )
    ).toThrow("table.columns[0].kind");
    expect(() =>
      prepareDocumentTable(
        unsafeTable({
          ...makeTable(),
          columns: [
            {
              id: "value",
              label: labels("Value"),
              kind: "text",
              widthWeight: Infinity,
            },
          ],
          rows: [],
        })
      )
    ).toThrow("widthWeight");
  });
});

describe("renderDocumentTable", () => {
  test("emits repeated headers and accessible row/column semantics", () => {
    const rendered = renderDocumentTable(makeTable(), {
      rowsPerPage: 2,
    });
    expect(rendered.html.match(/<thead>/g)).toHaveLength(2);
    expect(rendered.html).toContain('scope="col"');
    expect(rendered.html).toContain('scope="row"');
    expect(rendered.html).toContain('data-page="1"');
    expect(rendered.html).toContain('data-page="2"');
    expect(rendered.html).toContain('data-value-kind="number"');
    expect(rendered.html).toContain("<bdi dir=\"auto\">");
    expect(rendered.html).toContain('lang="ar" dir="rtl"');
    expect(rendered.html).toContain('lang="en" dir="ltr"');
  });

  test("escapes authored text rather than accepting raw HTML", () => {
    const rendered = renderDocumentTable(
      makeTable({
        title: labels(
          `<img src=x onerror="alert(1)">`,
          "<svg onload=alert(1)>"
        ),
        columns: [
          {
            id: "text",
            label: labels("<script>label</script>", "<b>عنوان</b>"),
            kind: "text",
          },
        ],
        rows: [
          {
            cells: {
              text: `<a href="javascript:alert(1)">unsafe</a> & text`,
            },
          },
        ],
      })
    );
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain("<svg onload");
    expect(rendered.html).not.toContain("<img src=");
    expect(rendered.html).not.toContain("<a href=");
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.html).toContain("&amp; text");
  });

  test("renders a deterministic no-data state", () => {
    const rendered = renderDocumentTable(makeTable({ rows: [] }), {
      locale: "ar",
    });
    expect(rendered.html).toContain("لا توجد بيانات");
    expect(rendered.html).toContain('colspan="4"');
    expect(rendered.html).toContain('dir="rtl"');
  });
});

describe("renderDocumentChart", () => {
  test("renders deterministic accessible bar SVG with a visible data fallback", () => {
    const first = renderDocumentChart(makeChart(), { locale: "en" });
    const second = renderDocumentChart(makeChart(), { locale: "en" });

    expect(first).toEqual(second);
    expect(first.svg).toStartWith("<svg");
    expect(first.svg).toContain('role="img"');
    expect(first.svg).toContain("aria-labelledby=");
    expect(first.svg).toContain("<title id=");
    expect(first.svg).toContain("<desc id=");
    expect(first.svg).toContain('data-chart-type="bar"');
    expect(first.svg).toContain('data-axis-order="categorical-ltr"');
    expect(first.svg).toContain("<pattern");
    expect(first.svg).toContain('role="list"');
    expect(first.svg).toContain("Revenue");
    expect(first.svg).toContain("Cost");
    expect(first.dataTableHtml).toContain("<table");
    expect(first.dataTableHtml).toContain('scope="col"');
    expect(first.dataTableHtml).toContain('scope="row"');
    expect(first.html).toContain(first.svg);
    expect(first.html).toContain(first.dataTableHtml);
    expect(first.altText).toContain("الأداء الربعي");
    expect(first.altText).toContain("Quarterly performance");
  });

  test("uses logical RTL ordering for categorical charts", () => {
    const rendered = renderDocumentChart(makeChart(), { locale: "ar" });
    expect(rendered.direction).toBe("rtl");
    expect(rendered.axisOrder).toBe("categorical-rtl");
    expect(rendered.visualCategoryOrder).toEqual(["q3", "q2", "q1"]);
    expect(rendered.svg).toContain('dir="rtl"');
    expect(rendered.svg).toContain('lang="ar"');
    expect(rendered.dataTableHtml).toContain("١٠");
  });

  test("sorts chronology physically left-to-right even in RTL output", () => {
    const rendered = renderDocumentChart(
      makeChart({
        categoryAxis: "chronological",
        categories: [
          { id: "latest", label: labels("2026"), chronology: 2026 },
          { id: "earliest", label: labels("2024"), chronology: 2024 },
          { id: "middle", label: labels("2025"), chronology: 2025 },
        ],
        series: [
          {
            id: "value",
            label: labels("Value"),
            values: [3, 1, 2],
          },
        ],
      }),
      { locale: "ar" }
    );
    expect(rendered.direction).toBe("rtl");
    expect(rendered.axisOrder).toBe("chronological-ltr");
    expect(rendered.visualCategoryOrder).toEqual([
      "earliest",
      "middle",
      "latest",
    ]);
    expect(rendered.svg).toContain('data-axis-order="chronological-ltr"');
    expect(rendered.dataTableHtml.indexOf("2024")).toBeLessThan(
      rendered.dataTableHtml.indexOf("2026")
    );
  });

  test("renders line charts with non-color line and marker distinctions", () => {
    const rendered = renderDocumentChart(
      makeChart({
        type: "line",
        series: [
          {
            id: "revenue",
            label: labels("Revenue"),
            values: [-5, 0, 20],
            color: "#0F766E",
            pattern: "solid",
          },
          {
            id: "cost",
            label: labels("Cost"),
            values: [4, 9, 12],
            color: "#B45309",
            pattern: "diagonal",
          },
        ],
      })
    );
    expect(rendered.svg).toContain('data-chart-type="line"');
    expect(rendered.svg).toContain("<polyline");
    expect(rendered.svg).toContain('stroke-dasharray="10 4"');
    expect(rendered.svg).toContain("<circle");
    expect(rendered.svg).toContain("<rect");
    expect(rendered.svg).toContain("Revenue, Q1");
    expect(rendered.dataTableHtml).toContain("-5");
  });

  test("renders multi-slice pie paths with stable category patterns", () => {
    const rendered = renderDocumentChart(
      makeChart({
        id: "market-share",
        type: "pie",
        categories: [
          { id: "public", label: labels("Public", "حكومي") },
          { id: "private", label: labels("Private", "خاص") },
          { id: "other", label: labels("Other", "أخرى") },
        ],
        series: [
          {
            id: "share",
            label: labels("Share", "الحصة"),
            values: [50, 30, 20],
            color: "#0F766E",
          },
        ],
        valueFormat: { style: "percent", maximumFractionDigits: 0 },
      }),
      { locale: "ar" }
    );
    expect(rendered.svg).toContain('data-chart-type="pie"');
    expect(rendered.svg).toContain("<path d=");
    expect(rendered.svg).toContain("market-share-category-public");
    expect(rendered.svg).toContain("market-share-category-private");
    expect(rendered.visualCategoryOrder).toEqual(["other", "private", "public"]);
    expect(rendered.svg).toContain("٪");
  });

  test("renders a one-slice pie as a circle", () => {
    const rendered = renderDocumentChart(
      makeChart({
        id: "single-share",
        type: "pie",
        categories: [{ id: "all", label: labels("All") }],
        series: [
          {
            id: "share",
            label: labels("Share"),
            values: [100],
          },
        ],
      })
    );
    expect(rendered.svg).toContain("<circle cx=");
    expect(rendered.svg).not.toContain("<path d=\"M");
  });

  test("supports bounded custom dimensions and explicit direction", () => {
    const rendered = renderDocumentChart(makeChart(), {
      locale: "en",
      direction: "rtl",
      width: 640,
      height: 360,
    });
    expect(rendered.svg).toContain('viewBox="0 0 640 360"');
    expect(rendered.direction).toBe("rtl");
    expect(rendered.axisOrder).toBe("categorical-rtl");
  });

  test("escapes malicious labels and summaries from SVG and HTML", () => {
    const rendered = renderDocumentChart(
      makeChart({
        title: labels("<script>alert(1)</script>", "<svg onload=x>"),
        summary: labels(
          `Summary "quoted" & <img src=x>`,
          "<a href=javascript:x>ملخص</a>"
        ),
        categories: [
          {
            id: "safe",
            label: labels("<foreignObject>bad</foreignObject>", "<b>فئة</b>"),
          },
        ],
        series: [
          {
            id: "safe-series",
            label: labels(`Series "one"`, "<i>سلسلة</i>"),
            values: [5],
          },
        ],
      })
    );
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain("<foreignObject>");
    expect(rendered.html).not.toContain("<img src=");
    expect(rendered.html).not.toContain("<a href=");
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.html).toContain("&amp;");
    expect(rendered.svg).toContain("&quot;one&quot;");
  });

  test("rejects NaN, infinity, and excessive magnitudes", () => {
    for (const value of [
      Number.NaN,
      Infinity,
      -Infinity,
      DOCUMENT_VISUALIZATION_LIMITS.maxAbsoluteValue + 1,
    ]) {
      expect(() =>
        renderDocumentChart(
          makeChart({
            series: [
              {
                id: "value",
                label: labels("Value"),
                values: [1, value, 3],
              },
            ],
          })
        )
      ).toThrow(DocumentVisualizationError);
    }
  });

  test("rejects unsafe colors, ids, and pattern names", () => {
    expect(() =>
      renderDocumentChart(makeChart({ id: `x" onload="alert(1)` }))
    ).toThrow("chart.id");
    expect(() =>
      renderDocumentChart(
        makeChart({
          series: [
            {
              id: "unsafe",
              label: labels("Unsafe"),
              values: [1, 2, 3],
              color: "url(javascript:alert(1))",
            },
          ],
        })
      )
    ).toThrow("six-digit hexadecimal");
    expect(() =>
      renderDocumentChart(
        unsafeChart({
          ...makeChart(),
          series: [
            {
              id: "unsafe",
              label: labels("Unsafe"),
              values: [1, 2, 3],
              pattern: "url-pattern",
            },
          ],
        })
      )
    ).toThrow("chart.series[0].pattern");
    expect(() =>
      renderDocumentChart(
        makeChart({
          categories: [
            { id: "bad id", label: labels("Bad") },
            { id: "two", label: labels("Two") },
            { id: "three", label: labels("Three") },
          ],
        })
      )
    ).toThrow("chart.categories[0].id");
  });

  test("rejects duplicate category, series, chronology, and visual keys", () => {
    expect(() =>
      renderDocumentChart(
        makeChart({
          categories: [
            { id: "same", label: labels("A") },
            { id: "same", label: labels("B") },
            { id: "three", label: labels("C") },
          ],
        })
      )
    ).toThrow("duplicate category id");
    expect(() =>
      renderDocumentChart(
        makeChart({
          series: [
            { id: "same", label: labels("A"), values: [1, 2, 3] },
            { id: "same", label: labels("B"), values: [2, 3, 4] },
          ],
        })
      )
    ).toThrow("duplicate series id");
    expect(() =>
      renderDocumentChart(
        makeChart({
          categoryAxis: "chronological",
          categories: [
            { id: "a", label: labels("A"), chronology: 1 },
            { id: "b", label: labels("B"), chronology: 1 },
            { id: "c", label: labels("C"), chronology: 2 },
          ],
        })
      )
    ).toThrow("duplicate chronology value");
    expect(() =>
      renderDocumentChart(
        makeChart({
          series: [
            {
              id: "a",
              label: labels("A"),
              values: [1, 2, 3],
              pattern: "dots",
            },
            {
              id: "b",
              label: labels("B"),
              values: [3, 2, 1],
              pattern: "dots",
            },
          ],
        })
      )
    ).toThrow("duplicate series pattern");
  });

  test("enforces category, series, and total point limits", () => {
    const categories = Array.from(
      { length: DOCUMENT_VISUALIZATION_LIMITS.maxChartCategories + 1 },
      (_, index) => ({
        id: `category-${index}`,
        label: labels(`Category ${index}`),
      })
    );
    expect(() =>
      renderDocumentChart(
        makeChart({
          categories,
          series: [
            {
              id: "value",
              label: labels("Value"),
              values: categories.map(() => 1),
            },
          ],
        })
      )
    ).toThrow(DocumentVisualizationError);

    const series = Array.from(
      { length: DOCUMENT_VISUALIZATION_LIMITS.maxChartSeries + 1 },
      (_, index) => ({
        id: `series-${index}`,
        label: labels(`Series ${index}`),
        values: [1, 2, 3],
      })
    );
    expect(() =>
      renderDocumentChart(makeChart({ series }))
    ).toThrow(DocumentVisualizationError);

    const pointCategories = Array.from({ length: 60 }, (_, index) => ({
      id: `category-${index}`,
      label: labels(`Category ${index}`),
    }));
    const pointSeries = Array.from({ length: 8 }, (_, index) => ({
      id: `series-${index}`,
      label: labels(`Series ${index}`),
      values: pointCategories.map(() => index + 1),
    }));
    expect(() =>
      renderDocumentChart(
        makeChart({
          categories: pointCategories,
          series: pointSeries,
        })
      )
    ).not.toThrow();
    const tooManyCategories = [
      ...pointCategories,
      { id: "extra", label: labels("Extra") },
    ];
    expect(() =>
      renderDocumentChart(
        makeChart({
          categories: tooManyCategories,
          series: pointSeries.map((item) => ({
            ...item,
            values: [...item.values, 1],
          })),
        })
      )
    ).toThrow(DocumentVisualizationError);
  });

  test("validates series lengths and chronological metadata", () => {
    expect(() =>
      renderDocumentChart(
        makeChart({
          series: [
            { id: "short", label: labels("Short"), values: [1, 2] },
          ],
        })
      )
    ).toThrow("exactly 3 values");
    expect(() =>
      renderDocumentChart(
        makeChart({
          categoryAxis: "chronological",
          categories: [
            { id: "a", label: labels("A"), chronology: 1 },
            { id: "b", label: labels("B") },
            { id: "c", label: labels("C"), chronology: 3 },
          ],
        })
      )
    ).toThrow("is required");
  });

  test("applies strict pie constraints", () => {
    expect(() =>
      renderDocumentChart(
        makeChart({
          type: "pie",
          categoryAxis: "chronological",
        })
      )
    ).toThrow("do not support chronological");
    expect(() =>
      renderDocumentChart(
        makeChart({
          type: "pie",
          series: [
            { id: "a", label: labels("A"), values: [1, 2, 3] },
            { id: "b", label: labels("B"), values: [3, 2, 1] },
          ],
        })
      )
    ).toThrow("exactly one series");
    expect(() =>
      renderDocumentChart(
        makeChart({
          type: "pie",
          series: [
            { id: "share", label: labels("Share"), values: [0, 0, 0] },
          ],
        })
      )
    ).toThrow("positive value");
    expect(() =>
      renderDocumentChart(
        makeChart({
          type: "pie",
          series: [
            { id: "share", label: labels("Share"), values: [1, -1, 2] },
          ],
        })
      )
    ).toThrow("must not be negative");
    const tooMany = Array.from(
      { length: DOCUMENT_VISUALIZATION_LIMITS.maxPieCategories + 1 },
      (_, index) => ({
        id: `slice-${index}`,
        label: labels(`Slice ${index}`),
      })
    );
    expect(() =>
      renderDocumentChart(
        makeChart({
          type: "pie",
          categories: tooMany,
          series: [
            {
              id: "share",
              label: labels("Share"),
              values: tooMany.map(() => 1),
            },
          ],
        })
      )
    ).toThrow("pie charts must not exceed");
  });

  test("validates chart discriminants, options, and labels", () => {
    expect(() =>
      renderDocumentChart(
        unsafeChart({ ...makeChart(), type: "gauge" })
      )
    ).toThrow("chart.type");
    expect(() =>
      renderDocumentChart(
        unsafeChart({ ...makeChart(), categoryAxis: "reverse" })
      )
    ).toThrow("chart.categoryAxis");
    expect(() =>
      renderDocumentChart(
        unsafeChart({ ...makeChart(), summary: { ar: "", en: "Summary" } })
      )
    ).toThrow("chart.summary.ar");
    expect(() =>
      renderDocumentChart(makeChart(), { direction: "auto" as "ltr" })
    ).toThrow("options.direction");
    expect(() =>
      renderDocumentChart(makeChart(), { width: 319 })
    ).toThrow("options.width");
    expect(() =>
      renderDocumentChart(makeChart(), { height: 1_201 })
    ).toThrow("options.height");
  });

  test("assigns every allow-listed non-color pattern deterministically", () => {
    const series = CHART_PATTERN_KEYS.map((pattern, index) => ({
      id: `series-${index}`,
      label: labels(`Series ${index}`),
      values: [index + 1],
      pattern,
    }));
    const rendered = renderDocumentChart(
      makeChart({
        type: "line",
        categories: [{ id: "only", label: labels("Only") }],
        series,
      })
    );
    for (const pattern of CHART_PATTERN_KEYS) {
      if (pattern === "solid") continue;
      expect(rendered.svg).toContain(`series-`);
    }
    expect(rendered.svg.match(/<pattern /g)).toHaveLength(
      CHART_PATTERN_KEYS.length
    );
    expect(rendered.svg).toContain("stroke-dasharray");
    expect(rendered.svg).toContain("<circle");
    expect(rendered.svg).toContain("<path");
  });
});
