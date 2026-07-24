import { describe, expect, test } from "bun:test";
import {
  renderBilingualHTML,
  type BilingualDocumentSpec,
  type BilingualInlineNode,
} from "../bilingual-layout";
import {
  BILINGUAL_PERFORMANCE_TARGETS,
  generateBilingualPdf,
  renderBilingualArtifact,
} from "../bilingual-pdf";
import {
  createAlignmentKey,
  synchronizeLayout,
  type PairedRowInput,
} from "../layout-sync";

const inline = (text: string): readonly BilingualInlineNode[] => [
  { type: "text", text },
];

function fiftyPageFixture(): BilingualDocumentSpec {
  return {
    id: "fifty-page-benchmark",
    title: {
      en: inline("Fifty-page bilingual benchmark"),
      ar: inline("اختبار أداء ثنائي اللغة من خمسين صفحة"),
    },
    sections: Array.from({ length: 50 }, (_, index) => ({
      id: `page-${index + 1}`,
      alignmentKey: `benchmark.page.${index + 1}`,
      startOnNewPage: index > 0,
      title: {
        en: inline(`Section ${index + 1}`),
        ar: inline(`القسم ${index + 1}`),
      },
      blocks: [
        {
          type: "paragraph" as const,
          id: `body-${index + 1}`,
          content: {
            en: inline(
              `Delivery section ${index + 1} contains selectable English text and reference PO-2026-${String(
                index + 1
              ).padStart(2, "0")}.`
            ),
            ar: inline(
              `يحتوي قسم التسليم ${index + 1} على نص عربي قابل للتحديد والمرجع PO-2026-${String(
                index + 1
              ).padStart(2, "0")}.`
            ),
          },
        },
      ],
    })),
  };
}

describe("50-page bilingual performance", () => {
  test("renders deterministic HTML within the CPU and heap budget", async () => {
    const fixture = fiftyPageFixture();
    const heapBefore = process.memoryUsage().heapUsed;
    const startedAt = performance.now();
    const first = await renderBilingualArtifact(fixture, { target: "print" });
    const elapsedMs = performance.now() - startedAt;
    const heapDeltaMiB = Math.max(
      0,
      (process.memoryUsage().heapUsed - heapBefore) / (1024 * 1024)
    );
    const second = renderBilingualHTML(fixture, { target: "print" });

    expect(first.html.match(/data-section-id=/g)).toHaveLength(50);
    expect(first.html.match(/break-before: page/g)?.length).toBeGreaterThan(0);
    expect(second).toContain("benchmark.page.50");
    expect(elapsedMs).toBeLessThan(
      BILINGUAL_PERFORMANCE_TARGETS.fiftyPageHtmlRenderMs
    );
    expect(heapDeltaMiB).toBeLessThan(
      BILINGUAL_PERFORMANCE_TARGETS.fiftyPageHeapDeltaMiB
    );
  });

  test("coordinates fifty explicit page fragments in stable order", () => {
    const rows: PairedRowInput[] = Array.from(
      { length: 50 },
      (_, index) => ({
        alignmentKey: createAlignmentKey(`benchmark.page.${index + 1}`),
        fragmentIndex: 0,
        fragmentCount: 1,
        kind: "paragraph",
        en: { contentHeight: 680, adjustableGaps: 4 },
        ar: { contentHeight: 692, adjustableGaps: 6 },
        breakBefore: index > 0,
      })
    );
    const result = synchronizeLayout(rows, {
      pageContentHeight: 700,
      rowGap: 8,
      maxSpacingPerGap: 4,
      maxDynamicSpacingPerRow: 24,
    });

    expect(result.metrics.pageCount).toBe(50);
    expect(result.metrics.inputRowCount).toBe(50);
    expect(result.pages[49]?.rows[0]?.alignmentKey).toBe(
      "benchmark.page.50"
    );
    expect(result.metrics.overflowRowCount).toBe(0);
  });
});

test.skipIf(process.env.PLAYWRIGHT_CHROMIUM !== "1")(
  "renders the fifty-page PDF within the production budget",
  async () => {
    const startedAt = performance.now();
    const artifact = await generateBilingualPdf(fiftyPageFixture());
    const elapsedMs = performance.now() - startedAt;

    expect(artifact.pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(artifact.pdf.byteLength).toBeGreaterThan(50_000);
    expect(elapsedMs).toBeLessThan(
      BILINGUAL_PERFORMANCE_TARGETS.fiftyPagePdfRenderMs
    );
  },
  120_000
);
