/**
 * Deterministic, print-safe document tables and charts.
 *
 * This module intentionally accepts structured data only. Every authored string
 * is emitted as escaped text, colors and identifiers use strict allow-lists,
 * and no renderer performs network access or evaluates authored code.
 */

import { designTokens } from "./design-tokens";

export type DocumentVisualizationLocale = "ar" | "en";
export type DocumentDirection = "rtl" | "ltr";

export interface BilingualLabel {
  readonly ar: string;
  readonly en: string;
}

export type DocumentCellValue = string | number | boolean | null;

export interface DocumentNumberFormatOptions {
  readonly minimumFractionDigits?: number;
  readonly maximumFractionDigits?: number;
  readonly useGrouping?: boolean;
}

export type DocumentNumberFormat =
  | ({
      readonly style: "number" | "integer" | "percent";
    } & DocumentNumberFormatOptions)
  | ({
      readonly style: "currency";
      readonly currency: string;
    } & DocumentNumberFormatOptions);

interface BaseTableColumn {
  readonly id: string;
  readonly label: BilingualLabel;
  /** Relative width hint used by the orientation recommendation algorithm. */
  readonly widthWeight?: number;
}

export type DocumentTableColumn =
  | (BaseTableColumn & {
      readonly kind: "text";
    })
  | (BaseTableColumn & {
      readonly kind: "number";
      readonly format?: DocumentNumberFormat;
    })
  | (BaseTableColumn & {
      readonly kind: "boolean";
      readonly trueLabel?: BilingualLabel;
      readonly falseLabel?: BilingualLabel;
    });

export interface DocumentTableRow {
  readonly id?: string;
  readonly cells: Readonly<Record<string, DocumentCellValue>>;
}

export interface DocumentTableDefinition {
  readonly id: string;
  readonly title: BilingualLabel;
  readonly summary?: BilingualLabel;
  readonly columns: readonly DocumentTableColumn[];
  readonly rows: readonly DocumentTableRow[];
}

export interface PrepareDocumentTableOptions {
  readonly locale?: DocumentVisualizationLocale;
  readonly rowsPerPage?: number;
}

export interface PreparedTableHeader {
  readonly id: string;
  readonly label: BilingualLabel;
  readonly displayLabel: string;
  readonly kind: DocumentTableColumn["kind"];
}

export interface PreparedTableCell {
  readonly columnId: string;
  readonly rawValue: DocumentCellValue;
  readonly formattedValue: string;
}

export interface PreparedTableRow {
  readonly id: string;
  readonly cells: readonly PreparedTableCell[];
}

export interface PreparedTablePage {
  readonly pageNumber: number;
  readonly pageCount: number;
  /** Repeated for every deterministic row chunk. */
  readonly headers: readonly PreparedTableHeader[];
  readonly rows: readonly PreparedTableRow[];
}

export interface PreparedDocumentTable {
  readonly id: string;
  readonly title: BilingualLabel;
  readonly summary?: BilingualLabel;
  readonly locale: DocumentVisualizationLocale;
  readonly direction: DocumentDirection;
  readonly headers: readonly PreparedTableHeader[];
  readonly pages: readonly PreparedTablePage[];
  readonly totalRows: number;
  readonly estimatedWidthUnits: number;
  readonly recommendedOrientation: "portrait" | "landscape";
  readonly orientationReasons: readonly (
    | "column-count"
    | "estimated-width"
    | "long-bilingual-header"
  )[];
}

export interface RenderedDocumentTable {
  readonly html: string;
  readonly prepared: PreparedDocumentTable;
}

export const CHART_PATTERN_KEYS = [
  "solid",
  "diagonal",
  "crosshatch",
  "dots",
  "horizontal",
  "vertical",
  "grid",
  "dense-diagonal",
] as const;

export type ChartPatternKey = (typeof CHART_PATTERN_KEYS)[number];
export type DocumentChartType = "bar" | "line" | "pie";
export type DocumentChartAxis = "categorical" | "chronological";

export interface DocumentChartCategory {
  readonly id: string;
  readonly label: BilingualLabel;
  /**
   * Required for chronological axes. Smaller values are rendered first from
   * physical left to right in both LTR and RTL documents.
   */
  readonly chronology?: number;
}

export interface DocumentChartSeries {
  readonly id: string;
  readonly label: BilingualLabel;
  readonly values: readonly number[];
  /** Strict six-digit hexadecimal color. */
  readonly color?: string;
  /** Non-color visual key. Automatically assigned when omitted. */
  readonly pattern?: ChartPatternKey;
}

export interface DocumentChartDefinition {
  readonly id: string;
  readonly type: DocumentChartType;
  readonly title: BilingualLabel;
  readonly summary: BilingualLabel;
  readonly categories: readonly DocumentChartCategory[];
  readonly series: readonly DocumentChartSeries[];
  readonly categoryAxis?: DocumentChartAxis;
  readonly valueFormat?: DocumentNumberFormat;
}

export interface RenderDocumentChartOptions {
  readonly locale?: DocumentVisualizationLocale;
  readonly direction?: DocumentDirection;
  readonly width?: number;
  readonly height?: number;
}

export interface RenderedDocumentChart {
  readonly svg: string;
  readonly dataTableHtml: string;
  readonly html: string;
  readonly altText: string;
  readonly locale: DocumentVisualizationLocale;
  readonly direction: DocumentDirection;
  readonly visualCategoryOrder: readonly string[];
  readonly axisOrder: "categorical-ltr" | "categorical-rtl" | "chronological-ltr";
}

export const DOCUMENT_VISUALIZATION_LIMITS = Object.freeze({
  maxIdentifierLength: 64,
  maxLabelLength: 500,
  maxTableColumns: 20,
  maxTableRows: 5_000,
  maxRowsPerPage: 100,
  maxChartCategories: 60,
  maxPieCategories: CHART_PATTERN_KEYS.length,
  maxChartSeries: CHART_PATTERN_KEYS.length,
  maxChartDataPoints: 480,
  maxAbsoluteValue: 1_000_000_000_000,
});

export type DocumentVisualizationErrorCode =
  | "INVALID_INPUT"
  | "LIMIT_EXCEEDED";

export class DocumentVisualizationError extends Error {
  readonly code: DocumentVisualizationErrorCode;
  readonly path: string;

  constructor(
    code: DocumentVisualizationErrorCode,
    path: string,
    message: string
  ) {
    super(`${path}: ${message}`);
    this.name = "DocumentVisualizationError";
    this.code = code;
    this.path = path;
  }
}

const SAFE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const SAFE_COLOR = /^#[0-9A-Fa-f]{6}$/;
const SAFE_CURRENCY = /^[A-Z]{3}$/;
const DEFAULT_ROWS_PER_PAGE = 28;
const LANDSCAPE_COLUMN_COUNT = 7;
const LANDSCAPE_WIDTH_UNITS = 12;
const LONG_HEADER_TOTAL = 100;
const EMPTY_CELL = "—";
const DEFAULT_BOOLEAN_LABELS = {
  true: { ar: "نعم", en: "Yes" },
  false: { ar: "لا", en: "No" },
} as const satisfies Record<"true" | "false", BilingualLabel>;

const DEFAULT_CHART_COLORS = [
  designTokens.colors.primary[700],
  designTokens.colors.accent[700],
  designTokens.colors.secondary[700],
  designTokens.colors.semantic.info,
  designTokens.colors.semantic.success,
  designTokens.colors.semantic.warning,
  designTokens.colors.primary[500],
  designTokens.colors.secondary[500],
] as const;

const LINE_DASH_PATTERNS = [
  "",
  "10 4",
  "3 3",
  "10 3 2 3",
  "2 5",
  "14 4",
  "7 3 1 3",
  "1 3",
] as const;

type NormalizedTableColumn = DocumentTableColumn & {
  readonly id: string;
  readonly label: BilingualLabel;
  readonly widthWeight: number;
};

type NormalizedChartCategory = DocumentChartCategory & {
  readonly id: string;
  readonly label: BilingualLabel;
};

type NormalizedChartSeries = DocumentChartSeries & {
  readonly id: string;
  readonly label: BilingualLabel;
  readonly color: string;
  readonly pattern: ChartPatternKey;
};

interface NormalizedChart {
  readonly id: string;
  readonly type: DocumentChartType;
  readonly title: BilingualLabel;
  readonly summary: BilingualLabel;
  readonly categories: readonly NormalizedChartCategory[];
  readonly series: readonly NormalizedChartSeries[];
  readonly categoryAxis: DocumentChartAxis;
  readonly valueFormat: DocumentNumberFormat;
}

function invalid(path: string, message: string): never {
  throw new DocumentVisualizationError("INVALID_INPUT", path, message);
}

function limit(path: string, message: string): never {
  throw new DocumentVisualizationError("LIMIT_EXCEEDED", path, message);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(
  value: unknown,
  path: string
): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) invalid(path, "must be a structured object");
  return value;
}

function requireArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) invalid(path, "must be an array");
  return value;
}

function normalizeId(value: unknown, path: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    invalid(
      path,
      "must start with a letter and contain only letters, numbers, '_' or '-'"
    );
  }
  return value;
}

function normalizeLabel(value: unknown, path: string): BilingualLabel {
  const record = requireRecord(value, path);
  const ar = normalizeLabelText(record.ar, `${path}.ar`);
  const en = normalizeLabelText(record.en, `${path}.en`);
  return Object.freeze({ ar, en });
}

function normalizeLabelText(value: unknown, path: string): string {
  if (typeof value !== "string") invalid(path, "must be a string");
  const normalized = value.trim();
  if (!normalized) invalid(path, "must not be blank");
  if (normalized.length > DOCUMENT_VISUALIZATION_LIMITS.maxLabelLength) {
    limit(
      path,
      `must not exceed ${DOCUMENT_VISUALIZATION_LIMITS.maxLabelLength} characters`
    );
  }
  return normalized;
}

function assertLocale(value: unknown, path: string): DocumentVisualizationLocale {
  if (value !== "ar" && value !== "en") {
    invalid(path, "must be 'ar' or 'en'");
  }
  return value;
}

function assertDirection(value: unknown, path: string): DocumentDirection {
  if (value !== "rtl" && value !== "ltr") {
    invalid(path, "must be 'rtl' or 'ltr'");
  }
  return value;
}

function normalizeBoundedInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    invalid(path, `must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function normalizePositiveNumber(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    invalid(path, `must be a finite number between ${minimum} and ${maximum}`);
  }
  return value;
}

function normalizeNumberFormat(
  value: unknown,
  path: string,
  fallback: DocumentNumberFormat = { style: "number" }
): DocumentNumberFormat {
  if (value === undefined) return fallback;
  const record = requireRecord(value, path);
  const style = record.style;
  if (
    style !== "number" &&
    style !== "integer" &&
    style !== "currency" &&
    style !== "percent"
  ) {
    invalid(`${path}.style`, "must be number, integer, currency, or percent");
  }

  const minimumFractionDigits =
    record.minimumFractionDigits === undefined
      ? undefined
      : normalizeBoundedInteger(
          record.minimumFractionDigits,
          `${path}.minimumFractionDigits`,
          0,
          6
        );
  const maximumFractionDigits =
    record.maximumFractionDigits === undefined
      ? undefined
      : normalizeBoundedInteger(
          record.maximumFractionDigits,
          `${path}.maximumFractionDigits`,
          0,
          6
        );
  if (
    minimumFractionDigits !== undefined &&
    maximumFractionDigits !== undefined &&
    minimumFractionDigits > maximumFractionDigits
  ) {
    invalid(
      path,
      "minimumFractionDigits must not exceed maximumFractionDigits"
    );
  }
  if (
    record.useGrouping !== undefined &&
    typeof record.useGrouping !== "boolean"
  ) {
    invalid(`${path}.useGrouping`, "must be a boolean");
  }

  const common = {
    ...(minimumFractionDigits === undefined
      ? {}
      : { minimumFractionDigits }),
    ...(maximumFractionDigits === undefined
      ? {}
      : { maximumFractionDigits }),
    ...(record.useGrouping === undefined
      ? {}
      : { useGrouping: record.useGrouping }),
  };

  if (style === "currency") {
    if (
      typeof record.currency !== "string" ||
      !SAFE_CURRENCY.test(record.currency)
    ) {
      invalid(`${path}.currency`, "must be an uppercase ISO 4217 code");
    }
    try {
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: record.currency,
      });
    } catch {
      invalid(`${path}.currency`, "is not supported by Intl.NumberFormat");
    }
    return Object.freeze({
      style,
      currency: record.currency,
      ...common,
    });
  }

  if (record.currency !== undefined) {
    invalid(`${path}.currency`, "is only allowed for currency formatting");
  }
  return Object.freeze({ style, ...common });
}

function normalizeFiniteValue(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalid(path, "must be a finite number");
  }
  if (
    Math.abs(value) > DOCUMENT_VISUALIZATION_LIMITS.maxAbsoluteValue
  ) {
    limit(
      path,
      `absolute value must not exceed ${DOCUMENT_VISUALIZATION_LIMITS.maxAbsoluteValue}`
    );
  }
  return value;
}

function getLocaleCode(locale: DocumentVisualizationLocale): string {
  return locale === "ar" ? "ar-SA-u-nu-arab" : "en-US-u-nu-latn";
}

/**
 * Format a finite number with explicit document locale and format semantics.
 */
export function formatDocumentNumber(
  value: number,
  locale: DocumentVisualizationLocale,
  format: DocumentNumberFormat = { style: "number" }
): string {
  normalizeFiniteValue(value, "value");
  const checkedLocale = assertLocale(locale, "locale");
  const checkedFormat = normalizeNumberFormat(format, "format");
  const options: Intl.NumberFormatOptions = {
    useGrouping: checkedFormat.useGrouping ?? true,
    ...(checkedFormat.minimumFractionDigits === undefined
      ? {}
      : { minimumFractionDigits: checkedFormat.minimumFractionDigits }),
    ...(checkedFormat.maximumFractionDigits === undefined
      ? {}
      : { maximumFractionDigits: checkedFormat.maximumFractionDigits }),
  };

  switch (checkedFormat.style) {
    case "integer":
      options.minimumFractionDigits = 0;
      options.maximumFractionDigits = 0;
      break;
    case "percent":
      options.style = "percent";
      break;
    case "currency":
      options.style = "currency";
      options.currency = checkedFormat.currency;
      break;
    case "number":
      break;
    default:
      assertNever(checkedFormat);
  }

  return new Intl.NumberFormat(getLocaleCode(checkedLocale), options)
    .format(value)
    .replace(
      /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u206f]/gu,
      ""
    );
}

function normalizeTableColumn(
  value: unknown,
  index: number
): NormalizedTableColumn {
  const path = `table.columns[${index}]`;
  const record = requireRecord(value, path);
  const id = normalizeId(record.id, `${path}.id`);
  const label = normalizeLabel(record.label, `${path}.label`);
  const kind = record.kind;
  if (kind !== "text" && kind !== "number" && kind !== "boolean") {
    invalid(`${path}.kind`, "must be text, number, or boolean");
  }
  const defaultWidth = kind === "text" ? 2.4 : kind === "number" ? 1.35 : 1;
  const widthWeight =
    record.widthWeight === undefined
      ? defaultWidth
      : normalizePositiveNumber(
          record.widthWeight,
          `${path}.widthWeight`,
          0.5,
          6
        );

  if (kind === "text") {
    if (record.format !== undefined) {
      invalid(`${path}.format`, "is only allowed for number columns");
    }
    return Object.freeze({ id, label, kind, widthWeight });
  }
  if (kind === "number") {
    const format = normalizeNumberFormat(record.format, `${path}.format`);
    return Object.freeze({ id, label, kind, widthWeight, format });
  }

  const trueLabel =
    record.trueLabel === undefined
      ? DEFAULT_BOOLEAN_LABELS.true
      : normalizeLabel(record.trueLabel, `${path}.trueLabel`);
  const falseLabel =
    record.falseLabel === undefined
      ? DEFAULT_BOOLEAN_LABELS.false
      : normalizeLabel(record.falseLabel, `${path}.falseLabel`);
  return Object.freeze({
    id,
    label,
    kind,
    widthWeight,
    trueLabel,
    falseLabel,
  });
}

function normalizeCell(
  value: unknown,
  column: NormalizedTableColumn,
  path: string
): DocumentCellValue {
  if (value === null) return null;
  switch (column.kind) {
    case "text":
      if (typeof value !== "string") invalid(path, "must be a string or null");
      if (value.length > DOCUMENT_VISUALIZATION_LIMITS.maxLabelLength) {
        limit(
          path,
          `must not exceed ${DOCUMENT_VISUALIZATION_LIMITS.maxLabelLength} characters`
        );
      }
      return value;
    case "number":
      return normalizeFiniteValue(value, path);
    case "boolean":
      if (typeof value !== "boolean") {
        invalid(path, "must be a boolean or null");
      }
      return value;
    default:
      return assertNever(column);
  }
}

function formatTableCell(
  value: DocumentCellValue,
  column: NormalizedTableColumn,
  locale: DocumentVisualizationLocale
): string {
  if (value === null) return EMPTY_CELL;
  switch (column.kind) {
    case "text":
      return value as string;
    case "number":
      return formatDocumentNumber(
        value as number,
        locale,
        column.format ?? { style: "number" }
      );
    case "boolean":
      return value
        ? (column.trueLabel ?? DEFAULT_BOOLEAN_LABELS.true)[locale]
        : (column.falseLabel ?? DEFAULT_BOOLEAN_LABELS.false)[locale];
    default:
      return assertNever(column);
  }
}

function deriveOrientation(
  columns: readonly NormalizedTableColumn[]
): Pick<
  PreparedDocumentTable,
  "estimatedWidthUnits" | "recommendedOrientation" | "orientationReasons"
> {
  const estimatedWidthUnits = round(
    columns.reduce((total, column) => total + column.widthWeight, 0)
  );
  const reasons: Array<
    "column-count" | "estimated-width" | "long-bilingual-header"
  > = [];
  if (columns.length >= LANDSCAPE_COLUMN_COUNT) reasons.push("column-count");
  if (estimatedWidthUnits > LANDSCAPE_WIDTH_UNITS) {
    reasons.push("estimated-width");
  }
  const headerLength = columns.reduce(
    (total, column) => total + column.label.ar.length + column.label.en.length,
    0
  );
  if (headerLength > LONG_HEADER_TOTAL) reasons.push("long-bilingual-header");
  return Object.freeze({
    estimatedWidthUnits,
    recommendedOrientation: reasons.length ? "landscape" : "portrait",
    orientationReasons: Object.freeze(reasons),
  });
}

/**
 * Validate, format, and chunk a structured document table.
 *
 * Every page receives an explicit header model so HTML/PDF consumers can repeat
 * headers without relying on browser-specific table pagination behavior.
 */
export function prepareDocumentTable(
  input: DocumentTableDefinition,
  options: PrepareDocumentTableOptions = {}
): PreparedDocumentTable {
  const table = requireRecord(input, "table");
  const id = normalizeId(table.id, "table.id");
  const title = normalizeLabel(table.title, "table.title");
  const summary =
    table.summary === undefined
      ? undefined
      : normalizeLabel(table.summary, "table.summary");
  const locale = assertLocale(options.locale ?? "en", "options.locale");
  const direction: DocumentDirection = locale === "ar" ? "rtl" : "ltr";
  const rowsPerPage =
    options.rowsPerPage === undefined
      ? DEFAULT_ROWS_PER_PAGE
      : normalizeBoundedInteger(
          options.rowsPerPage,
          "options.rowsPerPage",
          1,
          DOCUMENT_VISUALIZATION_LIMITS.maxRowsPerPage
        );

  const columnValues = requireArray(table.columns, "table.columns");
  if (columnValues.length === 0) invalid("table.columns", "must not be empty");
  if (
    columnValues.length > DOCUMENT_VISUALIZATION_LIMITS.maxTableColumns
  ) {
    limit(
      "table.columns",
      `must not exceed ${DOCUMENT_VISUALIZATION_LIMITS.maxTableColumns} columns`
    );
  }
  const columns = columnValues.map(normalizeTableColumn);
  assertUnique(
    columns.map((column) => column.id),
    "table.columns",
    "column id"
  );
  const columnIds = new Set(columns.map((column) => column.id));

  const rowValues = requireArray(table.rows, "table.rows");
  if (rowValues.length > DOCUMENT_VISUALIZATION_LIMITS.maxTableRows) {
    limit(
      "table.rows",
      `must not exceed ${DOCUMENT_VISUALIZATION_LIMITS.maxTableRows} rows`
    );
  }

  const preparedRows = rowValues.map((value, rowIndex): PreparedTableRow => {
    const path = `table.rows[${rowIndex}]`;
    const row = requireRecord(value, path);
    const id =
      row.id === undefined
        ? `row-${rowIndex + 1}`
        : normalizeId(row.id, `${path}.id`);
    const cells = requireRecord(row.cells, `${path}.cells`);
    const cellKeys = Object.keys(cells);
    for (const key of cellKeys) {
      if (!columnIds.has(key)) {
        invalid(`${path}.cells`, `contains unknown column '${key}'`);
      }
    }
    for (const column of columns) {
      if (!Object.prototype.hasOwnProperty.call(cells, column.id)) {
        invalid(`${path}.cells.${column.id}`, "is required");
      }
    }
    const preparedCells = columns.map((column): PreparedTableCell => {
      const rawValue = normalizeCell(
        cells[column.id],
        column,
        `${path}.cells.${column.id}`
      );
      return Object.freeze({
        columnId: column.id,
        rawValue,
        formattedValue: formatTableCell(rawValue, column, locale),
      });
    });
    return Object.freeze({ id, cells: Object.freeze(preparedCells) });
  });
  assertUnique(
    preparedRows.map((row) => row.id),
    "table.rows",
    "row id"
  );

  const headers = Object.freeze(
    columns.map(
      (column): PreparedTableHeader =>
        Object.freeze({
          id: column.id,
          label: column.label,
          displayLabel: column.label[locale],
          kind: column.kind,
        })
    )
  );
  const pageCount = Math.max(1, Math.ceil(preparedRows.length / rowsPerPage));
  const pages = Object.freeze(
    Array.from({ length: pageCount }, (_, pageIndex): PreparedTablePage => {
      const start = pageIndex * rowsPerPage;
      return Object.freeze({
        pageNumber: pageIndex + 1,
        pageCount,
        headers,
        rows: Object.freeze(preparedRows.slice(start, start + rowsPerPage)),
      });
    })
  );
  const orientation = deriveOrientation(columns);

  return Object.freeze({
    id,
    title,
    ...(summary === undefined ? {} : { summary }),
    locale,
    direction,
    headers,
    pages,
    totalRows: preparedRows.length,
    ...orientation,
  });
}

/**
 * Render a validated document table as escaped, accessible HTML.
 */
export function renderDocumentTable(
  input: DocumentTableDefinition,
  options: PrepareDocumentTableOptions = {}
): RenderedDocumentTable {
  const prepared = prepareDocumentTable(input, options);
  const caption = bilingualInline(prepared.title);
  const summary = prepared.summary
    ? `<p class="document-table-summary">${bilingualInline(
        prepared.summary
      )}</p>`
    : "";
  const pages = prepared.pages
    .map((page) => {
      const headerHtml = page.headers
        .map(
          (header) =>
            `<th scope="col" data-column-id="${escapeAttribute(
              header.id
            )}">${bilingualInline(header.label)}</th>`
        )
        .join("");
      const rowsHtml =
        page.rows.length === 0
          ? `<tr><td colspan="${page.headers.length}" class="document-table-empty">${escapeText(
              prepared.locale === "ar" ? "لا توجد بيانات" : "No data"
            )}</td></tr>`
          : page.rows
              .map(
                (row) =>
                  `<tr data-row-id="${escapeAttribute(row.id)}">${row.cells
                    .map((cell, cellIndex) => {
                      const header = page.headers[cellIndex];
                      const tag = cellIndex === 0 ? "th" : "td";
                      const scope = cellIndex === 0 ? ` scope="row"` : "";
                      const numeric =
                        header?.kind === "number"
                          ? ` data-value-kind="number"`
                          : "";
                      return `<${tag}${scope}${numeric} data-column-id="${escapeAttribute(
                        cell.columnId
                      )}"><bdi dir="auto">${escapeText(
                        cell.formattedValue
                      )}</bdi></${tag}>`;
                    })
                    .join("")}</tr>`
              )
              .join("");
      return `<section class="document-table-page" data-table-id="${escapeAttribute(
        prepared.id
      )}" data-page="${page.pageNumber}" data-page-count="${
        page.pageCount
      }" data-recommended-orientation="${
        prepared.recommendedOrientation
      }" lang="${prepared.locale}" dir="${prepared.direction}">
<table>
<caption>${caption}</caption>
<thead><tr>${headerHtml}</tr></thead>
<tbody>${rowsHtml}</tbody>
</table>
</section>`;
    })
    .join("");

  return Object.freeze({
    prepared,
    html: `<div class="document-table" data-table-id="${escapeAttribute(
      prepared.id
    )}" lang="${prepared.locale}" dir="${prepared.direction}" style="--document-table-border:${escapeAttribute(
      designTokens.colors.secondary[200]
    )};--document-table-heading:${escapeAttribute(
      designTokens.colors.secondary[900]
    )};--document-table-font:${escapeAttribute(
      prepared.locale === "ar"
        ? designTokens.typography.fontFamilies.arabic
        : designTokens.typography.fontFamilies.english
    )};">${summary}${pages}</div>`,
  });
}

function normalizeChart(input: DocumentChartDefinition): NormalizedChart {
  const chart = requireRecord(input, "chart");
  const id = normalizeId(chart.id, "chart.id");
  if (
    chart.type !== "bar" &&
    chart.type !== "line" &&
    chart.type !== "pie"
  ) {
    invalid("chart.type", "must be bar, line, or pie");
  }
  const type = chart.type;
  const title = normalizeLabel(chart.title, "chart.title");
  const summary = normalizeLabel(chart.summary, "chart.summary");
  const categoryAxis = chart.categoryAxis ?? "categorical";
  if (
    categoryAxis !== "categorical" &&
    categoryAxis !== "chronological"
  ) {
    invalid(
      "chart.categoryAxis",
      "must be categorical or chronological"
    );
  }
  if (type === "pie" && categoryAxis === "chronological") {
    invalid(
      "chart.categoryAxis",
      "pie charts do not support chronological axes"
    );
  }

  const categoryValues = requireArray(chart.categories, "chart.categories");
  if (categoryValues.length === 0) {
    invalid("chart.categories", "must not be empty");
  }
  if (
    categoryValues.length >
    DOCUMENT_VISUALIZATION_LIMITS.maxChartCategories
  ) {
    limit(
      "chart.categories",
      `must not exceed ${DOCUMENT_VISUALIZATION_LIMITS.maxChartCategories} categories`
    );
  }
  if (
    type === "pie" &&
    categoryValues.length >
      DOCUMENT_VISUALIZATION_LIMITS.maxPieCategories
  ) {
    limit(
      "chart.categories",
      `pie charts must not exceed ${DOCUMENT_VISUALIZATION_LIMITS.maxPieCategories} categories`
    );
  }
  const categories = categoryValues.map(
    (value, index): NormalizedChartCategory => {
      const path = `chart.categories[${index}]`;
      const record = requireRecord(value, path);
      const normalized: NormalizedChartCategory = Object.freeze({
        id: normalizeId(record.id, `${path}.id`),
        label: normalizeLabel(record.label, `${path}.label`),
        ...(record.chronology === undefined
          ? {}
          : {
              chronology: normalizeFiniteValue(
                record.chronology,
                `${path}.chronology`
              ),
            }),
      });
      if (
        categoryAxis === "chronological" &&
        normalized.chronology === undefined
      ) {
        invalid(
          `${path}.chronology`,
          "is required for a chronological axis"
        );
      }
      return normalized;
    }
  );
  assertUnique(
    categories.map((category) => category.id),
    "chart.categories",
    "category id"
  );
  if (categoryAxis === "chronological") {
    assertUnique(
      categories.map((category) => String(category.chronology)),
      "chart.categories",
      "chronology value"
    );
  }

  const seriesValues = requireArray(chart.series, "chart.series");
  if (seriesValues.length === 0) invalid("chart.series", "must not be empty");
  if (
    seriesValues.length > DOCUMENT_VISUALIZATION_LIMITS.maxChartSeries
  ) {
    limit(
      "chart.series",
      `must not exceed ${DOCUMENT_VISUALIZATION_LIMITS.maxChartSeries} series`
    );
  }
  if (type === "pie" && seriesValues.length !== 1) {
    invalid("chart.series", "pie charts require exactly one series");
  }
  if (
    seriesValues.length * categories.length >
    DOCUMENT_VISUALIZATION_LIMITS.maxChartDataPoints
  ) {
    limit(
      "chart.series",
      `chart must not exceed ${DOCUMENT_VISUALIZATION_LIMITS.maxChartDataPoints} data points`
    );
  }

  const series = seriesValues.map(
    (value, seriesIndex): NormalizedChartSeries => {
      const path = `chart.series[${seriesIndex}]`;
      const record = requireRecord(value, path);
      const values = requireArray(record.values, `${path}.values`);
      if (values.length !== categories.length) {
        invalid(
          `${path}.values`,
          `must contain exactly ${categories.length} values`
        );
      }
      const normalizedValues = Object.freeze(
        values.map((item, valueIndex) =>
          normalizeFiniteValue(item, `${path}.values[${valueIndex}]`)
        )
      );
      if (type === "pie" && normalizedValues.some((item) => item < 0)) {
        invalid(`${path}.values`, "pie values must not be negative");
      }
      const color =
        record.color === undefined
          ? DEFAULT_CHART_COLORS[seriesIndex]
          : normalizeColor(record.color, `${path}.color`);
      const pattern =
        record.pattern === undefined
          ? CHART_PATTERN_KEYS[seriesIndex]
          : normalizePattern(record.pattern, `${path}.pattern`);
      return Object.freeze({
        id: normalizeId(record.id, `${path}.id`),
        label: normalizeLabel(record.label, `${path}.label`),
        values: normalizedValues,
        color,
        pattern,
      });
    }
  );
  assertUnique(
    series.map((item) => item.id),
    "chart.series",
    "series id"
  );
  if (type !== "pie") {
    assertUnique(
      series.map((item) => item.pattern),
      "chart.series",
      "series pattern"
    );
  }
  if (
    type === "pie" &&
    series[0] &&
    series[0].values.every((value) => value === 0)
  ) {
    invalid("chart.series[0].values", "must include at least one positive value");
  }
  const valueFormat = normalizeNumberFormat(
    chart.valueFormat,
    "chart.valueFormat"
  );

  return Object.freeze({
    id,
    type,
    title,
    summary,
    categories: Object.freeze(categories),
    series: Object.freeze(series),
    categoryAxis,
    valueFormat,
  });
}

function normalizeColor(value: unknown, path: string): string {
  if (typeof value !== "string" || !SAFE_COLOR.test(value)) {
    invalid(path, "must be a six-digit hexadecimal color");
  }
  return value.toUpperCase();
}

function normalizePattern(value: unknown, path: string): ChartPatternKey {
  if (
    typeof value !== "string" ||
    !CHART_PATTERN_KEYS.includes(value as ChartPatternKey)
  ) {
    invalid(path, `must be one of ${CHART_PATTERN_KEYS.join(", ")}`);
  }
  return value as ChartPatternKey;
}

function chartCategoryOrder(
  chart: NormalizedChart,
  direction: DocumentDirection
): readonly number[] {
  const indexes = chart.categories.map((_, index) => index);
  if (chart.categoryAxis === "chronological") {
    return Object.freeze(
      indexes.sort((left, right) => {
        const leftValue = chart.categories[left]?.chronology ?? 0;
        const rightValue = chart.categories[right]?.chronology ?? 0;
        return leftValue - rightValue;
      })
    );
  }
  return Object.freeze(direction === "rtl" ? indexes.reverse() : indexes);
}

function chartAxisOrder(
  chart: NormalizedChart,
  direction: DocumentDirection
): RenderedDocumentChart["axisOrder"] {
  if (chart.categoryAxis === "chronological") return "chronological-ltr";
  return direction === "rtl" ? "categorical-rtl" : "categorical-ltr";
}

interface ChartGeometry {
  readonly width: number;
  readonly height: number;
  readonly plotLeft: number;
  readonly plotTop: number;
  readonly plotWidth: number;
  readonly plotHeight: number;
}

function makeGeometry(width: number, height: number): ChartGeometry {
  const plotLeft = 74;
  const plotTop = 72;
  const plotWidth = width - plotLeft - 32;
  const plotHeight = height - plotTop - 112;
  return Object.freeze({
    width,
    height,
    plotLeft,
    plotTop,
    plotWidth,
    plotHeight,
  });
}

function renderPatternDefinition(
  id: string,
  key: ChartPatternKey,
  color: string
): string {
  const background = escapeAttribute(color);
  const ink = escapeAttribute(designTokens.colors.secondary[900]);
  const common = `<rect width="10" height="10" fill="${background}"/>`;
  let mark = "";
  switch (key) {
    case "solid":
      mark = "";
      break;
    case "diagonal":
      mark = `<path d="M-2 10L10-2M2 12L12 2" stroke="${ink}" stroke-width="1.2" opacity=".6"/>`;
      break;
    case "crosshatch":
      mark = `<path d="M-2 10L10-2M2 12L12 2M-2 0L10 12M2-2L12 8" stroke="${ink}" stroke-width="1" opacity=".55"/>`;
      break;
    case "dots":
      mark = `<circle cx="2.5" cy="2.5" r="1.35" fill="${ink}" opacity=".65"/><circle cx="7.5" cy="7.5" r="1.35" fill="${ink}" opacity=".65"/>`;
      break;
    case "horizontal":
      mark = `<path d="M0 3H10M0 8H10" stroke="${ink}" stroke-width="1.1" opacity=".6"/>`;
      break;
    case "vertical":
      mark = `<path d="M3 0V10M8 0V10" stroke="${ink}" stroke-width="1.1" opacity=".6"/>`;
      break;
    case "grid":
      mark = `<path d="M0 3H10M0 8H10M3 0V10M8 0V10" stroke="${ink}" stroke-width=".9" opacity=".55"/>`;
      break;
    case "dense-diagonal":
      mark = `<path d="M-4 10L10-4M0 12L12 0M6 12L12 6" stroke="${ink}" stroke-width="1.5" opacity=".7"/>`;
      break;
    default:
      return assertNever(key);
  }
  return `<pattern id="${escapeAttribute(
    id
  )}" width="10" height="10" patternUnits="userSpaceOnUse">${common}${mark}</pattern>`;
}

function renderChartDefinitions(chart: NormalizedChart): string {
  if (chart.type === "pie") {
    const series = chart.series[0];
    if (!series) return "";
    return chart.categories
      .map((category, index) =>
        renderPatternDefinition(
          `${chart.id}-category-${category.id}`,
          CHART_PATTERN_KEYS[index] ?? "solid",
          index === 0
            ? series.color
            : DEFAULT_CHART_COLORS[index] ?? series.color
        )
      )
      .join("");
  }
  return chart.series
    .map((series) =>
      renderPatternDefinition(
        `${chart.id}-series-${series.id}`,
        series.pattern,
        series.color
      )
    )
    .join("");
}

interface NumericDomain {
  readonly minimum: number;
  readonly maximum: number;
  readonly span: number;
}

function numericDomain(series: readonly NormalizedChartSeries[]): NumericDomain {
  const values = series.flatMap((item) => [...item.values]);
  const rawMinimum = Math.min(0, ...values);
  const rawMaximum = Math.max(0, ...values);
  if (rawMinimum === rawMaximum) {
    return Object.freeze({
      minimum: rawMinimum,
      maximum: rawMaximum + 1,
      span: 1,
    });
  }
  return Object.freeze({
    minimum: rawMinimum,
    maximum: rawMaximum,
    span: rawMaximum - rawMinimum,
  });
}

function valueY(
  value: number,
  domain: NumericDomain,
  geometry: ChartGeometry
): number {
  return round(
    geometry.plotTop +
      ((domain.maximum - value) / domain.span) * geometry.plotHeight
  );
}

function renderAxes(
  chart: NormalizedChart,
  geometry: ChartGeometry,
  domain: NumericDomain,
  locale: DocumentVisualizationLocale
): string {
  const gridColor = designTokens.colors.secondary[200];
  const textColor = designTokens.colors.secondary[700];
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const value = domain.maximum - ratio * domain.span;
    const y = round(geometry.plotTop + ratio * geometry.plotHeight);
    return `<g aria-hidden="true"><line x1="${geometry.plotLeft}" y1="${y}" x2="${
      geometry.plotLeft + geometry.plotWidth
    }" y2="${y}" stroke="${gridColor}" stroke-width="1"/><text x="${
      geometry.plotLeft - 10
    }" y="${y + 4}" text-anchor="end" font-size="11" fill="${textColor}" direction="ltr">${escapeText(
      formatDocumentNumber(value, locale, chart.valueFormat)
    )}</text></g>`;
  }).join("");
  const baseline = valueY(0, domain, geometry);
  return `${ticks}<line aria-hidden="true" x1="${geometry.plotLeft}" y1="${baseline}" x2="${
    geometry.plotLeft + geometry.plotWidth
  }" y2="${baseline}" stroke="${
    designTokens.colors.secondary[700]
  }" stroke-width="1.5"/>`;
}

function renderCategoryLabel(
  chart: NormalizedChart,
  categoryIndex: number,
  x: number,
  geometry: ChartGeometry,
  locale: DocumentVisualizationLocale,
  direction: DocumentDirection
): string {
  const category = chart.categories[categoryIndex];
  if (!category) return "";
  return `<text aria-hidden="true" x="${round(x)}" y="${
    geometry.plotTop + geometry.plotHeight + 22
  }" text-anchor="middle" font-size="11" fill="${
    designTokens.colors.secondary[800]
  }" lang="${locale}" direction="${direction}">${escapeText(
    category.label[locale]
  )}</text>`;
}

function renderBarPlot(
  chart: NormalizedChart,
  order: readonly number[],
  geometry: ChartGeometry,
  locale: DocumentVisualizationLocale,
  direction: DocumentDirection
): string {
  const domain = numericDomain(chart.series);
  const axes = renderAxes(chart, geometry, domain, locale);
  const categoryBand = geometry.plotWidth / order.length;
  const groupWidth = categoryBand * 0.78;
  const barWidth = groupWidth / chart.series.length;
  const baseline = valueY(0, domain, geometry);
  const marks: string[] = [];
  const labels: string[] = [];

  order.forEach((categoryIndex, visualIndex) => {
    const category = chart.categories[categoryIndex];
    if (!category) return;
    const groupStart =
      geometry.plotLeft +
      visualIndex * categoryBand +
      (categoryBand - groupWidth) / 2;
    chart.series.forEach((series, seriesIndex) => {
      const value = series.values[categoryIndex] ?? 0;
      const valuePosition = valueY(value, domain, geometry);
      const y = Math.min(valuePosition, baseline);
      const height = Math.abs(baseline - valuePosition);
      const x = groupStart + seriesIndex * barWidth;
      const aria = `${series.label[locale]}, ${category.label[locale]}: ${formatDocumentNumber(
        value,
        locale,
        chart.valueFormat
      )}`;
      marks.push(
        `<g role="img" aria-label="${escapeAttribute(
          aria
        )}"><title>${escapeText(aria)}</title><rect x="${round(
          x + 1
        )}" y="${round(y)}" width="${round(
          Math.max(1, barWidth - 2)
        )}" height="${round(height)}" fill="url(#${escapeAttribute(
          `${chart.id}-series-${series.id}`
        )})" stroke="${escapeAttribute(
          designTokens.colors.secondary[900]
        )}" stroke-width=".5"/></g>`
      );
    });
    labels.push(
      renderCategoryLabel(
        chart,
        categoryIndex,
        geometry.plotLeft + visualIndex * categoryBand + categoryBand / 2,
        geometry,
        locale,
        direction
      )
    );
  });

  return `${axes}${marks.join("")}${labels.join("")}`;
}

function markerShape(
  x: number,
  y: number,
  index: number,
  color: string
): string {
  const safeColor = escapeAttribute(color);
  switch (index % 4) {
    case 0:
      return `<circle cx="${x}" cy="${y}" r="4" fill="#FFFFFF" stroke="${safeColor}" stroke-width="2"/>`;
    case 1:
      return `<rect x="${round(x - 4)}" y="${round(
        y - 4
      )}" width="8" height="8" fill="#FFFFFF" stroke="${safeColor}" stroke-width="2"/>`;
    case 2:
      return `<path d="M${x} ${round(y - 5)}L${round(
        x + 5
      )} ${y}L${x} ${round(y + 5)}L${round(
        x - 5
      )} ${y}Z" fill="#FFFFFF" stroke="${safeColor}" stroke-width="2"/>`;
    default:
      return `<path d="M${x} ${round(y - 5)}L${round(
        x + 5
      )} ${round(y + 4)}H${round(x - 5)}Z" fill="#FFFFFF" stroke="${safeColor}" stroke-width="2"/>`;
  }
}

function renderLinePlot(
  chart: NormalizedChart,
  order: readonly number[],
  geometry: ChartGeometry,
  locale: DocumentVisualizationLocale,
  direction: DocumentDirection
): string {
  const domain = numericDomain(chart.series);
  const axes = renderAxes(chart, geometry, domain, locale);
  const step =
    order.length === 1 ? 0 : geometry.plotWidth / (order.length - 1);
  const labels = order
    .map((categoryIndex, visualIndex) =>
      renderCategoryLabel(
        chart,
        categoryIndex,
        geometry.plotLeft +
          (order.length === 1 ? geometry.plotWidth / 2 : visualIndex * step),
        geometry,
        locale,
        direction
      )
    )
    .join("");
  const lines = chart.series
    .map((series) => {
      const styleIndex = CHART_PATTERN_KEYS.indexOf(series.pattern);
      const points = order.map((categoryIndex, visualIndex) => {
        const x = round(
          geometry.plotLeft +
            (order.length === 1
              ? geometry.plotWidth / 2
              : visualIndex * step)
        );
        const value = series.values[categoryIndex] ?? 0;
        return {
          x,
          y: valueY(value, domain, geometry),
          value,
          categoryIndex,
        };
      });
      const pointList = points.map((point) => `${point.x},${point.y}`).join(" ");
      const marks = points
        .map((point) => {
          const category = chart.categories[point.categoryIndex];
          if (!category) return "";
          const aria = `${series.label[locale]}, ${
            category.label[locale]
          }: ${formatDocumentNumber(
            point.value,
            locale,
            chart.valueFormat
          )}`;
          return `<g role="img" aria-label="${escapeAttribute(
            aria
          )}"><title>${escapeText(aria)}</title>${markerShape(
            point.x,
            point.y,
            styleIndex,
            series.color
          )}</g>`;
        })
        .join("");
      const dash = LINE_DASH_PATTERNS[styleIndex] ?? "";
      return `<polyline aria-hidden="true" points="${pointList}" fill="none" stroke="${escapeAttribute(
        series.color
      )}" stroke-width="3"${
        dash ? ` stroke-dasharray="${dash}"` : ""
      }/>${marks}`;
    })
    .join("");
  return `${axes}${lines}${labels}`;
}

function polarPoint(
  centerX: number,
  centerY: number,
  radius: number,
  angle: number
): { readonly x: number; readonly y: number } {
  const radians = ((angle - 90) * Math.PI) / 180;
  return Object.freeze({
    x: round(centerX + radius * Math.cos(radians)),
    y: round(centerY + radius * Math.sin(radians)),
  });
}

function piePath(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarPoint(centerX, centerY, radius, endAngle);
  const end = polarPoint(centerX, centerY, radius, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M${centerX} ${centerY}L${start.x} ${start.y}A${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}Z`;
}

function renderPiePlot(
  chart: NormalizedChart,
  order: readonly number[],
  geometry: ChartGeometry,
  locale: DocumentVisualizationLocale
): string {
  const series = chart.series[0];
  if (!series) return "";
  const total = series.values.reduce((sum, value) => sum + value, 0);
  const centerX = round(geometry.plotLeft + geometry.plotWidth * 0.38);
  const centerY = round(geometry.plotTop + geometry.plotHeight / 2);
  const radius = round(
    Math.max(45, Math.min(geometry.plotHeight, geometry.plotWidth * 0.58) / 2)
  );
  let angle = 0;
  return order
    .map((categoryIndex) => {
      const category = chart.categories[categoryIndex];
      const value = series.values[categoryIndex];
      if (!category || value === undefined || value === 0) return "";
      const sweep = (value / total) * 360;
      const aria = `${category.label[locale]}: ${formatDocumentNumber(
        value,
        locale,
        chart.valueFormat
      )}`;
      let shape: string;
      if (sweep >= 359.999) {
        shape = `<circle cx="${centerX}" cy="${centerY}" r="${radius}"`;
      } else {
        shape = `<path d="${piePath(
          centerX,
          centerY,
          radius,
          angle,
          angle + sweep
        )}"`;
      }
      angle += sweep;
      return `<g role="img" aria-label="${escapeAttribute(
        aria
      )}"><title>${escapeText(aria)}</title>${shape} fill="url(#${escapeAttribute(
        `${chart.id}-category-${category.id}`
      )})" stroke="#FFFFFF" stroke-width="2"/></g>`;
    })
    .join("");
}

function renderLegend(
  chart: NormalizedChart,
  geometry: ChartGeometry,
  locale: DocumentVisualizationLocale,
  direction: DocumentDirection
): string {
  const items: Array<{
    readonly id: string;
    readonly label: string;
    readonly color: string;
    readonly styleIndex: number;
  }> =
    chart.type === "pie"
      ? chart.categories.map((category, index) => ({
          id: `${chart.id}-category-${category.id}`,
          label: category.label[locale],
          color:
            DEFAULT_CHART_COLORS[index] ??
            chart.series[0]?.color ??
            designTokens.colors.primary[700],
          styleIndex: index,
        }))
      : chart.series.map((series) => ({
          id: `${chart.id}-series-${series.id}`,
          label: series.label[locale],
          color: series.color,
          styleIndex: CHART_PATTERN_KEYS.indexOf(series.pattern),
        }));
  const startX =
    chart.type === "pie"
      ? geometry.plotLeft + geometry.plotWidth * 0.72
      : geometry.plotLeft;
  const startY = chart.type === "pie" ? geometry.plotTop + 8 : geometry.height - 42;
  const rowHeight = 22;
  return `<g role="list" aria-label="${escapeAttribute(
    locale === "ar" ? "مفتاح الرسم البياني" : "Chart legend"
  )}" lang="${locale}" direction="${direction}">${items
    .map((item, index) => {
      const x =
        chart.type === "pie"
          ? startX
          : startX + (index % 4) * (geometry.plotWidth / 4);
      const y =
        chart.type === "pie"
          ? startY + index * rowHeight
          : startY + Math.floor(index / 4) * rowHeight;
      const swatch =
        chart.type === "line"
          ? `<g aria-hidden="true"><line x1="${round(x)}" y1="${round(
              y - 5
            )}" x2="${round(x + 14)}" y2="${round(
              y - 5
            )}" stroke="${escapeAttribute(
              item.color
            )}" stroke-width="3"${
              LINE_DASH_PATTERNS[item.styleIndex]
                ? ` stroke-dasharray="${
                    LINE_DASH_PATTERNS[item.styleIndex]
                  }"`
                : ""
            }/>${markerShape(
              round(x + 7),
              round(y - 5),
              item.styleIndex,
              item.color
            )}</g>`
          : `<rect aria-hidden="true" x="${round(x)}" y="${round(
              y - 11
            )}" width="14" height="14" fill="url(#${escapeAttribute(
              item.id
            )})" stroke="${
              designTokens.colors.secondary[900]
            }" stroke-width=".5"/>`;
      return `<g role="listitem" aria-label="${escapeAttribute(
        item.label
      )}">${swatch}<text x="${round(
        x + 20
      )}" y="${round(y)}" font-size="11" fill="${
        designTokens.colors.secondary[900]
      }">${escapeText(item.label)}</text></g>`;
    })
    .join("")}</g>`;
}

function renderChartDataTable(
  chart: NormalizedChart,
  locale: DocumentVisualizationLocale,
  direction: DocumentDirection,
  visualOrder: readonly number[]
): string {
  const headers = chart.series
    .map(
      (series) =>
        `<th scope="col">${bilingualInline(series.label)}</th>`
    )
    .join("");
  const rowOrder =
    chart.categoryAxis === "chronological"
      ? visualOrder
      : chart.categories.map((_, index) => index);
  const rows = rowOrder
    .map((categoryIndex) => {
      const category = chart.categories[categoryIndex];
      if (!category) return "";
      return (
        `<tr><th scope="row">${bilingualInline(
          category.label
        )}</th>${chart.series
          .map(
            (series) =>
              `<td><bdi dir="auto">${escapeText(
                formatDocumentNumber(
                  series.values[categoryIndex] ?? 0,
                  locale,
                  chart.valueFormat
                )
              )}</bdi></td>`
          )
          .join("")}</tr>`
      );
    })
    .join("");
  return `<table class="document-chart-data" data-chart-id="${escapeAttribute(
    chart.id
  )}" lang="${locale}" dir="${direction}">
<caption>${bilingualInline(chart.title)}</caption>
<thead><tr><th scope="col">${escapeText(
    locale === "ar" ? "الفئة" : "Category"
  )}</th>${headers}</tr></thead>
<tbody>${rows}</tbody>
</table>`;
}

/**
 * Render bar, line, or pie data as deterministic accessible SVG and an HTML
 * data-table fallback. The SVG never contains authored markup.
 */
export function renderDocumentChart(
  input: DocumentChartDefinition,
  options: RenderDocumentChartOptions = {}
): RenderedDocumentChart {
  const chart = normalizeChart(input);
  const locale = assertLocale(options.locale ?? "en", "options.locale");
  const direction = assertDirection(
    options.direction ?? (locale === "ar" ? "rtl" : "ltr"),
    "options.direction"
  );
  const width =
    options.width === undefined
      ? 800
      : normalizeBoundedInteger(options.width, "options.width", 320, 1_600);
  const height =
    options.height === undefined
      ? 480
      : normalizeBoundedInteger(options.height, "options.height", 280, 1_200);
  const geometry = makeGeometry(width, height);
  const order = chartCategoryOrder(chart, direction);
  const axisOrder = chartAxisOrder(chart, direction);
  const titleId = `${chart.id}-title`;
  const descriptionId = `${chart.id}-description`;
  const bilingualTitle = bilingualPlainText(chart.title);
  const altText = `${bilingualPlainText(chart.title)} — ${bilingualPlainText(
    chart.summary
  )}`;
  const definitions = renderChartDefinitions(chart);
  let plot: string;
  switch (chart.type) {
    case "bar":
      plot = renderBarPlot(chart, order, geometry, locale, direction);
      break;
    case "line":
      plot = renderLinePlot(chart, order, geometry, locale, direction);
      break;
    case "pie":
      plot = renderPiePlot(chart, order, geometry, locale);
      break;
    default:
      plot = assertNever(chart.type);
  }
  const legend = renderLegend(chart, geometry, locale, direction);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${escapeAttribute(
    `${titleId} ${descriptionId}`
  )}" lang="${locale}" dir="${direction}" font-family="${escapeAttribute(
    locale === "ar"
      ? designTokens.typography.fontFamilies.arabic
      : designTokens.typography.fontFamilies.english
  )}" data-chart-type="${
    chart.type
  }" data-axis-order="${axisOrder}" focusable="false">
<title id="${escapeAttribute(titleId)}">${escapeText(bilingualTitle)}</title>
<desc id="${escapeAttribute(descriptionId)}">${escapeText(altText)}</desc>
<defs>${definitions}</defs>
<rect aria-hidden="true" width="${width}" height="${height}" fill="#FFFFFF"/>
<text aria-hidden="true" x="${width / 2}" y="34" text-anchor="middle" font-size="18" font-weight="${
    designTokens.typography.fontWeights.bold
  }" fill="${designTokens.colors.secondary[900]}" lang="${locale}" direction="${direction}">${escapeText(
    chart.title[locale]
  )}</text>
${plot}
${legend}
</svg>`;
  const dataTableHtml = renderChartDataTable(
    chart,
    locale,
    direction,
    order
  );
  const html = `<figure class="document-chart" data-chart-id="${escapeAttribute(
    chart.id
  )}" lang="${locale}" dir="${direction}">
${svg}
<figcaption>${bilingualInline(chart.summary)}</figcaption>
<div class="document-chart-data-fallback">${dataTableHtml}</div>
</figure>`;

  return Object.freeze({
    svg,
    dataTableHtml,
    html,
    altText,
    locale,
    direction,
    visualCategoryOrder: Object.freeze(
      order.map((index) => chart.categories[index]?.id ?? "")
    ),
    axisOrder,
  });
}

function bilingualPlainText(label: BilingualLabel): string {
  return `${label.ar} / ${label.en}`;
}

function bilingualInline(label: BilingualLabel): string {
  return `<span lang="ar" dir="rtl">${escapeText(
    label.ar
  )}</span><span aria-hidden="true"> / </span><span lang="en" dir="ltr">${escapeText(
    label.en
  )}</span>`;
}

function assertUnique(
  values: readonly string[],
  path: string,
  noun: string
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) invalid(path, `contains duplicate ${noun} '${value}'`);
    seen.add(value);
  }
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function round(value: number): number {
  const rounded = Math.round(value * 1_000) / 1_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function assertNever(value: never): never {
  throw new DocumentVisualizationError(
    "INVALID_INPUT",
    "internal",
    `unsupported variant ${String(value)}`
  );
}
