import { describe, expect, test } from "bun:test";
import {
  LayoutSyncError,
  applyBilingualLayoutInPage,
  createAlignmentKey,
  measureBilingualLayoutInPage,
  synchronizeBilingualLayoutPage,
  synchronizeLayout,
  type AppliedBilingualLayout,
  type BilingualLayoutApplication,
  type BilingualLayoutEvaluationPage,
  type BrowserLayoutMeasurement,
  type LayoutSyncOptions,
  type LayoutSyncResult,
  type PairedRowInput,
} from "../layout-sync";
import {
  renderBilingualHTML,
  type BilingualDocumentSpec,
  type BilingualInlineNode,
} from "../bilingual-layout";

const BASE_OPTIONS = {
  pageContentHeight: 100,
  rowGap: 4,
  maxSpacingPerGap: 4,
  maxDynamicSpacingPerRow: 24,
  balanceTolerance: 0.01,
} satisfies LayoutSyncOptions;

function row(
  alignmentKey: string,
  fragmentIndex: number,
  fragmentCount: number,
  enHeight: number,
  arHeight: number,
  overrides: Partial<PairedRowInput> = {},
): PairedRowInput {
  return {
    alignmentKey: createAlignmentKey(alignmentKey),
    fragmentIndex,
    fragmentCount,
    kind: "paragraph",
    en: { contentHeight: enHeight, adjustableGaps: 0 },
    ar: { contentHeight: arHeight, adjustableGaps: 0 },
    ...overrides,
  };
}

function expectLayoutError(
  action: () => unknown,
  code: LayoutSyncError["code"],
): void {
  try {
    action();
    throw new Error(`Expected LayoutSyncError with code ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(LayoutSyncError);
    expect((error as LayoutSyncError).code).toBe(code);
  }
}

describe("createAlignmentKey", () => {
  test("preserves a valid stable semantic key", () => {
    expect(createAlignmentKey("scope.payment.1")).toBe("scope.payment.1");
  });

  test("rejects empty, padded, and direction-control keys", () => {
    expectLayoutError(() => createAlignmentKey(""), "INVALID_ALIGNMENT_KEY");
    expectLayoutError(
      () => createAlignmentKey(" scope.1"),
      "INVALID_ALIGNMENT_KEY",
    );
    expectLayoutError(
      () => createAlignmentKey("scope.\u202e1"),
      "INVALID_ALIGNMENT_KEY",
    );
  });
});

describe("synchronizeLayout height synchronization", () => {
  test("keeps equal-height columns unchanged", () => {
    const result = synchronizeLayout(
      [row("scope.1", 0, 1, 40, 40)],
      BASE_OPTIONS,
    );
    const synchronized = result.rows[0];

    expect(synchronized?.rowHeight).toBe(40);
    expect(synchronized?.en).toEqual({
      contentHeight: 40,
      adjustableGaps: 0,
      addedSpacing: 0,
      spacingPerGap: 0,
      trailingSpace: 0,
    });
    expect(synchronized?.ar).toEqual({
      contentHeight: 40,
      adjustableGaps: 0,
      addedSpacing: 0,
      spacingPerGap: 0,
      trailingSpace: 0,
    });
    expect(synchronized?.overflow).toEqual({ kind: "none" });
  });

  test("distributes bounded spacing across the shorter English column", () => {
    const result = synchronizeLayout(
      [
        row("scope.1", 0, 1, 30, 38, {
          en: { contentHeight: 30, adjustableGaps: 2 },
        }),
      ],
      BASE_OPTIONS,
    );
    const synchronized = result.rows[0];

    expect(synchronized?.rowHeight).toBe(38);
    expect(synchronized?.en.addedSpacing).toBe(8);
    expect(synchronized?.en.spacingPerGap).toBe(4);
    expect(synchronized?.en.trailingSpace).toBe(0);
    expect(synchronized?.ar.addedSpacing).toBe(0);
    expect(synchronized?.overflow).toEqual({ kind: "none" });
  });

  test("distributes bounded spacing across the shorter Arabic column", () => {
    const result = synchronizeLayout(
      [
        row("scope.1", 0, 1, 41, 32, {
          ar: { contentHeight: 32, adjustableGaps: 3 },
        }),
      ],
      {
        ...BASE_OPTIONS,
        maxSpacingPerGap: 3,
      },
    );
    const synchronized = result.rows[0];

    expect(synchronized?.ar.addedSpacing).toBe(9);
    expect(synchronized?.ar.spacingPerGap).toBe(3);
    expect(synchronized?.ar.trailingSpace).toBe(0);
    expect(synchronized?.overflow).toEqual({ kind: "none" });
  });

  test("caps spacing per gap and classifies residual imbalance", () => {
    const result = synchronizeLayout(
      [
        row("scope.1", 0, 1, 20, 40, {
          en: { contentHeight: 20, adjustableGaps: 2 },
        }),
      ],
      BASE_OPTIONS,
    );
    const synchronized = result.rows[0];

    expect(synchronized?.en.addedSpacing).toBe(8);
    expect(synchronized?.en.trailingSpace).toBe(12);
    expect(synchronized?.overflow).toEqual({
      kind: "column-imbalance",
      shorterLanguage: "EN",
      residualHeight: 12,
    });
  });

  test("caps total dynamic spacing even when many gaps are available", () => {
    const result = synchronizeLayout(
      [
        row("scope.1", 0, 1, 10, 50, {
          en: { contentHeight: 10, adjustableGaps: 20 },
        }),
      ],
      {
        ...BASE_OPTIONS,
        maxDynamicSpacingPerRow: 12,
      },
    );
    const synchronized = result.rows[0];

    expect(synchronized?.en.addedSpacing).toBe(12);
    expect(synchronized?.en.spacingPerGap).toBe(0.6);
    expect(synchronized?.en.trailingSpace).toBe(28);
  });

  test("leaves bounded trailing space when no adjustable gaps exist", () => {
    const result = synchronizeLayout(
      [row("scope.1", 0, 1, 20, 30)],
      BASE_OPTIONS,
    );

    expect(result.rows[0]?.en.addedSpacing).toBe(0);
    expect(result.rows[0]?.en.trailingSpace).toBe(10);
    expect(result.rows[0]?.overflow.kind).toBe("column-imbalance");
  });

  test("uses tolerance to ignore sub-pixel imbalance", () => {
    const result = synchronizeLayout([row("scope.1", 0, 1, 30, 30.4)], {
      ...BASE_OPTIONS,
      balanceTolerance: 0.5,
    });

    expect(result.rows[0]?.overflow).toEqual({ kind: "none" });
    expect(result.rows[0]?.en.trailingSpace).toBeCloseTo(0.4);
  });

  test("classifies a page-height overflow separately", () => {
    const result = synchronizeLayout(
      [row("scope.1", 0, 1, 120, 120)],
      BASE_OPTIONS,
    );

    expect(result.rows[0]?.overflow).toEqual({
      kind: "page-overflow",
      excessHeight: 20,
    });
  });

  test("classifies simultaneous page and column overflow", () => {
    const result = synchronizeLayout(
      [row("scope.1", 0, 1, 120, 80)],
      BASE_OPTIONS,
    );

    expect(result.rows[0]?.overflow).toEqual({
      kind: "page-and-column-overflow",
      excessHeight: 20,
      shorterLanguage: "AR",
      residualHeight: 40,
    });
  });

  test("does not mutate input rows or nested measurements", () => {
    const input = [
      row("scope.1", 0, 1, 30, 40, {
        en: { contentHeight: 30, adjustableGaps: 2 },
      }),
    ];
    const snapshot = structuredClone(input);

    synchronizeLayout(input, BASE_OPTIONS);

    expect(input).toEqual(snapshot);
  });
});

describe("synchronizeLayout coordinated pagination", () => {
  test("returns an empty deterministic result for an empty document", () => {
    const result = synchronizeLayout([], BASE_OPTIONS);

    expect(result.pages).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.metrics).toEqual({
      inputRowCount: 0,
      pageCount: 0,
      overflowRowCount: 0,
      continuationBreakCount: 0,
    });
  });

  test("places rows using deterministic offsets and row gaps", () => {
    const result = synchronizeLayout(
      [row("a", 0, 1, 20, 20), row("b", 0, 1, 30, 30), row("c", 0, 1, 10, 10)],
      BASE_OPTIONS,
    );

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.rows.map((item) => item.offsetTop)).toEqual([
      0, 24, 58,
    ]);
    expect(result.pages[0]?.usedHeight).toBe(68);
    expect(result.pages[0]?.remainingHeight).toBe(32);
    expect(result.pages[0]?.overflowHeight).toBe(0);
  });

  test("fits an exact page boundary without creating another page", () => {
    const result = synchronizeLayout(
      [row("a", 0, 1, 48, 48), row("b", 0, 1, 48, 48)],
      BASE_OPTIONS,
    );

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.usedHeight).toBe(100);
  });

  test("moves a row to the next page when it does not fit", () => {
    const result = synchronizeLayout(
      [row("a", 0, 1, 60, 60), row("b", 0, 1, 40, 40)],
      BASE_OPTIONS,
    );

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]?.rows.map((item) => item.alignmentKey)).toEqual([
      "a",
    ]);
    expect(result.pages[1]?.rows.map((item) => item.alignmentKey)).toEqual([
      "b",
    ]);
    expect(result.pages[1]?.rows[0]?.offsetTop).toBe(0);
  });

  test("honors an explicit break without emitting an empty page", () => {
    const result = synchronizeLayout(
      [
        row("a", 0, 1, 20, 20, { breakBefore: true }),
        row("b", 0, 1, 20, 20, { breakBefore: true }),
      ],
      BASE_OPTIONS,
    );

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]?.rows[0]?.alignmentKey).toBe("a");
    expect(result.pages[1]?.rows[0]?.alignmentKey).toBe("b");
  });

  test("moves keep-with-next rows together when the pair fits a fresh page", () => {
    const result = synchronizeLayout(
      [
        row("intro", 0, 1, 55, 55),
        row("clause", 0, 2, 20, 20, {
          kind: "heading",
          keepWithNext: true,
        }),
        row("clause", 1, 2, 30, 30),
      ],
      BASE_OPTIONS,
    );

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]?.rows.map((item) => item.alignmentKey)).toEqual([
      "intro",
    ]);
    expect(
      result.pages[1]?.rows.map((item) => [
        item.alignmentKey,
        item.fragmentIndex,
      ]),
    ).toEqual([
      ["clause", 0],
      ["clause", 1],
    ]);
  });

  test("reports an unsatisfiable keep-with-next pair without looping", () => {
    const result = synchronizeLayout(
      [
        row("clause", 0, 2, 70, 70, {
          kind: "heading",
          keepWithNext: true,
        }),
        row("clause", 1, 2, 40, 40),
      ],
      BASE_OPTIONS,
    );

    expect(result.pages).toHaveLength(2);
    expect(result.warnings).toContainEqual({
      code: "KEEP_WITH_NEXT_UNSATISFIABLE",
      alignmentKey: "clause",
      fragmentIndex: 0,
      requiredHeight: 114,
      pageContentHeight: 100,
    });
  });

  test("isolates an oversized fragment and reports its page overflow", () => {
    const result = synchronizeLayout(
      [
        row("a", 0, 1, 20, 20),
        row("large", 0, 1, 125, 125),
        row("b", 0, 1, 20, 20),
      ],
      BASE_OPTIONS,
    );

    expect(result.pages).toHaveLength(3);
    expect(result.pages[1]?.usedHeight).toBe(125);
    expect(result.pages[1]?.remainingHeight).toBe(0);
    expect(result.pages[1]?.overflowHeight).toBe(25);
    expect(result.warnings).toContainEqual({
      code: "OVERSIZED_FRAGMENT",
      alignmentKey: "large",
      fragmentIndex: 0,
      rowHeight: 125,
      pageContentHeight: 100,
    });
  });
});

describe("synchronizeLayout continuation metadata", () => {
  test("marks both sides of a two-page semantic continuation", () => {
    const result = synchronizeLayout(
      [
        row("scope", 0, 3, 55, 55),
        row("scope", 1, 3, 55, 55),
        row("scope", 2, 3, 20, 20),
      ],
      BASE_OPTIONS,
    );
    const [first, second, third] = result.rows;

    expect(first?.continuation).toEqual({
      continuedFromPreviousPage: false,
      continuesOnNextPage: true,
      previousPageNumber: null,
      nextPageNumber: 2,
      beforeLabel: null,
      afterLabel: { en: "Continued", ar: "يتبع" },
    });
    expect(second?.continuation).toEqual({
      continuedFromPreviousPage: true,
      continuesOnNextPage: false,
      previousPageNumber: 1,
      nextPageNumber: null,
      beforeLabel: { en: "Continued", ar: "تابع" },
      afterLabel: null,
    });
    expect(third?.continuation.continuedFromPreviousPage).toBe(false);
    expect(result.metrics.continuationBreakCount).toBe(1);
  });

  test("marks both incoming and outgoing continuation on a middle page", () => {
    const result = synchronizeLayout(
      [
        row("scope", 0, 3, 100, 100),
        row("scope", 1, 3, 100, 100),
        row("scope", 2, 3, 100, 100),
      ],
      BASE_OPTIONS,
    );
    const middle = result.rows[1];

    expect(middle?.continuation.continuedFromPreviousPage).toBe(true);
    expect(middle?.continuation.continuesOnNextPage).toBe(true);
    expect(middle?.continuation.previousPageNumber).toBe(1);
    expect(middle?.continuation.nextPageNumber).toBe(3);
    expect(result.metrics.continuationBreakCount).toBe(2);
  });

  test("does not continue across different alignment keys", () => {
    const result = synchronizeLayout(
      [row("scope.1", 0, 1, 70, 70), row("scope.2", 0, 1, 70, 70)],
      BASE_OPTIONS,
    );

    expect(
      result.rows.every(
        (item) =>
          !item.continuation.continuedFromPreviousPage &&
          !item.continuation.continuesOnNextPage,
      ),
    ).toBe(true);
  });

  test("uses caller-provided bilingual continuation labels", () => {
    const result = synchronizeLayout(
      [row("scope", 0, 2, 60, 60), row("scope", 1, 2, 60, 60)],
      {
        ...BASE_OPTIONS,
        continuationLabels: {
          before: { en: "Continuation", ar: "تكملة" },
          after: { en: "Continues", ar: "مستمر" },
        },
      },
    );

    expect(result.rows[0]?.continuation.afterLabel).toEqual({
      en: "Continues",
      ar: "مستمر",
    });
    expect(result.rows[1]?.continuation.beforeLabel).toEqual({
      en: "Continuation",
      ar: "تكملة",
    });
  });
});

describe("synchronizeLayout validation and determinism", () => {
  test("rejects non-finite, negative, and fractional measurements", () => {
    expectLayoutError(
      () => synchronizeLayout([row("a", 0, 1, Number.NaN, 20)], BASE_OPTIONS),
      "INVALID_MEASUREMENT",
    );
    expectLayoutError(
      () => synchronizeLayout([row("a", 0, 1, -1, 20)], BASE_OPTIONS),
      "INVALID_MEASUREMENT",
    );
    expectLayoutError(
      () =>
        synchronizeLayout(
          [
            row("a", 0, 1, 20, 20, {
              en: { contentHeight: 20, adjustableGaps: 1.5 },
            }),
          ],
          BASE_OPTIONS,
        ),
      "INVALID_MEASUREMENT",
    );
  });

  test("rejects invalid pagination and spacing options", () => {
    for (const options of [
      { ...BASE_OPTIONS, pageContentHeight: 0 },
      { ...BASE_OPTIONS, rowGap: -1 },
      { ...BASE_OPTIONS, maxSpacingPerGap: Number.POSITIVE_INFINITY },
      { ...BASE_OPTIONS, maxDynamicSpacingPerRow: -1 },
      { ...BASE_OPTIONS, balanceTolerance: -1 },
    ]) {
      expectLayoutError(
        () => synchronizeLayout([], options),
        "INVALID_OPTIONS",
      );
    }
  });

  test("rejects invalid fragment indexes and counts", () => {
    expectLayoutError(
      () => synchronizeLayout([row("a", -1, 1, 20, 20)], BASE_OPTIONS),
      "INVALID_FRAGMENT",
    );
    expectLayoutError(
      () => synchronizeLayout([row("a", 0, 0, 20, 20)], BASE_OPTIONS),
      "INVALID_FRAGMENT",
    );
    expectLayoutError(
      () => synchronizeLayout([row("a", 1, 1, 20, 20)], BASE_OPTIONS),
      "INVALID_FRAGMENT",
    );
  });

  test("requires complete sequential fragments with a consistent count", () => {
    expectLayoutError(
      () =>
        synchronizeLayout(
          [row("a", 0, 3, 20, 20), row("a", 2, 3, 20, 20)],
          BASE_OPTIONS,
        ),
      "INVALID_FRAGMENT_SEQUENCE",
    );
    expectLayoutError(
      () =>
        synchronizeLayout(
          [row("a", 0, 2, 20, 20), row("a", 1, 3, 20, 20)],
          BASE_OPTIONS,
        ),
      "INCONSISTENT_FRAGMENT_COUNT",
    );
    expectLayoutError(
      () => synchronizeLayout([row("a", 0, 2, 20, 20)], BASE_OPTIONS),
      "INCOMPLETE_FRAGMENT_GROUP",
    );
  });

  test("rejects an alignment key that reappears non-contiguously", () => {
    expectLayoutError(
      () =>
        synchronizeLayout(
          [
            row("a", 0, 1, 20, 20),
            row("b", 0, 1, 20, 20),
            row("a", 0, 1, 20, 20),
          ],
          BASE_OPTIONS,
        ),
      "NON_CONTIGUOUS_ALIGNMENT_KEY",
    );
  });

  test("rejects a keep-with-next policy that conflicts with next break", () => {
    expectLayoutError(
      () =>
        synchronizeLayout(
          [
            row("a", 0, 1, 20, 20, { keepWithNext: true }),
            row("b", 0, 1, 20, 20, { breakBefore: true }),
          ],
          BASE_OPTIONS,
        ),
      "CONFLICTING_BREAK_POLICY",
    );
  });

  test("produces exactly the same value for repeated invocations", () => {
    const input = [
      row("a", 0, 2, 48, 40, {
        en: { contentHeight: 48, adjustableGaps: 1 },
        ar: { contentHeight: 40, adjustableGaps: 2 },
      }),
      row("a", 1, 2, 48, 48),
      row("b", 0, 1, 48, 48),
    ];

    expect(synchronizeLayout(input, BASE_OPTIONS)).toEqual(
      synchronizeLayout(input, BASE_OPTIONS),
    );
  });

  test("handles a 50-page document in stable input order", () => {
    const input = Array.from({ length: 100 }, (_, index) =>
      row(`section.${index}`, 0, 1, 48, 48),
    );
    const result = synchronizeLayout(input, BASE_OPTIONS);

    expect(result.pages).toHaveLength(50);
    expect(result.rows).toHaveLength(100);
    expect(result.rows.map((item) => item.alignmentKey)).toEqual(
      input.map((item) => item.alignmentKey),
    );
    expect(result.pages.every((page) => page.rows.length === 2)).toBe(true);
    expect(result.metrics).toEqual({
      inputRowCount: 100,
      pageCount: 50,
      overflowRowCount: 0,
      continuationBreakCount: 0,
    });
  });
});

describe("trusted bilingual renderer bridge", () => {
  test("measures in-page, runs the shared engine, and applies the result", async () => {
    const measurement: BrowserLayoutMeasurement = {
      rowGap: 4,
      rows: [
        {
          alignmentKey: "bridge.scope",
          fragmentIndex: 0,
          fragmentCount: 2,
          kind: "heading",
          en: { contentHeight: 30, adjustableGaps: 2 },
          ar: { contentHeight: 38, adjustableGaps: 0 },
          keepWithNext: true,
          breakBefore: false,
        },
        {
          alignmentKey: "bridge.scope",
          fragmentIndex: 1,
          fragmentCount: 2,
          kind: "paragraph",
          en: { contentHeight: 70, adjustableGaps: 0 },
          ar: { contentHeight: 70, adjustableGaps: 0 },
          keepWithNext: false,
          breakBefore: false,
        },
      ],
    };
    let applied: LayoutSyncResult | null = null;
    let appliedPageHeight: number | null = null;
    const page: BilingualLayoutEvaluationPage = {
      async evaluate<Result, Argument>(
        pageFunction: (argument: Argument) => Result | Promise<Result>,
        argument: Argument,
      ): Promise<Result> {
        if (pageFunction === (measureBilingualLayoutInPage as unknown)) {
          return measurement as Result;
        }
        if (pageFunction === (applyBilingualLayoutInPage as unknown)) {
          const application = argument as BilingualLayoutApplication;
          applied = application.result;
          appliedPageHeight = application.pageContentHeight;
          return {
            rowCount: applied.metrics.inputRowCount,
            pageCount: applied.metrics.pageCount,
            warningCount: applied.warnings.length,
          } as AppliedBilingualLayout as Result;
        }
        throw new Error("Unexpected page evaluation callable.");
      },
    };

    const result = await synchronizeBilingualLayoutPage(page, {
      pageContentHeight: 100,
    });

    expect(applied).toEqual(result);
    expect(appliedPageHeight).toBe(100);
    expect(result.rows[0]?.en.addedSpacing).toBe(8);
    expect(result.rows[0]?.rowHeight).toBe(38);
    expect(result.pages).toHaveLength(2);
    expect(result.rows[1]?.pageNumber).toBe(2);
  });

  test("fails closed before applying a row taller than the printable page", async () => {
    const measurement: BrowserLayoutMeasurement = {
      rowGap: 0,
      rows: [
        {
          alignmentKey: "bridge.oversized",
          fragmentIndex: 0,
          fragmentCount: 1,
          kind: "list-item",
          en: { contentHeight: 101, adjustableGaps: 0 },
          ar: { contentHeight: 90, adjustableGaps: 0 },
          keepWithNext: false,
          breakBefore: false,
        },
      ],
    };
    let applyCalled = false;
    const page: BilingualLayoutEvaluationPage = {
      async evaluate<Result, Argument>(
        pageFunction: (argument: Argument) => Result | Promise<Result>,
        _argument: Argument,
      ): Promise<Result> {
        if (pageFunction === (measureBilingualLayoutInPage as unknown)) {
          return measurement as Result;
        }
        applyCalled = true;
        throw new Error("Oversized layout must not be applied.");
      },
    };

    let error: unknown;
    try {
      await synchronizeBilingualLayoutPage(page, {
        pageContentHeight: 100,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(LayoutSyncError);
    expect((error as LayoutSyncError).code).toBe("INVALID_FRAGMENT");
    expect((error as Error).message).toContain(
      "taller than the printable page",
    );
    expect(applyCalled).toBe(false);
  });

  test.skipIf(process.env.PLAYWRIGHT_CHROMIUM !== "1")(
    "applies measured spacing and readiness in JavaScript-disabled Chromium",
    async () => {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({
          javaScriptEnabled: false,
        });
        try {
          const page = await context.newPage();
          await page.setContent(`<!doctype html>
<html><head><style>
* { box-sizing: border-box; }
.bilingual-pair { display:grid; grid-template-columns:1fr 1fr; width:500px; gap:16px; margin-block-end:4px; align-items:stretch; }
.bilingual-cell { min-width:0; padding:8px; }
li { margin-block:2px; }
</style></head><body>
<main data-bilingual-document data-bilingual-layout-state="pending" data-bilingual-layout-ready="false">
  <div class="bilingual-pair" data-bilingual-pair data-alignment-key="live.scope" data-fragment-kind="list" data-fragment-index="0" data-fragment-count="1" data-fragment-keep-with-next="false">
    <div class="bilingual-cell" data-language="en"><ul><li>One</li><li>Two</li></ul></div>
    <div class="bilingual-cell" data-language="ar" dir="rtl"><ul><li>هذا نص عربي طويل جدا لاختبار القياس الحقيقي والتفاف الأسطر داخل العمود المتزامن</li><li>وهذا سطر عربي طويل آخر يضمن اختلاف الارتفاع بين العمودين</li></ul></div>
  </div>
</main>
</body></html>`);

          const result = await synchronizeBilingualLayoutPage(
            page as unknown as BilingualLayoutEvaluationPage,
            { pageContentHeight: 900 },
          );
          const snapshot = await page.evaluate(() => {
            const root = document.querySelector("[data-bilingual-document]");
            const row = document.querySelector("[data-bilingual-pair]");
            const en = document.querySelector('[data-language="en"]');
            return {
              state: root?.getAttribute("data-bilingual-layout-state"),
              ready: root?.getAttribute("data-bilingual-layout-ready"),
              page: row?.getAttribute("data-sync-page"),
              rowHeight: Number(row?.getAttribute("data-sync-row-height")),
              addedSpacing: Number(en?.getAttribute("data-sync-added-spacing")),
            };
          });

          expect(result.rows).toHaveLength(1);
          expect(snapshot.state).toBe("ready");
          expect(snapshot.ready).toBe("true");
          expect(snapshot.page).toBe("1");
          expect(snapshot.rowHeight).toBeGreaterThan(0);
          expect(snapshot.addedSpacing).toBeGreaterThan(0);
        } finally {
          await context.close();
        }
      } finally {
        await browser.close();
      }
    },
    120_000,
  );

  test.skipIf(process.env.PLAYWRIGHT_CHROMIUM !== "1")(
    "measures both tab languages before a switch and preserves print pagination",
    async () => {
      const inline = (value: string): readonly BilingualInlineNode[] => [
        { type: "text", text: value },
      ];
      const document: BilingualDocumentSpec = {
        id: "tabs-print-proof",
        title: { en: inline("TAB_TITLE_EN"), ar: inline("عنوان") },
        layout: {
          mode: "parallel",
          viewer: { mode: "tabs", defaultLanguage: "ar" },
        },
        sections: [
          {
            id: "tabs",
            alignmentKey: "tabs",
            blocks: [
              {
                type: "paragraph",
                id: "long",
                content: {
                  en: inline(
                    `TAB_LONG_EN ${"English delivery governance evidence. ".repeat(
                      80,
                    )}`,
                  ),
                  ar: inline("TAB_SHORT_AR نص عربي موجز."),
                },
              },
            ],
          },
        ],
      };
      const { chromium } = await import("playwright");
      const { PDFParse } = await import("pdf-parse");
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({
          viewport: { width: 1_280, height: 900 },
        });
        await page.emulateMedia({ media: "screen" });
        await page.setContent(
          renderBilingualHTML(document, { target: "screen" }),
        );
        await page.evaluate(() => {
          const root = document.querySelector<HTMLElement>(
            "[data-bilingual-document]",
          );
          if (!root) throw new Error("Missing bilingual root.");
          root.dataset.viewerMode = "tabs";
        });
        const initial = await synchronizeBilingualLayoutPage(page);
        const continuationMarkers = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll<HTMLElement>(
              "[data-bilingual-continuation-marker]",
            ),
            (marker) => marker.textContent,
          ),
        );
        await page.evaluate(() => {
          const root = document.querySelector<HTMLElement>(
            "[data-bilingual-document]",
          );
          if (!root) throw new Error("Missing bilingual root.");
          root.dataset.viewerLanguage = "en";
        });
        const switched = await synchronizeBilingualLayoutPage(page);
        await page.emulateMedia({ media: "print" });
        const overflow = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll<HTMLElement>("[data-bilingual-pair]"),
          ).some((pair) =>
            Array.from(
              pair.querySelectorAll<HTMLElement>(":scope > [data-language]"),
            ).some(
              (cell) =>
                cell.scrollHeight > pair.getBoundingClientRect().height + 1,
            ),
          ),
        );
        const pdf = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: {
            top: "16mm",
            bottom: "18mm",
            left: "14mm",
            right: "14mm",
          },
        });
        const parser = new PDFParse({ data: pdf });
        const parsed = await parser.getText();
        await parser.destroy();
        const allText = parsed.pages.map((item) => item.text).join("\n");

        expect(initial.metrics.pageCount).toBe(switched.metrics.pageCount);
        expect(initial.metrics.pageCount).toBeGreaterThan(1);
        expect(continuationMarkers).toContain("Continued");
        expect(continuationMarkers).toContain("تابع");
        expect(parsed.total).toBe(switched.metrics.pageCount);
        expect(overflow).toBe(false);
        expect(allText).toContain("TAB_LONG_EN");
        expect(allText).toContain("TAB_SHORT_AR");
      } finally {
        await browser.close();
      }
    },
    120_000,
  );
});
