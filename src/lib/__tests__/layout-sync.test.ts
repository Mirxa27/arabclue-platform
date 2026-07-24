import { describe, expect, test } from "bun:test";
import {
  LayoutSyncError,
  createAlignmentKey,
  synchronizeLayout,
  type LayoutSyncOptions,
  type PairedRowInput,
} from "../layout-sync";

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
  overrides: Partial<PairedRowInput> = {}
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
  code: LayoutSyncError["code"]
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
    expectLayoutError(
      () => createAlignmentKey(""),
      "INVALID_ALIGNMENT_KEY"
    );
    expectLayoutError(
      () => createAlignmentKey(" scope.1"),
      "INVALID_ALIGNMENT_KEY"
    );
    expectLayoutError(
      () => createAlignmentKey("scope.\u202e1"),
      "INVALID_ALIGNMENT_KEY"
    );
  });
});

describe("synchronizeLayout height synchronization", () => {
  test("keeps equal-height columns unchanged", () => {
    const result = synchronizeLayout(
      [row("scope.1", 0, 1, 40, 40)],
      BASE_OPTIONS
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
      BASE_OPTIONS
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
      }
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
      BASE_OPTIONS
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
      }
    );
    const synchronized = result.rows[0];

    expect(synchronized?.en.addedSpacing).toBe(12);
    expect(synchronized?.en.spacingPerGap).toBe(0.6);
    expect(synchronized?.en.trailingSpace).toBe(28);
  });

  test("leaves bounded trailing space when no adjustable gaps exist", () => {
    const result = synchronizeLayout(
      [row("scope.1", 0, 1, 20, 30)],
      BASE_OPTIONS
    );

    expect(result.rows[0]?.en.addedSpacing).toBe(0);
    expect(result.rows[0]?.en.trailingSpace).toBe(10);
    expect(result.rows[0]?.overflow.kind).toBe("column-imbalance");
  });

  test("uses tolerance to ignore sub-pixel imbalance", () => {
    const result = synchronizeLayout(
      [row("scope.1", 0, 1, 30, 30.4)],
      {
        ...BASE_OPTIONS,
        balanceTolerance: 0.5,
      }
    );

    expect(result.rows[0]?.overflow).toEqual({ kind: "none" });
    expect(result.rows[0]?.en.trailingSpace).toBeCloseTo(0.4);
  });

  test("classifies a page-height overflow separately", () => {
    const result = synchronizeLayout(
      [row("scope.1", 0, 1, 120, 120)],
      BASE_OPTIONS
    );

    expect(result.rows[0]?.overflow).toEqual({
      kind: "page-overflow",
      excessHeight: 20,
    });
  });

  test("classifies simultaneous page and column overflow", () => {
    const result = synchronizeLayout(
      [row("scope.1", 0, 1, 120, 80)],
      BASE_OPTIONS
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
      [
        row("a", 0, 1, 20, 20),
        row("b", 0, 1, 30, 30),
        row("c", 0, 1, 10, 10),
      ],
      BASE_OPTIONS
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
      BASE_OPTIONS
    );

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.usedHeight).toBe(100);
  });

  test("moves a row to the next page when it does not fit", () => {
    const result = synchronizeLayout(
      [row("a", 0, 1, 60, 60), row("b", 0, 1, 40, 40)],
      BASE_OPTIONS
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
      BASE_OPTIONS
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
      BASE_OPTIONS
    );

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]?.rows.map((item) => item.alignmentKey)).toEqual([
      "intro",
    ]);
    expect(
      result.pages[1]?.rows.map((item) => [
        item.alignmentKey,
        item.fragmentIndex,
      ])
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
      BASE_OPTIONS
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
      BASE_OPTIONS
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
      BASE_OPTIONS
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
      BASE_OPTIONS
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
      BASE_OPTIONS
    );

    expect(
      result.rows.every(
        (item) =>
          !item.continuation.continuedFromPreviousPage &&
          !item.continuation.continuesOnNextPage
      )
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
      }
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
      () =>
        synchronizeLayout(
          [row("a", 0, 1, Number.NaN, 20)],
          BASE_OPTIONS
        ),
      "INVALID_MEASUREMENT"
    );
    expectLayoutError(
      () => synchronizeLayout([row("a", 0, 1, -1, 20)], BASE_OPTIONS),
      "INVALID_MEASUREMENT"
    );
    expectLayoutError(
      () =>
        synchronizeLayout(
          [
            row("a", 0, 1, 20, 20, {
              en: { contentHeight: 20, adjustableGaps: 1.5 },
            }),
          ],
          BASE_OPTIONS
        ),
      "INVALID_MEASUREMENT"
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
        "INVALID_OPTIONS"
      );
    }
  });

  test("rejects invalid fragment indexes and counts", () => {
    expectLayoutError(
      () => synchronizeLayout([row("a", -1, 1, 20, 20)], BASE_OPTIONS),
      "INVALID_FRAGMENT"
    );
    expectLayoutError(
      () => synchronizeLayout([row("a", 0, 0, 20, 20)], BASE_OPTIONS),
      "INVALID_FRAGMENT"
    );
    expectLayoutError(
      () => synchronizeLayout([row("a", 1, 1, 20, 20)], BASE_OPTIONS),
      "INVALID_FRAGMENT"
    );
  });

  test("requires complete sequential fragments with a consistent count", () => {
    expectLayoutError(
      () =>
        synchronizeLayout(
          [row("a", 0, 3, 20, 20), row("a", 2, 3, 20, 20)],
          BASE_OPTIONS
        ),
      "INVALID_FRAGMENT_SEQUENCE"
    );
    expectLayoutError(
      () =>
        synchronizeLayout(
          [row("a", 0, 2, 20, 20), row("a", 1, 3, 20, 20)],
          BASE_OPTIONS
        ),
      "INCONSISTENT_FRAGMENT_COUNT"
    );
    expectLayoutError(
      () => synchronizeLayout([row("a", 0, 2, 20, 20)], BASE_OPTIONS),
      "INCOMPLETE_FRAGMENT_GROUP"
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
          BASE_OPTIONS
        ),
      "NON_CONTIGUOUS_ALIGNMENT_KEY"
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
          BASE_OPTIONS
        ),
      "CONFLICTING_BREAK_POLICY"
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
      synchronizeLayout(input, BASE_OPTIONS)
    );
  });

  test("handles a 50-page document in stable input order", () => {
    const input = Array.from({ length: 100 }, (_, index) =>
      row(`section.${index}`, 0, 1, 48, 48)
    );
    const result = synchronizeLayout(input, BASE_OPTIONS);

    expect(result.pages).toHaveLength(50);
    expect(result.rows).toHaveLength(100);
    expect(result.rows.map((item) => item.alignmentKey)).toEqual(
      input.map((item) => item.alignmentKey)
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
