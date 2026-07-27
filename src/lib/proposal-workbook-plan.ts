/**
 * Pure workbook-plan compiler for the structured XLSX channel (Requirement 8).
 *
 * This module performs no I/O. It converts a validated `CompiledProposalLayout`
 * plus its source `ProposalSnapshot` into an ordered, manifest-first workbook
 * plan. A separate ExcelJS serializer consumes the plan; keeping the two apart
 * lets property tests drive the planner with no spreadsheet dependency, no
 * clock, and no filesystem.
 *
 * Invariants this module guarantees and never relaxes:
 *
 * - The manifest is always sheet 1; representable block sheets follow in
 *   compiled-layout order (Requirement 8.1, 8.4).
 * - Every block sheet carries exactly two header rows: Arabic labels first,
 *   the matching English labels second, at identical column positions
 *   (Requirement 8.2).
 * - Narrative, bullet-list, and diagram blocks never produce a sheet; each one
 *   produces a single manifest row with a bilingual not-representable marker
 *   (Requirement 8.5).
 * - Commercial amounts, commercial currencies, and KPI values are emitted as
 *   `STORED_LITERAL` cells holding the stored text verbatim. Nothing here
 *   rounds, coerces, converts, totals, or derives a monetary value, and no cell
 *   kind can express a formula (Requirement 8.7).
 * - A null or blank stored value becomes a `NOT_AVAILABLE` cell carrying the
 *   bilingual marker, never an empty cell and never a zero (Requirement 8.10).
 * - Every label originates from a registered bilingual key in `./i18n`; this
 *   module contains no user-facing literal (Requirement 18.5).
 */

import {
  getCompletionErrorContract,
  getDynamicTranslationKey,
  translate,
  type TranslationKey,
  type TranslationValues,
} from "./i18n";
import type {
  CompiledProposalLayout,
  EvidenceStatus,
  LocalizedProposalText,
  ProposalBlock,
  ProposalBlockType,
  ProposalLayoutKey,
  ProposalModuleKey,
  ProposalSnapshot,
} from "./proposal-layouts";

/** Block types the spreadsheet channel represents as their own worksheet. */
export const XLSX_REPRESENTABLE_BLOCK_TYPES = Object.freeze([
  "TABLE",
  "KPI",
  "EVIDENCE_REGISTER",
  "COMMERCIAL_HANDOFF",
] as const satisfies readonly ProposalBlockType[]);

/** Block types the spreadsheet channel records in the manifest only. */
export const XLSX_MANIFEST_ONLY_BLOCK_TYPES = Object.freeze([
  "NARRATIVE",
  "BULLET_LIST",
  "DIAGRAM",
] as const satisfies readonly ProposalBlockType[]);

export type XlsxRepresentableBlockType =
  (typeof XLSX_REPRESENTABLE_BLOCK_TYPES)[number];
export type XlsxManifestOnlyBlockType =
  (typeof XLSX_MANIFEST_ONLY_BLOCK_TYPES)[number];

const REPRESENTABLE_BLOCK_TYPE_SET = new Set<string>(
  XLSX_REPRESENTABLE_BLOCK_TYPES,
);

export function isXlsxRepresentableBlock(
  block: ProposalBlock,
): block is Extract<ProposalBlock, { type: XlsxRepresentableBlockType }> {
  return REPRESENTABLE_BLOCK_TYPE_SET.has(block.type);
}

export function isXlsxManifestOnlyBlock(
  block: ProposalBlock,
): block is Extract<ProposalBlock, { type: XlsxManifestOnlyBlockType }> {
  return !REPRESENTABLE_BLOCK_TYPE_SET.has(block.type);
}

export type ProposalWorkbookLocale = "ar" | "en";
export type ProposalWorkbookDirection = "rtl" | "ltr";

/**
 * A planned cell. There is deliberately no formula kind: the plan cannot
 * express a computed value, so no serializer can emit one (Requirement 8.7).
 */
export type ProposalWorkbookCell =
  | Readonly<{
      columnKey: string;
      kind: "STORED_LITERAL";
      /** The stored text copied verbatim; never parsed, rounded, or totalled. */
      literal: string;
    }>
  | Readonly<{
      columnKey: string;
      kind: "LOCALIZED";
      label: LocalizedProposalText;
    }>
  | Readonly<{
      columnKey: string;
      kind: "NOT_AVAILABLE";
      label: LocalizedProposalText;
    }>;

export type ProposalWorkbookCellKind = ProposalWorkbookCell["kind"];

export interface ProposalWorkbookColumn {
  readonly key: string;
  readonly label: LocalizedProposalText;
}

export interface ProposalWorkbookRow {
  readonly key: string;
  readonly cells: readonly ProposalWorkbookCell[];
}

/**
 * A single-valued block field that has no place in the repeating grid, such as
 * a commercial handoff instruction. Serializers write these below the data rows
 * so the two bilingual header rows stay at the top of the sheet.
 */
export interface ProposalWorkbookAttribute {
  readonly key: string;
  readonly label: LocalizedProposalText;
  readonly value: ProposalWorkbookCell;
}

/** Arabic labels occupy row 1 and English labels row 2 (Requirement 8.2). */
export type ProposalWorkbookHeaderRows = readonly [
  readonly string[],
  readonly string[],
];

export const PROPOSAL_WORKBOOK_HEADER_ROW_COUNT = 2;
export const PROPOSAL_WORKBOOK_FIRST_DATA_ROW = 3;

export interface ProposalWorkbookBlockSheet {
  readonly kind: "BLOCK";
  /** Sanitized, unique, at most 31 characters, derived from the block key. */
  readonly name: string;
  readonly direction: ProposalWorkbookDirection;
  readonly moduleKey: ProposalModuleKey;
  readonly blockKey: string;
  readonly blockType: XlsxRepresentableBlockType;
  readonly blockTypeLabel: LocalizedProposalText;
  readonly title: LocalizedProposalText;
  readonly columns: readonly ProposalWorkbookColumn[];
  readonly headerRows: ProposalWorkbookHeaderRows;
  readonly firstDataRow: typeof PROPOSAL_WORKBOOK_FIRST_DATA_ROW;
  readonly rows: readonly ProposalWorkbookRow[];
  readonly attributes: readonly ProposalWorkbookAttribute[];
}

export type ProposalWorkbookManifestField =
  | "snapshotRevision"
  | "snapshotHash"
  | "planHash"
  | "presetKey"
  | "locale"
  | "generatedAt";

export interface ProposalWorkbookManifestEntry {
  readonly field: ProposalWorkbookManifestField;
  readonly label: LocalizedProposalText;
  readonly value: string;
}

export interface ProposalWorkbookManifestBlockRow {
  readonly moduleKey: ProposalModuleKey;
  readonly blockKey: string;
  readonly blockType: XlsxManifestOnlyBlockType;
  readonly blockTypeLabel: LocalizedProposalText;
  /** Explicit bilingual not-representable marker (Requirement 8.5). */
  readonly notRepresentable: LocalizedProposalText;
}

export interface ProposalWorkbookManifestSheet {
  readonly kind: "MANIFEST";
  readonly name: string;
  readonly direction: ProposalWorkbookDirection;
  readonly title: LocalizedProposalText;
  readonly metadataColumns: readonly ProposalWorkbookColumn[];
  readonly metadataHeaderRows: ProposalWorkbookHeaderRows;
  readonly metadata: readonly ProposalWorkbookManifestEntry[];
  readonly notRepresentableTitle: LocalizedProposalText;
  readonly notRepresentableColumns: readonly ProposalWorkbookColumn[];
  readonly notRepresentableHeaderRows: ProposalWorkbookHeaderRows;
  readonly notRepresentableRows: readonly ProposalWorkbookManifestBlockRow[];
}

export type ProposalWorkbookSheet =
  | ProposalWorkbookManifestSheet
  | ProposalWorkbookBlockSheet;

export interface ProposalWorkbookPlan {
  readonly schemaVersion: 1;
  readonly channel: "XLSX";
  readonly locale: ProposalWorkbookLocale;
  readonly direction: ProposalWorkbookDirection;
  readonly presetKey: ProposalLayoutKey;
  readonly snapshotId: string;
  readonly snapshotVersion: number;
  readonly snapshotHash: string;
  readonly planHash: string;
  /** UTC ISO-8601 instant supplied by the caller; the planner reads no clock. */
  readonly generatedAt: string;
  readonly notAvailableMarker: LocalizedProposalText;
  readonly notRepresentableMarker: LocalizedProposalText;
  /** Manifest first, then one sheet per representable block in layout order. */
  readonly sheets: readonly ProposalWorkbookSheet[];
  readonly manifest: ProposalWorkbookManifestSheet;
  readonly blockSheets: readonly ProposalWorkbookBlockSheet[];
}

export type ProposalWorkbookDiagnosticCode =
  | "XLSX_BILINGUAL_LABEL_MISSING"
  | "UNSUPPORTED_EXPORT_CHANNEL"
  | "INVALID_SNAPSHOT";

export interface ProposalWorkbookDiagnostic {
  readonly severity: "ERROR";
  readonly code: ProposalWorkbookDiagnosticCode;
  readonly channel: "XLSX";
  /** Empty when the diagnostic is not attributable to one block. */
  readonly blockKey: string;
  /** Offending field relative to the block, or to the plan for plan errors. */
  readonly field: string;
  readonly path: string;
  readonly message: LocalizedProposalText;
}

export type CompileProposalWorkbookPlanResult =
  | Readonly<{
      status: "READY";
      plan: ProposalWorkbookPlan;
      diagnostics: readonly ProposalWorkbookDiagnostic[];
    }>
  | Readonly<{
      status: "BLOCKED";
      plan: null;
      diagnostics: readonly ProposalWorkbookDiagnostic[];
    }>;

export interface CompileProposalWorkbookPlanOptions {
  /** Already compiled for the XLSX channel by `compileProposalLayout`. */
  readonly layout: CompiledProposalLayout;
  readonly locale: ProposalWorkbookLocale;
  /** Injected so the planner stays pure and byte-reproducible. */
  readonly generatedAt: Date;
}

// ── Localization helpers ─────────────────────────────────────────────────────

function pair(key: TranslationKey): LocalizedProposalText {
  return Object.freeze({
    ar: translate(key, "ar"),
    en: translate(key, "en"),
  });
}

function interpolatedPair<Key extends TranslationKey>(
  key: Key,
  values: TranslationValues<Key>,
): LocalizedProposalText {
  return Object.freeze({
    ar: translate(key, "ar", values),
    en: translate(key, "en", values),
  });
}

function blockTypeLabel(type: ProposalBlockType): LocalizedProposalText {
  return pair(getDynamicTranslationKey("xlsxBlockType", type));
}

function evidenceStatusLabel(status: EvidenceStatus): LocalizedProposalText {
  return pair(getDynamicTranslationKey("evidenceStatus", status));
}

function pricingStatusLabel(
  status: Extract<ProposalBlock, { type: "COMMERCIAL_HANDOFF" }>["pricingStatus"],
): LocalizedProposalText {
  return pair(getDynamicTranslationKey("pricingStatus", status));
}

// ── Sheet name allocation (Requirement 8.1) ──────────────────────────────────

export const EXCEL_SHEET_NAME_MAX_LENGTH = 31;

/** Excel rejects these characters outright in a worksheet name. */
const EXCEL_FORBIDDEN_SHEET_CHARACTERS = /[:\\/?*[\]]/gu;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/gu;
const WRAPPING_APOSTROPHES = /^'+|'+$/gu;
/** Excel reserves this name for the change-history sheet. */
const EXCEL_RESERVED_SHEET_NAMES: ReadonlySet<string> = new Set(["history"]);
const COLLISION_SEPARATOR = "~";

/**
 * Reduce an arbitrary block key to a legal Excel worksheet name. The result is
 * at most 31 characters, free of reserved punctuation, and stable for a given
 * input.
 */
export function sanitizeWorkbookSheetName(candidate: string): string {
  return candidate
    .replace(EXCEL_FORBIDDEN_SHEET_CHARACTERS, "_")
    .replace(CONTROL_CHARACTERS, "_")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(WRAPPING_APOSTROPHES, "")
    .trim()
    .slice(0, EXCEL_SHEET_NAME_MAX_LENGTH)
    .trim();
}

/**
 * Deterministic, order-dependent unique-name allocator. Names are compared
 * case-insensitively because Excel treats `Scope` and `scope` as one sheet.
 */
class WorkbookSheetNameAllocator {
  private readonly taken = new Set<string>();

  allocate(preferred: string, fallbacks: readonly string[]): string {
    let base = sanitizeWorkbookSheetName(preferred);
    for (const fallback of fallbacks) {
      if (base.length > 0) break;
      base = sanitizeWorkbookSheetName(fallback);
    }
    if (base.length === 0) base = String(this.taken.size + 1);

    let candidate = base;
    let attempt = 2;
    while (this.isUnavailable(candidate)) {
      const suffix = `${COLLISION_SEPARATOR}${attempt}`;
      const room = EXCEL_SHEET_NAME_MAX_LENGTH - suffix.length;
      candidate = `${base.slice(0, Math.max(room, 0)).trim()}${suffix}`;
      attempt += 1;
    }
    this.taken.add(candidate.toLowerCase());
    return candidate;
  }

  private isUnavailable(candidate: string): boolean {
    const normalized = candidate.toLowerCase();
    return (
      this.taken.has(normalized) || EXCEL_RESERVED_SHEET_NAMES.has(normalized)
    );
  }
}

// ── Cell construction ────────────────────────────────────────────────────────

/** Read one language of a possibly absent bilingual value without throwing. */
function languageText(
  value: LocalizedProposalText | undefined,
  language: ProposalWorkbookLocale,
): string {
  const text = value === undefined ? undefined : value[language];
  return typeof text === "string" ? text : "";
}

function notAvailableCell(
  columnKey: string,
  marker: LocalizedProposalText,
): ProposalWorkbookCell {
  return Object.freeze({
    columnKey,
    kind: "NOT_AVAILABLE" as const,
    label: marker,
  });
}

/**
 * Copy a stored literal verbatim. A null or blank value yields the bilingual
 * not-available marker rather than an empty cell or a zero (Requirement 8.10).
 */
function storedLiteralCell(
  columnKey: string,
  stored: string | null | undefined,
  marker: LocalizedProposalText,
): ProposalWorkbookCell {
  if (typeof stored !== "string" || stored.trim().length === 0) {
    return notAvailableCell(columnKey, marker);
  }
  return Object.freeze({
    columnKey,
    kind: "STORED_LITERAL" as const,
    literal: stored,
  });
}

function localizedCell(
  columnKey: string,
  label: LocalizedProposalText | undefined,
  marker: LocalizedProposalText,
): ProposalWorkbookCell {
  const ar = languageText(label, "ar");
  const en = languageText(label, "en");
  // Absent content is reported separately as a diagnostic where a requirement
  // demands both languages. The cell still carries the explicit marker so no
  // empty cell can ever be serialized.
  if (ar.trim().length === 0 && en.trim().length === 0) {
    return notAvailableCell(columnKey, marker);
  }
  return Object.freeze({
    columnKey,
    kind: "LOCALIZED" as const,
    label: Object.freeze({ ar, en }),
  });
}

/**
 * Source reference identifiers are stored tokens, so they are concatenated
 * without translation. An empty list yields the explicit marker.
 */
function sourceRefsCell(
  columnKey: string,
  sourceRefs: readonly string[] | undefined,
  marker: LocalizedProposalText,
): ProposalWorkbookCell {
  const refs = (sourceRefs ?? []).filter(
    (ref) => typeof ref === "string" && ref.trim().length > 0,
  );
  if (refs.length === 0) return notAvailableCell(columnKey, marker);
  return Object.freeze({
    columnKey,
    kind: "STORED_LITERAL" as const,
    literal: refs.join(", "),
  });
}

// ── Diagnostics (Requirement 8.11) ───────────────────────────────────────────

function bilingualLabelDiagnostic(
  blockKey: string,
  moduleKey: ProposalModuleKey,
  field: string,
): ProposalWorkbookDiagnostic {
  const path = `modules.${moduleKey}.blocks.${blockKey}.${field}`;
  const contract = getCompletionErrorContract("XLSX_BILINGUAL_LABEL_MISSING", {
    fieldPath: path,
  });
  return Object.freeze({
    severity: "ERROR" as const,
    code: "XLSX_BILINGUAL_LABEL_MISSING" as const,
    channel: "XLSX" as const,
    blockKey,
    field,
    path,
    message: Object.freeze({ ar: contract.message.ar, en: contract.message.en }),
  });
}

/**
 * Requirement 8.11: a column label, KPI label, evidence entry label, or
 * commercial entry description whose Arabic or English text is empty after
 * trimming blocks the export. Nothing here synthesizes a translation.
 */
function requireBilingualLabel(
  label: LocalizedProposalText | undefined,
  blockKey: string,
  moduleKey: ProposalModuleKey,
  field: string,
  diagnostics: ProposalWorkbookDiagnostic[],
): void {
  for (const language of ["ar", "en"] as const) {
    if (languageText(label, language).trim().length > 0) continue;
    diagnostics.push(
      bilingualLabelDiagnostic(blockKey, moduleKey, `${field}.${language}`),
    );
  }
}

function planDiagnostic(
  code: Extract<
    ProposalWorkbookDiagnosticCode,
    "UNSUPPORTED_EXPORT_CHANNEL" | "INVALID_SNAPSHOT"
  >,
  field: string,
  message: LocalizedProposalText,
): ProposalWorkbookDiagnostic {
  return Object.freeze({
    severity: "ERROR" as const,
    code,
    channel: "XLSX" as const,
    blockKey: "",
    field,
    path: field,
    message,
  });
}

/** Extract the block key from a compiled diagnostic path, when it names one. */
function blockKeyFromPath(path: string): string {
  const match = /\.blocks\.([^.[]+)/u.exec(path);
  return match?.[1] ?? "";
}

function sortDiagnostics(
  diagnostics: readonly ProposalWorkbookDiagnostic[],
): readonly ProposalWorkbookDiagnostic[] {
  return Object.freeze(
    [...diagnostics].sort(
      (left, right) =>
        left.path.localeCompare(right.path) ||
        left.code.localeCompare(right.code) ||
        left.message.en.localeCompare(right.message.en),
    ),
  );
}

// ── Column definitions ───────────────────────────────────────────────────────

function column(key: string, labelKey: TranslationKey): ProposalWorkbookColumn {
  return Object.freeze({ key, label: pair(labelKey) });
}

const KPI_COLUMN_KEYS = Object.freeze({
  label: "kpiLabel",
  value: "kpiValue",
  unit: "kpiUnit",
  asOf: "kpiAsOf",
} as const);

const EVIDENCE_COLUMN_KEYS = Object.freeze({
  label: "evidenceLabel",
  status: "evidenceStatus",
  sourceRefs: "sourceRefs",
} as const);

const COMMERCIAL_COLUMN_KEYS = Object.freeze({
  description: "commercialDescription",
  amount: "commercialAmount",
  currency: "commercialCurrency",
  sourceRefs: "sourceRefs",
} as const);

const MANIFEST_COLUMN_KEYS = Object.freeze({
  field: "manifestField",
  value: "manifestValue",
  moduleKey: "manifestModuleKey",
  blockKey: "manifestBlockKey",
  blockType: "manifestBlockType",
  markerAr: "manifestMarkerAr",
  markerEn: "manifestMarkerEn",
} as const);

function kpiColumns(): readonly ProposalWorkbookColumn[] {
  return Object.freeze([
    column(KPI_COLUMN_KEYS.label, "xlsx_col_kpi_label"),
    column(KPI_COLUMN_KEYS.value, "xlsx_col_kpi_value"),
    column(KPI_COLUMN_KEYS.unit, "xlsx_col_kpi_unit"),
    column(KPI_COLUMN_KEYS.asOf, "xlsx_col_kpi_as_of"),
  ]);
}

function evidenceColumns(): readonly ProposalWorkbookColumn[] {
  return Object.freeze([
    column(EVIDENCE_COLUMN_KEYS.label, "xlsx_col_evidence_label"),
    column(EVIDENCE_COLUMN_KEYS.status, "xlsx_col_evidence_status"),
    column(EVIDENCE_COLUMN_KEYS.sourceRefs, "xlsx_col_source_refs"),
  ]);
}

function commercialColumns(): readonly ProposalWorkbookColumn[] {
  return Object.freeze([
    column(COMMERCIAL_COLUMN_KEYS.description, "xlsx_col_commercial_description"),
    column(COMMERCIAL_COLUMN_KEYS.amount, "xlsx_col_commercial_amount"),
    column(COMMERCIAL_COLUMN_KEYS.currency, "xlsx_col_commercial_currency"),
    column(COMMERCIAL_COLUMN_KEYS.sourceRefs, "xlsx_col_source_refs"),
  ]);
}

/**
 * Requirement 8.2: Arabic labels form row 1 and the matching English labels
 * form row 2 at the same column positions.
 */
function headerRows(
  columns: readonly ProposalWorkbookColumn[],
): ProposalWorkbookHeaderRows {
  const arabic: readonly string[] = Object.freeze(
    columns.map((entry) => entry.label.ar),
  );
  const english: readonly string[] = Object.freeze(
    columns.map((entry) => entry.label.en),
  );
  return Object.freeze([arabic, english] as const);
}

// ── Block sheet construction ─────────────────────────────────────────────────

interface BlockSheetContext {
  readonly moduleKey: ProposalModuleKey;
  readonly moduleTitle: LocalizedProposalText;
  readonly direction: ProposalWorkbookDirection;
  readonly marker: LocalizedProposalText;
  readonly sheetName: string;
}

function attribute(
  key: string,
  labelKey: TranslationKey,
  value: ProposalWorkbookCell,
): ProposalWorkbookAttribute {
  return Object.freeze({ key, label: pair(labelKey), value });
}

function baseAttributes(
  block: Extract<ProposalBlock, { type: XlsxRepresentableBlockType }>,
  context: BlockSheetContext,
): readonly ProposalWorkbookAttribute[] {
  return [
    attribute(
      "moduleTitle",
      "xlsx_attr_module_title",
      localizedCell("moduleTitle", context.moduleTitle, context.marker),
    ),
    attribute(
      "blockTitle",
      "xlsx_attr_block_title",
      localizedCell("blockTitle", block.title, context.marker),
    ),
  ];
}

function tableRows(
  block: Extract<ProposalBlock, { type: "TABLE" }>,
  context: BlockSheetContext,
  diagnostics: ProposalWorkbookDiagnostic[],
): readonly ProposalWorkbookRow[] {
  block.columns.forEach((tableColumn, index) => {
    requireBilingualLabel(
      tableColumn.label,
      block.key,
      context.moduleKey,
      `columns[${index}].label`,
      diagnostics,
    );
  });

  return Object.freeze(
    block.rows.map((row) =>
      Object.freeze({
        key: row.key,
        cells: Object.freeze(
          block.columns.map((tableColumn) =>
            localizedCell(
              tableColumn.key,
              row.cells[tableColumn.key],
              context.marker,
            ),
          ),
        ),
      }),
    ),
  );
}

function kpiRows(
  block: Extract<ProposalBlock, { type: "KPI" }>,
  context: BlockSheetContext,
  diagnostics: ProposalWorkbookDiagnostic[],
): readonly ProposalWorkbookRow[] {
  requireBilingualLabel(
    block.label,
    block.key,
    context.moduleKey,
    "label",
    diagnostics,
  );

  return Object.freeze([
    Object.freeze({
      key: block.key,
      cells: Object.freeze([
        localizedCell(KPI_COLUMN_KEYS.label, block.label, context.marker),
        storedLiteralCell(KPI_COLUMN_KEYS.value, block.value, context.marker),
        localizedCell(KPI_COLUMN_KEYS.unit, block.unit, context.marker),
        storedLiteralCell(KPI_COLUMN_KEYS.asOf, block.asOf, context.marker),
      ]),
    }),
  ]);
}

function evidenceRows(
  block: Extract<ProposalBlock, { type: "EVIDENCE_REGISTER" }>,
  context: BlockSheetContext,
  diagnostics: ProposalWorkbookDiagnostic[],
): readonly ProposalWorkbookRow[] {
  return Object.freeze(
    block.entries.map((entry, index) => {
      requireBilingualLabel(
        entry.label,
        block.key,
        context.moduleKey,
        `entries[${index}].label`,
        diagnostics,
      );
      return Object.freeze({
        key: entry.key,
        cells: Object.freeze([
          localizedCell(EVIDENCE_COLUMN_KEYS.label, entry.label, context.marker),
          localizedCell(
            EVIDENCE_COLUMN_KEYS.status,
            evidenceStatusLabel(entry.status),
            context.marker,
          ),
          sourceRefsCell(
            EVIDENCE_COLUMN_KEYS.sourceRefs,
            entry.sourceRefs,
            context.marker,
          ),
        ]),
      });
    }),
  );
}

function commercialRows(
  block: Extract<ProposalBlock, { type: "COMMERCIAL_HANDOFF" }>,
  context: BlockSheetContext,
  diagnostics: ProposalWorkbookDiagnostic[],
): readonly ProposalWorkbookRow[] {
  return Object.freeze(
    block.entries.map((entry, index) => {
      requireBilingualLabel(
        entry.description,
        block.key,
        context.moduleKey,
        `entries[${index}].description`,
        diagnostics,
      );
      return Object.freeze({
        key: entry.key,
        cells: Object.freeze([
          localizedCell(
            COMMERCIAL_COLUMN_KEYS.description,
            entry.description,
            context.marker,
          ),
          // Requirement 8.7: the stored amount and currency are copied
          // verbatim. No total, unit price, or conversion is derived.
          storedLiteralCell(
            COMMERCIAL_COLUMN_KEYS.amount,
            entry.amount,
            context.marker,
          ),
          storedLiteralCell(
            COMMERCIAL_COLUMN_KEYS.currency,
            entry.currency,
            context.marker,
          ),
          sourceRefsCell(
            COMMERCIAL_COLUMN_KEYS.sourceRefs,
            entry.sourceRefs,
            context.marker,
          ),
        ]),
      });
    }),
  );
}

interface BlockGrid {
  readonly columns: readonly ProposalWorkbookColumn[];
  readonly rows: readonly ProposalWorkbookRow[];
  readonly extraAttributes: readonly ProposalWorkbookAttribute[];
}

function blockGrid(
  block: Extract<ProposalBlock, { type: XlsxRepresentableBlockType }>,
  context: BlockSheetContext,
  diagnostics: ProposalWorkbookDiagnostic[],
): BlockGrid {
  switch (block.type) {
    case "TABLE":
      return {
        // Table columns are tenant-declared, so their labels come from the
        // snapshot rather than the localization registry.
        columns: Object.freeze(
          block.columns.map((tableColumn) =>
            Object.freeze({
              key: tableColumn.key,
              label: Object.freeze({
                ar: languageText(tableColumn.label, "ar"),
                en: languageText(tableColumn.label, "en"),
              }),
            }),
          ),
        ),
        rows: tableRows(block, context, diagnostics),
        extraAttributes: Object.freeze([]),
      };
    case "KPI":
      return {
        columns: kpiColumns(),
        rows: kpiRows(block, context, diagnostics),
        extraAttributes: Object.freeze([]),
      };
    case "EVIDENCE_REGISTER":
      return {
        columns: evidenceColumns(),
        rows: evidenceRows(block, context, diagnostics),
        extraAttributes: Object.freeze([]),
      };
    case "COMMERCIAL_HANDOFF":
      return {
        columns: commercialColumns(),
        rows: commercialRows(block, context, diagnostics),
        extraAttributes: Object.freeze([
          attribute(
            "pricingStatus",
            "xlsx_attr_pricing_status",
            localizedCell(
              "pricingStatus",
              pricingStatusLabel(block.pricingStatus),
              context.marker,
            ),
          ),
          attribute(
            "commercialInstruction",
            "xlsx_attr_commercial_instruction",
            localizedCell(
              "commercialInstruction",
              block.instruction,
              context.marker,
            ),
          ),
        ]),
      };
  }
}

function blockSheet(
  block: Extract<ProposalBlock, { type: XlsxRepresentableBlockType }>,
  context: BlockSheetContext,
  diagnostics: ProposalWorkbookDiagnostic[],
): ProposalWorkbookBlockSheet {
  const grid = blockGrid(block, context, diagnostics);

  return Object.freeze({
    kind: "BLOCK" as const,
    name: context.sheetName,
    direction: context.direction,
    moduleKey: context.moduleKey,
    blockKey: block.key,
    blockType: block.type,
    blockTypeLabel: blockTypeLabel(block.type),
    title: Object.freeze({
      ar: languageText(block.title, "ar"),
      en: languageText(block.title, "en"),
    }),
    columns: grid.columns,
    headerRows: headerRows(grid.columns),
    firstDataRow: PROPOSAL_WORKBOOK_FIRST_DATA_ROW,
    rows: grid.rows,
    attributes: Object.freeze([
      ...baseAttributes(block, context),
      ...grid.extraAttributes,
    ]),
  });
}

// ── Manifest construction (Requirements 8.4, 8.5) ────────────────────────────

function manifestMetadata(
  layout: CompiledProposalLayout,
  locale: ProposalWorkbookLocale,
  generatedAt: string,
): readonly ProposalWorkbookManifestEntry[] {
  const entries: readonly Readonly<{
    field: ProposalWorkbookManifestField;
    labelKey: TranslationKey;
    value: string;
  }>[] = [
    {
      field: "snapshotRevision",
      labelKey: "xlsx_manifest_revision",
      value: String(layout.snapshotVersion),
    },
    {
      field: "snapshotHash",
      labelKey: "xlsx_manifest_hash",
      value: layout.snapshotHash,
    },
    {
      field: "planHash",
      labelKey: "xlsx_manifest_plan_hash",
      value: layout.planHash,
    },
    {
      field: "presetKey",
      labelKey: "xlsx_manifest_preset",
      value: layout.presetKey,
    },
    { field: "locale", labelKey: "xlsx_manifest_locale", value: locale },
    {
      field: "generatedAt",
      labelKey: "xlsx_manifest_timestamp",
      value: generatedAt,
    },
  ];

  return Object.freeze(
    entries.map((entry) =>
      Object.freeze({
        field: entry.field,
        label: pair(entry.labelKey),
        value: entry.value,
      }),
    ),
  );
}

function manifestSheet(
  layout: CompiledProposalLayout,
  locale: ProposalWorkbookLocale,
  direction: ProposalWorkbookDirection,
  generatedAt: string,
  name: string,
  notRepresentableRows: readonly ProposalWorkbookManifestBlockRow[],
): ProposalWorkbookManifestSheet {
  const metadataColumns = Object.freeze([
    column(MANIFEST_COLUMN_KEYS.field, "xlsx_manifest_field"),
    column(MANIFEST_COLUMN_KEYS.value, "xlsx_manifest_value"),
  ]);
  const blockColumns = Object.freeze([
    column(MANIFEST_COLUMN_KEYS.moduleKey, "xlsx_manifest_module_key"),
    column(MANIFEST_COLUMN_KEYS.blockKey, "xlsx_manifest_block_key"),
    column(MANIFEST_COLUMN_KEYS.blockType, "xlsx_manifest_block_type"),
    column(MANIFEST_COLUMN_KEYS.markerAr, "xlsx_manifest_marker_ar"),
    column(MANIFEST_COLUMN_KEYS.markerEn, "xlsx_manifest_marker_en"),
  ]);

  return Object.freeze({
    kind: "MANIFEST" as const,
    name,
    direction,
    title: pair("xlsx_sheet_manifest"),
    metadataColumns,
    metadataHeaderRows: headerRows(metadataColumns),
    metadata: manifestMetadata(layout, locale, generatedAt),
    notRepresentableTitle: pair("xlsx_manifest_not_representable"),
    notRepresentableColumns: blockColumns,
    notRepresentableHeaderRows: headerRows(blockColumns),
    notRepresentableRows,
  });
}

// ── Compiler ─────────────────────────────────────────────────────────────────

function snapshotBlockIndex(
  snapshot: ProposalSnapshot,
): ReadonlyMap<ProposalModuleKey, ReadonlyMap<string, ProposalBlock>> {
  const index = new Map<ProposalModuleKey, Map<string, ProposalBlock>>();
  for (const snapshotModule of snapshot.modules) {
    const blocks = index.get(snapshotModule.key) ?? new Map<string, ProposalBlock>();
    for (const block of snapshotModule.blocks) {
      if (!blocks.has(block.key)) blocks.set(block.key, block);
    }
    index.set(snapshotModule.key, blocks);
  }
  return index;
}

function moduleTitles(
  snapshot: ProposalSnapshot,
): ReadonlyMap<ProposalModuleKey, LocalizedProposalText> {
  const titles = new Map<ProposalModuleKey, LocalizedProposalText>();
  for (const snapshotModule of snapshot.modules) {
    if (!titles.has(snapshotModule.key)) {
      titles.set(snapshotModule.key, snapshotModule.title);
    }
  }
  return titles;
}

/**
 * Compile one deterministic, manifest-first workbook plan.
 *
 * The function is total for well-typed input: it either returns a READY plan or
 * a BLOCKED result carrying sorted bilingual diagnostics. It throws only for a
 * caller programming error, namely a non-finite `generatedAt`.
 */
export function compileProposalWorkbookPlan(
  snapshot: ProposalSnapshot,
  options: CompileProposalWorkbookPlanOptions,
): CompileProposalWorkbookPlanResult {
  const { layout, locale } = options;
  if (Number.isNaN(options.generatedAt.getTime())) {
    throw new TypeError(
      "compileProposalWorkbookPlan requires a valid generatedAt instant.",
    );
  }

  const diagnostics: ProposalWorkbookDiagnostic[] = [];
  const direction: ProposalWorkbookDirection = locale === "ar" ? "rtl" : "ltr";
  const marker = pair("xlsx_not_available");
  const notRepresentableMarker = pair("xlsx_not_representable_marker");

  if (layout.channel !== "XLSX") {
    diagnostics.push(
      planDiagnostic(
        "UNSUPPORTED_EXPORT_CHANNEL",
        "layout.channel",
        pair("xlsx_export_blocked"),
      ),
    );
  }
  // Requirement 8.6: an invalid snapshot yields no worksheet and no plan. The
  // compiled diagnostics are surfaced unchanged so the export gate can report
  // each failed check with its channel, block key, and field.
  if (layout.status !== "VALID") {
    for (const compiled of layout.diagnostics) {
      diagnostics.push(
        Object.freeze({
          severity: "ERROR" as const,
          code: "INVALID_SNAPSHOT" as const,
          channel: "XLSX" as const,
          blockKey: blockKeyFromPath(compiled.path),
          field: compiled.path,
          path: compiled.path,
          message: Object.freeze({
            ar: compiled.message.ar,
            en: compiled.message.en,
          }),
        }),
      );
    }
  }

  if (diagnostics.length > 0) {
    return Object.freeze({
      status: "BLOCKED" as const,
      plan: null,
      diagnostics: sortDiagnostics(diagnostics),
    });
  }

  const blocksByModule = snapshotBlockIndex(snapshot);
  const titles = moduleTitles(snapshot);
  const allocator = new WorkbookSheetNameAllocator();
  // The manifest claims its name first so it always occupies sheet 1 and no
  // block key can take it (Requirement 8.4).
  const manifestName = allocator.allocate(
    translate("xlsx_sheet_manifest", locale),
    [translate("xlsx_sheet_manifest", locale === "ar" ? "en" : "ar")],
  );

  const blockSheets: ProposalWorkbookBlockSheet[] = [];
  const notRepresentableRows: ProposalWorkbookManifestBlockRow[] = [];

  for (const compiledModule of layout.modules) {
    const moduleBlocks = blocksByModule.get(compiledModule.key);
    const moduleTitle =
      titles.get(compiledModule.key) ?? compiledModule.title;

    for (const compiledBlock of compiledModule.blocks) {
      const block = moduleBlocks?.get(compiledBlock.key);
      if (!block) continue;

      if (isXlsxRepresentableBlock(block)) {
        const sheetName = allocator.allocate(block.key, [
          interpolatedPair("xlsx_sheet_block_fallback", {
            index: blockSheets.length + 1,
          })[locale],
        ]);
        blockSheets.push(
          blockSheet(
            block,
            {
              moduleKey: compiledModule.key,
              moduleTitle,
              direction,
              marker,
              sheetName,
            },
            diagnostics,
          ),
        );
        continue;
      }

      // Narrative, bullet-list, and diagram blocks — and any block type added
      // to the vocabulary later — are recorded in the manifest, never as a
      // worksheet (Requirement 8.5).
      notRepresentableRows.push(
        Object.freeze({
          moduleKey: compiledModule.key,
          blockKey: block.key,
          blockType: block.type,
          blockTypeLabel: blockTypeLabel(block.type),
          notRepresentable: notRepresentableMarker,
        }),
      );
    }
  }

  if (diagnostics.length > 0) {
    return Object.freeze({
      status: "BLOCKED" as const,
      plan: null,
      diagnostics: sortDiagnostics(diagnostics),
    });
  }

  const manifest = manifestSheet(
    layout,
    locale,
    direction,
    options.generatedAt.toISOString(),
    manifestName,
    Object.freeze(notRepresentableRows),
  );
  const frozenBlockSheets: readonly ProposalWorkbookBlockSheet[] =
    Object.freeze([...blockSheets]);
  const sheets: readonly ProposalWorkbookSheet[] = Object.freeze([
    manifest,
    ...frozenBlockSheets,
  ]);

  return Object.freeze({
    status: "READY" as const,
    plan: Object.freeze({
      schemaVersion: 1 as const,
      channel: "XLSX" as const,
      locale,
      direction,
      presetKey: layout.presetKey,
      snapshotId: layout.snapshotId,
      snapshotVersion: layout.snapshotVersion,
      snapshotHash: layout.snapshotHash,
      planHash: layout.planHash,
      generatedAt: options.generatedAt.toISOString(),
      notAvailableMarker: marker,
      notRepresentableMarker,
      sheets,
      manifest,
      blockSheets: frozenBlockSheets,
    }),
    diagnostics: Object.freeze([]),
  });
}
