import { describe, expect, test } from "bun:test";
import {
  generateBilingualCSS,
  renderBilingualHTML,
  type BilingualDocumentSpec,
  type BilingualInlineNode,
  type PairedTableBlock,
} from "../bilingual-layout";
import { inspectBilingualHtml } from "../bilingual-pdf";
import { createBidiValue } from "../bilingual-typography";

const text = (value: string): readonly BilingualInlineNode[] => [
  { type: "text", text: value },
];

const HASH =
  "sha256:33edc451436342785338c69cc4f3d9090eeed3bd47c48b04d3e0bcd2bb9f13b1";

const table: PairedTableBlock = {
  type: "table",
  id: "coverage",
  columns: [
    { id: "req", header: { en: text("Requirement"), ar: text("المتطلب") } },
    {
      id: "amount",
      header: { en: text("Amount"), ar: text("المبلغ") },
      align: "numeric",
    },
    { id: "status", header: { en: text("Status"), ar: text("الحالة") } },
  ],
  rows: ["r1", "r2", "r3"].map((id, index) => ({
    id,
    cells: {
      req: {
        content: {
          en: text(`R-${String(index + 1)} Data residency within the Kingdom`),
          ar: text(`م-${String(index + 1)} إقامة البيانات داخل المملكة`),
        },
      },
      amount: {
        content: {
          en: [
            {
              type: "value",
              valueKind: "currency",
              value: createBidiValue("1,250,000.00", { baseLocale: "en" }),
            },
          ],
          ar: [
            {
              type: "value",
              valueKind: "currency",
              value: createBidiValue("1,250,000.00", { baseLocale: "ar" }),
            },
          ],
        },
      },
      status: {
        content: {
          en: [{ type: "strong", children: text("Compliant") }],
          ar: [{ type: "strong", children: text("ممتثل") }],
        },
      },
    },
  })),
  repeatHeader: true,
};

const document: BilingualDocumentSpec = {
  id: "chrome-fixture",
  title: { en: text("Technical proposal"), ar: text("العرض الفني") },
  sections: [
    {
      id: "scope",
      alignmentKey: "scope",
      title: { en: text("Scope"), ar: text("النطاق") },
      blocks: [
        {
          type: "paragraph",
          id: "notice",
          content: {
            en: [{ type: "strong", children: text("Needs user input.") }],
            ar: [{ type: "strong", children: text("يلزم إدخال المستخدم.") }],
          },
        },
        table,
      ],
    },
  ],
};

const cover = {
  kicker: { en: "Technical proposal", ar: "عرض فني" },
  bidderName: { en: "Riyadh Systems", ar: "أنظمة الرياض" },
  tenderReference: "ETM-2026-77",
  dateLabel: { en: "2026-09-05", ar: "2026-09-05" },
};

describe("cover sheet as a synchronized pair", () => {
  test("the cover is the first paired row and the title breaks onto a new page", () => {
    const html = renderBilingualHTML(document, {
      cover,
      target: "print",
      includeDocumentShell: false,
    });
    const coverIndex = html.indexOf("data-bilingual-cover");
    const titleIndex = html.indexOf('data-fragment-kind="document-title"');
    expect(coverIndex).toBeGreaterThan(-1);
    expect(coverIndex).toBeLessThan(titleIndex);
    expect(html).toMatch(
      /data-bilingual-cover[^>]*class="bilingual-pair bilingual-pair--parallel bilingual-cover"[^>]*data-bilingual-pair/u,
    );
    expect(html).toMatch(
      /data-fragment-kind="document-title"[^>]*data-fragment-break-before="true"/u,
    );
    expect(html).toContain("ETM-2026-77");
    expect(html).toContain("Riyadh Systems");
    expect(html).toContain("أنظمة الرياض");
    expect(html).toContain("Print-ready draft");
    expect(html).toContain("Confidential · Prepared for tender evaluation");
  });

  test("without a cover the title does not force a page break", () => {
    const html = renderBilingualHTML(document, { includeDocumentShell: false });
    expect(html).toMatch(
      /data-fragment-kind="document-title"[^>]*data-fragment-break-before="false"/u,
    );
    expect(html).not.toContain("data-bilingual-cover");
  });

  test("cover and signature block keep every pair balanced for the PDF gate", () => {
    const html = renderBilingualHTML(document, {
      cover,
      signatureBlock: true,
      integrity: { hash: HASH, qrPayload: `arabclue:proposal:p1:${HASH}` },
      includeDocumentShell: true,
    });
    const report = inspectBilingualHtml(html);
    expect(report.valid).toBe(true);
    // title + section heading + notice + 3 table rows + cover + signature
    expect(report.pairCount).toBe(8);
    expect(report.englishCellCount).toBe(8);
    expect(report.arabicCellCount).toBe(8);
    expect((html.match(/<h1\b/gu) ?? []).length).toBe(1);
  });

  test("custom confidentiality copy replaces the default handling line", () => {
    const html = renderBilingualHTML(document, {
      cover: {
        ...cover,
        confidentiality: { en: "Restricted · Board only", ar: "مقيّد · للمجلس فقط" },
      },
      includeDocumentShell: false,
    });
    expect(html).toContain("Restricted · Board only");
    expect(html).toContain("مقيّد · للمجلس فقط");
    expect(html).not.toContain("Prepared for tender evaluation");
  });
});

describe("integrity strip", () => {
  test("prints only the hash prefix and an offline QR when a payload exists", () => {
    const html = renderBilingualHTML(document, {
      cover,
      integrity: { hash: HASH, qrPayload: `arabclue:proposal:p1:${HASH}` },
      includeDocumentShell: false,
    });
    expect(html).toContain("33ed c451 4363");
    expect(html).toContain("bilingual-integrity__qr");
    expect((html.match(/<svg\b/gu) ?? []).length).toBe(1);
    expect(html).not.toContain(`arabclue:proposal:p1:${HASH}`);
    expect(html).not.toContain("<img");
    // Footer strip repeats the prefix on the last page in both languages.
    expect(
      (html.match(/bilingual-document-footer__integrity/gu) ?? []).length,
    ).toBe(2);
    expect(html).toContain("Content hash");
    expect(html).toContain("بصمة المحتوى");
  });

  test("hash without a payload renders text only; garbage renders nothing", () => {
    const withoutPayload = renderBilingualHTML(document, {
      cover,
      integrity: { hash: HASH },
      includeDocumentShell: false,
    });
    expect(withoutPayload).toContain("33ed c451 4363");
    expect(withoutPayload).not.toContain("<svg");

    const garbage = renderBilingualHTML(document, {
      cover,
      integrity: { hash: "<b>fake</b>", qrPayload: "arabclue:x" },
      includeDocumentShell: false,
    });
    expect(garbage).not.toContain("bilingual-integrity");
    expect(garbage).not.toContain("fake");
  });

  test("escapes a hostile integrity label", () => {
    const html = renderBilingualHTML(document, {
      integrity: {
        hash: HASH,
        label: { en: "<script>alert(1)</script>", ar: "<img src=x>" },
      },
      includeDocumentShell: false,
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("signature block", () => {
  test("is opt-in and renders blank bilingual signature lines", () => {
    const plain = renderBilingualHTML(document, { includeDocumentShell: false });
    expect(plain).not.toContain("data-bilingual-signature");

    const html = renderBilingualHTML(document, {
      signatureBlock: true,
      includeDocumentShell: false,
    });
    expect(html).toContain("data-bilingual-signature");
    expect(html).toContain("Approval and signature");
    expect(html).toContain("الاعتماد والتوقيع");
    expect(html).toContain("Authorised signatory");
    expect(html).toContain("intentionally blank in a draft");
    expect(html.indexOf("data-bilingual-signature")).toBeLessThan(
      html.indexOf("bilingual-document-footer"),
    );
    expect(html.indexOf('data-section-id="scope"')).toBeLessThan(
      html.indexOf("data-bilingual-signature"),
    );
  });

  test("final artifacts swap the draft note for the signing instruction", () => {
    const html = renderBilingualHTML(document, {
      signatureBlock: true,
      lifecycle: "final",
      includeDocumentShell: false,
    });
    expect(html).toContain("qualified electronic signature");
    expect(html).not.toContain("intentionally blank in a draft");
  });
});

describe("table fragments", () => {
  test("carry part and parity metadata for continuous zebra tables", () => {
    const html = renderBilingualHTML(document, { includeDocumentShell: false });
    expect(html).toContain('data-fragment-kind="table"');
    expect(html).toMatch(
      /data-fragment-id="scope--coverage--part-1"[^>]*data-fragment-part="first"/u,
    );
    expect(html).toMatch(
      /data-fragment-id="scope--coverage--part-2"[^>]*data-fragment-part="middle"/u,
    );
    expect(html).toMatch(
      /data-fragment-id="scope--coverage--part-3"[^>]*data-fragment-part="last"/u,
    );
    expect(html).toContain('data-table-row-id="r1" data-row-parity="even"');
    expect(html).toContain('data-table-row-id="r2" data-row-parity="odd"');
    expect(html).toContain('data-column-count="3"');
  });

  test("derive one shared column grid for both languages from content", () => {
    const html = renderBilingualHTML(document, { includeDocumentShell: false });
    const groups = html.match(/<colgroup>.*?<\/colgroup>/gu) ?? [];
    expect(groups.length).toBe(6);
    expect(new Set(groups).size).toBe(1);
    const widths = Array.from(
      groups[0]!.matchAll(/width:([\d.]+)%/gu),
      (match) => Number(match[1]),
    );
    expect(widths).toHaveLength(3);
    expect(widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(100, 0);
    // The long requirement column earns the most room; the numeric column
    // gets at least its non-breaking amount.
    expect(widths[0]).toBeGreaterThan(widths[2]!);
    expect(widths[1]).toBeGreaterThan(20);
  });

  test("author-specified widths are respected unchanged", () => {
    const authored: BilingualDocumentSpec = {
      ...document,
      sections: [
        {
          ...document.sections[0]!,
          blocks: [
            {
              ...table,
              columns: table.columns.map((column, index) => ({
                ...column,
                widthPercent: [50, 30, 20][index],
              })),
            },
          ],
        },
      ],
    };
    const html = renderBilingualHTML(authored, { includeDocumentShell: false });
    expect(html).toContain('<col style="width:50%" />');
    expect(html).toContain('<col style="width:20%" />');
  });
});

describe("stylesheet system", () => {
  test("declares the print-first type scale, script leading, and fonts", () => {
    const css = generateBilingualCSS();
    expect(css).toContain("--bilingual-size-body: 10.5pt;");
    expect(css).toContain("--bilingual-size-body-ar: 11pt;");
    expect(css).toContain("--bilingual-leading-body-ar: 1.7;");
    expect(css).toContain('--bilingual-font-ar: "IBM Plex Sans Arabic"');
    expect(css).toContain('--bilingual-font-en: "IBM Plex Sans"');
    expect(css).toContain("color-scheme: light;");
    expect(css).not.toContain("googleapis");
  });

  test("styles notices, status chips, zebra rows, the gutter, and the cover", () => {
    const css = generateBilingualCSS();
    expect(css).toContain(".bilingual-cell > p > strong:only-child");
    expect(css).toContain(".bilingual-cell td > strong:only-child");
    expect(css).toContain('tr[data-row-parity="odd"] > td');
    expect(css).toContain(".bilingual-pair--parallel::before");
    expect(css).toContain("--bilingual-en-fraction: 0.5;");
    expect(css).toContain(".bilingual-signature__field");
    expect(css).toContain(".bilingual-integrity__qr");
    expect(css).toMatch(/\.bilingual-cover\s*\{[^}]*break-after:\s*page/u);
    expect(css).toContain("orphans: 3;");
    expect(css).toContain("hyphens: manual;");
  });

  test("darkens a light brand primary before using it as text", () => {
    const light = generateBilingualCSS(undefined, { primaryColor: "#9BE7FF" });
    expect(light).toContain("--bilingual-primary: #9be7ff;");
    expect(light).toContain(
      "--bilingual-primary-text: color-mix(in srgb, #9be7ff 70%, #000000);",
    );
    const dark = generateBilingualCSS(undefined, { primaryColor: "#0F4C5C" });
    expect(dark).toContain("--bilingual-primary-text: #0f4c5c;");
  });
});
