/**
 * Production bilingual layout engine for English-Arabic documents.
 *
 * The public model is a structured, immutable document AST. It deliberately
 * does not accept HTML strings or React nodes. All user-authored text crosses a
 * single escaping boundary before it is emitted as HTML.
 *
 * The engine is SSR-safe: it has no browser globals, effects, event handlers,
 * executable inline scripts, or mutable singleton state.
 */

import { designTokens } from "./design-tokens";
import {
  renderDocumentChart,
  type DocumentChartDefinition,
} from "./document-visualizations";
import {
  detectStrongDirection,
  findUnsafeBidiControls,
  type BidiValue,
  type DocumentLanguage,
  type StrongDirection,
} from "./bilingual-typography";

// ============================================================================
// Public model
// ============================================================================

export type Localized<T> = Readonly<{
  en: T;
  ar: T;
}>;

export type BilingualLayoutMode =
  "parallel" | "serial-ar-first" | "serial-en-first";

/** Safe compatibility name for code that only needs the layout-mode type. */
export type BilingualMode = BilingualLayoutMode;

export type BilingualViewerMode = "both" | "tabs";
export type TextDirectionOverride = "auto" | "ltr" | "rtl";
export type DirectionalVisualBehavior = "never" | "mirror-in-rtl";

export interface TextInlineNode {
  readonly type: "text";
  readonly text: string;
}

export interface ValueInlineNode {
  readonly type: "value";
  readonly value: BidiValue;
  /**
   * Optional semantic formatting hint. `BidiValue.kind` remains the detected
   * script category (`arabic`, `latin`, `mixed`, or `neutral`).
   */
  readonly valueKind?: BilingualValueKind;
}

export type BilingualValueKind =
  | "identifier"
  | "number"
  | "currency"
  | "date"
  | "url"
  | "email"
  | "technical-term";

export interface StrongInlineNode {
  readonly type: "strong";
  readonly children: readonly BilingualInlineNode[];
}

export interface EmphasisInlineNode {
  readonly type: "emphasis";
  readonly children: readonly BilingualInlineNode[];
}

export interface CodeInlineNode {
  readonly type: "code";
  readonly text: string;
}

export interface LinkInlineNode {
  readonly type: "link";
  readonly href: string;
  readonly children: readonly BilingualInlineNode[];
}

export interface LineBreakInlineNode {
  readonly type: "line-break";
}

export type BilingualInlineNode =
  | TextInlineNode
  | ValueInlineNode
  | StrongInlineNode
  | EmphasisInlineNode
  | CodeInlineNode
  | LinkInlineNode
  | LineBreakInlineNode;

export interface PairedHeadingBlock {
  readonly type: "heading";
  readonly id: string;
  readonly level: 2 | 3 | 4 | 5 | 6;
  readonly content: Localized<readonly BilingualInlineNode[]>;
  readonly direction?: TextDirectionOverride;
  readonly keepWithNext?: boolean;
}

export interface PairedParagraphBlock {
  readonly type: "paragraph";
  readonly id: string;
  readonly content: Localized<readonly BilingualInlineNode[]>;
  readonly direction?: TextDirectionOverride;
}

export interface BilingualListItem {
  readonly id: string;
  readonly content: Localized<readonly BilingualInlineNode[]>;
  readonly children?: readonly BilingualListItem[];
}

export interface PairedListBlock {
  readonly type: "list";
  readonly id: string;
  readonly ordered: boolean;
  readonly start?: number;
  readonly items: readonly BilingualListItem[];
}

export interface BilingualTableColumn {
  readonly id: string;
  readonly header: Localized<readonly BilingualInlineNode[]>;
  readonly align?: "start" | "center" | "end" | "numeric";
  readonly widthPercent?: number;
}

export interface BilingualTableCell {
  readonly content: Localized<readonly BilingualInlineNode[]>;
}

export interface BilingualTableRow {
  readonly id: string;
  readonly cells: Readonly<Record<string, BilingualTableCell>>;
}

export interface PairedTableBlock {
  readonly type: "table";
  readonly id: string;
  readonly caption?: Localized<readonly BilingualInlineNode[]>;
  readonly columns: readonly BilingualTableColumn[];
  readonly rows: readonly BilingualTableRow[];
  readonly repeatHeader?: boolean;
}

export type SafeImageSource =
  | Readonly<{
      kind: "public";
      /**
       * Application-relative, trusted asset path. Remote URLs and traversal are
       * rejected so rendering cannot become an SSRF boundary.
       */
      path: string;
    }>
  | Readonly<{
      kind: "data";
      /** Base64 PNG, JPEG, or WebP only. */
      uri: string;
    }>;

export interface PairedImageBlock {
  readonly type: "image";
  readonly id: string;
  readonly source: SafeImageSource;
  readonly alt: Localized<string>;
  readonly caption?: Localized<readonly BilingualInlineNode[]>;
  readonly decorative?: boolean;
  readonly visualBehavior?: DirectionalVisualBehavior;
  readonly widthPercent?: number;
}

export interface PairedChartBlock {
  readonly type: "chart";
  readonly id: string;
  readonly chart: DocumentChartDefinition;
}

export type PairedBlock =
  | PairedHeadingBlock
  | PairedParagraphBlock
  | PairedListBlock
  | PairedTableBlock
  | PairedImageBlock
  | PairedChartBlock;

export interface PairedSection {
  readonly id: string;
  readonly alignmentKey: string;
  readonly title?: Localized<readonly BilingualInlineNode[]>;
  readonly blocks: readonly PairedBlock[];
  readonly startOnNewPage?: boolean;
}

export interface BilingualViewerConfig {
  readonly mode: BilingualViewerMode;
  readonly defaultLanguage: DocumentLanguage;
}

export interface BilingualLayoutConfig {
  readonly mode: BilingualLayoutMode;
  /**
   * Physical page ratio in percentages: [English-left, Arabic-right].
   * Each column must be 30%-70% and the pair must total 100.
   */
  readonly columnRatio: readonly [number, number];
  readonly mobileBreakpointPx: number;
  readonly mobileOrder: "ar-first" | "en-first";
  readonly viewer: BilingualViewerConfig;
}

export interface BilingualLayoutOverrides {
  readonly mode?: BilingualLayoutMode;
  readonly columnRatio?: readonly [number, number];
  readonly mobileBreakpointPx?: number;
  readonly mobileOrder?: "ar-first" | "en-first";
  readonly viewer?: Partial<BilingualViewerConfig>;
}

export interface BilingualDocumentSpec {
  readonly id: string;
  readonly version?: string;
  readonly title: Localized<readonly BilingualInlineNode[]>;
  readonly sections: readonly PairedSection[];
  readonly layout?: BilingualLayoutOverrides;
}

export interface RenderBilingualDocumentOptions {
  /**
   * A screen artifact can expose declarative viewer-tab metadata. A print
   * artifact always renders both languages regardless of viewer preference.
   */
  readonly target?: "screen" | "print";
  readonly includeDocumentShell?: boolean;
}

export type BilingualValidationIssueCode =
  | "INVALID_DOCUMENT"
  | "INVALID_CONFIG"
  | "INVALID_RATIO"
  | "INVALID_ID"
  | "DUPLICATE_ID"
  | "DUPLICATE_ALIGNMENT_KEY"
  | "EMPTY_TRANSLATION"
  | "MISSING_CONTENT"
  | "INVALID_INLINE_NODE"
  | "INVALID_BLOCK"
  | "INVALID_LINK"
  | "INVALID_TABLE"
  | "INVALID_CHART"
  | "INVALID_LIST"
  | "INVALID_IMAGE"
  | "UNSAFE_BIDI_CONTROL"
  | "DOCUMENT_LIMIT_EXCEEDED";

export interface BilingualValidationIssue {
  readonly code: BilingualValidationIssueCode;
  readonly severity: "error" | "warning";
  readonly path: string;
  readonly message: string;
}

export interface BilingualValidationResult {
  readonly valid: boolean;
  readonly issues: readonly BilingualValidationIssue[];
}

export const DEFAULT_BILINGUAL_CONFIG: BilingualLayoutConfig = Object.freeze({
  mode: "parallel",
  columnRatio: Object.freeze([50, 50] as const),
  mobileBreakpointPx: 768,
  mobileOrder: "ar-first",
  viewer: Object.freeze({
    mode: "both",
    defaultLanguage: "ar",
  }),
});

export const BILINGUAL_LAYOUT_LIMITS = Object.freeze({
  maxSections: 500,
  maxBlocks: 5_000,
  maxTextCharacters: 500_000,
  maxListDepth: 8,
  maxInlineDepth: 16,
  maxInlineNodes: 50_000,
  maxDataImageBytes: 8 * 1024 * 1024,
  maxTotalDataImageBytes: 24 * 1024 * 1024,
  maxAtomicListSubtreeItems: 24,
  maxAtomicListSubtreeGraphemes: 900,
  maxTableColumns: 12,
  maxAtomicTableRowGraphemes: 1_000,
  maxAtomicTableCaptionGraphemes: 360,
});

const LIMITS = BILINGUAL_LAYOUT_LIMITS;

const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_DATA_IMAGE_PATTERN =
  /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const SAFE_VALUE_KINDS = new Set<StrongDirection>([
  "arabic",
  "latin",
  "mixed",
  "neutral",
]);
const SAFE_SEMANTIC_VALUE_KINDS = new Set<BilingualValueKind>([
  "identifier",
  "number",
  "currency",
  "date",
  "url",
  "email",
  "technical-term",
]);
const SAFE_BIDI_DIRECTIONS = new Set(["ltr", "rtl"]);

// ============================================================================
// Validation
// ============================================================================

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function addIssue(
  issues: BilingualValidationIssue[],
  code: BilingualValidationIssueCode,
  path: string,
  message: string,
  severity: "error" | "warning" = "error",
): void {
  issues.push({ code, severity, path, message });
}

function validateStableId(
  value: unknown,
  path: string,
  issues: BilingualValidationIssue[],
  ids: Set<string>,
): value is string {
  if (typeof value !== "string" || !STABLE_ID_PATTERN.test(value)) {
    addIssue(
      issues,
      "INVALID_ID",
      path,
      "IDs must be 1-128 ASCII letters, numbers, dots, colons, underscores, or hyphens.",
    );
    return false;
  }

  if (ids.has(value)) {
    addIssue(issues, "DUPLICATE_ID", path, `Duplicate ID "${value}".`);
    return false;
  }

  ids.add(value);
  return true;
}

function validateText(
  value: unknown,
  path: string,
  issues: BilingualValidationIssue[],
  stats: ValidationStats,
  allowEmpty = false,
): value is string {
  if (typeof value !== "string" || (!allowEmpty && value.trim().length === 0)) {
    addIssue(
      issues,
      "EMPTY_TRANSLATION",
      path,
      "Translated text cannot be empty.",
    );
    return false;
  }

  stats.textCharacters += value.length;
  const bidiIssues = findUnsafeBidiControls(value);
  if (bidiIssues.length > 0) {
    addIssue(
      issues,
      "UNSAFE_BIDI_CONTROL",
      path,
      "Text contains Unicode direction-control characters. Use a structured bidi value instead.",
    );
  }

  return true;
}

function isSafeHref(href: string): boolean {
  if (href.startsWith("/") && !href.startsWith("//") && !href.includes("\\")) {
    return !href.split(/[?#]/, 1)[0].split("/").includes("..");
  }
  if (href.startsWith("#")) return true;

  try {
    const parsed = new URL(href);
    return ["https:", "mailto:", "tel:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function validateBidiValue(
  value: unknown,
  path: string,
  issues: BilingualValidationIssue[],
  stats: ValidationStats,
): value is BidiValue {
  if (!isRecord(value)) {
    addIssue(
      issues,
      "INVALID_INLINE_NODE",
      path,
      "Bidi value must be an object.",
    );
    return false;
  }

  const validText = validateText(value.text, `${path}.text`, issues, stats);
  const validKind =
    typeof value.kind === "string" &&
    SAFE_VALUE_KINDS.has(value.kind as StrongDirection);
  if (!validKind) {
    addIssue(
      issues,
      "INVALID_INLINE_NODE",
      `${path}.kind`,
      "Bidi value kind must be arabic, latin, mixed, or neutral.",
    );
  }
  const validDirection =
    typeof value.dir === "string" && SAFE_BIDI_DIRECTIONS.has(value.dir);
  if (!validDirection) {
    addIssue(
      issues,
      "INVALID_INLINE_NODE",
      `${path}.dir`,
      "Bidi value direction must be ltr or rtl.",
    );
  }
  if (
    Array.isArray(value.removedControls) &&
    value.removedControls.length > 0
  ) {
    addIssue(
      issues,
      "UNSAFE_BIDI_CONTROL",
      `${path}.removedControls`,
      "The source value contained Unicode direction-control characters.",
    );
  }
  return validText && validKind && validDirection;
}

function validateInlineNodes(
  value: unknown,
  path: string,
  issues: BilingualValidationIssue[],
  stats: ValidationStats,
  depth = 1,
): value is readonly BilingualInlineNode[] {
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(
      issues,
      "MISSING_CONTENT",
      path,
      "Inline content must contain at least one node.",
    );
    return false;
  }

  if (depth > LIMITS.maxInlineDepth) {
    addIssue(
      issues,
      "DOCUMENT_LIMIT_EXCEEDED",
      path,
      `Inline-node nesting cannot exceed ${LIMITS.maxInlineDepth} levels.`,
    );
    return false;
  }

  stats.inlineNodeCount += value.length;
  if (stats.inlineNodeCount > LIMITS.maxInlineNodes) {
    addIssue(
      issues,
      "DOCUMENT_LIMIT_EXCEEDED",
      path,
      `Documents cannot exceed ${LIMITS.maxInlineNodes} inline nodes.`,
    );
    return false;
  }

  for (let index = 0; index < value.length; index += 1) {
    const node = value[index];
    const nodePath = `${path}[${index}]`;
    if (!isRecord(node) || typeof node.type !== "string") {
      addIssue(issues, "INVALID_INLINE_NODE", nodePath, "Invalid inline node.");
      continue;
    }

    switch (node.type) {
      case "text":
      case "code":
        validateText(node.text, `${nodePath}.text`, issues, stats);
        break;
      case "value":
        validateBidiValue(node.value, `${nodePath}.value`, issues, stats);
        if (
          node.valueKind !== undefined &&
          (typeof node.valueKind !== "string" ||
            !SAFE_SEMANTIC_VALUE_KINDS.has(
              node.valueKind as BilingualValueKind,
            ))
        ) {
          addIssue(
            issues,
            "INVALID_INLINE_NODE",
            `${nodePath}.valueKind`,
            "Unsupported semantic value kind.",
          );
        }
        break;
      case "strong":
      case "emphasis":
        validateInlineNodes(
          node.children,
          `${nodePath}.children`,
          issues,
          stats,
          depth + 1,
        );
        break;
      case "link":
        if (typeof node.href !== "string" || !isSafeHref(node.href)) {
          addIssue(
            issues,
            "INVALID_LINK",
            `${nodePath}.href`,
            "Links must be HTTPS, mailto, tel, a fragment, or a safe application-relative path.",
          );
        }
        validateInlineNodes(
          node.children,
          `${nodePath}.children`,
          issues,
          stats,
          depth + 1,
        );
        break;
      case "line-break":
        break;
      default:
        addIssue(
          issues,
          "INVALID_INLINE_NODE",
          `${nodePath}.type`,
          `Unsupported inline node type "${node.type}".`,
        );
    }
  }

  return true;
}

function validateLocalizedInline(
  value: unknown,
  path: string,
  issues: BilingualValidationIssue[],
  stats: ValidationStats,
): value is Localized<readonly BilingualInlineNode[]> {
  if (!isRecord(value)) {
    addIssue(
      issues,
      "MISSING_CONTENT",
      path,
      "Localized content must provide English and Arabic values.",
    );
    return false;
  }

  const en = validateInlineNodes(value.en, `${path}.en`, issues, stats);
  const ar = validateInlineNodes(value.ar, `${path}.ar`, issues, stats);
  return en && ar;
}

function validateListItems(
  value: unknown,
  path: string,
  issues: BilingualValidationIssue[],
  stats: ValidationStats,
  ids: Set<string>,
  depth: number,
): value is readonly BilingualListItem[] {
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(
      issues,
      "INVALID_LIST",
      path,
      "A list must contain at least one item.",
    );
    return false;
  }

  if (depth > LIMITS.maxListDepth) {
    addIssue(
      issues,
      "DOCUMENT_LIMIT_EXCEEDED",
      path,
      `List nesting cannot exceed ${LIMITS.maxListDepth} levels.`,
    );
    return false;
  }

  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      addIssue(issues, "INVALID_LIST", itemPath, "Invalid list item.");
      continue;
    }
    validateStableId(item.id, `${itemPath}.id`, issues, ids);
    const validContent = validateLocalizedInline(
      item.content,
      `${itemPath}.content`,
      issues,
      stats,
    );
    let validChildren = true;
    if (item.children !== undefined) {
      validChildren = validateListItems(
        item.children,
        `${itemPath}.children`,
        issues,
        stats,
        ids,
        depth + 1,
      );
    }
    if (validContent && validChildren) {
      const typedItem = item as unknown as BilingualListItem;
      const subtreeItems = countListSubtreeItems(typedItem);
      if (subtreeItems > LIMITS.maxAtomicListSubtreeItems) {
        addIssue(
          issues,
          "DOCUMENT_LIMIT_EXCEEDED",
          itemPath,
          `A list-item subtree cannot exceed ${LIMITS.maxAtomicListSubtreeItems} items because it must remain atomic during pagination.`,
        );
      }
      for (const language of ["en", "ar"] as const) {
        const graphemes = countListSubtreeGraphemes(typedItem, language);
        if (graphemes > LIMITS.maxAtomicListSubtreeGraphemes) {
          addIssue(
            issues,
            "DOCUMENT_LIMIT_EXCEEDED",
            `${itemPath}.content.${language}`,
            `A list-item subtree cannot exceed ${LIMITS.maxAtomicListSubtreeGraphemes} graphemes per language because it must fit on one page.`,
          );
        }
      }
    }
  }

  return true;
}

function validateSafeImageSource(
  value: unknown,
  path: string,
  issues: BilingualValidationIssue[],
  stats: ValidationStats,
): value is SafeImageSource {
  if (!isRecord(value) || typeof value.kind !== "string") {
    addIssue(issues, "INVALID_IMAGE", path, "Image source must be structured.");
    return false;
  }

  if (value.kind === "public") {
    if (
      typeof value.path !== "string" ||
      !value.path.startsWith("/") ||
      value.path.startsWith("//") ||
      value.path.includes("\\") ||
      value.path.split(/[?#]/, 1)[0].split("/").includes("..")
    ) {
      addIssue(
        issues,
        "INVALID_IMAGE",
        `${path}.path`,
        "Public images must use a safe application-relative path.",
      );
      return false;
    }
    return true;
  }

  if (value.kind === "data") {
    if (typeof value.uri !== "string") {
      addIssue(
        issues,
        "INVALID_IMAGE",
        `${path}.uri`,
        "Image data URI is required.",
      );
      return false;
    }
    const match = value.uri.match(SAFE_DATA_IMAGE_PATTERN);
    if (!match || match[1].length % 4 !== 0) {
      addIssue(
        issues,
        "INVALID_IMAGE",
        `${path}.uri`,
        "Only base64 PNG, JPEG, and WebP data images are accepted.",
      );
      return false;
    }
    const encoded = match[1];
    const paddingBytes = encoded.endsWith("==")
      ? 2
      : encoded.endsWith("=")
        ? 1
        : 0;
    const decodedBytes = Math.max(
      0,
      Math.floor((encoded.length * 3) / 4) - paddingBytes,
    );
    stats.dataImageBytes += decodedBytes;
    if (decodedBytes > LIMITS.maxDataImageBytes) {
      addIssue(
        issues,
        "DOCUMENT_LIMIT_EXCEEDED",
        `${path}.uri`,
        `Embedded images cannot exceed ${LIMITS.maxDataImageBytes} bytes.`,
      );
      return false;
    }
    return true;
  }

  addIssue(
    issues,
    "INVALID_IMAGE",
    `${path}.kind`,
    "Unsupported image source.",
  );
  return false;
}

interface ValidationStats {
  blockCount: number;
  textCharacters: number;
  inlineNodeCount: number;
  dataImageBytes: number;
}

function validateBlock(
  value: unknown,
  path: string,
  issues: BilingualValidationIssue[],
  stats: ValidationStats,
  ids: Set<string>,
): value is PairedBlock {
  if (!isRecord(value) || typeof value.type !== "string") {
    addIssue(issues, "INVALID_BLOCK", path, "Invalid paired block.");
    return false;
  }

  stats.blockCount += 1;
  validateStableId(value.id, `${path}.id`, issues, ids);

  switch (value.type) {
    case "heading": {
      if (
        typeof value.level !== "number" ||
        ![2, 3, 4, 5, 6].includes(value.level)
      ) {
        addIssue(
          issues,
          "INVALID_BLOCK",
          `${path}.level`,
          "Heading level must be between 2 and 6.",
        );
      }
      validateLocalizedInline(value.content, `${path}.content`, issues, stats);
      validateDirectionOverride(value.direction, `${path}.direction`, issues);
      return true;
    }
    case "paragraph":
      validateLocalizedInline(value.content, `${path}.content`, issues, stats);
      validateDirectionOverride(value.direction, `${path}.direction`, issues);
      return true;
    case "list":
      if (typeof value.ordered !== "boolean") {
        addIssue(
          issues,
          "INVALID_LIST",
          `${path}.ordered`,
          "List ordered must be a boolean.",
        );
      }
      if (
        value.start !== undefined &&
        (typeof value.start !== "number" ||
          !Number.isInteger(value.start) ||
          value.start < 1)
      ) {
        addIssue(
          issues,
          "INVALID_LIST",
          `${path}.start`,
          "Ordered-list start must be a positive integer.",
        );
      }
      validateListItems(value.items, `${path}.items`, issues, stats, ids, 1);
      return true;
    case "table":
      validateTable(value, path, issues, stats, ids);
      return true;
    case "image":
      validateImage(value, path, issues, stats);
      return true;
    case "chart":
      validateChart(value, path, issues);
      return true;
    default:
      addIssue(
        issues,
        "INVALID_BLOCK",
        `${path}.type`,
        `Unsupported paired block type "${value.type}".`,
      );
      return false;
  }
}

function validateChart(
  chartBlock: Readonly<Record<string, unknown>>,
  path: string,
  issues: BilingualValidationIssue[],
): void {
  if (!isRecord(chartBlock.chart)) {
    addIssue(
      issues,
      "INVALID_CHART",
      `${path}.chart`,
      "A chart must be a structured document-chart definition.",
    );
    return;
  }

  try {
    renderDocumentChart(
      chartBlock.chart as unknown as DocumentChartDefinition,
      { locale: "en", direction: "ltr" },
    );
    renderDocumentChart(
      chartBlock.chart as unknown as DocumentChartDefinition,
      { locale: "ar", direction: "rtl" },
    );
  } catch (error) {
    addIssue(
      issues,
      "INVALID_CHART",
      `${path}.chart`,
      error instanceof Error ? error.message : "Invalid document chart.",
    );
  }
}

function validateDirectionOverride(
  value: unknown,
  path: string,
  issues: BilingualValidationIssue[],
): void {
  if (
    value !== undefined &&
    value !== "auto" &&
    value !== "ltr" &&
    value !== "rtl"
  ) {
    addIssue(
      issues,
      "INVALID_BLOCK",
      path,
      "Direction must be auto, ltr, or rtl.",
    );
  }
}

function validateTable(
  table: Readonly<Record<string, unknown>>,
  path: string,
  issues: BilingualValidationIssue[],
  stats: ValidationStats,
  ids: Set<string>,
): void {
  if (!Array.isArray(table.columns) || table.columns.length === 0) {
    addIssue(
      issues,
      "INVALID_TABLE",
      `${path}.columns`,
      "A table must contain at least one column.",
    );
    return;
  }
  if (table.columns.length > LIMITS.maxTableColumns) {
    addIssue(
      issues,
      "DOCUMENT_LIMIT_EXCEEDED",
      `${path}.columns`,
      `Tables cannot exceed ${LIMITS.maxTableColumns} columns.`,
    );
  }

  const columnIds = new Set<string>();
  const columnWidths = new Map<string, number | undefined>();
  const validColumnHeaders: Array<{
    id: string;
    header: Localized<readonly BilingualInlineNode[]>;
  }> = [];
  let widthTotal = 0;
  table.columns.forEach((column, columnIndex) => {
    const columnPath = `${path}.columns[${columnIndex}]`;
    if (!isRecord(column)) {
      addIssue(issues, "INVALID_TABLE", columnPath, "Invalid table column.");
      return;
    }
    if (typeof column.id !== "string" || !STABLE_ID_PATTERN.test(column.id)) {
      addIssue(
        issues,
        "INVALID_ID",
        `${columnPath}.id`,
        "Table column ID is invalid.",
      );
    } else if (columnIds.has(column.id)) {
      addIssue(
        issues,
        "INVALID_TABLE",
        `${columnPath}.id`,
        `Duplicate table column "${column.id}".`,
      );
    } else {
      columnIds.add(column.id);
      columnWidths.set(
        column.id,
        typeof column.widthPercent === "number" &&
          Number.isFinite(column.widthPercent) &&
          column.widthPercent > 0
          ? column.widthPercent
          : undefined,
      );
    }
    const header = column.header;
    const validHeader = validateLocalizedInline(
      header,
      `${columnPath}.header`,
      issues,
      stats,
    );
    if (
      validHeader &&
      typeof column.id === "string" &&
      STABLE_ID_PATTERN.test(column.id)
    ) {
      validColumnHeaders.push({
        id: column.id,
        header,
      });
    }
    if (
      column.align !== undefined &&
      !["start", "center", "end", "numeric"].includes(String(column.align))
    ) {
      addIssue(
        issues,
        "INVALID_TABLE",
        `${columnPath}.align`,
        "Unsupported table alignment.",
      );
    }
    if (column.widthPercent !== undefined) {
      if (
        typeof column.widthPercent !== "number" ||
        !Number.isFinite(column.widthPercent) ||
        column.widthPercent <= 0 ||
        column.widthPercent > 100
      ) {
        addIssue(
          issues,
          "INVALID_TABLE",
          `${columnPath}.widthPercent`,
          "Column width must be between 0 and 100.",
        );
      } else {
        widthTotal += column.widthPercent;
      }
    }
  });

  if (widthTotal > 100.001) {
    addIssue(
      issues,
      "INVALID_TABLE",
      `${path}.columns`,
      "Explicit table column widths cannot total more than 100%.",
    );
  }

  const definedWidthTotal = [...columnWidths.values()].reduce<number>(
    (total, width) => total + (width ?? 0),
    0,
  );
  const undefinedWidthCount = [...columnWidths.values()].filter(
    (width) => width === undefined,
  ).length;
  const fallbackWidth =
    undefinedWidthCount > 0
      ? Math.max(0, 100 - definedWidthTotal) / undefinedWidthCount
      : 0;
  const resolvedColumnShares = new Map(
    [...columnWidths].map(([id, width]) => [id, width ?? fallbackWidth]),
  );
  for (const { id, header } of validColumnHeaders) {
    const headerBudget = Math.max(
      32,
      Math.floor(
        (LIMITS.maxAtomicTableRowGraphemes *
          (resolvedColumnShares.get(id) ?? 0)) /
          100,
      ),
    );
    for (const language of ["en", "ar"] as const) {
      if (countInlineGraphemes(header[language]) > headerBudget) {
        addIssue(
          issues,
          "DOCUMENT_LIMIT_EXCEEDED",
          `${path}.columns.${id}.header.${language}`,
          `This table header cannot exceed ${headerBudget} graphemes at its column width.`,
        );
      }
    }
  }

  if (table.caption !== undefined) {
    if (
      validateLocalizedInline(table.caption, `${path}.caption`, issues, stats)
    ) {
      for (const language of ["en", "ar"] as const) {
        if (
          countInlineGraphemes(table.caption[language]) >
          LIMITS.maxAtomicTableCaptionGraphemes
        ) {
          addIssue(
            issues,
            "DOCUMENT_LIMIT_EXCEEDED",
            `${path}.caption.${language}`,
            `A table caption cannot exceed ${LIMITS.maxAtomicTableCaptionGraphemes} graphemes.`,
          );
        }
      }
    }
  }

  if (!Array.isArray(table.rows) || table.rows.length === 0) {
    addIssue(
      issues,
      "INVALID_TABLE",
      `${path}.rows`,
      "A table must contain at least one row.",
    );
    return;
  }

  table.rows.forEach((row, rowIndex) => {
    const rowPath = `${path}.rows[${rowIndex}]`;
    if (!isRecord(row)) {
      addIssue(issues, "INVALID_TABLE", rowPath, "Invalid table row.");
      return;
    }
    validateStableId(row.id, `${rowPath}.id`, issues, ids);
    if (!isRecord(row.cells)) {
      addIssue(
        issues,
        "INVALID_TABLE",
        `${rowPath}.cells`,
        "Table row cells must be keyed by column ID.",
      );
      return;
    }
    const cellIds = Object.keys(row.cells);
    const missing = [...columnIds].filter(
      (columnId) => !cellIds.includes(columnId),
    );
    const extra = cellIds.filter((cellId) => !columnIds.has(cellId));
    if (missing.length > 0 || extra.length > 0) {
      addIssue(
        issues,
        "INVALID_TABLE",
        `${rowPath}.cells`,
        `Table cells do not match columns (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}).`,
      );
    }
    for (const [cellId, cell] of Object.entries(row.cells)) {
      if (!isRecord(cell)) {
        addIssue(
          issues,
          "INVALID_TABLE",
          `${rowPath}.cells.${cellId}`,
          "Invalid table cell.",
        );
        continue;
      }
      const content = cell.content;
      const validContent = validateLocalizedInline(
        content,
        `${rowPath}.cells.${cellId}.content`,
        issues,
        stats,
      );
      if (validContent) {
        const columnShare = resolvedColumnShares.get(cellId) ?? 0;
        const cellBudget = Math.max(
          32,
          Math.floor((LIMITS.maxAtomicTableRowGraphemes * columnShare) / 100),
        );
        for (const language of ["en", "ar"] as const) {
          if (countInlineGraphemes(content[language]) > cellBudget) {
            addIssue(
              issues,
              "DOCUMENT_LIMIT_EXCEEDED",
              `${rowPath}.cells.${cellId}.content.${language}`,
              `This table cell cannot exceed ${cellBudget} graphemes at its column width because rows must remain atomic during pagination.`,
            );
          }
        }
      }
    }
  });
}

function validateImage(
  image: Readonly<Record<string, unknown>>,
  path: string,
  issues: BilingualValidationIssue[],
  stats: ValidationStats,
): void {
  validateSafeImageSource(image.source, `${path}.source`, issues, stats);
  const decorative = image.decorative === true;
  if (!isRecord(image.alt)) {
    addIssue(
      issues,
      "INVALID_IMAGE",
      `${path}.alt`,
      "Localized image alt text is required.",
    );
  } else {
    validateText(image.alt.en, `${path}.alt.en`, issues, stats, decorative);
    validateText(image.alt.ar, `${path}.alt.ar`, issues, stats, decorative);
  }
  if (image.caption !== undefined) {
    validateLocalizedInline(image.caption, `${path}.caption`, issues, stats);
  }
  if (
    image.visualBehavior !== undefined &&
    image.visualBehavior !== "never" &&
    image.visualBehavior !== "mirror-in-rtl"
  ) {
    addIssue(
      issues,
      "INVALID_IMAGE",
      `${path}.visualBehavior`,
      "Visual behavior must be never or mirror-in-rtl.",
    );
  }
  if (
    image.widthPercent !== undefined &&
    (typeof image.widthPercent !== "number" ||
      !Number.isFinite(image.widthPercent) ||
      image.widthPercent <= 0 ||
      image.widthPercent > 100)
  ) {
    addIssue(
      issues,
      "INVALID_IMAGE",
      `${path}.widthPercent`,
      "Image width must be between 0 and 100.",
    );
  }
}

function validateConfig(
  value: unknown,
  path: string,
  issues: BilingualValidationIssue[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    addIssue(
      issues,
      "INVALID_CONFIG",
      path,
      "Layout configuration is invalid.",
    );
    return;
  }

  if (
    value.mode !== undefined &&
    value.mode !== "parallel" &&
    value.mode !== "serial-ar-first" &&
    value.mode !== "serial-en-first"
  ) {
    addIssue(
      issues,
      "INVALID_CONFIG",
      `${path}.mode`,
      "Unsupported layout mode.",
    );
  }
  if (value.columnRatio !== undefined) {
    validateColumnRatio(value.columnRatio, `${path}.columnRatio`, issues);
  }
  if (
    value.mobileBreakpointPx !== undefined &&
    (typeof value.mobileBreakpointPx !== "number" ||
      !Number.isInteger(value.mobileBreakpointPx) ||
      value.mobileBreakpointPx < 320 ||
      value.mobileBreakpointPx > 2_560)
  ) {
    addIssue(
      issues,
      "INVALID_CONFIG",
      `${path}.mobileBreakpointPx`,
      "Mobile breakpoint must be an integer from 320 to 2560.",
    );
  }
  if (
    value.mobileOrder !== undefined &&
    value.mobileOrder !== "ar-first" &&
    value.mobileOrder !== "en-first"
  ) {
    addIssue(
      issues,
      "INVALID_CONFIG",
      `${path}.mobileOrder`,
      "Mobile order must be ar-first or en-first.",
    );
  }
  if (value.viewer !== undefined) {
    if (!isRecord(value.viewer)) {
      addIssue(
        issues,
        "INVALID_CONFIG",
        `${path}.viewer`,
        "Viewer configuration is invalid.",
      );
    } else {
      if (
        value.viewer.mode !== undefined &&
        value.viewer.mode !== "both" &&
        value.viewer.mode !== "tabs"
      ) {
        addIssue(
          issues,
          "INVALID_CONFIG",
          `${path}.viewer.mode`,
          "Viewer mode must be both or tabs.",
        );
      }
      if (
        value.viewer.defaultLanguage !== undefined &&
        value.viewer.defaultLanguage !== "ar" &&
        value.viewer.defaultLanguage !== "en"
      ) {
        addIssue(
          issues,
          "INVALID_CONFIG",
          `${path}.viewer.defaultLanguage`,
          "Default viewer language must be ar or en.",
        );
      }
    }
  }
}

function validateColumnRatio(
  value: unknown,
  path: string,
  issues: BilingualValidationIssue[],
): value is readonly [number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== "number" ||
    typeof value[1] !== "number" ||
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1])
  ) {
    addIssue(
      issues,
      "INVALID_RATIO",
      path,
      "Column ratio must be [English percentage, Arabic percentage].",
    );
    return false;
  }

  const [en, ar] = value;
  if (en < 30 || en > 70 || ar < 30 || ar > 70) {
    addIssue(
      issues,
      "INVALID_RATIO",
      path,
      "Each bilingual column must occupy between 30% and 70%.",
    );
    return false;
  }
  if (Math.abs(en + ar - 100) > 0.001) {
    addIssue(
      issues,
      "INVALID_RATIO",
      path,
      "Column percentages must total 100.",
    );
    return false;
  }
  return true;
}

export function validateBilingualDocument(
  document: unknown,
): BilingualValidationResult {
  const issues: BilingualValidationIssue[] = [];
  const ids = new Set<string>();
  const alignmentKeys = new Set<string>();
  const stats: ValidationStats = {
    blockCount: 0,
    textCharacters: 0,
    inlineNodeCount: 0,
    dataImageBytes: 0,
  };

  if (!isRecord(document)) {
    return {
      valid: false,
      issues: [
        {
          code: "INVALID_DOCUMENT",
          severity: "error",
          path: "$",
          message: "Bilingual document must be an object.",
        },
      ],
    };
  }

  validateStableId(document.id, "$.id", issues, ids);
  validateLocalizedInline(document.title, "$.title", issues, stats);
  validateConfig(document.layout, "$.layout", issues);

  if (!Array.isArray(document.sections)) {
    addIssue(
      issues,
      "MISSING_CONTENT",
      "$.sections",
      "Document sections must be an array.",
    );
  } else {
    if (document.sections.length > LIMITS.maxSections) {
      addIssue(
        issues,
        "DOCUMENT_LIMIT_EXCEEDED",
        "$.sections",
        `Documents cannot exceed ${LIMITS.maxSections} sections.`,
      );
    }

    document.sections.forEach((section, sectionIndex) => {
      const sectionPath = `$.sections[${sectionIndex}]`;
      if (!isRecord(section)) {
        addIssue(
          issues,
          "INVALID_BLOCK",
          sectionPath,
          "Invalid paired section.",
        );
        return;
      }
      validateStableId(section.id, `${sectionPath}.id`, issues, ids);
      if (
        typeof section.alignmentKey !== "string" ||
        !STABLE_ID_PATTERN.test(section.alignmentKey)
      ) {
        addIssue(
          issues,
          "INVALID_ID",
          `${sectionPath}.alignmentKey`,
          "Alignment key must use the stable ID format.",
        );
      } else if (alignmentKeys.has(section.alignmentKey)) {
        addIssue(
          issues,
          "DUPLICATE_ALIGNMENT_KEY",
          `${sectionPath}.alignmentKey`,
          `Duplicate alignment key "${section.alignmentKey}".`,
        );
      } else {
        alignmentKeys.add(section.alignmentKey);
      }

      if (section.title !== undefined) {
        validateLocalizedInline(
          section.title,
          `${sectionPath}.title`,
          issues,
          stats,
        );
      }
      if (!Array.isArray(section.blocks) || section.blocks.length === 0) {
        addIssue(
          issues,
          "MISSING_CONTENT",
          `${sectionPath}.blocks`,
          "A paired section must contain at least one block.",
        );
      } else {
        section.blocks.forEach((block, blockIndex) => {
          validateBlock(
            block,
            `${sectionPath}.blocks[${blockIndex}]`,
            issues,
            stats,
            ids,
          );
        });
      }
    });
  }

  if (stats.blockCount > LIMITS.maxBlocks) {
    addIssue(
      issues,
      "DOCUMENT_LIMIT_EXCEEDED",
      "$.sections",
      `Documents cannot exceed ${LIMITS.maxBlocks} blocks.`,
    );
  }
  if (stats.textCharacters > LIMITS.maxTextCharacters) {
    addIssue(
      issues,
      "DOCUMENT_LIMIT_EXCEEDED",
      "$",
      `Documents cannot exceed ${LIMITS.maxTextCharacters} text characters.`,
    );
  }
  if (stats.dataImageBytes > LIMITS.maxTotalDataImageBytes) {
    addIssue(
      issues,
      "DOCUMENT_LIMIT_EXCEEDED",
      "$",
      `Embedded images cannot exceed ${LIMITS.maxTotalDataImageBytes} decoded bytes in total.`,
    );
  }

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}

export class BilingualLayoutValidationError extends Error {
  readonly issues: readonly BilingualValidationIssue[];

  constructor(issues: readonly BilingualValidationIssue[]) {
    super(
      `Bilingual layout validation failed: ${issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
    this.name = "BilingualLayoutValidationError";
    this.issues = issues;
  }
}

export function parseBilingualDocument(
  document: unknown,
): BilingualDocumentSpec {
  const result = validateBilingualDocument(document);
  if (!result.valid) {
    throw new BilingualLayoutValidationError(result.issues);
  }
  return deepFreeze(document as BilingualDocumentSpec);
}

export function createColumnRatio(
  englishPercent: number,
): readonly [number, number] {
  const ratio = [englishPercent, 100 - englishPercent] as const;
  const issues: BilingualValidationIssue[] = [];
  if (!validateColumnRatio(ratio, "$.columnRatio", issues)) {
    throw new BilingualLayoutValidationError(issues);
  }
  return Object.freeze(ratio);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(
    value as Readonly<Record<string, unknown>>,
  )) {
    deepFreeze(child);
  }
  return value;
}

// ============================================================================
// Safe rendering
// ============================================================================

export function escapeBilingualHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function assertNever(value: never): never {
  throw new Error(`Unsupported bilingual AST node: ${String(value)}`);
}

function inlineText(nodes: readonly BilingualInlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
        case "code":
          return node.text;
        case "value":
          return node.value.text;
        case "strong":
        case "emphasis":
        case "link":
          return inlineText(node.children);
        case "line-break":
          return "\n";
        default:
          return assertNever(node);
      }
    })
    .join("");
}

const graphemeSegmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;
const COMBINING_GRAPHEME_PART =
  /^(?:\p{Mark}|\uFE0E|\uFE0F|\u200D|[\u{1F3FB}-\u{1F3FF}])$/u;
const REGIONAL_INDICATOR = /^[\u{1F1E6}-\u{1F1FF}]$/u;

/**
 * Split at Unicode grapheme boundaries. `Intl.Segmenter` is available in all
 * supported runtimes; the fallback still preserves surrogate pairs, combining
 * marks, emoji modifiers, ZWJ sequences, and flag pairs.
 */
function segmentGraphemes(value: string): readonly string[] {
  if (graphemeSegmenter) {
    return Array.from(
      graphemeSegmenter.segment(value),
      ({ segment }) => segment,
    );
  }

  const result: string[] = [];
  let regionalIndicatorCount = 0;
  for (const codePoint of Array.from(value)) {
    const previous = result[result.length - 1];
    const joinsPrevious =
      previous !== undefined &&
      (COMBINING_GRAPHEME_PART.test(codePoint) ||
        previous.endsWith("\u200D") ||
        (REGIONAL_INDICATOR.test(codePoint) &&
          regionalIndicatorCount % 2 === 1));
    if (joinsPrevious) {
      result[result.length - 1] = previous + codePoint;
    } else {
      result.push(codePoint);
    }
    regionalIndicatorCount = REGIONAL_INDICATOR.test(codePoint)
      ? regionalIndicatorCount + 1
      : 0;
  }
  return result;
}

function countGraphemes(value: string): number {
  return segmentGraphemes(value).length;
}

function countInlineGraphemes(nodes: readonly BilingualInlineNode[]): number {
  return countGraphemes(inlineText(nodes));
}

function countListSubtreeItems(item: BilingualListItem): number {
  return (
    1 +
    (item.children ?? []).reduce(
      (total, child) => total + countListSubtreeItems(child),
      0,
    )
  );
}

function countListSubtreeGraphemes(
  item: BilingualListItem,
  language: DocumentLanguage,
): number {
  return (
    countInlineGraphemes(item.content[language]) +
    (item.children ?? []).reduce(
      (total, child) => total + countListSubtreeGraphemes(child, language),
      0,
    )
  );
}

function resolvedDirection(
  nodes: readonly BilingualInlineNode[],
  language: DocumentLanguage,
  override: TextDirectionOverride = "auto",
): "ltr" | "rtl" {
  if (override === "ltr" || override === "rtl") return override;
  const detected: StrongDirection = detectStrongDirection(inlineText(nodes));
  if (detected === "arabic") return "rtl";
  if (detected === "latin") return "ltr";
  return language === "ar" ? "rtl" : "ltr";
}

export function renderSafeInline(
  nodes: readonly BilingualInlineNode[],
): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return escapeBilingualHtml(node.text);
        case "value": {
          const semanticClass = node.valueKind
            ? ` bilingual-value--${escapeBilingualHtml(node.valueKind)}`
            : "";
          return `<bdi class="bilingual-value bilingual-value--${escapeBilingualHtml(
            node.value.kind,
          )}${semanticClass}" dir="${escapeBilingualHtml(
            node.value.dir,
          )}">${escapeBilingualHtml(node.value.text)}</bdi>`;
        }
        case "strong":
          return `<strong>${renderSafeInline(node.children)}</strong>`;
        case "emphasis":
          return `<em>${renderSafeInline(node.children)}</em>`;
        case "code":
          return `<code>${escapeBilingualHtml(node.text)}</code>`;
        case "link":
          if (!isSafeHref(node.href)) {
            throw new BilingualLayoutValidationError([
              {
                code: "INVALID_LINK",
                severity: "error",
                path: "$.inline.href",
                message: "Unsafe link reached the renderer.",
              },
            ]);
          }
          return `<a href="${escapeBilingualHtml(
            node.href,
          )}">${renderSafeInline(node.children)}</a>`;
        case "line-break":
          return "<br />";
        default:
          return assertNever(node);
      }
    })
    .join("");
}

function imageSource(source: SafeImageSource): string {
  return source.kind === "public" ? source.path : source.uri;
}

function renderListItems(
  items: readonly BilingualListItem[],
  language: DocumentLanguage,
  ordered: boolean,
  start?: number,
): string {
  const tag = ordered ? "ol" : "ul";
  const startAttribute =
    ordered && start !== undefined ? ` start="${String(start)}"` : "";
  const renderedItems = items
    .map((item) => {
      const content = item.content[language];
      const direction = resolvedDirection(content, language);
      const children =
        item.children && item.children.length > 0
          ? renderListItems(item.children, language, ordered)
          : "";
      return `<li data-list-item-id="${escapeBilingualHtml(
        item.id,
      )}" dir="${direction}">${renderSafeInline(content)}${children}</li>`;
    })
    .join("");
  return `<${tag}${startAttribute}>${renderedItems}</${tag}>`;
}

function tableAlignmentClass(align: BilingualTableColumn["align"]): string {
  return `bilingual-table-cell--${align ?? "start"}`;
}

function renderTable(
  table: PairedTableBlock,
  language: DocumentLanguage,
  includeHeader = true,
): string {
  const caption = table.caption
    ? `<caption>${renderSafeInline(table.caption[language])}</caption>`
    : "";
  const columnGroup = table.columns.some(
    (column) => column.widthPercent !== undefined,
  )
    ? `<colgroup>${table.columns
        .map((column) =>
          column.widthPercent === undefined
            ? "<col />"
            : `<col style="width:${String(column.widthPercent)}%" />`,
        )
        .join("")}</colgroup>`
    : "";
  const head = includeHeader
    ? `<thead><tr>${table.columns
        .map(
          (column) =>
            `<th scope="col" class="${tableAlignmentClass(
              column.align,
            )}">${renderSafeInline(column.header[language])}</th>`,
        )
        .join("")}</tr></thead>`
    : "";
  const body = `<tbody>${table.rows
    .map(
      (row) =>
        `<tr data-table-row-id="${escapeBilingualHtml(row.id)}">${table.columns
          .map((column) => {
            const cell = row.cells[column.id];
            if (!cell) return "";
            const content = cell.content[language];
            const direction = resolvedDirection(content, language);
            return `<td class="${tableAlignmentClass(
              column.align,
            )}" dir="${direction}">${renderSafeInline(content)}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("")}</tbody>`;
  return `<table data-repeat-header="${
    table.repeatHeader === false ? "false" : "true"
  }">${caption}${columnGroup}${head}${body}</table>`;
}

function renderBlockForLanguage(
  block: PairedBlock,
  language: DocumentLanguage,
): string {
  switch (block.type) {
    case "heading": {
      const content = block.content[language];
      const direction = resolvedDirection(
        content,
        language,
        block.direction ?? "auto",
      );
      return `<h${block.level} dir="${direction}">${renderSafeInline(
        content,
      )}</h${block.level}>`;
    }
    case "paragraph": {
      const content = block.content[language];
      const direction = resolvedDirection(
        content,
        language,
        block.direction ?? "auto",
      );
      return `<p dir="${direction}">${renderSafeInline(content)}</p>`;
    }
    case "list":
      return renderListItems(block.items, language, block.ordered, block.start);
    case "table":
      return renderTable(block, language);
    case "image": {
      const visualClass =
        block.visualBehavior === "mirror-in-rtl"
          ? " bilingual-visual--mirror-in-rtl"
          : "";
      const width =
        block.widthPercent === undefined
          ? ""
          : ` style="inline-size:${String(block.widthPercent)}%"`;
      const alt = block.decorative ? "" : block.alt[language];
      const caption = block.caption
        ? `<figcaption>${renderSafeInline(block.caption[language])}</figcaption>`
        : "";
      return `<figure class="bilingual-visual${visualClass}"><img src="${escapeBilingualHtml(
        imageSource(block.source),
      )}" alt="${escapeBilingualHtml(alt)}"${width}${
        block.decorative ? ' aria-hidden="true"' : ""
      } />${caption}</figure>`;
    }
    case "chart":
      return renderDocumentChart(block.chart, {
        locale: language,
        direction: language === "ar" ? "rtl" : "ltr",
        instanceKey: block.id,
      }).html;
    default:
      return assertNever(block);
  }
}

const MAX_PARAGRAPH_FRAGMENT_CHARACTERS = 360;
const MAX_LIST_ITEMS_PER_FRAGMENT = 1;
const MAX_TABLE_ROWS_PER_FRAGMENT = 1;

function splitTextAtSemanticBoundary(
  value: string,
  maximumGraphemes: number,
): readonly string[] {
  const graphemes = segmentGraphemes(value);
  if (graphemes.length <= maximumGraphemes) return [value];

  const parts: string[] = [];
  let cursor = 0;
  while (graphemes.length - cursor > maximumGraphemes) {
    const maximumEnd = cursor + maximumGraphemes;
    const minimumEnd = cursor + Math.floor(maximumGraphemes * 0.5);
    let splitAt = maximumEnd;
    for (let index = maximumEnd; index > minimumEnd; index -= 1) {
      const candidate = graphemes[index - 1];
      if (candidate !== undefined && /[\s.!?؟;،,]$/u.test(candidate)) {
        splitAt = index;
        break;
      }
    }
    const part = graphemes.slice(cursor, splitAt).join("");
    if (part.length > 0) parts.push(part);
    cursor = splitAt;
  }
  const remaining = graphemes.slice(cursor).join("");
  if (remaining.length > 0) parts.push(remaining);
  return parts.length > 0 ? parts : [value];
}

function splitOversizedInlineNode(
  node: BilingualInlineNode,
  maximumGraphemes: number,
): readonly BilingualInlineNode[] {
  if (countInlineGraphemes([node]) <= maximumGraphemes) return [node];
  switch (node.type) {
    case "text":
      return splitTextAtSemanticBoundary(node.text, maximumGraphemes).map(
        (text): TextInlineNode => ({ type: "text", text }),
      );
    case "code":
      return splitTextAtSemanticBoundary(node.text, maximumGraphemes).map(
        (text): CodeInlineNode => ({ type: "code", text }),
      );
    case "value":
      return splitTextAtSemanticBoundary(node.value.text, maximumGraphemes).map(
        (text): ValueInlineNode => ({
          ...node,
          value: { ...node.value, text },
        }),
      );
    case "strong":
    case "emphasis":
    case "link": {
      const childChunks = splitInlineContent(node.children, maximumGraphemes);
      return childChunks.map((children) => ({ ...node, children }));
    }
    case "line-break":
      return [node];
    default:
      return assertNever(node);
  }
}

function splitInlineContent(
  nodes: readonly BilingualInlineNode[],
  maximumGraphemes = MAX_PARAGRAPH_FRAGMENT_CHARACTERS,
): readonly (readonly BilingualInlineNode[])[] {
  const atoms = nodes.flatMap((node) =>
    splitOversizedInlineNode(node, maximumGraphemes),
  );
  const chunks: BilingualInlineNode[][] = [];
  let current: BilingualInlineNode[] = [];
  let currentGraphemes = 0;

  for (const atom of atoms) {
    const atomGraphemes = Math.max(1, countInlineGraphemes([atom]));
    if (
      current.length > 0 &&
      currentGraphemes + atomGraphemes > maximumGraphemes
    ) {
      chunks.push(current);
      current = [];
      currentGraphemes = 0;
    }
    current.push(atom);
    currentGraphemes += atomGraphemes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : [nodes];
}

function chunkArray<T>(
  values: readonly T[],
  size: number,
): readonly (readonly T[])[] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

interface CompiledRenderFragment {
  readonly id: string;
  readonly kind: PairedBlock["type"];
  readonly content: Localized<string>;
  readonly keepTogether: boolean;
  readonly keepWithNext: boolean;
}

function renderParagraphFragment(
  block: PairedParagraphBlock,
  language: DocumentLanguage,
  content: readonly BilingualInlineNode[] | undefined,
): string {
  if (!content || content.length === 0) {
    return '<p class="bilingual-fragment-placeholder" aria-hidden="true"></p>';
  }
  const direction = resolvedDirection(
    content,
    language,
    block.direction ?? "auto",
  );
  return `<p dir="${direction}">${renderSafeInline(content)}</p>`;
}

function compileBlockRenderFragments(
  block: PairedBlock,
): readonly CompiledRenderFragment[] {
  if (block.type === "paragraph") {
    const enChunks = splitInlineContent(block.content.en);
    const arChunks = splitInlineContent(block.content.ar);
    const fragmentCount = Math.max(enChunks.length, arChunks.length);
    return Array.from({ length: fragmentCount }, (_, index) => ({
      id:
        fragmentCount === 1
          ? block.id
          : `${block.id}--part-${String(index + 1)}`,
      kind: block.type,
      content: {
        en: renderParagraphFragment(block, "en", enChunks[index]),
        ar: renderParagraphFragment(block, "ar", arChunks[index]),
      },
      keepTogether: true,
      keepWithNext: false,
    }));
  }

  if (block.type === "list") {
    const chunks = chunkArray(block.items, MAX_LIST_ITEMS_PER_FRAGMENT);
    return chunks.map((items, index) => ({
      id:
        chunks.length === 1
          ? block.id
          : `${block.id}--part-${String(index + 1)}`,
      kind: block.type,
      content: {
        en: renderListItems(
          items,
          "en",
          block.ordered,
          block.ordered
            ? (block.start ?? 1) + index * MAX_LIST_ITEMS_PER_FRAGMENT
            : undefined,
        ),
        ar: renderListItems(
          items,
          "ar",
          block.ordered,
          block.ordered
            ? (block.start ?? 1) + index * MAX_LIST_ITEMS_PER_FRAGMENT
            : undefined,
        ),
      },
      keepTogether: true,
      keepWithNext: false,
    }));
  }

  if (block.type === "table") {
    const chunks = chunkArray(block.rows, MAX_TABLE_ROWS_PER_FRAGMENT);
    return chunks.map((rows, index) => {
      const table: PairedTableBlock = {
        ...block,
        rows,
        caption: index === 0 ? block.caption : undefined,
      };
      return {
        id:
          chunks.length === 1
            ? block.id
            : `${block.id}--part-${String(index + 1)}`,
        kind: block.type,
        content: {
          en: renderTable(
            table,
            "en",
            index === 0 || block.repeatHeader !== false,
          ),
          ar: renderTable(
            table,
            "ar",
            index === 0 || block.repeatHeader !== false,
          ),
        },
        keepTogether: true,
        keepWithNext: false,
      };
    });
  }

  return [
    {
      id: block.id,
      kind: block.type,
      content: {
        en: renderBlockForLanguage(block, "en"),
        ar: renderBlockForLanguage(block, "ar"),
      },
      keepTogether: true,
      keepWithNext: block.type === "heading" && block.keepWithNext === true,
    },
  ];
}

function renderLanguageCell(
  html: string,
  language: DocumentLanguage,
  className = "",
): string {
  return `<div class="bilingual-cell bilingual-cell--${language}${
    className ? ` ${className}` : ""
  }" data-language="${language}" lang="${language}" dir="${
    language === "ar" ? "rtl" : "ltr"
  }">${html}</div>`;
}

function orderedLanguages(
  mode: BilingualLayoutMode,
): readonly DocumentLanguage[] {
  if (mode === "serial-ar-first") return ["ar", "en"];
  return ["en", "ar"];
}

function fragmentClass(mode: BilingualLayoutMode): string {
  return mode === "parallel"
    ? "bilingual-pair bilingual-pair--parallel"
    : "bilingual-pair bilingual-pair--serial";
}

function renderPairedFragment(options: {
  section: PairedSection;
  fragmentId: string;
  content: Localized<string>;
  config: BilingualLayoutConfig;
  kind: string;
  keepTogether: boolean;
  keepWithNext?: boolean;
  fragmentIndex: number;
  fragmentCount: number;
  breakBefore?: boolean;
  sectionMarker?: boolean;
}): string {
  const {
    section,
    fragmentId,
    content,
    config,
    kind,
    keepTogether,
    keepWithNext = false,
    fragmentIndex,
    fragmentCount,
    breakBefore = false,
    sectionMarker = false,
  } = options;
  const languages = orderedLanguages(config.mode);
  const cells = languages
    .map((language) => renderLanguageCell(content[language], language))
    .join("");
  return `<div class="${fragmentClass(
    config.mode,
  )}" data-bilingual-pair data-alignment-key="${escapeBilingualHtml(
    section.alignmentKey,
  )}"${sectionMarker ? ` data-section-id="${escapeBilingualHtml(section.id)}"` : ""} data-fragment-id="${escapeBilingualHtml(
    fragmentId,
  )}" data-fragment-kind="${escapeBilingualHtml(
    kind,
  )}" data-fragment-keep="${keepTogether ? "true" : "false"}" data-fragment-keep-with-next="${
    keepWithNext ? "true" : "false"
  }" data-fragment-break-before="${breakBefore ? "true" : "false"}" data-fragment-index="${String(fragmentIndex)}" data-fragment-count="${String(
    fragmentCount,
  )}">${cells}</div>`;
}

function renderSection(
  section: PairedSection,
  config: BilingualLayoutConfig,
  flattenForPrint: boolean,
): string {
  const compiledBlocks = section.blocks.flatMap(compileBlockRenderFragments);
  const headingOffset = section.title ? 1 : 0;
  const fragmentCount = compiledBlocks.length + headingOffset;
  const sectionHeading = section.title
    ? renderPairedFragment({
        section,
        fragmentId: `${section.alignmentKey}--heading`,
        content: {
          en: `<h2 id="${escapeBilingualHtml(
            section.id,
          )}--heading">${renderSafeInline(section.title.en)}</h2>`,
          ar: `<h2>${renderSafeInline(section.title.ar)}</h2>`,
        },
        config,
        kind: "section-heading",
        keepTogether: true,
        keepWithNext: true,
        fragmentIndex: 0,
        fragmentCount,
        breakBefore: section.startOnNewPage === true,
        sectionMarker: flattenForPrint,
      })
    : "";

  const blocks = compiledBlocks
    .map((fragment, blockIndex) =>
      renderPairedFragment({
        section,
        fragmentId: `${section.alignmentKey}--${fragment.id}`,
        content: fragment.content,
        config,
        kind: fragment.kind,
        keepTogether: fragment.keepTogether,
        keepWithNext: fragment.keepWithNext,
        fragmentIndex: blockIndex + headingOffset,
        fragmentCount,
        breakBefore:
          section.startOnNewPage === true &&
          headingOffset === 0 &&
          blockIndex === 0,
        sectionMarker:
          flattenForPrint && headingOffset === 0 && blockIndex === 0,
      }),
    )
    .join("");

  const label = section.title
    ? ` aria-labelledby="${escapeBilingualHtml(section.id)}--heading"`
    : "";
  if (flattenForPrint) return sectionHeading + blocks;
  return `<section class="bilingual-section${
    section.startOnNewPage ? " bilingual-section--new-page" : ""
  }" data-section-id="${escapeBilingualHtml(section.id)}"${label}>${
    sectionHeading + blocks
  }</section>`;
}

function renderViewerMetadata(
  documentId: string,
  config: BilingualLayoutConfig,
  target: "screen" | "print",
): string {
  if (config.viewer.mode !== "tabs" || target === "print") return "";
  return `<div class="bilingual-viewer-tabs" data-bilingual-viewer-tabs data-viewer-controller="host" data-viewer-document="${escapeBilingualHtml(
    documentId,
  )}" role="note" aria-label="English and Arabic document">
  <span data-bilingual-viewer-static-label>English / العربية</span>
</div>`;
}

function renderDocumentTitle(
  document: BilingualDocumentSpec,
  config: BilingualLayoutConfig,
  flattenForPrint: boolean,
): string {
  const languages = orderedLanguages(config.mode);
  const cells = languages
    .map(
      (language) =>
        `<span class="bilingual-cell bilingual-cell--${language}" data-language="${language}" lang="${language}" dir="${
          language === "ar" ? "rtl" : "ltr"
        }">${renderSafeInline(document.title[language])}</span>`,
    )
    .join("");
  const heading = `<h1 class="${fragmentClass(
    config.mode,
  )}" data-bilingual-pair data-alignment-key="document-title" data-fragment-id="document-title" data-fragment-kind="document-title" data-fragment-keep="true" data-fragment-keep-with-next="false" data-fragment-break-before="false" data-fragment-index="0" data-fragment-count="1">${cells}</h1>`;
  return flattenForPrint
    ? heading
    : `<header class="bilingual-document-header">${heading}</header>`;
}

function resolveConfig(
  base: BilingualLayoutConfig,
  overrides?: BilingualLayoutOverrides,
): BilingualLayoutConfig {
  const config: BilingualLayoutConfig = {
    mode: overrides?.mode ?? base.mode,
    columnRatio: overrides?.columnRatio ?? base.columnRatio,
    mobileBreakpointPx:
      overrides?.mobileBreakpointPx ?? base.mobileBreakpointPx,
    mobileOrder: overrides?.mobileOrder ?? base.mobileOrder,
    viewer: {
      mode: overrides?.viewer?.mode ?? base.viewer.mode,
      defaultLanguage:
        overrides?.viewer?.defaultLanguage ?? base.viewer.defaultLanguage,
    },
  };
  const issues: BilingualValidationIssue[] = [];
  validateConfig(config, "$.layout", issues);
  if (issues.length > 0) throw new BilingualLayoutValidationError(issues);
  return deepFreeze(config);
}

export function generateBilingualCSS(
  config: BilingualLayoutConfig = DEFAULT_BILINGUAL_CONFIG,
): string {
  const issues: BilingualValidationIssue[] = [];
  validateConfig(config, "$.layout", issues);
  if (issues.length > 0) throw new BilingualLayoutValidationError(issues);

  const [enPercent, arPercent] = config.columnRatio;
  const mobileEnOrder = config.mobileOrder === "en-first" ? 1 : 2;
  const mobileArOrder = config.mobileOrder === "ar-first" ? 1 : 2;

  return `
:root {
  --bilingual-primary: #0F766E;
  --bilingual-ink: #173F5F;
  --bilingual-ink-deep: #0F172A;
  --bilingual-muted: #475569;
  --bilingual-border: #E2E8F0;
  --bilingual-border-strong: #94A3B8;
  --bilingual-surface: #F8FAFC;
  --bilingual-surface-strong: #EEF2F6;
  --bilingual-accent: #B45309;
  --bilingual-paper: #FFFFFF;
  --bilingual-en-column: ${String(enPercent)}fr;
  --bilingual-ar-column: ${String(arPercent)}fr;
  --bilingual-gap: 1.25rem;
  --bilingual-rule: 2.5px solid var(--bilingual-primary);
  --bilingual-hairline: 0.5px solid var(--bilingual-border);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  color: var(--bilingual-ink-deep);
  background: var(--bilingual-paper);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

.bilingual-document {
  direction: ltr;
  max-inline-size: 210mm;
  margin-inline: auto;
  padding-inline: 1.75rem;
  padding-block: 1.5rem 1.25rem;
  font-size: 11pt;
  line-height: 1.55;
  color: var(--bilingual-ink-deep);
}

.bilingual-document-header,
.bilingual-section {
  display: contents;
}

.bilingual-document h1,
.bilingual-document h2,
.bilingual-document h3,
.bilingual-document h4,
.bilingual-document h5,
.bilingual-document h6 {
  margin-block: 0;
  color: var(--bilingual-ink);
  font-weight: 650;
  letter-spacing: -0.012em;
  line-height: 1.25;
  text-wrap: balance;
}

.bilingual-document h1[data-fragment-kind="document-title"] {
  font-size: 1.55rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  padding-block-end: 0.7rem;
  margin-block-end: 1.1rem;
  border-block-end: var(--bilingual-rule);
  break-before: auto !important;
  page-break-before: auto !important;
}

.bilingual-document h1[data-fragment-kind="document-title"] .bilingual-cell {
  padding-block: 0.15rem 0.35rem;
}

.bilingual-document h2 {
  font-size: 0.95rem;
  font-weight: 650;
  letter-spacing: -0.01em;
  padding-block-end: 0.35rem;
  margin-block-end: 0.15rem;
  border-block-end: 1px solid color-mix(in srgb, var(--bilingual-primary) 45%, var(--bilingual-border));
}

.bilingual-document h3 {
  font-size: 0.88rem;
  font-weight: 600;
}

.bilingual-section--new-page {
  break-before: page;
}

.bilingual-pair {
  position: relative;
  inline-size: 100%;
  margin-block-end: 0.7rem;
  break-inside: avoid-page;
  page-break-inside: avoid;
}

.bilingual-pair--parallel {
  display: grid;
  grid-template-columns:
    minmax(0, var(--bilingual-en-column))
    minmax(0, var(--bilingual-ar-column));
  gap: var(--bilingual-gap);
  direction: ltr;
  align-items: stretch;
}

.bilingual-pair--serial {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.bilingual-cell {
  position: relative;
  min-inline-size: 0;
  padding-inline: 0.55rem;
  padding-block: 0.4rem;
  overflow-wrap: break-word;
}

.bilingual-continuation-marker {
  position: absolute;
  inset-inline-start: 0.55rem;
  z-index: 1;
  color: var(--bilingual-muted);
  font-size: 7.5px;
  font-weight: 600;
  line-height: 10px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.bilingual-continuation-marker--before {
  inset-block-start: 1px;
}

.bilingual-continuation-marker--after {
  inset-block-end: 1px;
}

.bilingual-cell--en {
  font-family: ${designTokens.typography.fontFamilies.english};
  text-align: start;
}

.bilingual-cell--ar {
  font-family: ${designTokens.typography.fontFamilies.arabic};
  text-align: start;
  letter-spacing: 0;
}

.bilingual-value {
  unicode-bidi: isolate;
}

.bilingual-value--identifier,
.bilingual-value--url,
.bilingual-value--email,
.bilingual-value--technical-term {
  overflow-wrap: anywhere;
}

.bilingual-value--number,
.bilingual-value--currency,
.bilingual-value--date,
.bilingual-table-cell--numeric {
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings: "tnum" 1, "lnum" 1;
}

.bilingual-cell p {
  margin-block: 0 0.55rem;
  line-height: 1.55;
  color: var(--bilingual-ink-deep);
}

.bilingual-cell ul,
.bilingual-cell ol {
  margin-block: 0.2rem 0.65rem;
  padding-inline-start: 1.15rem;
}

.bilingual-cell li {
  margin-block: 0.18rem;
  line-height: 1.45;
  padding-inline-start: 0.1rem;
}

.bilingual-cell li::marker {
  color: var(--bilingual-primary);
  font-weight: 600;
}

.bilingual-cell table {
  inline-size: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  margin-block: 0.35rem 0.55rem;
  font-size: 0.86rem;
  line-height: 1.35;
  border: none;
  border-block-start: 1.5px solid var(--bilingual-ink);
  border-block-end: 1.5px solid var(--bilingual-ink);
}

.bilingual-cell caption {
  margin-block-end: 0.4rem;
  font-weight: 650;
  font-size: 0.78rem;
  letter-spacing: 0.01em;
  color: var(--bilingual-ink);
  text-align: start;
}

.bilingual-cell th,
.bilingual-cell td {
  padding-inline: 0.55rem;
  padding-block: 0.42rem;
  border: none;
  border-block-end: var(--bilingual-hairline);
  vertical-align: top;
  text-align: start;
  overflow-wrap: anywhere;
}

.bilingual-cell thead {
  display: table-header-group;
  background: linear-gradient(
    180deg,
    var(--bilingual-surface-strong) 0%,
    var(--bilingual-surface) 100%
  );
}

.bilingual-cell th {
  font-weight: 650;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--bilingual-ink);
  border-block-end: 1px solid var(--bilingual-border-strong);
}

.bilingual-cell tbody tr:last-child td {
  border-block-end: none;
}

.bilingual-cell table[data-repeat-header="false"] thead {
  display: table-row-group;
}

.bilingual-table-cell--center { text-align: center !important; }
.bilingual-table-cell--end { text-align: end !important; }
.bilingual-table-cell--numeric { text-align: end !important; }

.bilingual-visual {
  margin-inline: 0;
  margin-block: 0.85rem 0.35rem;
  padding-block: 0.55rem 0.35rem;
  text-align: center;
  border-block-start: var(--bilingual-hairline);
}

.bilingual-visual img {
  max-inline-size: 100%;
  block-size: auto;
  border-radius: 2px;
}

[dir="rtl"] .bilingual-visual--mirror-in-rtl img {
  transform: scaleX(-1);
}

.bilingual-visual figcaption {
  margin-block-start: 0.4rem;
  color: var(--bilingual-muted);
  font-size: 0.7rem;
  font-weight: 550;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.bilingual-document-footer {
  display: grid;
  grid-template-columns:
    minmax(0, var(--bilingual-en-column))
    minmax(0, var(--bilingual-ar-column));
  gap: var(--bilingual-gap);
  margin-block-start: 1.35rem;
  padding-block-start: 0.7rem;
  border-block-start: 1.5px solid var(--bilingual-ink);
  color: var(--bilingual-muted);
  font-size: 0.68rem;
  letter-spacing: 0.02em;
  line-height: 1.4;
}

.bilingual-document-footer__cell {
  min-inline-size: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.bilingual-document-footer__cell--en,
.bilingual-document-footer__cell--ar {
  text-align: start;
}

.bilingual-document-footer__brand {
  color: var(--bilingual-ink);
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-size: 0.66rem;
}

.bilingual-document-footer__meta {
  color: var(--bilingual-muted);
}

.document-chart {
  min-inline-size: 0;
  margin-inline: 0;
}

.document-chart svg {
  display: block;
  max-inline-size: 100%;
  block-size: auto;
}

.document-chart-data-fallback {
  max-inline-size: 100%;
  overflow-x: auto;
}

[data-fragment-keep="true"] {
  break-inside: avoid;
}

[data-fragment-keep-with-next="true"] {
  break-after: avoid-page;
}

.bilingual-viewer-tabs {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-block-end: 1rem;
}

.bilingual-viewer-tabs button {
  padding-inline: 0.9rem;
  padding-block: 0.4rem;
  border: 1px solid var(--bilingual-primary);
  border-radius: 999px;
  color: var(--bilingual-primary);
  background: white;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
}

.bilingual-viewer-tabs button[aria-pressed="true"] {
  color: white;
  background: var(--bilingual-primary);
}

[data-viewer-mode="tabs"] .bilingual-pair {
  display: block;
}

[data-viewer-mode="tabs"][data-viewer-language="en"] [data-language="ar"],
[data-viewer-mode="tabs"][data-viewer-language="ar"] [data-language="en"] {
  display: none;
}

[data-bilingual-sync-measuring="true"] .bilingual-pair--parallel {
  display: grid !important;
  grid-template-columns:
    minmax(0, var(--bilingual-en-column))
    minmax(0, var(--bilingual-ar-column)) !important;
  gap: var(--bilingual-gap) !important;
}

[data-bilingual-sync-measuring="true"] .bilingual-pair--parallel [data-language] {
  display: block !important;
}

[data-bilingual-sync-measuring="true"] .bilingual-pair--serial {
  display: flex !important;
}

[data-bilingual-sync-measuring="true"] .bilingual-pair--serial [data-language] {
  display: block !important;
}

@media screen and (max-width: ${String(config.mobileBreakpointPx)}px) {
  .bilingual-document {
    padding-inline: 1rem;
  }

  .bilingual-pair--parallel,
  .bilingual-document-footer {
    grid-template-columns: minmax(0, 1fr);
  }

  .bilingual-pair--parallel {
    gap: 0.75rem;
  }

  .bilingual-cell--en { order: ${String(mobileEnOrder)}; }
  .bilingual-cell--ar { order: ${String(mobileArOrder)}; }

  .bilingual-document-footer__cell--en { order: ${String(mobileEnOrder)}; }
  .bilingual-document-footer__cell--ar { order: ${String(mobileArOrder)}; }
}

@media print {
  .bilingual-document {
    max-inline-size: none;
    padding: 0;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  .bilingual-document-header,
  .bilingual-section {
    display: contents;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .bilingual-section--new-page {
    break-before: auto;
  }

  .bilingual-viewer-tabs {
    display: none !important;
  }

  [data-viewer-mode="tabs"] .bilingual-pair--parallel {
    display: grid !important;
  }

  .bilingual-pair--parallel,
  .bilingual-document-footer {
    grid-template-columns:
      minmax(0, var(--bilingual-en-column))
      minmax(0, var(--bilingual-ar-column)) !important;
    gap: var(--bilingual-gap) !important;
  }

  [data-viewer-mode="tabs"] .bilingual-pair--serial {
    display: flex !important;
  }

  [data-viewer-mode="tabs"] [data-language] {
    display: block !important;
  }

  .bilingual-cell th,
  .bilingual-cell thead {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
}
`.trim();
}

export class BilingualLayoutEngine {
  readonly config: BilingualLayoutConfig;

  constructor(config: BilingualLayoutOverrides = {}) {
    this.config = resolveConfig(DEFAULT_BILINGUAL_CONFIG, config);
  }

  validate(document: unknown): BilingualValidationResult {
    const documentResult = validateBilingualDocument(document);
    if (!isRecord(document)) return documentResult;

    const issues = [...documentResult.issues];
    try {
      resolveConfig(this.config, document.layout as BilingualLayoutOverrides);
    } catch (error) {
      if (error instanceof BilingualLayoutValidationError) {
        issues.push(...error.issues);
      } else {
        throw error;
      }
    }
    return {
      valid: !issues.some((issue) => issue.severity === "error"),
      issues,
    };
  }

  render(input: unknown, options: RenderBilingualDocumentOptions = {}): string {
    const validation = this.validate(input);
    if (!validation.valid) {
      throw new BilingualLayoutValidationError(validation.issues);
    }
    const document = deepFreeze(input as BilingualDocumentSpec);
    const config = resolveConfig(this.config, document.layout);
    const target = options.target ?? "screen";
    const includeDocumentShell = options.includeDocumentShell ?? true;
    const effectiveViewerMode = "both";
    const root = `<main class="bilingual-document" data-bilingual-document data-document-id="${escapeBilingualHtml(
      document.id,
    )}" data-layout-mode="${config.mode}" data-viewer-preference="${
      config.viewer.mode
    }" data-viewer-mode="${effectiveViewerMode}" data-viewer-language="${
      config.viewer.defaultLanguage
    }" data-render-target="${target}" data-bilingual-layout-state="pending" data-bilingual-layout-ready="false">
${renderViewerMetadata(document.id, config, target)}
${renderDocumentTitle(document, config, target === "print")}
${document.sections
  .map((section) => renderSection(section, config, target === "print"))
  .join("\n")}
<footer class="bilingual-document-footer" data-bilingual-footer aria-label="Document identity">
  <div class="bilingual-document-footer__cell bilingual-document-footer__cell--en" lang="en" dir="ltr">
    <span class="bilingual-document-footer__brand">Print-ready draft</span>
    <span class="bilingual-document-footer__meta">Human author is final authority · Confidential</span>
  </div>
  <div class="bilingual-document-footer__cell bilingual-document-footer__cell--ar" lang="ar" dir="rtl">
    <span class="bilingual-document-footer__brand">مسودة جاهزة للطباعة</span>
    <span class="bilingual-document-footer__meta">المؤلف البشري هو المرجع النهائي · سري</span>
  </div>
</footer>
</main>`;

    if (!includeDocumentShell) return root;

    const title = `${inlineText(document.title.en)} · ${inlineText(
      document.title.ar,
    )}`;
    return `<!DOCTYPE html>
<html lang="${config.viewer.defaultLanguage}" dir="${
      config.viewer.defaultLanguage === "ar" ? "rtl" : "ltr"
    }">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeBilingualHtml(title)}</title>
<style>${generateBilingualCSS(config)}</style>
</head>
<body>
${root}
</body>
</html>`;
  }
}

export function renderBilingualHTML(
  document: unknown,
  options: RenderBilingualDocumentOptions = {},
): string {
  const documentLayout =
    isRecord(document) && isRecord(document.layout)
      ? (document.layout as BilingualLayoutOverrides)
      : {};
  return new BilingualLayoutEngine(documentLayout).render(document, options);
}
