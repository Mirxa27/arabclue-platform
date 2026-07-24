/**
 * Pure bilingual row synchronization and coordinated pagination.
 *
 * The renderer measures compiler-created English/Arabic fragments and passes
 * those measurements here. This module deliberately has no DOM dependency:
 * identical inputs always produce identical layout instructions in browsers,
 * server-side previews, tests, and PDF workers.
 *
 * Rows are paired by a stable semantic alignment key. Large clauses must be
 * segmented by the document compiler at safe paragraph, list-item, or table-row
 * boundaries before synchronization. This engine never uses ratio-based scroll
 * synchronization and never splits a fragment internally.
 */

declare const ALIGNMENT_KEY_BRAND: unique symbol;

/** Stable semantic identifier shared by all fragments of one bilingual unit. */
export type AlignmentKey = string & {
  readonly [ALIGNMENT_KEY_BRAND]: "AlignmentKey";
};

export type BilingualLanguage = "EN" | "AR";

export type PairedFragmentKind =
  | "heading"
  | "paragraph"
  | "list-item"
  | "table-header"
  | "table-row"
  | "callout"
  | "caption"
  | "signature"
  | "image"
  | "other";

/** A measured language column, expressed in one consistent layout unit. */
export interface ColumnMeasurement {
  /** Measured content height before synchronization. */
  readonly contentHeight: number;
  /**
   * Number of internal, renderer-approved gaps that may receive extra spacing.
   * Text line spacing is intentionally not changed by this engine.
   */
  readonly adjustableGaps?: number;
}

/**
 * One compiler-created bilingual fragment. Every fragment is an atomic
 * pagination unit, while consecutive fragments with the same alignment key may
 * flow across pages.
 */
export interface PairedRowInput {
  readonly alignmentKey: AlignmentKey;
  readonly fragmentIndex: number;
  readonly fragmentCount: number;
  readonly kind: PairedFragmentKind;
  readonly en: ColumnMeasurement;
  readonly ar: ColumnMeasurement;
  /** Keep this fragment with the immediately following fragment when possible. */
  readonly keepWithNext?: boolean;
  /** Force this fragment to start a new page unless the page is already empty. */
  readonly breakBefore?: boolean;
}

export interface LocalizedContinuationLabel {
  readonly en: string;
  readonly ar: string;
}

export interface ContinuationLabels {
  /** Label displayed before a fragment that continues from an earlier page. */
  readonly before: LocalizedContinuationLabel;
  /** Label displayed after a fragment whose semantic pair continues. */
  readonly after: LocalizedContinuationLabel;
}

export interface LayoutSyncOptions {
  /**
   * Available body height after the caller has reserved page headers, footers,
   * and margins. All other measurements must use the same unit.
   */
  readonly pageContentHeight: number;
  /** Gap placed between paired rows. Defaults to 0. */
  readonly rowGap?: number;
  /** Maximum extra spacing assigned to one adjustable gap. Defaults to 4. */
  readonly maxSpacingPerGap?: number;
  /** Maximum total spacing assigned to one column in one row. Defaults to 24. */
  readonly maxDynamicSpacingPerRow?: number;
  /** Residual difference at or below this value is visually balanced. */
  readonly balanceTolerance?: number;
  /** Localized labels used at semantic page continuations. */
  readonly continuationLabels?: ContinuationLabels;
}

interface ResolvedLayoutSyncOptions {
  readonly pageContentHeight: number;
  readonly rowGap: number;
  readonly maxSpacingPerGap: number;
  readonly maxDynamicSpacingPerRow: number;
  readonly balanceTolerance: number;
  readonly continuationLabels: ContinuationLabels;
}

export interface SynchronizedColumn {
  readonly contentHeight: number;
  readonly adjustableGaps: number;
  /** Total bounded spacing to distribute across adjustable gaps. */
  readonly addedSpacing: number;
  /** Uniform addition for each adjustable gap. */
  readonly spacingPerGap: number;
  /** Unfilled space remaining at the block end inside the paired grid row. */
  readonly trailingSpace: number;
}

export type OverflowClassification =
  | {
      readonly kind: "none";
    }
  | {
      readonly kind: "column-imbalance";
      readonly shorterLanguage: BilingualLanguage;
      readonly residualHeight: number;
    }
  | {
      readonly kind: "page-overflow";
      readonly excessHeight: number;
    }
  | {
      readonly kind: "page-and-column-overflow";
      readonly excessHeight: number;
      readonly shorterLanguage: BilingualLanguage;
      readonly residualHeight: number;
    };

export interface SynchronizedPairedRow {
  readonly sourceIndex: number;
  readonly alignmentKey: AlignmentKey;
  readonly fragmentIndex: number;
  readonly fragmentCount: number;
  readonly kind: PairedFragmentKind;
  readonly keepWithNext: boolean;
  readonly breakBefore: boolean;
  readonly en: SynchronizedColumn;
  readonly ar: SynchronizedColumn;
  /** Physical paired-grid row height shared by English and Arabic. */
  readonly rowHeight: number;
  readonly overflow: OverflowClassification;
}

export interface ContinuationMetadata {
  readonly continuedFromPreviousPage: boolean;
  readonly continuesOnNextPage: boolean;
  readonly previousPageNumber: number | null;
  readonly nextPageNumber: number | null;
  readonly beforeLabel: LocalizedContinuationLabel | null;
  readonly afterLabel: LocalizedContinuationLabel | null;
}

export interface PaginatedPairedRow extends SynchronizedPairedRow {
  readonly pageNumber: number;
  readonly indexOnPage: number;
  readonly offsetTop: number;
  readonly continuation: ContinuationMetadata;
}

export interface SynchronizedPage {
  readonly pageNumber: number;
  readonly rows: readonly PaginatedPairedRow[];
  readonly usedHeight: number;
  readonly remainingHeight: number;
  readonly overflowHeight: number;
}

export type LayoutSyncWarning =
  | {
      readonly code: "RESIDUAL_COLUMN_IMBALANCE";
      readonly alignmentKey: AlignmentKey;
      readonly fragmentIndex: number;
      readonly shorterLanguage: BilingualLanguage;
      readonly residualHeight: number;
    }
  | {
      readonly code: "OVERSIZED_FRAGMENT";
      readonly alignmentKey: AlignmentKey;
      readonly fragmentIndex: number;
      readonly rowHeight: number;
      readonly pageContentHeight: number;
    }
  | {
      readonly code: "KEEP_WITH_NEXT_UNSATISFIABLE";
      readonly alignmentKey: AlignmentKey;
      readonly fragmentIndex: number;
      readonly requiredHeight: number;
      readonly pageContentHeight: number;
    };

export interface LayoutSyncMetrics {
  readonly inputRowCount: number;
  readonly pageCount: number;
  readonly overflowRowCount: number;
  readonly continuationBreakCount: number;
}

export interface LayoutSyncResult {
  /** Pages in physical output order. */
  readonly pages: readonly SynchronizedPage[];
  /** The same paginated rows flattened in source order for easy key lookup. */
  readonly rows: readonly PaginatedPairedRow[];
  readonly warnings: readonly LayoutSyncWarning[];
  readonly metrics: LayoutSyncMetrics;
}

export const LAYOUT_SYNC_ERROR_CODES = [
  "INVALID_ALIGNMENT_KEY",
  "INVALID_OPTIONS",
  "INVALID_MEASUREMENT",
  "INVALID_FRAGMENT",
  "INVALID_FRAGMENT_SEQUENCE",
  "INCONSISTENT_FRAGMENT_COUNT",
  "INCOMPLETE_FRAGMENT_GROUP",
  "NON_CONTIGUOUS_ALIGNMENT_KEY",
  "CONFLICTING_BREAK_POLICY",
] as const;

export type LayoutSyncErrorCode = (typeof LAYOUT_SYNC_ERROR_CODES)[number];

/** Domain error returned for malformed measurements or fragment sequences. */
export class LayoutSyncError extends Error {
  public readonly name = "LayoutSyncError";

  public constructor(
    public readonly code: LayoutSyncErrorCode,
    message: string,
    public readonly rowIndex: number | null = null,
  ) {
    super(message);
  }
}

const DEFAULT_CONTINUATION_LABELS = {
  before: {
    en: "Continued",
    ar: "تابع",
  },
  after: {
    en: "Continued",
    ar: "يتبع",
  },
} as const satisfies ContinuationLabels;

const DEFAULT_SYNC_SETTINGS = {
  rowGap: 0,
  maxSpacingPerGap: 4,
  maxDynamicSpacingPerRow: 24,
  balanceTolerance: 0.5,
} as const satisfies Omit<
  ResolvedLayoutSyncOptions,
  "pageContentHeight" | "continuationLabels"
>;

const BIDI_OR_CONTROL_CHARACTER =
  /[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

const PAIRED_FRAGMENT_KINDS = new Set<PairedFragmentKind>([
  "heading",
  "paragraph",
  "list-item",
  "table-header",
  "table-row",
  "callout",
  "caption",
  "signature",
  "image",
  "other",
]);

interface ProvisionalRow {
  readonly row: SynchronizedPairedRow;
  readonly offsetTop: number;
  readonly indexOnPage: number;
}

interface ProvisionalPage {
  readonly pageNumber: number;
  readonly rows: readonly ProvisionalRow[];
  readonly usedHeight: number;
}

interface AssignedRow extends ProvisionalRow {
  readonly pageNumber: number;
}

/**
 * Validate and brand an alignment key.
 *
 * Keys are intentionally never trimmed or normalized: changing a key during
 * layout could silently pair unrelated legal clauses.
 */
export function createAlignmentKey(value: string): AlignmentKey {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    /\s/u.test(value) ||
    BIDI_OR_CONTROL_CHARACTER.test(value)
  ) {
    throw new LayoutSyncError(
      "INVALID_ALIGNMENT_KEY",
      "Alignment keys must be non-empty, whitespace-free, and contain no control characters.",
    );
  }

  return value as AlignmentKey;
}

/**
 * Synchronize measured paired fragments and paginate them as atomic grid rows.
 *
 * Runtime is O(n) and memory is O(n), where n is the number of compiler-created
 * fragments. Input arrays and nested measurements are never mutated.
 */
export function synchronizeLayout(
  rows: readonly PairedRowInput[],
  options: LayoutSyncOptions,
): LayoutSyncResult {
  const resolved = resolveOptions(options);
  validateRows(rows);

  const synchronizedRows = rows.map((row, sourceIndex) =>
    synchronizeRow(row, sourceIndex, resolved),
  );
  const warnings: LayoutSyncWarning[] =
    collectImbalanceWarnings(synchronizedRows);
  const provisionalPages = paginateRows(synchronizedRows, resolved, warnings);
  const assignedRows = assignRows(provisionalPages);
  const continuationBreakCount = countContinuationBreaks(assignedRows);
  const paginatedRows = addContinuationMetadata(
    assignedRows,
    resolved.continuationLabels,
  );
  const pages = finalizePages(
    provisionalPages,
    paginatedRows,
    resolved.pageContentHeight,
  );

  return {
    pages,
    rows: paginatedRows,
    warnings,
    metrics: {
      inputRowCount: rows.length,
      pageCount: pages.length,
      overflowRowCount: synchronizedRows.reduce(
        (count, row) => count + (row.overflow.kind === "none" ? 0 : 1),
        0,
      ),
      continuationBreakCount,
    },
  };
}

function resolveOptions(options: LayoutSyncOptions): ResolvedLayoutSyncOptions {
  if (options === null || typeof options !== "object") {
    throw new LayoutSyncError(
      "INVALID_OPTIONS",
      "Layout synchronization options are required.",
    );
  }

  const resolved: ResolvedLayoutSyncOptions = {
    pageContentHeight: options.pageContentHeight,
    rowGap: options.rowGap ?? DEFAULT_SYNC_SETTINGS.rowGap,
    maxSpacingPerGap:
      options.maxSpacingPerGap ?? DEFAULT_SYNC_SETTINGS.maxSpacingPerGap,
    maxDynamicSpacingPerRow:
      options.maxDynamicSpacingPerRow ??
      DEFAULT_SYNC_SETTINGS.maxDynamicSpacingPerRow,
    balanceTolerance:
      options.balanceTolerance ?? DEFAULT_SYNC_SETTINGS.balanceTolerance,
    continuationLabels:
      options.continuationLabels ?? DEFAULT_CONTINUATION_LABELS,
  };

  if (
    !isFiniteNumber(resolved.pageContentHeight) ||
    resolved.pageContentHeight <= 0 ||
    !isFiniteNumber(resolved.rowGap) ||
    resolved.rowGap < 0 ||
    !isFiniteNumber(resolved.maxSpacingPerGap) ||
    resolved.maxSpacingPerGap < 0 ||
    !isFiniteNumber(resolved.maxDynamicSpacingPerRow) ||
    resolved.maxDynamicSpacingPerRow < 0 ||
    !isFiniteNumber(resolved.balanceTolerance) ||
    resolved.balanceTolerance < 0
  ) {
    throw new LayoutSyncError(
      "INVALID_OPTIONS",
      "Page height must be positive; spacing, gaps, and tolerance must be finite and non-negative.",
    );
  }

  validateContinuationLabel(resolved.continuationLabels.before.en, "before.en");
  validateContinuationLabel(resolved.continuationLabels.before.ar, "before.ar");
  validateContinuationLabel(resolved.continuationLabels.after.en, "after.en");
  validateContinuationLabel(resolved.continuationLabels.after.ar, "after.ar");

  return resolved;
}

function validateContinuationLabel(value: string, path: string): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    BIDI_OR_CONTROL_CHARACTER.test(value)
  ) {
    throw new LayoutSyncError(
      "INVALID_OPTIONS",
      `Continuation label ${path} must be non-empty and contain no control characters.`,
    );
  }
}

function validateRows(rows: readonly PairedRowInput[]): void {
  if (!Array.isArray(rows)) {
    throw new LayoutSyncError(
      "INVALID_FRAGMENT",
      "Paired rows must be provided as an array.",
    );
  }

  let activeKey: AlignmentKey | null = null;
  let activeFragmentCount = 0;
  let expectedFragmentIndex = 0;
  const closedKeys = new Set<AlignmentKey>();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row === undefined || row === null || typeof row !== "object") {
      throw new LayoutSyncError(
        "INVALID_FRAGMENT",
        `Row ${index} must be an object.`,
        index,
      );
    }

    validateAlignmentKeyAtRow(row.alignmentKey, index);
    validateFragmentMetadata(row, index);
    validateMeasurement(row.en, "EN", index);
    validateMeasurement(row.ar, "AR", index);

    if (activeKey !== row.alignmentKey) {
      if (activeKey !== null && expectedFragmentIndex !== activeFragmentCount) {
        throw new LayoutSyncError(
          "INCOMPLETE_FRAGMENT_GROUP",
          `Alignment key "${activeKey}" ended after ${expectedFragmentIndex} of ${activeFragmentCount} fragments.`,
          index - 1,
        );
      }

      if (activeKey !== null) {
        closedKeys.add(activeKey);
      }
      if (closedKeys.has(row.alignmentKey)) {
        throw new LayoutSyncError(
          "NON_CONTIGUOUS_ALIGNMENT_KEY",
          `Alignment key "${row.alignmentKey}" reappears after its group was closed.`,
          index,
        );
      }
      if (row.fragmentIndex !== 0) {
        throw new LayoutSyncError(
          "INVALID_FRAGMENT_SEQUENCE",
          `Alignment key "${row.alignmentKey}" must begin with fragment 0.`,
          index,
        );
      }

      activeKey = row.alignmentKey;
      activeFragmentCount = row.fragmentCount;
      expectedFragmentIndex = 0;
    } else if (row.fragmentCount !== activeFragmentCount) {
      throw new LayoutSyncError(
        "INCONSISTENT_FRAGMENT_COUNT",
        `Alignment key "${row.alignmentKey}" changed fragmentCount within its group.`,
        index,
      );
    }

    if (row.fragmentIndex !== expectedFragmentIndex) {
      throw new LayoutSyncError(
        "INVALID_FRAGMENT_SEQUENCE",
        `Alignment key "${row.alignmentKey}" expected fragment ${expectedFragmentIndex}, received ${row.fragmentIndex}.`,
        index,
      );
    }
    expectedFragmentIndex += 1;

    const next = rows[index + 1];
    if (row.keepWithNext === true && next?.breakBefore === true) {
      throw new LayoutSyncError(
        "CONFLICTING_BREAK_POLICY",
        `Row ${index} cannot be kept with a following row that forces a page break.`,
        index,
      );
    }
  }

  if (activeKey !== null && expectedFragmentIndex !== activeFragmentCount) {
    throw new LayoutSyncError(
      "INCOMPLETE_FRAGMENT_GROUP",
      `Alignment key "${activeKey}" ended after ${expectedFragmentIndex} of ${activeFragmentCount} fragments.`,
      rows.length - 1,
    );
  }
}

function validateAlignmentKeyAtRow(
  value: AlignmentKey,
  rowIndex: number,
): void {
  try {
    createAlignmentKey(value);
  } catch (error) {
    if (error instanceof LayoutSyncError) {
      throw new LayoutSyncError(error.code, error.message, rowIndex);
    }
    throw error;
  }
}

function validateFragmentMetadata(row: PairedRowInput, rowIndex: number): void {
  if (
    !Number.isSafeInteger(row.fragmentIndex) ||
    row.fragmentIndex < 0 ||
    !Number.isSafeInteger(row.fragmentCount) ||
    row.fragmentCount <= 0 ||
    row.fragmentIndex >= row.fragmentCount ||
    !PAIRED_FRAGMENT_KINDS.has(row.kind) ||
    (row.keepWithNext !== undefined && typeof row.keepWithNext !== "boolean") ||
    (row.breakBefore !== undefined && typeof row.breakBefore !== "boolean")
  ) {
    throw new LayoutSyncError(
      "INVALID_FRAGMENT",
      `Row ${rowIndex} has invalid fragment metadata.`,
      rowIndex,
    );
  }
}

function validateMeasurement(
  measurement: ColumnMeasurement,
  language: BilingualLanguage,
  rowIndex: number,
): void {
  const adjustableGaps = measurement?.adjustableGaps ?? 0;
  if (
    measurement === null ||
    typeof measurement !== "object" ||
    !isFiniteNumber(measurement.contentHeight) ||
    measurement.contentHeight < 0 ||
    !Number.isSafeInteger(adjustableGaps) ||
    adjustableGaps < 0
  ) {
    throw new LayoutSyncError(
      "INVALID_MEASUREMENT",
      `Row ${rowIndex} has an invalid ${language} measurement.`,
      rowIndex,
    );
  }
}

function synchronizeRow(
  row: PairedRowInput,
  sourceIndex: number,
  options: ResolvedLayoutSyncOptions,
): SynchronizedPairedRow {
  const enHeight = row.en.contentHeight;
  const arHeight = row.ar.contentHeight;
  const rowHeight = Math.max(enHeight, arHeight);
  const enIsShorter = enHeight < arHeight;
  const arIsShorter = arHeight < enHeight;
  const heightDifference = Math.abs(enHeight - arHeight);

  const en = synchronizeColumn(
    row.en,
    enIsShorter ? heightDifference : 0,
    options,
  );
  const ar = synchronizeColumn(
    row.ar,
    arIsShorter ? heightDifference : 0,
    options,
  );
  const shorterLanguage: BilingualLanguage | null = enIsShorter
    ? "EN"
    : arIsShorter
      ? "AR"
      : null;
  const residualHeight = enIsShorter
    ? en.trailingSpace
    : arIsShorter
      ? ar.trailingSpace
      : 0;
  const excessHeight = Math.max(0, rowHeight - options.pageContentHeight);
  const hasColumnOverflow =
    shorterLanguage !== null && residualHeight > options.balanceTolerance;
  const hasPageOverflow = excessHeight > 0;

  return {
    sourceIndex,
    alignmentKey: row.alignmentKey,
    fragmentIndex: row.fragmentIndex,
    fragmentCount: row.fragmentCount,
    kind: row.kind,
    keepWithNext: row.keepWithNext ?? false,
    breakBefore: row.breakBefore ?? false,
    en,
    ar,
    rowHeight,
    overflow: classifyOverflow(
      hasPageOverflow,
      hasColumnOverflow,
      excessHeight,
      shorterLanguage,
      residualHeight,
    ),
  };
}

function synchronizeColumn(
  measurement: ColumnMeasurement,
  heightDifference: number,
  options: ResolvedLayoutSyncOptions,
): SynchronizedColumn {
  const adjustableGaps = measurement.adjustableGaps ?? 0;
  const perGapCapacity = adjustableGaps * options.maxSpacingPerGap;
  const addedSpacing =
    adjustableGaps === 0
      ? 0
      : Math.min(
          heightDifference,
          perGapCapacity,
          options.maxDynamicSpacingPerRow,
        );
  const trailingSpace = normalizeZero(heightDifference - addedSpacing);

  return {
    contentHeight: measurement.contentHeight,
    adjustableGaps,
    addedSpacing,
    spacingPerGap: adjustableGaps === 0 ? 0 : addedSpacing / adjustableGaps,
    trailingSpace,
  };
}

function classifyOverflow(
  hasPageOverflow: boolean,
  hasColumnOverflow: boolean,
  excessHeight: number,
  shorterLanguage: BilingualLanguage | null,
  residualHeight: number,
): OverflowClassification {
  if (hasPageOverflow && hasColumnOverflow && shorterLanguage !== null) {
    return {
      kind: "page-and-column-overflow",
      excessHeight,
      shorterLanguage,
      residualHeight,
    };
  }
  if (hasPageOverflow) {
    return {
      kind: "page-overflow",
      excessHeight,
    };
  }
  if (hasColumnOverflow && shorterLanguage !== null) {
    return {
      kind: "column-imbalance",
      shorterLanguage,
      residualHeight,
    };
  }
  return { kind: "none" };
}

function collectImbalanceWarnings(
  rows: readonly SynchronizedPairedRow[],
): LayoutSyncWarning[] {
  const warnings: LayoutSyncWarning[] = [];
  for (const row of rows) {
    if (
      row.overflow.kind === "column-imbalance" ||
      row.overflow.kind === "page-and-column-overflow"
    ) {
      warnings.push({
        code: "RESIDUAL_COLUMN_IMBALANCE",
        alignmentKey: row.alignmentKey,
        fragmentIndex: row.fragmentIndex,
        shorterLanguage: row.overflow.shorterLanguage,
        residualHeight: row.overflow.residualHeight,
      });
    }
  }
  return warnings;
}

function paginateRows(
  rows: readonly SynchronizedPairedRow[],
  options: ResolvedLayoutSyncOptions,
  warnings: LayoutSyncWarning[],
): ProvisionalPage[] {
  const pages: ProvisionalPage[] = [];
  let currentRows: ProvisionalRow[] = [];
  let usedHeight = 0;

  const flushPage = (): void => {
    if (currentRows.length === 0) {
      return;
    }
    pages.push({
      pageNumber: pages.length + 1,
      rows: currentRows,
      usedHeight,
    });
    currentRows = [];
    usedHeight = 0;
  };

  const placeRow = (row: SynchronizedPairedRow): void => {
    const offsetTop =
      currentRows.length === 0 ? 0 : usedHeight + options.rowGap;
    currentRows.push({
      row,
      offsetTop,
      indexOnPage: currentRows.length,
    });
    usedHeight = offsetTop + row.rowHeight;
  };

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row === undefined) {
      continue;
    }

    if (row.breakBefore) {
      flushPage();
    }

    const next = rows[index + 1];
    if (row.keepWithNext && next !== undefined) {
      const requiredHeight = row.rowHeight + options.rowGap + next.rowHeight;
      if (requiredHeight > options.pageContentHeight) {
        warnings.push({
          code: "KEEP_WITH_NEXT_UNSATISFIABLE",
          alignmentKey: row.alignmentKey,
          fragmentIndex: row.fragmentIndex,
          requiredHeight,
          pageContentHeight: options.pageContentHeight,
        });
      } else if (currentRows.length > 0) {
        const pairOffset = usedHeight + options.rowGap;
        if (pairOffset + requiredHeight > options.pageContentHeight) {
          flushPage();
        }
      }
    }

    if (row.rowHeight > options.pageContentHeight) {
      flushPage();
      placeRow(row);
      warnings.push({
        code: "OVERSIZED_FRAGMENT",
        alignmentKey: row.alignmentKey,
        fragmentIndex: row.fragmentIndex,
        rowHeight: row.rowHeight,
        pageContentHeight: options.pageContentHeight,
      });
      flushPage();
      continue;
    }

    const offsetTop =
      currentRows.length === 0 ? 0 : usedHeight + options.rowGap;
    if (
      currentRows.length > 0 &&
      offsetTop + row.rowHeight > options.pageContentHeight
    ) {
      flushPage();
    }
    placeRow(row);
  }

  flushPage();
  return pages;
}

function assignRows(pages: readonly ProvisionalPage[]): AssignedRow[] {
  const assigned: AssignedRow[] = [];
  for (const page of pages) {
    for (const provisional of page.rows) {
      assigned.push({
        ...provisional,
        pageNumber: page.pageNumber,
      });
    }
  }
  return assigned;
}

function countContinuationBreaks(rows: readonly AssignedRow[]): number {
  let count = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      previous.row.alignmentKey === current.row.alignmentKey &&
      previous.pageNumber !== current.pageNumber
    ) {
      count += 1;
    }
  }
  return count;
}

function addContinuationMetadata(
  rows: readonly AssignedRow[],
  labels: ContinuationLabels,
): PaginatedPairedRow[] {
  return rows.map((assigned, index) => {
    const previous = rows[index - 1];
    const next = rows[index + 1];
    const continuedFromPreviousPage =
      previous !== undefined &&
      previous.row.alignmentKey === assigned.row.alignmentKey &&
      previous.pageNumber !== assigned.pageNumber;
    const continuesOnNextPage =
      next !== undefined &&
      next.row.alignmentKey === assigned.row.alignmentKey &&
      next.pageNumber !== assigned.pageNumber;

    return {
      ...assigned.row,
      pageNumber: assigned.pageNumber,
      indexOnPage: assigned.indexOnPage,
      offsetTop: assigned.offsetTop,
      continuation: {
        continuedFromPreviousPage,
        continuesOnNextPage,
        previousPageNumber: continuedFromPreviousPage
          ? (previous?.pageNumber ?? null)
          : null,
        nextPageNumber: continuesOnNextPage ? (next?.pageNumber ?? null) : null,
        beforeLabel: continuedFromPreviousPage ? { ...labels.before } : null,
        afterLabel: continuesOnNextPage ? { ...labels.after } : null,
      },
    };
  });
}

function finalizePages(
  provisionalPages: readonly ProvisionalPage[],
  rows: readonly PaginatedPairedRow[],
  pageContentHeight: number,
): SynchronizedPage[] {
  const pages: SynchronizedPage[] = [];
  let rowCursor = 0;

  for (const provisional of provisionalPages) {
    const pageRows = rows.slice(rowCursor, rowCursor + provisional.rows.length);
    rowCursor += provisional.rows.length;
    pages.push({
      pageNumber: provisional.pageNumber,
      rows: pageRows,
      usedHeight: provisional.usedHeight,
      remainingHeight: Math.max(0, pageContentHeight - provisional.usedHeight),
      overflowHeight: Math.max(0, provisional.usedHeight - pageContentHeight),
    });
  }

  return pages;
}

function isFiniteNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeZero(value: number): number {
  return Math.abs(value) < Number.EPSILON ? 0 : value;
}

// ============================================================================
// Trusted renderer bridge
// ============================================================================

/**
 * The generated document starts pending and becomes ready only after a trusted
 * renderer has measured, synchronized, and applied every paired row.
 */
export const BILINGUAL_LAYOUT_PENDING_SELECTOR =
  '[data-bilingual-document][data-bilingual-layout-state="pending"]';
export const BILINGUAL_LAYOUT_READY_SELECTOR =
  '[data-bilingual-document][data-bilingual-layout-ready="true"]';

export const DEFAULT_BILINGUAL_RENDER_SYNC_OPTIONS = Object.freeze({
  /**
   * A4 body width after the default 14mm inline PDF margins, in CSS pixels
   * (96 per inch).
   */
  pageContentWidth: ((210 - 14 - 14) * 96) / 25.4,
  /**
   * A4 body height after the default 16mm/18mm PDF margins, in CSS pixels
   * (96 per inch).
   */
  pageContentHeight: ((297 - 16 - 18) * 96) / 25.4,
  maxRows: 6_000,
  maxSpacingPerGap: DEFAULT_SYNC_SETTINGS.maxSpacingPerGap,
  maxDynamicSpacingPerRow: DEFAULT_SYNC_SETTINGS.maxDynamicSpacingPerRow,
  balanceTolerance: DEFAULT_SYNC_SETTINGS.balanceTolerance,
} as const);

export interface BilingualRendererSyncOptions {
  readonly pageContentWidth?: number;
  readonly pageContentHeight?: number;
  readonly maxRows?: number;
  readonly maxSpacingPerGap?: number;
  readonly maxDynamicSpacingPerRow?: number;
  readonly balanceTolerance?: number;
  readonly continuationLabels?: ContinuationLabels;
}

export interface BrowserMeasuredPairedRow {
  readonly alignmentKey: string;
  readonly fragmentIndex: number;
  readonly fragmentCount: number;
  readonly kind: PairedFragmentKind;
  readonly en: ColumnMeasurement;
  readonly ar: ColumnMeasurement;
  readonly keepWithNext: boolean;
  readonly breakBefore: boolean;
}

export interface BrowserLayoutMeasurement {
  readonly rows: readonly BrowserMeasuredPairedRow[];
  readonly rowGap: number;
}

export interface AppliedBilingualLayout {
  readonly rowCount: number;
  readonly pageCount: number;
  readonly warningCount: number;
}

export interface BilingualLayoutApplication {
  readonly result: LayoutSyncResult;
  readonly pageContentHeight: number;
}

/**
 * Minimal structural contract implemented by Playwright's Page. The generic
 * keeps this module free of a runtime Playwright dependency.
 */
export interface BilingualLayoutEvaluationPage {
  evaluate<Result, Argument>(
    pageFunction: (argument: Argument) => Result | Promise<Result>,
    argument: Argument,
  ): Promise<Result>;
}

interface BrowserMeasurementOptions {
  readonly maxRows: number;
  readonly pageContentWidth: number;
}

/**
 * Trusted browser-context measurement callable. It is deliberately
 * self-contained so Playwright can serialize it into a JavaScript-disabled
 * page via `page.evaluate`; document-authored scripts remain disabled.
 */
export function measureBilingualLayoutInPage(
  options: BrowserMeasurementOptions,
  targetDocument: Document = document,
): BrowserLayoutMeasurement {
  const root = targetDocument.querySelector<HTMLElement>(
    "[data-bilingual-document]",
  );
  if (!root) {
    throw new Error("Bilingual layout root was not found.");
  }
  if (
    !Number.isFinite(options.pageContentWidth) ||
    options.pageContentWidth <= 0
  ) {
    throw new Error("Bilingual printable content width is invalid.");
  }
  root.style.inlineSize = `${String(options.pageContentWidth)}px`;
  root.style.maxInlineSize = `${String(options.pageContentWidth)}px`;
  root.style.padding = "0";
  root.setAttribute("data-bilingual-sync-measuring", "true");
  root
    .querySelectorAll<HTMLElement>("[data-bilingual-sync-page]")
    .forEach((page) => {
      const parent = page.parentNode;
      if (!parent) return;
      Array.from(page.children).forEach((child) => {
        parent.insertBefore(child, page);
      });
      page.remove();
    });
  // Force layout after constraining the root to the exact PDF content width.
  root.getBoundingClientRect();

  const pairs = Array.from(
    root.querySelectorAll<HTMLElement>("[data-bilingual-pair]"),
  );
  if (pairs.length === 0) {
    throw new Error("Bilingual layout contains no paired rows.");
  }
  if (pairs.length > options.maxRows) {
    throw new Error(
      `Bilingual layout exceeds the trusted renderer limit of ${String(
        options.maxRows,
      )} rows.`,
    );
  }

  const finiteCssNumber = (value: string): number => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  };
  const isHtmlElement = (value: Element): value is HTMLElement => {
    const constructor = targetDocument.defaultView?.HTMLElement;
    return constructor
      ? value instanceof constructor
      : "style" in value && "dataset" in value;
  };
  const approvedGapElements = (cell: HTMLElement): HTMLElement[] => {
    const targets = new Set<HTMLElement>();
    Array.from(cell.children)
      .slice(1)
      .forEach((element) => {
        if (isHtmlElement(element)) targets.add(element);
      });
    cell
      .querySelectorAll<HTMLElement>(
        ":scope > ul > li:not(:first-child), :scope > ol > li:not(:first-child)",
      )
      .forEach((element) => targets.add(element));
    return [...targets];
  };
  const measureIntrinsicHeight = (cell: HTMLElement): number => {
    const cellStyle = getComputedStyle(cell);
    const padding =
      finiteCssNumber(cellStyle.paddingBlockStart) +
      finiteCssNumber(cellStyle.paddingBlockEnd);
    const children = Array.from(cell.children).filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
    );
    const childHeight = children.reduce((total, child) => {
      const style = getComputedStyle(child);
      return (
        total +
        child.getBoundingClientRect().height +
        finiteCssNumber(style.marginBlockStart) +
        finiteCssNumber(style.marginBlockEnd)
      );
    }, 0);
    const range = targetDocument.createRange();
    range.selectNodeContents(cell);
    const rangeHeight = range.getBoundingClientRect().height;
    range.detach();
    return Math.max(0, padding + Math.max(childHeight, rangeHeight));
  };
  const readPositiveInteger = (
    element: HTMLElement,
    attribute: string,
  ): number => {
    const parsed = Number.parseInt(element.getAttribute(attribute) ?? "", 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(`Invalid bilingual fragment metadata: ${attribute}.`);
    }
    return parsed;
  };
  const normalizeKind = (value: string | null): PairedFragmentKind => {
    switch (value) {
      case "heading":
      case "paragraph":
      case "image":
        return value;
      case "list":
        return "list-item";
      case "table":
        return "table-row";
      case "section-heading":
      case "document-title":
        return "heading";
      default:
        return "other";
    }
  };

  root
    .querySelectorAll<HTMLElement>("[data-bilingual-sync-gap]")
    .forEach((element) => {
      element.style.removeProperty("padding-block-start");
      element.removeAttribute("data-bilingual-sync-gap");
    });
  pairs.forEach((pair) => {
    pair
      .querySelectorAll<HTMLElement>("[data-bilingual-continuation-marker]")
      .forEach((marker) => marker.remove());
    pair.style.removeProperty("position");
    pair.style.removeProperty("inset-block-start");
    pair.style.removeProperty("block-size");
    pair.style.removeProperty("margin-block-end");
    pair.style.removeProperty("min-block-size");
    pair.style.removeProperty("break-before");
    pair.removeAttribute("data-sync-page");
    pair
      .querySelectorAll<HTMLElement>("[data-language]")
      .forEach((cell) => cell.style.removeProperty("min-block-size"));
  });

  const measuredRows = pairs.map((pair): BrowserMeasuredPairedRow => {
    const enCell = pair.querySelector<HTMLElement>(
      ':scope > [data-language="en"]',
    );
    const arCell = pair.querySelector<HTMLElement>(
      ':scope > [data-language="ar"]',
    );
    if (!enCell || !arCell) {
      throw new Error(
        "Every bilingual pair must contain one English and one Arabic cell.",
      );
    }
    const alignmentKey = pair.getAttribute("data-alignment-key");
    if (!alignmentKey) {
      throw new Error("A bilingual pair is missing its alignment key.");
    }
    const fragmentIndex = readPositiveInteger(pair, "data-fragment-index");
    const fragmentCount = readPositiveInteger(pair, "data-fragment-count");
    if (fragmentCount < 1 || fragmentIndex >= fragmentCount) {
      throw new Error("Bilingual fragment sequence metadata is invalid.");
    }
    const enContentHeight = measureIntrinsicHeight(enCell);
    const arContentHeight = measureIntrinsicHeight(arCell);
    const pairHeight = pair.getBoundingClientRect().height;
    const isSerial = pair.classList.contains("bilingual-pair--serial");
    const pairChromeHeight = Math.max(
      0,
      pairHeight - Math.max(enContentHeight, arContentHeight),
    );

    return {
      alignmentKey,
      fragmentIndex,
      fragmentCount,
      kind: normalizeKind(pair.getAttribute("data-fragment-kind")),
      en: isSerial
        ? { contentHeight: pairHeight, adjustableGaps: 0 }
        : {
            contentHeight: enContentHeight + pairChromeHeight,
            adjustableGaps: approvedGapElements(enCell).length,
          },
      ar: isSerial
        ? { contentHeight: pairHeight, adjustableGaps: 0 }
        : {
            contentHeight: arContentHeight + pairChromeHeight,
            adjustableGaps: approvedGapElements(arCell).length,
          },
      keepWithNext:
        pair.getAttribute("data-fragment-keep-with-next") === "true",
      breakBefore: pair.getAttribute("data-fragment-break-before") === "true",
    };
  });

  const rowGap = pairs.reduce(
    (maximum, pair) =>
      Math.max(maximum, finiteCssNumber(getComputedStyle(pair).marginBlockEnd)),
    0,
  );
  root.removeAttribute("data-bilingual-sync-measuring");
  return { rows: measuredRows, rowGap };
}

/**
 * Trusted browser-context application callable. Only numeric instructions
 * produced by `synchronizeLayout` are accepted by the orchestrator below.
 */
export function applyBilingualLayoutInPage(
  input: BilingualLayoutApplication | LayoutSyncResult,
  targetDocument: Document = document,
): AppliedBilingualLayout {
  const result = "result" in input ? input.result : input;
  const inferredPage =
    result.pages.find((page) => page.remainingHeight > 0) ?? result.pages[0];
  const pageContentHeight =
    "result" in input
      ? input.pageContentHeight
      : (inferredPage?.usedHeight ?? 0) + (inferredPage?.remainingHeight ?? 0);
  const root = targetDocument.querySelector<HTMLElement>(
    "[data-bilingual-document]",
  );
  if (!root) {
    throw new Error("Bilingual layout root was not found.");
  }
  const pairs = Array.from(
    root.querySelectorAll<HTMLElement>("[data-bilingual-pair]"),
  );
  if (pairs.length !== result.rows.length) {
    throw new Error("Measured bilingual rows changed before synchronization.");
  }
  if (
    !Number.isFinite(pageContentHeight) ||
    pageContentHeight <= 0 ||
    pageContentHeight > 100_000
  ) {
    throw new Error("Bilingual synchronized page height is invalid.");
  }
  const isHtmlElement = (value: Element): value is HTMLElement => {
    const constructor = targetDocument.defaultView?.HTMLElement;
    return constructor
      ? value instanceof constructor
      : "style" in value && "dataset" in value;
  };

  const approvedGapElements = (cell: HTMLElement): HTMLElement[] => {
    const targets = new Set<HTMLElement>();
    Array.from(cell.children)
      .slice(1)
      .forEach((element) => {
        if (isHtmlElement(element)) targets.add(element);
      });
    cell
      .querySelectorAll<HTMLElement>(
        ":scope > ul > li:not(:first-child), :scope > ol > li:not(:first-child)",
      )
      .forEach((element) => targets.add(element));
    return [...targets];
  };
  const applyColumn = (
    pair: HTMLElement,
    language: "en" | "ar",
    column: SynchronizedColumn,
  ): void => {
    const cell = pair.querySelector<HTMLElement>(
      `:scope > [data-language="${language}"]`,
    );
    if (!cell) {
      throw new Error(`Missing ${language.toUpperCase()} synchronized cell.`);
    }
    cell.style.minBlockSize = `${String(column.contentHeight + column.addedSpacing + column.trailingSpace)}px`;
    cell.setAttribute("data-sync-added-spacing", String(column.addedSpacing));
    cell.setAttribute("data-sync-trailing-space", String(column.trailingSpace));
    if (pair.classList.contains("bilingual-pair--serial")) {
      cell.style.removeProperty("min-block-size");
      return;
    }
    const gaps = approvedGapElements(cell);
    if (gaps.length !== column.adjustableGaps) {
      throw new Error(
        `The ${language.toUpperCase()} adjustable-gap count changed before synchronization.`,
      );
    }
    gaps.forEach((element) => {
      element.setAttribute("data-bilingual-sync-gap", "true");
      if (column.spacingPerGap > 0) {
        element.style.paddingBlockStart = `${String(column.spacingPerGap)}px`;
      }
    });
  };
  const addContinuationMarker = (
    pair: HTMLElement,
    language: "en" | "ar",
    position: "before" | "after",
    label: string,
  ): void => {
    const cell = pair.querySelector<HTMLElement>(
      `:scope > [data-language="${language}"]`,
    );
    if (!cell) {
      throw new Error(`Missing ${language.toUpperCase()} continuation cell.`);
    }
    const marker = targetDocument.createElement("span");
    marker.className = `bilingual-continuation-marker bilingual-continuation-marker--${position}`;
    marker.setAttribute("data-bilingual-continuation-marker", position);
    marker.setAttribute("role", "note");
    marker.lang = language;
    marker.dir = language === "ar" ? "rtl" : "ltr";
    marker.textContent = label;
    cell.append(marker);
  };

  result.rows.forEach((row, index) => {
    const pair = pairs[row.sourceIndex];
    if (!pair || row.sourceIndex !== index) {
      throw new Error("Bilingual synchronization source order changed.");
    }
    pair.style.position = "absolute";
    pair.style.insetBlockStart = `${String(row.offsetTop)}px`;
    pair.style.blockSize = `${String(row.rowHeight)}px`;
    pair.style.marginBlockEnd = "0";
    pair.style.minBlockSize = `${String(row.rowHeight)}px`;
    pair.style.breakBefore = "";
    pair.setAttribute("data-sync-page", String(row.pageNumber));
    pair.setAttribute("data-sync-index-on-page", String(row.indexOnPage));
    pair.setAttribute("data-sync-offset-top", String(row.offsetTop));
    pair.setAttribute("data-sync-row-height", String(row.rowHeight));
    pair.setAttribute("data-sync-overflow", row.overflow.kind);
    pair.setAttribute(
      "data-sync-continued-from-previous",
      String(row.continuation.continuedFromPreviousPage),
    );
    pair.setAttribute(
      "data-sync-continues-on-next",
      String(row.continuation.continuesOnNextPage),
    );
    if (row.continuation.beforeLabel) {
      pair.setAttribute(
        "data-sync-before-label-en",
        row.continuation.beforeLabel.en,
      );
      pair.setAttribute(
        "data-sync-before-label-ar",
        row.continuation.beforeLabel.ar,
      );
    }
    if (row.continuation.afterLabel) {
      pair.setAttribute(
        "data-sync-after-label-en",
        row.continuation.afterLabel.en,
      );
      pair.setAttribute(
        "data-sync-after-label-ar",
        row.continuation.afterLabel.ar,
      );
    }
    applyColumn(pair, "en", row.en);
    applyColumn(pair, "ar", row.ar);
    if (row.continuation.beforeLabel) {
      addContinuationMarker(
        pair,
        "en",
        "before",
        row.continuation.beforeLabel.en,
      );
      addContinuationMarker(
        pair,
        "ar",
        "before",
        row.continuation.beforeLabel.ar,
      );
    }
    if (row.continuation.afterLabel) {
      addContinuationMarker(
        pair,
        "en",
        "after",
        row.continuation.afterLabel.en,
      );
      addContinuationMarker(
        pair,
        "ar",
        "after",
        row.continuation.afterLabel.ar,
      );
    }
  });

  const pageCount = result.metrics.pageCount;
  const pageElements = new Map<number, HTMLElement>();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = targetDocument.createElement("div");
    page.className = "bilingual-synchronized-page";
    page.setAttribute("data-bilingual-sync-page", String(pageNumber));
    page.style.position = "relative";
    page.style.inlineSize = "100%";
    page.style.blockSize = `${String(pageContentHeight)}px`;
    page.style.breakInside = "avoid";
    page.style.pageBreakInside = "avoid";
    page.style.breakAfter = pageNumber < pageCount ? "page" : "auto";
    page.style.pageBreakAfter = pageNumber < pageCount ? "always" : "auto";
    pageElements.set(pageNumber, page);
  }
  result.rows.forEach((row) => {
    const pair = pairs[row.sourceIndex];
    const page = pageElements.get(row.pageNumber);
    if (!pair || !page) {
      throw new Error("Bilingual synchronized page assembly failed.");
    }
    page.append(pair);
  });
  pageElements.forEach((page) => root.append(page));

  root.setAttribute("data-bilingual-layout-state", "ready");
  root.setAttribute("data-bilingual-layout-ready", "true");
  root.setAttribute(
    "data-bilingual-layout-pages",
    String(result.metrics.pageCount),
  );
  root.setAttribute(
    "data-bilingual-layout-warnings",
    String(result.warnings.length),
  );
  return {
    rowCount: result.metrics.inputRowCount,
    pageCount: result.metrics.pageCount,
    warningCount: result.warnings.length,
  };
}

function resolveRendererSyncOptions(
  options: BilingualRendererSyncOptions,
): Required<Omit<BilingualRendererSyncOptions, "continuationLabels">> & {
  readonly continuationLabels?: ContinuationLabels;
} {
  const resolved = {
    pageContentWidth:
      options.pageContentWidth ??
      DEFAULT_BILINGUAL_RENDER_SYNC_OPTIONS.pageContentWidth,
    pageContentHeight:
      options.pageContentHeight ??
      DEFAULT_BILINGUAL_RENDER_SYNC_OPTIONS.pageContentHeight,
    maxRows: options.maxRows ?? DEFAULT_BILINGUAL_RENDER_SYNC_OPTIONS.maxRows,
    maxSpacingPerGap:
      options.maxSpacingPerGap ??
      DEFAULT_BILINGUAL_RENDER_SYNC_OPTIONS.maxSpacingPerGap,
    maxDynamicSpacingPerRow:
      options.maxDynamicSpacingPerRow ??
      DEFAULT_BILINGUAL_RENDER_SYNC_OPTIONS.maxDynamicSpacingPerRow,
    balanceTolerance:
      options.balanceTolerance ??
      DEFAULT_BILINGUAL_RENDER_SYNC_OPTIONS.balanceTolerance,
    ...(options.continuationLabels
      ? { continuationLabels: options.continuationLabels }
      : {}),
  };
  if (
    !Number.isFinite(resolved.pageContentWidth) ||
    resolved.pageContentWidth <= 0 ||
    resolved.pageContentWidth > 10_000
  ) {
    throw new LayoutSyncError(
      "INVALID_OPTIONS",
      "Trusted renderer pageContentWidth must be finite and between 0 and 10000 CSS pixels.",
    );
  }
  if (
    !Number.isInteger(resolved.maxRows) ||
    resolved.maxRows < 1 ||
    resolved.maxRows > DEFAULT_BILINGUAL_RENDER_SYNC_OPTIONS.maxRows
  ) {
    throw new LayoutSyncError(
      "INVALID_OPTIONS",
      `Trusted renderer maxRows must be between 1 and ${String(
        DEFAULT_BILINGUAL_RENDER_SYNC_OPTIONS.maxRows,
      )}.`,
    );
  }
  return resolved;
}

function synchronizeBrowserMeasurement(
  measurement: BrowserLayoutMeasurement,
  options: ReturnType<typeof resolveRendererSyncOptions>,
): LayoutSyncResult {
  if (
    !measurement ||
    !Array.isArray(measurement.rows) ||
    measurement.rows.length > options.maxRows
  ) {
    throw new LayoutSyncError(
      "INVALID_FRAGMENT",
      "Trusted renderer returned an invalid bilingual row measurement.",
    );
  }
  const rows: PairedRowInput[] = measurement.rows.map((row) => ({
    ...row,
    alignmentKey: createAlignmentKey(row.alignmentKey),
  }));
  const result = synchronizeLayout(rows, {
    pageContentHeight: options.pageContentHeight,
    rowGap: measurement.rowGap,
    maxSpacingPerGap: options.maxSpacingPerGap,
    maxDynamicSpacingPerRow: options.maxDynamicSpacingPerRow,
    balanceTolerance: options.balanceTolerance,
    ...(options.continuationLabels
      ? { continuationLabels: options.continuationLabels }
      : {}),
  });
  const oversized = result.rows.find(
    (row) =>
      row.overflow.kind === "page-overflow" ||
      row.overflow.kind === "page-and-column-overflow",
  );
  if (oversized) {
    throw new LayoutSyncError(
      "INVALID_FRAGMENT",
      `Bilingual fragment ${oversized.alignmentKey}:${String(
        oversized.fragmentIndex,
      )} is taller than the printable page and cannot be rendered safely.`,
      oversized.sourceIndex,
    );
  }
  return result;
}

/**
 * Measure and synchronize the current browser document using the shared pure
 * engine. Client previews may call this after their fonts and images settle.
 */
export function synchronizeCurrentBilingualDocument(
  options: BilingualRendererSyncOptions = {},
  targetDocument?: Document,
): LayoutSyncResult {
  const activeDocument =
    targetDocument ?? (typeof document === "undefined" ? undefined : document);
  if (!activeDocument) {
    throw new LayoutSyncError(
      "INVALID_OPTIONS",
      "Bilingual DOM synchronization requires a browser document.",
    );
  }
  const resolved = resolveRendererSyncOptions(options);
  const measurement = measureBilingualLayoutInPage(
    {
      maxRows: resolved.maxRows,
      pageContentWidth: resolved.pageContentWidth,
    },
    activeDocument,
  );
  const result = synchronizeBrowserMeasurement(measurement, resolved);
  applyBilingualLayoutInPage(
    {
      result,
      pageContentHeight: resolved.pageContentHeight,
    },
    activeDocument,
  );
  return result;
}

/**
 * Playwright adapter used by PDF generation. Measurements cross the browser
 * boundary as data, synchronization runs in trusted Node code, and only the
 * resulting numeric layout instructions are applied back to the page.
 */
export async function synchronizeBilingualLayoutPage(
  page: BilingualLayoutEvaluationPage,
  options: BilingualRendererSyncOptions = {},
): Promise<LayoutSyncResult> {
  const resolved = resolveRendererSyncOptions(options);
  const measurement = await page.evaluate(measureBilingualLayoutInPage, {
    maxRows: resolved.maxRows,
    pageContentWidth: resolved.pageContentWidth,
  });
  const result = synchronizeBrowserMeasurement(measurement, resolved);
  await page.evaluate(applyBilingualLayoutInPage, {
    result,
    pageContentHeight: resolved.pageContentHeight,
  });
  return result;
}
