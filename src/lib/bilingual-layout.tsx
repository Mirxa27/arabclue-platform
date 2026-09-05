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
import {
  describeIntegrityHash,
  isSafeIntegrityQrPayload,
  renderIntegrityQrSvg,
} from "./pdf/document-chrome";

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

export interface BilingualKpiItem {
  readonly id: string;
  readonly label: Localized<readonly BilingualInlineNode[]>;
  readonly value: Localized<readonly BilingualInlineNode[]>;
  readonly hint?: Localized<readonly BilingualInlineNode[]>;
}

export interface PairedKpiBlock {
  readonly type: "kpi";
  readonly id: string;
  /** Between one and six metrics; larger sets belong in a table. */
  readonly items: readonly BilingualKpiItem[];
}

export type PairedBlock =
  | PairedHeadingBlock
  | PairedParagraphBlock
  | PairedListBlock
  | PairedTableBlock
  | PairedImageBlock
  | PairedChartBlock
  | PairedKpiBlock;

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
  /** Render a full branded cover page before the document body. */
  readonly cover?: BilingualDocumentCover;
  /** Insert a bilingual table of contents linking every titled section. */
  readonly tableOfContents?: boolean;
  /** Prefix section headings (and TOC entries) with hierarchical numbers. */
  readonly sectionNumbering?: boolean;
  /**
   * Draft artifacts carry the honest draft footer; final artifacts are
   * approved/authoritative exports and say so instead.
   */
  readonly lifecycle?: "draft" | "final";
  /**
   * Workspace brand colors mapped onto the document palette. Invalid values
   * fall back to the built-in defaults; low-contrast secondary colors never
   * replace body ink.
   */
  readonly palette?: BilingualBrandPalette;
  /**
   * Real integrity data for the artifact (content hash, optional offline QR
   * payload). Only a verified hex prefix is ever printed; when omitted, no
   * integrity strip is rendered at all.
   */
  readonly integrity?: BilingualDocumentIntegrity;
  /**
   * Append a bilingual signature / approval block after the last section.
   * Off by default so lightweight fixtures keep their exact pair count.
   */
  readonly signatureBlock?: boolean;
}

/** Content shown on a generated cover page. All fields are optional. */
export interface BilingualDocumentCover {
  /** Small label above the title, e.g. "Technical proposal". */
  readonly kicker?: Localized<string>;
  readonly subtitle?: Localized<string>;
  readonly bidderName?: Localized<string>;
  readonly tenderReference?: string;
  readonly dateLabel?: Localized<string>;
  /** Handling / confidentiality line printed on the cover meta block. */
  readonly confidentiality?: Localized<string>;
}

/**
 * Integrity metadata that already exists for the artifact. The hash is
 * displayed as a short prefix on the cover and in the footer strip; the QR
 * payload (for example `arabclue:proposal:<id>:<hash>`) is encoded verbatim
 * for offline checks. No verification URL is invented.
 */
export interface BilingualDocumentIntegrity {
  /** Hex digest, optionally prefixed with `sha256:`. */
  readonly hash: string;
  /** Printable-ASCII payload (1-512 characters) for the cover QR code. */
  readonly qrPayload?: string;
  /** Caption for the hash, defaulting to "Content hash" / "بصمة المحتوى". */
  readonly label?: Localized<string>;
}

/**
 * Brand color overrides for the document palette. Values must be hex colors
 * (`#RGB` or `#RRGGBB`); anything else keeps the built-in default.
 */
export interface BilingualBrandPalette {
  readonly primaryColor?: string | null;
  readonly secondaryColor?: string | null;
  readonly accentColor?: string | null;
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
    case "kpi":
      validateKpi(value, path, issues, stats, ids);
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
): void {  if (!isRecord(chartBlock.chart)) {
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

const MAX_KPI_ITEMS = 6;

function validateKpi(
  block: Readonly<Record<string, unknown>>,
  path: string,
  issues: BilingualValidationIssue[],
  stats: ValidationStats,
  ids: Set<string>,
): void {
  if (!Array.isArray(block.items) || block.items.length === 0) {
    addIssue(
      issues,
      "INVALID_BLOCK",
      `${path}.items`,
      "A KPI block must contain at least one metric.",
    );
    return;
  }
  if (block.items.length > MAX_KPI_ITEMS) {
    addIssue(
      issues,
      "INVALID_BLOCK",
      `${path}.items`,
      `A KPI block must contain at most ${String(MAX_KPI_ITEMS)} metrics.`,
    );
  }
  for (const [index, item] of block.items.entries()) {
    const itemPath = `${path}.items[${String(index)}]`;
    if (!isRecord(item)) {
      addIssue(
        issues,
        "INVALID_BLOCK",
        itemPath,
        "A KPI metric must be a structured object.",
      );
      continue;
    }
    validateStableId(item.id, `${itemPath}.id`, issues, ids);
    validateLocalizedInline(
      item.label,
      `${itemPath}.label`,
      issues,
      stats,
    );
    validateLocalizedInline(
      item.value,
      `${itemPath}.value`,
      issues,
      stats,
    );
    if (item.hint !== undefined) {
      validateLocalizedInline(item.hint, `${itemPath}.hint`, issues, stats);
    }
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

/**
 * Approximate graphemes that fit across one language column at table size.
 * Dense tables step their type down (see CSS), which raises the budget.
 */
const TABLE_GRAPHEME_BUDGET = 52;
const TABLE_BUDGET_SCALE_BY_COLUMNS: Readonly<Record<number, number>> = {
  4: 1.06,
  5: 1.24,
  6: 1.24,
};
const COLUMN_CONTENT_WEIGHT_CAP = 48;
const COLUMN_TOKEN_MIN_CAP = 16;
const COLUMN_PADDING_GRAPHEMES = 3;
/** Uppercase, tracked header text and tabular numerals run wider than prose. */
const HEADER_TOKEN_FACTOR = 1.5;
/** Dense tables keep sentence-case headers, so their tokens are not wider. */
const DENSE_HEADER_TOKEN_FACTOR = 1.05;
const DENSE_TABLE_COLUMN_THRESHOLD = 4;
const NUMERIC_TOKEN_FACTOR = 1.2;
const NON_BREAKING_VALUE_KINDS = new Set<BilingualValueKind>([
  "number",
  "currency",
  "date",
]);

function longestTokenGraphemes(nodes: readonly BilingualInlineNode[]): number {
  return inlineText(nodes)
    .split(/\s+/u)
    .reduce((longest, token) => Math.max(longest, countGraphemes(token)), 0);
}

/** True when the cell is set entirely in non-breaking numeric values. */
function isNonBreakingCell(nodes: readonly BilingualInlineNode[]): boolean {
  return (
    nodes.length > 0 &&
    nodes.every(
      (node) =>
        node.type === "value" &&
        node.valueKind !== undefined &&
        NON_BREAKING_VALUE_KINDS.has(node.valueKind),
    )
  );
}

interface ColumnSizingStats {
  /** Width a column needs for tokens the stylesheet never breaks. */
  readonly hardMin: number;
  /** Width the longest ordinary token wants before mid-word breaking. */
  readonly softMin: number;
  /** Share of leftover space, from the longest header or cell text. */
  readonly weight: number;
}

function columnSizingStats(
  table: PairedTableBlock,
  column: BilingualTableColumn,
): ColumnSizingStats {
  const headerToken =
    Math.max(
      longestTokenGraphemes(column.header.en),
      longestTokenGraphemes(column.header.ar),
    ) *
    (table.columns.length >= DENSE_TABLE_COLUMN_THRESHOLD
      ? DENSE_HEADER_TOKEN_FACTOR
      : HEADER_TOKEN_FACTOR);
  let hardToken = 0;
  let softToken = headerToken;
  let longestText = Math.max(
    countInlineGraphemes(column.header.en),
    countInlineGraphemes(column.header.ar),
  );
  for (const row of table.rows) {
    const cell = row.cells[column.id];
    if (!cell) continue;
    for (const language of ["en", "ar"] as const) {
      const content = cell.content[language];
      const token = longestTokenGraphemes(content);
      if (isNonBreakingCell(content)) {
        hardToken = Math.max(hardToken, token * NUMERIC_TOKEN_FACTOR);
      } else {
        softToken = Math.max(softToken, token);
      }
      longestText = Math.max(longestText, countInlineGraphemes(content));
    }
  }
  return {
    hardMin: hardToken > 0 ? hardToken + COLUMN_PADDING_GRAPHEMES : 0,
    softMin:
      Math.min(softToken, COLUMN_TOKEN_MIN_CAP) + COLUMN_PADDING_GRAPHEMES,
    weight: Math.min(longestText, COLUMN_CONTENT_WEIGHT_CAP) + 4,
  };
}

/**
 * Deterministic column widths for tables whose author gave none. Fixed table
 * layout keeps every row fragment aligned, but equal widths starve long
 * columns and split words mid-token. Each column first receives room for its
 * non-breaking numerals, then for its longest ordinary token, and any space
 * left is shared by content length; both language tables use the same grid.
 */
function resolveColumnWidths(table: PairedTableBlock): readonly number[] | null {
  const columnCount = table.columns.length;
  if (columnCount < 2) return null;
  if (table.columns.some((column) => column.widthPercent !== undefined)) {
    return null;
  }
  const budget =
    TABLE_GRAPHEME_BUDGET *
    (TABLE_BUDGET_SCALE_BY_COLUMNS[columnCount] ?? (columnCount > 6 ? 1.33 : 1));
  const stats = table.columns.map((column) => columnSizingStats(table, column));
  const sum = (values: readonly number[]): number =>
    values.reduce((total, value) => total + value, 0);

  const hardTotal = sum(stats.map((column) => column.hardMin));
  const hardScale = hardTotal > budget ? budget / hardTotal : 1;
  const hard = stats.map((column) => column.hardMin * hardScale);
  const softBudget = Math.max(0, budget - sum(hard));
  const softNeeds = stats.map((column) =>
    column.hardMin > 0 ? Math.max(0, column.softMin - column.hardMin) : column.softMin,
  );
  const softTotal = sum(softNeeds);
  const softScale = softTotal > softBudget ? softBudget / softTotal : 1;
  const base = stats.map((_, index) => hard[index] + softNeeds[index] * softScale);
  const remaining = Math.max(0, budget - sum(base));
  const weightTotal = sum(stats.map((column) => column.weight));
  const widths = stats.map(
    (column, index) => base[index] + remaining * (column.weight / weightTotal),
  );
  const widthTotal = sum(widths);
  return widths.map((width) => Math.round((width / widthTotal) * 1000) / 10);
}

function renderColumnGroup(
  table: PairedTableBlock,
  resolvedWidths: readonly number[] | null,
): string {
  if (resolvedWidths) {
    return `<colgroup>${resolvedWidths
      .map((width) => `<col style="width:${String(width)}%" />`)
      .join("")}</colgroup>`;
  }
  if (!table.columns.some((column) => column.widthPercent !== undefined)) {
    return "";
  }
  return `<colgroup>${table.columns
    .map((column) =>
      column.widthPercent === undefined
        ? "<col />"
        : `<col style="width:${String(column.widthPercent)}%" />`,
    )
    .join("")}</colgroup>`;
}

function renderTable(
  table: PairedTableBlock,
  language: DocumentLanguage,
  includeHeader = true,
  rowIndexOffset = 0,
  resolvedWidths: readonly number[] | null = resolveColumnWidths(table),
): string {
  const caption = table.caption
    ? `<caption>${renderSafeInline(table.caption[language])}</caption>`
    : "";
  const columnGroup = renderColumnGroup(table, resolvedWidths);
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
      (row, rowIndex) =>
        `<tr data-table-row-id="${escapeBilingualHtml(row.id)}" data-row-parity="${
          (rowIndexOffset + rowIndex) % 2 === 0 ? "even" : "odd"
        }">${table.columns
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
  }" data-column-count="${String(table.columns.length)}">${caption}${columnGroup}${head}${body}</table>`;
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
    case "kpi":
      return `<div class="bilingual-kpi-grid" role="list">${block.items
        .map((item) => {
          const hint = item.hint
            ? `<span class="bilingual-kpi-hint">${renderSafeInline(
                item.hint[language],
              )}</span>`
            : "";
          return `<div class="bilingual-kpi-card" role="listitem" data-kpi-id="${escapeBilingualHtml(
            item.id,
          )}"><span class="bilingual-kpi-value">${renderSafeInline(
            item.value[language],
          )}</span><span class="bilingual-kpi-label">${renderSafeInline(
            item.label[language],
          )}</span>${hint}</div>`;
        })
        .join("")}</div>`;
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

/**
 * Position of a fragment inside a block that the compiler split at a safe
 * boundary. Continuation parts let the stylesheet render one visually
 * continuous table or list even though every row is its own pagination unit.
 */
type FragmentPart = "only" | "first" | "middle" | "last";

interface CompiledRenderFragment {
  readonly id: string;
  readonly kind: PairedBlock["type"];
  readonly content: Localized<string>;
  readonly keepTogether: boolean;
  readonly keepWithNext: boolean;
  readonly part: FragmentPart;
}

function fragmentPart(index: number, count: number): FragmentPart {
  if (count <= 1) return "only";
  if (index === 0) return "first";
  return index === count - 1 ? "last" : "middle";
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
      part: fragmentPart(index, fragmentCount),
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
      part: fragmentPart(index, chunks.length),
    }));
  }

  if (block.type === "table") {
    const chunks = chunkArray(block.rows, MAX_TABLE_ROWS_PER_FRAGMENT);
    // Widths derive from the whole table once so every row fragment shares
    // the same column grid in both languages.
    const resolvedWidths = resolveColumnWidths(block);
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
            index * MAX_TABLE_ROWS_PER_FRAGMENT,
            resolvedWidths,
          ),
          ar: renderTable(
            table,
            "ar",
            index === 0 || block.repeatHeader !== false,
            index * MAX_TABLE_ROWS_PER_FRAGMENT,
            resolvedWidths,
          ),
        },
        keepTogether: true,
        keepWithNext: false,
        part: fragmentPart(index, chunks.length),
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
      part: "only",
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
  part?: FragmentPart;
  /** Extra class for chrome pairs (cover, signature) that carry own styling. */
  className?: string;
  cellClassName?: string;
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
    part = "only",
    className = "",
    cellClassName = "",
  } = options;
  const languages = orderedLanguages(config.mode);
  const cells = languages
    .map((language) =>
      renderLanguageCell(content[language], language, cellClassName),
    )
    .join("");
  return `<div class="${fragmentClass(config.mode)}${
    className ? ` ${className}` : ""
  }" data-bilingual-pair data-alignment-key="${escapeBilingualHtml(
    section.alignmentKey,
  )}"${sectionMarker ? ` data-section-id="${escapeBilingualHtml(section.id)}"` : ""} data-fragment-id="${escapeBilingualHtml(
    fragmentId,
  )}" data-fragment-kind="${escapeBilingualHtml(
    kind,
  )}" data-fragment-keep="${keepTogether ? "true" : "false"}" data-fragment-keep-with-next="${
    keepWithNext ? "true" : "false"
  }" data-fragment-break-before="${breakBefore ? "true" : "false"}" data-fragment-index="${String(fragmentIndex)}" data-fragment-count="${String(
    fragmentCount,
  )}" data-fragment-part="${part}">${cells}</div>`;
}

function renderSection(
  section: PairedSection,
  config: BilingualLayoutConfig,
  flattenForPrint: boolean,
  numberLabel?: string,
): string {
  const compiledBlocks = section.blocks.flatMap(compileBlockRenderFragments);
  const headingOffset = section.title ? 1 : 0;
  const fragmentCount = compiledBlocks.length + headingOffset;
  const numberPrefix = numberLabel
    ? `<span class="bilingual-section-number">${escapeBilingualHtml(
        numberLabel,
      )}</span> `
    : "";
  const sectionHeading = section.title
    ? renderPairedFragment({
        section,
        fragmentId: `${section.alignmentKey}--heading`,
        content: {
          en: `<h2 id="${escapeBilingualHtml(
            section.id,
          )}--heading">${numberPrefix}${renderSafeInline(section.title.en)}</h2>`,
          ar: `<h2>${numberPrefix}${renderSafeInline(section.title.ar)}</h2>`,
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
        part: fragment.part,
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
  followsCover = false,
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
  // After a cover sheet the title opens the body on its own page; the cover
  // pair itself is a single synchronized row, so the paginator needs this
  // explicit break to keep body rows off the cover.
  const heading = `<h1 class="${fragmentClass(
    config.mode,
  )}" data-bilingual-pair data-alignment-key="document-title" data-fragment-id="document-title" data-fragment-kind="document-title" data-fragment-keep="true" data-fragment-keep-with-next="true" data-fragment-break-before="${
    followsCover ? "true" : "false"
  }" data-fragment-index="0" data-fragment-count="1" data-fragment-part="only">${cells}</h1>`;
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

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normalizedHexColor(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !HEX_COLOR_PATTERN.test(trimmed)) return null;
  if (trimmed.length === 4) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase();
  }
  return trimmed.toLowerCase();
}

function hexToRgbChannel(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgbChannel(hex).map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio; used to keep body ink readable over white paper. */
function contrastRatio(foreground: string, background: string): number {
  const luminanceForeground = relativeLuminance(foreground);
  const luminanceBackground = relativeLuminance(background);
  const lighter = Math.max(luminanceForeground, luminanceBackground);
  const darker = Math.min(luminanceForeground, luminanceBackground);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Document font stacks: local OFL families first, then metric-compatible system fallbacks. */
const DOCUMENT_FONT_STACK_EN =
  '"IBM Plex Sans", "Noto Sans", "Segoe UI", Arial, sans-serif';
const DOCUMENT_FONT_STACK_AR =
  '"IBM Plex Sans Arabic", "Noto Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif';
const DOCUMENT_FONT_STACK_MONO =
  '"IBM Plex Mono", "SFMono-Regular", Menlo, Consolas, monospace';

export function generateBilingualCSS(
  config: BilingualLayoutConfig = DEFAULT_BILINGUAL_CONFIG,
  palette?: BilingualBrandPalette,
): string {
  const issues: BilingualValidationIssue[] = [];
  validateConfig(config, "$.layout", issues);
  if (issues.length > 0) throw new BilingualLayoutValidationError(issues);

  const [enPercent, arPercent] = config.columnRatio;
  const mobileEnOrder = config.mobileOrder === "en-first" ? 1 : 2;
  const mobileArOrder = config.mobileOrder === "ar-first" ? 1 : 2;

  // Brand palette override: invalid values silently keep defaults; a brand
  // secondary may only become body ink when it stays WCAG-readable on paper.
  const DEFAULT_PRIMARY = "#0F766E";
  const DEFAULT_INK = "#173F5F";
  const DEFAULT_ACCENT = "#B45309";
  const primary = normalizedHexColor(palette?.primaryColor) ?? DEFAULT_PRIMARY;
  const accent = normalizedHexColor(palette?.accentColor) ?? DEFAULT_ACCENT;
  const secondaryCandidate = normalizedHexColor(palette?.secondaryColor);
  const ink =
    secondaryCandidate &&
    contrastRatio(secondaryCandidate, "#FFFFFF") >= 4.5
      ? secondaryCandidate
      : DEFAULT_INK;
  // Brand primaries are often mid-tone; text set in the primary must still
  // clear AA on paper, so darken it when the brand colour is too light.
  const primaryText =
    contrastRatio(primary, "#FFFFFF") >= 4.5
      ? primary
      : `color-mix(in srgb, ${primary} 70%, #000000)`;

  return `
:root {
  color-scheme: light;
  --bilingual-primary: ${primary};
  --bilingual-primary-text: ${primaryText};
  --bilingual-ink: ${ink};
  --bilingual-ink-deep: #0F172A;
  --bilingual-muted: #475569;
  --bilingual-border: #D9DEE5;
  --bilingual-border-strong: #94A3B8;
  --bilingual-surface: #F6F8FA;
  --bilingual-surface-strong: #EDF1F5;
  --bilingual-accent: ${accent};
  --bilingual-paper: #FFFFFF;
  --bilingual-band-ink: #FFFFFF;
  --bilingual-en-column: ${String(enPercent)}fr;
  --bilingual-ar-column: ${String(arPercent)}fr;
  --bilingual-en-fraction: ${String(enPercent / 100)};
  --bilingual-gap: 1.25rem;
  --bilingual-cell-inline-padding: 0.55rem;
  --bilingual-rule: 2.5px solid var(--bilingual-primary);
  --bilingual-hairline: 0.5px solid var(--bilingual-border);
  --bilingual-font-en: ${DOCUMENT_FONT_STACK_EN};
  --bilingual-font-ar: ${DOCUMENT_FONT_STACK_AR};
  --bilingual-font-mono: ${DOCUMENT_FONT_STACK_MONO};
  /* Type scale (print-first, in points). Arabic runs one step larger with
     more leading so connected letterforms and diacritics stay legible. */
  --bilingual-size-display: 20pt;
  --bilingual-size-h1: 17pt;
  --bilingual-size-h2: 12.5pt;
  --bilingual-size-h3: 11pt;
  --bilingual-size-body: 10.5pt;
  --bilingual-size-body-ar: 11pt;
  --bilingual-size-small: 9pt;
  --bilingual-size-caption: 8pt;
  --bilingual-size-micro: 7pt;
  --bilingual-leading-body-en: 1.5;
  --bilingual-leading-body-ar: 1.7;
  --bilingual-leading-heading-en: 1.22;
  --bilingual-leading-heading-ar: 1.42;
  --bilingual-leading-table-en: 1.38;
  --bilingual-leading-table-ar: 1.55;
  --bilingual-cover-band: 96mm;
  --bilingual-cover-height: 236mm;
}

* { box-sizing: border-box; }

/* 1rem = 11pt so rem-based rhythm is identical in the preview and the PDF. */
html {
  color-scheme: light;
  font-size: 11pt;
}

body {
  margin: 0;
  color: var(--bilingual-ink-deep);
  background: var(--bilingual-paper);
  font-family: var(--bilingual-font-en);
  font-kerning: normal;
  font-synthesis: none;
  font-variant-ligatures: common-ligatures contextual;
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
  font-size: var(--bilingual-size-body);
  line-height: var(--bilingual-leading-body-en);
  color: var(--bilingual-ink-deep);
}

/* Script-aware families and leading. Cells set lang/dir, so every descendant
   (including cover, TOC, and footer chrome) inherits the right face. */
/* Ragged-right formal prose: no automatic hyphenation in either script. */
.bilingual-document [lang="en"],
.bilingual-document :lang(en) {
  font-family: var(--bilingual-font-en);
  letter-spacing: normal;
  hyphens: manual;
}

.bilingual-document [lang="ar"],
.bilingual-document :lang(ar) {
  font-family: var(--bilingual-font-ar);
  letter-spacing: normal;
  word-spacing: normal;
  hyphens: none;
}

.bilingual-document-header,
.bilingual-section {
  display: contents;
}

/* ------------------------------------------------------------------ */
/* Headings                                                            */
/* ------------------------------------------------------------------ */

.bilingual-document h1,
.bilingual-document h2,
.bilingual-document h3,
.bilingual-document h4,
.bilingual-document h5,
.bilingual-document h6 {
  margin-block: 0;
  color: var(--bilingual-ink);
  font-weight: 600;
  letter-spacing: -0.012em;
  line-height: var(--bilingual-leading-heading-en);
  text-wrap: balance;
  break-after: avoid-page;
  page-break-after: avoid;
}

.bilingual-document [lang="ar"] h1,
.bilingual-document [lang="ar"] h2,
.bilingual-document [lang="ar"] h3,
.bilingual-document [lang="ar"] h4,
.bilingual-document [lang="ar"] h5,
.bilingual-document [lang="ar"] h6 {
  letter-spacing: 0;
  line-height: var(--bilingual-leading-heading-ar);
}

.bilingual-document h1[data-fragment-kind="document-title"] {
  font-size: var(--bilingual-size-h1);
  font-weight: 650;
  letter-spacing: -0.018em;
  color: var(--bilingual-ink-deep);
  border-block-end: var(--bilingual-rule);
  break-before: auto !important;
  page-break-before: auto !important;
}

.bilingual-document h1[data-fragment-kind="document-title"] .bilingual-cell {
  padding-block: 0.2rem 0.75rem;
  margin-block-end: 0;
}

.bilingual-document h1[data-fragment-kind="document-title"] .bilingual-cell--ar {
  font-size: calc(var(--bilingual-size-h1) * 1.04);
}

.bilingual-document h2 {
  font-size: var(--bilingual-size-h2);
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--bilingual-ink-deep);
  padding-block-end: 0.3rem;
  border-block-end: 1px solid color-mix(in srgb, var(--bilingual-primary) 55%, var(--bilingual-border));
}

/* Hanging section numbers: the numeral sits in its own slot so wrapped
   titles align on a common indent in both reading directions. */
.bilingual-document h2:has(> .bilingual-section-number) {
  display: grid;
  grid-template-columns: minmax(2.1em, auto) minmax(0, 1fr);
  column-gap: 0.55em;
  align-items: baseline;
}

.bilingual-document h3 {
  font-size: var(--bilingual-size-h3);
  font-weight: 600;
  color: var(--bilingual-ink);
}

.bilingual-document h4,
.bilingual-document h5,
.bilingual-document h6 {
  font-size: var(--bilingual-size-body);
  font-weight: 600;
  color: var(--bilingual-ink);
}

.bilingual-document h5,
.bilingual-document h6 {
  font-size: var(--bilingual-size-small);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--bilingual-muted);
}

.bilingual-section--new-page {
  break-before: page;
}

.bilingual-section-number {
  display: inline-block;
  min-inline-size: 1.6em;
  color: var(--bilingual-primary-text);
  font-family: var(--bilingual-font-en);
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings: "tnum" 1, "lnum" 1;
  font-weight: 700;
  letter-spacing: 0;
}

/* ------------------------------------------------------------------ */
/* Paired rows                                                         */
/* ------------------------------------------------------------------ */

/* Rows carry no margin or padding of their own: the trusted paginator
   measures cells, so vertical rhythm lives in cell padding (below). */
.bilingual-pair {
  position: relative;
  inline-size: 100%;
  margin-block-end: 0;
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

/* Hairline gutter between the two languages, centred in the grid gap. */
.bilingual-pair--parallel::before {
  content: "";
  position: absolute;
  inset-block: 0;
  inset-inline-start: calc(
    (100% - var(--bilingual-gap)) * var(--bilingual-en-fraction) +
      var(--bilingual-gap) / 2
  );
  inline-size: 0;
  border-inline-start: var(--bilingual-hairline);
  pointer-events: none;
}

.bilingual-pair--parallel.bilingual-cover::before,
.bilingual-pair--parallel[data-fragment-kind="document-title"]::before {
  display: none;
}

.bilingual-pair--serial {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.bilingual-pair--serial > .bilingual-cell + .bilingual-cell {
  border-block-start: var(--bilingual-hairline);
}

.bilingual-cover.bilingual-pair--serial > .bilingual-cell + .bilingual-cell {
  border-block-start: none;
}

.bilingual-cell {
  position: relative;
  min-inline-size: 0;
  padding-inline: var(--bilingual-cell-inline-padding);
  padding-block: 0.15rem 0.6rem;
  overflow-wrap: break-word;
}

/* Vertical rhythm by fragment kind (measured as cell height). */
[data-fragment-kind="section-heading"] > .bilingual-cell,
[data-fragment-kind="toc-heading"] > .bilingual-cell {
  padding-block: 1.1rem 0.55rem;
}

[data-fragment-kind="document-title"] + [data-fragment-kind="section-heading"] > .bilingual-cell,
[data-bilingual-toc] + [data-fragment-kind="section-heading"] > .bilingual-cell {
  padding-block-start: 0.85rem;
}

[data-fragment-kind="heading"] > .bilingual-cell {
  padding-block: 0.75rem 0.3rem;
}

[data-fragment-kind="paragraph"] > .bilingual-cell {
  padding-block: 0.1rem 0.55rem;
}

[data-fragment-kind="list"] > .bilingual-cell {
  padding-block: 0.05rem 0.2rem;
}

[data-fragment-kind="list"][data-fragment-part="last"] > .bilingual-cell,
[data-fragment-kind="list"][data-fragment-part="only"] > .bilingual-cell {
  padding-block-end: 0.6rem;
}

/* A table fragment fills its synchronized row so zebra fills and the closing
   hairline stay level across both languages. */
[data-fragment-kind="table"] > .bilingual-cell {
  padding-block: 0 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  align-items: stretch;
}

[data-fragment-kind="table"][data-fragment-part="first"] > .bilingual-cell,
[data-fragment-kind="table"][data-fragment-part="only"] > .bilingual-cell {
  padding-block-start: 0.35rem;
}

[data-fragment-kind="table"][data-fragment-part="last"] > .bilingual-cell,
[data-fragment-kind="table"][data-fragment-part="only"] > .bilingual-cell {
  padding-block-end: 0.8rem;
}

[data-fragment-kind="kpi"] > .bilingual-cell,
[data-fragment-kind="image"] > .bilingual-cell,
[data-fragment-kind="chart"] > .bilingual-cell {
  padding-block: 0.3rem 0.75rem;
}

.bilingual-continuation-marker {
  position: absolute;
  inset-inline-start: var(--bilingual-cell-inline-padding);
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
  font-family: var(--bilingual-font-en);
  text-align: start;
}

.bilingual-cell--ar {
  font-family: var(--bilingual-font-ar);
  font-size: var(--bilingual-size-body-ar);
  text-align: start;
  letter-spacing: 0;
}

/* Latin-script runs inside Arabic cells keep the Latin face: the Arabic
   family's Latin glyphs are wider and would wrap identifiers differently. */
.bilingual-document .bilingual-cell--ar .bilingual-value--latin,
.bilingual-document .bilingual-cell--ar p[dir="ltr"],
.bilingual-document .bilingual-cell--ar li[dir="ltr"],
.bilingual-document .bilingual-cell--ar td[dir="ltr"],
.bilingual-document .bilingual-cell--ar h2[dir="ltr"],
.bilingual-document .bilingual-cell--ar h3[dir="ltr"],
.bilingual-document .bilingual-cell--ar h4[dir="ltr"] {
  font-family: var(--bilingual-font-en);
}

/* ------------------------------------------------------------------ */
/* Inline values                                                       */
/* ------------------------------------------------------------------ */

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
.bilingual-value--identifier,
.bilingual-table-cell--numeric {
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings: "tnum" 1, "lnum" 1;
}

.bilingual-value--number,
.bilingual-value--currency,
.bilingual-value--date {
  white-space: nowrap;
}

/* Identifiers (evidence IDs, references, [Sn] citations) read as refs. */
p .bilingual-value--identifier,
li .bilingual-value--identifier {
  font-size: 0.88em;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--bilingual-ink);
  padding-inline: 0.28em;
  padding-block: 0.02em;
  border: var(--bilingual-hairline);
  border-color: var(--bilingual-border-strong);
  border-radius: 2px;
  background: var(--bilingual-surface);
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.bilingual-value--technical-term {
  letter-spacing: 0.005em;
}

.bilingual-cell code {
  font-family: var(--bilingual-font-mono);
  font-size: 0.9em;
  padding-inline: 0.25em;
  background: var(--bilingual-surface);
  border-radius: 2px;
  overflow-wrap: anywhere;
}

.bilingual-cell a {
  color: var(--bilingual-primary-text);
  text-decoration: underline;
  text-decoration-thickness: 0.06em;
  text-underline-offset: 0.14em;
}

/* ------------------------------------------------------------------ */
/* Body text, lists, notices                                           */
/* ------------------------------------------------------------------ */

.bilingual-cell p {
  margin-block: 0 0.4rem;
  font-size: inherit;
  line-height: var(--bilingual-leading-body-en);
  color: var(--bilingual-ink-deep);
  orphans: 3;
  widows: 3;
}

.bilingual-cell--ar p,
.bilingual-cell--ar li,
.bilingual-cell--ar td,
.bilingual-cell--ar th,
.bilingual-cell--ar figcaption {
  line-height: var(--bilingual-leading-body-ar);
}

.bilingual-cell p:last-child {
  margin-block-end: 0;
}

.bilingual-cell ul,
.bilingual-cell ol {
  margin-block: 0 0.25rem;
  margin-inline: 0;
  padding-inline-start: 1.3rem;
}

.bilingual-cell li {
  margin-block: 0.12rem;
  line-height: var(--bilingual-leading-body-en);
  padding-inline-start: 0.1rem;
}

.bilingual-cell li::marker {
  color: var(--bilingual-primary-text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* A paragraph consisting solely of emphasised text is a notice; bold reads
   as attention (gaps, user input needed), italic as a legal or advisory
   note. Both are icon-free, border-accented callouts. */
.bilingual-cell > p > strong:only-child,
.bilingual-cell > p > em:only-child {
  display: block;
  padding: 0.55rem 0.8rem;
  border-inline-start: 3px solid var(--bilingual-accent);
  background: color-mix(in srgb, var(--bilingual-accent) 7%, var(--bilingual-paper));
  color: var(--bilingual-ink-deep);
  font-weight: 600;
  font-style: normal;
  line-height: inherit;
  break-inside: avoid;
}

.bilingual-cell > p > em:only-child {
  border-inline-start-color: var(--bilingual-border-strong);
  background: var(--bilingual-surface);
  font-weight: 500;
  color: var(--bilingual-muted);
}

/* Provenance lines (block sources, evidence IDs) set as a compact strip. */
.bilingual-pair[data-fragment-id$=".sources"] > .bilingual-cell {
  padding-block: 0.1rem 0.85rem;
}

.bilingual-pair[data-fragment-id$=".sources"] p {
  font-size: var(--bilingual-size-caption);
  line-height: 1.5;
  color: var(--bilingual-muted);
  padding-block-start: 0.3rem;
  border-block-start: var(--bilingual-hairline);
}

.bilingual-pair[data-fragment-id$=".sources"] .bilingual-value--identifier {
  font-size: 0.95em;
}

/* Document-control paragraphs (bidder, references, hashes) as a ledger. */
.bilingual-pair[data-alignment-key="proposal.control"][data-fragment-kind="paragraph"] > .bilingual-cell {
  padding-block: 0.05rem 0.05rem;
}

.bilingual-pair[data-alignment-key="proposal.control"][data-fragment-kind="paragraph"] p {
  font-size: var(--bilingual-size-small);
  line-height: 1.5;
  padding-block: 0.32rem 0.3rem;
  margin-block: 0;
  border-block-end: var(--bilingual-hairline);
  overflow-wrap: anywhere;
}

.bilingual-pair[data-alignment-key="proposal.control"] .bilingual-value--technical-term {
  font-family: var(--bilingual-font-mono);
  font-size: 0.86em;
  letter-spacing: 0;
}

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

.bilingual-cell table {
  inline-size: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  margin-block: 0;
  font-size: var(--bilingual-size-small);
  line-height: var(--bilingual-leading-table-en);
  border: none;
  font-variant-numeric: tabular-nums lining-nums;
}

.bilingual-cell--ar table {
  font-size: calc(var(--bilingual-size-small) + 0.5pt);
  line-height: var(--bilingual-leading-table-ar);
}

.bilingual-cell--ar td,
.bilingual-cell--ar th {
  line-height: var(--bilingual-leading-table-ar);
}

/* Dense tables step the type down instead of splitting words. */
.bilingual-cell table[data-column-count="4"] {
  font-size: calc(var(--bilingual-size-small) - 0.5pt);
}

.bilingual-cell table[data-column-count="5"],
.bilingual-cell table[data-column-count="6"] {
  font-size: calc(var(--bilingual-size-caption) - 0.75pt);
}

.bilingual-cell table[data-column-count="7"],
.bilingual-cell table[data-column-count="8"],
.bilingual-cell table[data-column-count="9"],
.bilingual-cell table[data-column-count="10"],
.bilingual-cell table[data-column-count="11"],
.bilingual-cell table[data-column-count="12"] {
  font-size: calc(var(--bilingual-size-caption) - 1.25pt);
}

.bilingual-cell table[data-column-count="4"] th,
.bilingual-cell table[data-column-count="4"] td {
  padding-inline: 0.4rem;
}

/* Dense headers keep sentence case and drop tracking so labels stay whole. */
.bilingual-cell table[data-column-count="4"] th,
.bilingual-cell table[data-column-count="5"] th,
.bilingual-cell table[data-column-count="6"] th {
  font-size: calc(var(--bilingual-size-micro) + 0.25pt);
  letter-spacing: 0;
  text-transform: none;
}

.bilingual-cell table[data-column-count="7"] th,
.bilingual-cell table[data-column-count="8"] th,
.bilingual-cell table[data-column-count="9"] th,
.bilingual-cell table[data-column-count="10"] th,
.bilingual-cell table[data-column-count="11"] th,
.bilingual-cell table[data-column-count="12"] th {
  font-size: calc(var(--bilingual-size-micro) - 0.5pt);
  letter-spacing: 0;
}

.bilingual-cell table[data-column-count="5"] th,
.bilingual-cell table[data-column-count="5"] td,
.bilingual-cell table[data-column-count="6"] th,
.bilingual-cell table[data-column-count="6"] td {
  padding-inline: 0.32rem;
}

[data-fragment-part="first"] > .bilingual-cell table,
[data-fragment-part="only"] > .bilingual-cell table {
  border-block-start: 1.5px solid var(--bilingual-ink);
}

[data-fragment-part="last"] > .bilingual-cell table,
[data-fragment-part="only"] > .bilingual-cell table {
  border-block-end: 1.5px solid var(--bilingual-ink);
}

.bilingual-cell caption {
  caption-side: top;
  margin-block-end: 0.35rem;
  padding-block-end: 0.15rem;
  font-weight: 650;
  font-size: var(--bilingual-size-caption);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--bilingual-ink);
  text-align: start;
}

.bilingual-cell--ar caption {
  letter-spacing: 0;
  font-size: var(--bilingual-size-small);
}

.bilingual-cell th,
.bilingual-cell td {
  padding-inline: 0.5rem;
  padding-block: 0.38rem;
  border: none;
  border-block-end: var(--bilingual-hairline);
  vertical-align: top;
  text-align: start;
  overflow-wrap: anywhere;
}

.bilingual-cell thead {
  display: table-header-group;
  background: var(--bilingual-surface-strong);
}

.bilingual-cell th {
  font-weight: 650;
  font-size: calc(var(--bilingual-size-caption) - 0.25pt);
  line-height: 1.35;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--bilingual-ink);
  border-block-end: 1px solid var(--bilingual-border-strong);
  overflow-wrap: break-word;
}

/* Narrow measures may hyphenate English rather than split words. */
.bilingual-cell--en th,
.bilingual-cell--en table[data-column-count="4"] td,
.bilingual-cell--en table[data-column-count="5"] td,
.bilingual-cell--en table[data-column-count="6"] td {
  hyphens: auto;
}

.bilingual-cell--ar th {
  font-size: var(--bilingual-size-caption);
  letter-spacing: 0;
}

.bilingual-cell tbody tr[data-row-parity="odd"] > td {
  background: var(--bilingual-surface);
}

.bilingual-cell tbody tr:last-child td {
  border-block-end: none;
}

/* Consecutive row fragments of one table read as a single table: the
   header appears once and continuation rows keep only their hairline. */
.bilingual-pair[data-fragment-kind="table"][data-fragment-part="middle"] thead,
.bilingual-pair[data-fragment-kind="table"][data-fragment-part="last"] thead {
  display: none;
}

.bilingual-pair[data-fragment-kind="table"][data-fragment-part="first"] tbody tr:last-child td,
.bilingual-pair[data-fragment-kind="table"][data-fragment-part="middle"] tbody tr:last-child td {
  border-block-end: var(--bilingual-hairline);
}

.bilingual-cell table[data-repeat-header="false"] thead {
  display: table-row-group;
}

/* A cell whose entire content is emphasised is a status label. */
.bilingual-cell td > strong:only-child {
  display: inline-block;
  padding-inline: 0.5em;
  padding-block: 0.08em;
  border: 1px solid var(--bilingual-border-strong);
  border-radius: 999px;
  font-size: 0.86em;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--bilingual-ink);
  background: var(--bilingual-paper);
  white-space: nowrap;
}

.bilingual-table-cell--center { text-align: center !important; }
.bilingual-table-cell--end { text-align: end !important; }
.bilingual-table-cell--numeric { text-align: end !important; }

/* ------------------------------------------------------------------ */
/* Figures and charts                                                  */
/* ------------------------------------------------------------------ */

.bilingual-visual {
  margin-inline: 0;
  margin-block: 0.35rem 0;
  padding-block: 0.55rem 0.3rem;
  text-align: center;
  border-block-start: var(--bilingual-hairline);
}

.bilingual-visual img {
  display: inline-block;
  max-inline-size: 100%;
  block-size: auto;
  margin-inline: auto;
  border-radius: 2px;
}

[dir="rtl"] .bilingual-visual--mirror-in-rtl img {
  transform: scaleX(-1);
}

.bilingual-visual figcaption {
  margin-block-start: 0.4rem;
  color: var(--bilingual-muted);
  font-size: var(--bilingual-size-caption);
  font-weight: 550;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.bilingual-cell--ar .bilingual-visual figcaption {
  letter-spacing: 0;
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

/* ------------------------------------------------------------------ */
/* KPI stat cards                                                      */
/* ------------------------------------------------------------------ */

.bilingual-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
  gap: 0.6rem;
  margin-block: 0.1rem 0;
}

.bilingual-kpi-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.65rem 0.8rem 0.6rem;
  background: var(--bilingual-surface);
  border: var(--bilingual-hairline);
  border-inline-start: 3px solid var(--bilingual-primary);
  break-inside: avoid-page;
  page-break-inside: avoid;
}

.bilingual-document .bilingual-kpi-value .bilingual-value {
  font-family: inherit;
}

.bilingual-kpi-value {
  font-size: 17pt;
  font-weight: 650;
  line-height: 1.15;
  color: var(--bilingual-primary-text);
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings: "tnum" 1, "lnum" 1;
  letter-spacing: -0.02em;
}

.bilingual-cell--ar .bilingual-kpi-value {
  letter-spacing: 0;
}

.bilingual-kpi-label {
  font-size: var(--bilingual-size-micro);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 600;
  color: var(--bilingual-muted);
}

.bilingual-cell--ar .bilingual-kpi-label {
  letter-spacing: 0;
  font-size: var(--bilingual-size-caption);
}

.bilingual-kpi-hint {
  font-size: var(--bilingual-size-micro);
  color: var(--bilingual-muted);
}

/* ------------------------------------------------------------------ */
/* Cover sheet                                                         */
/* ------------------------------------------------------------------ */

.bilingual-cover {
  break-after: page;
  page-break-after: always;
  min-block-size: var(--bilingual-cover-height);
  margin-block-end: 0;
  background:
    linear-gradient(
      180deg,
      var(--bilingual-accent) 0,
      var(--bilingual-accent) 2.5mm,
      transparent 2.5mm
    ),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--bilingual-primary) 88%, #000000) 0,
      var(--bilingual-primary) var(--bilingual-cover-band),
      transparent var(--bilingual-cover-band)
    );
  background-repeat: no-repeat;
}

.bilingual-cover.bilingual-pair--serial {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--bilingual-gap);
  direction: ltr;
}

.bilingual-cover__cell {
  display: flex;
  flex-direction: column;
  padding-inline: 12mm 4mm;
  padding-block: 14mm 10mm;
}

.bilingual-cover__cell.bilingual-cell--ar {
  padding-inline: 4mm 12mm;
}

.bilingual-cover__band-block {
  block-size: calc(var(--bilingual-cover-band) - 14mm - 8mm);
  overflow: hidden;
  color: var(--bilingual-band-ink);
}

.bilingual-cover__line {
  margin: 0;
}

.bilingual-cover__kicker {
  font-size: var(--bilingual-size-caption);
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--bilingual-band-ink);
  opacity: 0.88;
  margin-block-end: 7mm;
}

.bilingual-cover__band-block p {
  color: var(--bilingual-band-ink);
}

.bilingual-cell--ar .bilingual-cover__kicker {
  letter-spacing: 0;
  font-size: var(--bilingual-size-small);
}

.bilingual-cover__title-line {
  display: block;
  font-size: var(--bilingual-size-display);
  line-height: 1.22;
  font-weight: 650;
  letter-spacing: -0.015em;
  text-wrap: balance;
  color: var(--bilingual-band-ink);
}

.bilingual-cell--ar .bilingual-cover__title-line {
  font-size: calc(var(--bilingual-size-display) * 1.05);
  line-height: 1.42;
  letter-spacing: 0;
}

.bilingual-cover__subtitle {
  margin-block-start: 5mm;
  font-size: var(--bilingual-size-body);
  line-height: 1.5;
  opacity: 0.9;
}

/* Meta rows use fixed line boxes (mm) so the English and Arabic ledgers and
   their hairlines stay level despite different script metrics. */
.bilingual-cover__meta {
  margin-block-start: 12mm;
  display: grid;
  gap: 4mm;
}

.bilingual-cover__meta-item {
  display: flex;
  flex-direction: column;
  gap: 0.8mm;
  padding-block-end: 2.6mm;
  border-block-end: var(--bilingual-hairline);
}

.bilingual-cover__meta-label {
  font-size: var(--bilingual-size-micro);
  line-height: 4mm;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--bilingual-muted);
}

.bilingual-cell--ar .bilingual-cover__meta-label {
  letter-spacing: 0;
  font-size: var(--bilingual-size-caption);
}

.bilingual-cover__meta-value {
  font-size: var(--bilingual-size-body);
  line-height: 6.5mm;
  font-weight: 600;
  color: var(--bilingual-ink-deep);
  font-variant-numeric: tabular-nums lining-nums;
  overflow-wrap: anywhere;
}

.bilingual-cover__meta-item--reference .bilingual-cover__meta-value {
  font-size: 13pt;
  letter-spacing: 0.02em;
  color: var(--bilingual-primary-text);
}

.bilingual-cover__control {
  margin-block-start: auto;
  padding-block-start: 6mm;
  display: grid;
  gap: 3.5mm;
}

.bilingual-cover__control .bilingual-cover__meta-item {
  border-block-end: none;
  padding-block-end: 0;
}

.bilingual-cover__control .bilingual-cover__meta-value {
  font-size: var(--bilingual-size-small);
  line-height: 5.5mm;
  font-weight: 500;
}

.bilingual-cover__meta-item--status .bilingual-cover__meta-value {
  display: inline-flex;
  align-self: start;
  padding-inline: 0.6em;
  padding-block: 0.15em;
  border: 1px solid var(--bilingual-primary);
  border-radius: 2px;
  font-size: var(--bilingual-size-caption);
  font-weight: 650;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--bilingual-primary-text);
}

.bilingual-cell--ar .bilingual-cover__meta-item--status .bilingual-cover__meta-value {
  letter-spacing: 0;
  font-size: var(--bilingual-size-small);
}

/* Integrity strip: hash prefix (both cells) and offline QR (English cell). */
.bilingual-integrity {
  display: flex;
  align-items: center;
  gap: 3mm;
  min-block-size: 20mm;
  padding-block-start: 3mm;
  border-block-start: 1px solid var(--bilingual-border-strong);
}

.bilingual-integrity__qr {
  flex: none;
  display: block;
  border: var(--bilingual-hairline);
}

.bilingual-integrity__text {
  display: flex;
  flex-direction: column;
  gap: 0.6mm;
  min-inline-size: 0;
}

.bilingual-integrity__label {
  font-size: var(--bilingual-size-micro);
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--bilingual-muted);
}

.bilingual-cell--ar .bilingual-integrity__label,
.bilingual-document-footer__cell--ar .bilingual-integrity__label {
  letter-spacing: 0;
  font-size: var(--bilingual-size-caption);
}

.bilingual-integrity__hash {
  display: inline-flex;
  align-items: baseline;
  gap: 0.5em;
  font-family: var(--bilingual-font-mono);
  font-size: var(--bilingual-size-small);
  color: var(--bilingual-ink-deep);
  unicode-bidi: isolate;
}

.bilingual-integrity__algorithm {
  font-family: var(--bilingual-font-en);
  font-size: var(--bilingual-size-micro);
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--bilingual-muted);
}

.bilingual-integrity__prefix {
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums lining-nums;
}

/* ------------------------------------------------------------------ */
/* Table of contents                                                   */
/* ------------------------------------------------------------------ */

[data-bilingual-toc] {
  display: contents;
}

[data-fragment-kind="toc-list"] > .bilingual-cell {
  padding-block: 0.2rem 1.2rem;
}

.bilingual-toc__heading {
  font-size: var(--bilingual-size-h3);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--bilingual-muted);
  border-block-end-color: var(--bilingual-border-strong);
}

.bilingual-cell--ar .bilingual-toc__heading {
  letter-spacing: 0;
}

.bilingual-toc__list {
  list-style: none;
  margin: 0;
  padding: 0;
  counter-reset: none;
}

.bilingual-toc__item {
  margin-block: 0;
  break-inside: avoid;
}

.bilingual-cell a.bilingual-toc__link {
  display: grid;
  grid-template-columns: minmax(2.1em, auto) minmax(0, max-content) minmax(1.5em, 1fr);
  align-items: baseline;
  column-gap: 0.55em;
  padding-block: 0.32rem;
  color: var(--bilingual-ink-deep);
  text-decoration: none;
  font-size: var(--bilingual-size-body);
  font-weight: 500;
}

.bilingual-cell a.bilingual-toc__link:not(:has(> .bilingual-section-number)) {
  grid-template-columns: minmax(0, max-content) minmax(1.5em, 1fr);
}

.bilingual-toc__leader {
  border-block-end: 1px dotted var(--bilingual-border-strong);
  transform: translateY(-0.28em);
}

.bilingual-toc__title {
  min-inline-size: 0;
}

.bilingual-toc__link:hover .bilingual-toc__title {
  color: var(--bilingual-primary-text);
}

/* ------------------------------------------------------------------ */
/* Signature / approval block                                          */
/* ------------------------------------------------------------------ */

.bilingual-signature > .bilingual-cell {
  padding-block: 1.4rem 0.8rem;
}

.bilingual-signature__heading {
  font-size: var(--bilingual-size-h3);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--bilingual-muted);
  border-block-end-color: var(--bilingual-border-strong);
  margin-block-end: 0.7rem;
}

.bilingual-cell--ar .bilingual-signature__heading {
  letter-spacing: 0;
}

.bilingual-signature__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.8rem 1rem;
}

.bilingual-signature__role {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  break-inside: avoid;
}

.bilingual-signature__role-label {
  font-size: var(--bilingual-size-caption);
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--bilingual-ink);
}

.bilingual-cell--ar .bilingual-signature__role-label {
  letter-spacing: 0;
  font-size: var(--bilingual-size-small);
}

.bilingual-signature__field {
  display: block;
  min-block-size: 7mm;
  border-block-end: 1px solid var(--bilingual-border-strong);
  position: relative;
}

.bilingual-signature__field--date {
  max-inline-size: 60%;
}

.bilingual-signature__field-label {
  display: block;
  font-size: var(--bilingual-size-micro);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--bilingual-muted);
}

.bilingual-cell--ar .bilingual-signature__field-label {
  letter-spacing: 0;
  font-size: var(--bilingual-size-caption);
}

.bilingual-signature__stamp {
  min-block-size: 30mm;
  border: 1px dashed var(--bilingual-border-strong);
  border-radius: 3px;
  padding: 0.45rem 0.6rem;
}

.bilingual-signature__note {
  margin-block: 0.7rem 0;
  font-size: var(--bilingual-size-caption);
  line-height: 1.5;
  color: var(--bilingual-muted);
}

/* ------------------------------------------------------------------ */
/* Identity footer                                                     */
/* ------------------------------------------------------------------ */

.bilingual-document-footer {
  display: grid;
  grid-template-columns:
    minmax(0, var(--bilingual-en-column))
    minmax(0, var(--bilingual-ar-column));
  gap: var(--bilingual-gap);
  margin-block-start: 1.35rem;
  padding-block-start: 0.6rem;
  border-block-start: 1.5px solid var(--bilingual-ink);
  color: var(--bilingual-muted);
  font-size: var(--bilingual-size-micro);
  letter-spacing: 0.02em;
  line-height: 1.45;
}

.bilingual-document-footer__cell {
  min-inline-size: 0;
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  padding-inline: var(--bilingual-cell-inline-padding);
}

.bilingual-document-footer__cell--en,
.bilingual-document-footer__cell--ar {
  text-align: start;
}

.bilingual-document-footer__cell--ar {
  letter-spacing: 0;
  font-size: var(--bilingual-size-caption);
}

.bilingual-document-footer__brand {
  color: var(--bilingual-ink);
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.bilingual-document-footer__cell--ar .bilingual-document-footer__brand {
  letter-spacing: 0;
}

.bilingual-document-footer__meta {
  color: var(--bilingual-muted);
}

.bilingual-document-footer__date {
  font-variant-numeric: tabular-nums lining-nums;
  color: var(--bilingual-ink-deep);
}

.bilingual-document-footer__integrity {
  display: inline-flex;
  align-items: baseline;
  gap: 0.5em;
  margin-block-start: 0.15rem;
  font-family: var(--bilingual-font-mono);
  color: var(--bilingual-ink-deep);
}

.bilingual-document-footer__integrity .bilingual-integrity__label {
  font-family: var(--bilingual-font-en);
}

.bilingual-document-footer__cell--ar .bilingual-document-footer__integrity .bilingual-integrity__label {
  font-family: var(--bilingual-font-ar);
}

/* ------------------------------------------------------------------ */
/* Pagination hints and viewer plumbing                                */
/* ------------------------------------------------------------------ */

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
  font-size: var(--bilingual-size-small);
  color: var(--bilingual-muted);
}

.bilingual-viewer-tabs button {
  padding-inline: 0.9rem;
  padding-block: 0.4rem;
  border: 1px solid var(--bilingual-primary);
  border-radius: 999px;
  color: var(--bilingual-primary-text);
  background: var(--bilingual-paper);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
}

.bilingual-viewer-tabs button[aria-pressed="true"] {
  color: var(--bilingual-paper);
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

[data-bilingual-sync-measuring="true"] .bilingual-cover.bilingual-pair--serial {
  display: grid !important;
}

[data-bilingual-sync-measuring="true"] .bilingual-pair--serial [data-language] {
  display: block !important;
}

[data-bilingual-sync-measuring="true"] .bilingual-cover [data-language] {
  display: flex !important;
}

/* Synchronized pages: the footer is pinned by the renderer; keep it clear of
   the last rows by reserving nothing here (rows are absolutely positioned). */
.bilingual-synchronized-page {
  overflow: visible;
}

@media screen and (max-width: ${String(config.mobileBreakpointPx)}px) {
  .bilingual-document {
    padding-inline: 1rem;
  }

  .bilingual-pair--parallel,
  .bilingual-document-footer,
  .bilingual-cover.bilingual-pair--serial {
    grid-template-columns: minmax(0, 1fr);
  }

  .bilingual-pair--parallel {
    gap: 0.75rem;
  }

  .bilingual-pair--parallel::before {
    display: none;
  }

  .bilingual-cell--en { order: ${String(mobileEnOrder)}; }
  .bilingual-cell--ar { order: ${String(mobileArOrder)}; }

  .bilingual-document-footer__cell--en { order: ${String(mobileEnOrder)}; }
  .bilingual-document-footer__cell--ar { order: ${String(mobileArOrder)}; }

  /* Stacked cover: the whole sheet becomes the brand panel. */
  .bilingual-cover {
    min-block-size: auto;
    --bilingual-muted: rgba(255, 255, 255, 0.78);
    --bilingual-ink-deep: #FFFFFF;
    --bilingual-ink: #FFFFFF;
    --bilingual-primary-text: #FFFFFF;
    --bilingual-border: rgba(255, 255, 255, 0.35);
    --bilingual-border-strong: rgba(255, 255, 255, 0.55);
    background:
      linear-gradient(
        180deg,
        var(--bilingual-accent) 0,
        var(--bilingual-accent) 2.5mm,
        transparent 2.5mm
      ),
      var(--bilingual-primary);
  }

  .bilingual-cover__cell,
  .bilingual-cover__cell.bilingual-cell--ar {
    padding-inline: 8mm;
    padding-block: 12mm 8mm;
  }

  .bilingual-cover__band-block {
    block-size: auto;
    overflow: visible;
  }

  .bilingual-integrity__qr {
    background: #FFFFFF;
  }
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

  .bilingual-cover {
    block-size: var(--bilingual-cover-height);
    min-block-size: var(--bilingual-cover-height);
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

  .bilingual-cover [data-language] {
    display: flex !important;
  }

  .bilingual-cell tr,
  .bilingual-kpi-card,
  .bilingual-visual {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .bilingual-cell thead {
    display: table-header-group;
  }

  .bilingual-cell p,
  .bilingual-cell li {
    orphans: 3;
    widows: 3;
  }

  .bilingual-cell th,
  .bilingual-cell thead,
  .bilingual-cover,
  .bilingual-kpi-card,
  .bilingual-cell tbody tr[data-row-parity="odd"] > td {
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
    const flattenForPrint = target === "print";
    const effectiveViewerMode = "both";
    const lifecycle = options.lifecycle === "final" ? "final" : "draft";

    const numberedSections = options.sectionNumbering
      ? assignSectionNumbers(document.sections)
      : [];
    const integrity = resolveIntegrity(options.integrity);
    const coverHtml = options.cover
      ? renderCoverPage(options.cover, document, config, {
          lifecycle,
          integrity,
          flattenForPrint,
        })
      : "";
    const tocHtml =
      options.tableOfContents && document.sections.length > 0
        ? renderTableOfContents(
            document.sections,
            numberedSections,
            config,
            flattenForPrint,
          )
        : "";
    const signatureHtml = options.signatureBlock
      ? renderSignatureBlock(config, lifecycle, flattenForPrint)
      : "";

    // Reading order: cover, document title, contents, body, approval block,
    // identity footer. The title follows the cover on a fresh page so the
    // synchronized paginator never shares the cover sheet with body rows.
    const root = `<main class="bilingual-document" data-bilingual-document data-document-id="${escapeBilingualHtml(
      document.id,
    )}" data-layout-mode="${config.mode}" data-viewer-preference="${
      config.viewer.mode
    }" data-viewer-mode="${effectiveViewerMode}" data-viewer-language="${
      config.viewer.defaultLanguage
    }" data-render-target="${target}" data-lifecycle="${lifecycle}"${
      options.cover ? ' data-has-cover="true"' : ""
    } data-bilingual-layout-state="pending" data-bilingual-layout-ready="false">
${renderViewerMetadata(document.id, config, target)}
${coverHtml}
${renderDocumentTitle(document, config, flattenForPrint, Boolean(options.cover))}
${tocHtml}
${document.sections
  .map((section, sectionIndex) =>
    renderSection(
      section,
      config,
      flattenForPrint,
      numberedSections[sectionIndex],
    ),
  )
  .join("\n")}
${signatureHtml}
${renderDocumentFooter(lifecycle, integrity, options.cover?.dateLabel)}
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
<meta name="color-scheme" content="light" />
<title>${escapeBilingualHtml(title)}</title>
<style>${generateBilingualCSS(config, options.palette)}</style>
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

// ============================================================================
// Document chrome: cover page, table of contents, numbering, lifecycle footer
// ============================================================================

/**
 * Assign hierarchical decimal numbers ("1", "2", …) to titled sections in
 * order. Untitled sections are skipped without consuming a number so the
 * visible numbering always matches what readers can see.
 */
export function assignSectionNumbers(
  sections: readonly PairedSection[],
): readonly string[] {
  let counter = 0;
  return sections.map((section) => {
    if (!section.title) return "";
    counter += 1;
    return String(counter);
  });
}

interface ResolvedIntegrity {
  readonly hash: string;
  readonly prefix: string;
  readonly algorithm: string | null;
  readonly qrPayload: string | null;
  readonly label: Localized<string>;
}

const DEFAULT_INTEGRITY_LABEL: Localized<string> = Object.freeze({
  en: "Content hash",
  ar: "بصمة المحتوى",
});

/**
 * Accept only integrity data that can be displayed truthfully: a real hex
 * digest and, optionally, a printable QR payload. Anything else is dropped so
 * the document never carries a decorative or misleading verification mark.
 */
function resolveIntegrity(
  integrity: BilingualDocumentIntegrity | undefined,
): ResolvedIntegrity | null {
  if (!integrity) return null;
  const described = describeIntegrityHash(integrity.hash);
  if (!described) return null;
  const qrPayload =
    integrity.qrPayload && isSafeIntegrityQrPayload(integrity.qrPayload)
      ? integrity.qrPayload
      : null;
  const label =
    integrity.label &&
    isNonEmptyString(integrity.label.en) &&
    isNonEmptyString(integrity.label.ar)
      ? integrity.label
      : DEFAULT_INTEGRITY_LABEL;
  return {
    hash: integrity.hash.trim(),
    prefix: described.prefix,
    algorithm: described.algorithm,
    qrPayload,
    label,
  };
}

function coverLine(
  value: Localized<string> | undefined,
  language: DocumentLanguage,
  className: string,
  tag: "p" | "span" = "p",
): string {
  const text = value?.[language]?.trim();
  if (!text) return "";
  return `<${tag} class="bilingual-cover__line ${className}">${escapeBilingualHtml(
    text,
  )}</${tag}>`;
}

function coverMetaItem(
  label: string,
  value: string | undefined,
  className = "",
): string {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  return `<div class="bilingual-cover__meta-item${
    className ? ` ${className}` : ""
  }"><span class="bilingual-cover__meta-label">${escapeBilingualHtml(
    label,
  )}</span><span class="bilingual-cover__meta-value">${escapeBilingualHtml(
    trimmed,
  )}</span></div>`;
}

const COVER_COPY = {
  tenderReference: { en: "Tender reference", ar: "مرجع المنافسة" },
  bidder: { en: "Submitted by", ar: "مقدم العرض" },
  date: { en: "Date", ar: "التاريخ" },
  status: { en: "Document status", ar: "حالة الوثيقة" },
  handling: { en: "Handling", ar: "التصنيف" },
  integrity: { en: "Integrity", ar: "سلامة المستند" },
  qrLabel: {
    en: "Offline integrity code",
    ar: "رمز التحقق من السلامة دون اتصال",
  },
  defaultConfidentiality: {
    en: "Confidential · Prepared for tender evaluation",
    ar: "سري · أُعدّ لتقييم المنافسة",
  },
} as const satisfies Readonly<Record<string, Localized<string>>>;

function renderIntegrityStrip(
  integrity: ResolvedIntegrity | null,
  language: DocumentLanguage,
  options: { readonly withQr: boolean },
): string {
  if (!integrity) return "";
  const qr =
    options.withQr && integrity.qrPayload
      ? renderIntegrityQrSvg(integrity.qrPayload, {
          size: "17mm",
          ariaLabel: COVER_COPY.qrLabel[language],
        })
      : "";
  const algorithm = integrity.algorithm
    ? `<span class="bilingual-integrity__algorithm">${escapeBilingualHtml(
        integrity.algorithm,
      )}</span>`
    : "";
  return `<div class="bilingual-integrity">${qr}<div class="bilingual-integrity__text"><span class="bilingual-integrity__label">${escapeBilingualHtml(
    integrity.label[language],
  )}</span><span class="bilingual-integrity__hash" dir="ltr">${algorithm}<bdi class="bilingual-integrity__prefix">${escapeBilingualHtml(
    integrity.prefix,
  )}</bdi></span></div></div>`;
}

/**
 * The cover is rendered as one synchronized bilingual pair: English on the
 * start side, Arabic on the end side, sharing a brand band and a fixed sheet
 * height. Being a pair keeps it first in the trusted paginator instead of
 * being treated as trailing chrome, and the following document title carries
 * an explicit page break so body rows never share the cover sheet.
 *
 * The cover is presentation chrome: its titles are styled <span>s, not
 * headings, so the document keeps exactly one semantic <h1>.
 */
function renderCoverPage(
  cover: BilingualDocumentCover,
  document: BilingualDocumentSpec,
  config: BilingualLayoutConfig,
  context: {
    readonly lifecycle: "draft" | "final";
    readonly integrity: ResolvedIntegrity | null;
    readonly flattenForPrint: boolean;
  },
): string {
  const status = LIFECYCLE_FOOTER[context.lifecycle];
  const confidentiality = cover.confidentiality ??
    COVER_COPY.defaultConfidentiality;
  const cellFor = (language: DocumentLanguage): string => {
    const isEnglish = language === "en";
    const statusLabel = isEnglish ? status.brandEn : status.brandAr;
    return `<div class="bilingual-cover__band-block">${coverLine(
      cover.kicker,
      language,
      "bilingual-cover__kicker",
    )}<span class="bilingual-cover__title-line">${escapeBilingualHtml(
      inlineText(document.title[language]),
    )}</span>${coverLine(
      cover.subtitle,
      language,
      "bilingual-cover__subtitle",
    )}</div>
<div class="bilingual-cover__meta">${coverMetaItem(
      COVER_COPY.tenderReference[language],
      cover.tenderReference,
      "bilingual-cover__meta-item--reference",
    )}${coverMetaItem(
      COVER_COPY.bidder[language],
      cover.bidderName?.[language],
    )}${coverMetaItem(
      COVER_COPY.date[language],
      cover.dateLabel?.[language],
      "bilingual-cover__meta-item--date",
    )}</div>
<div class="bilingual-cover__control">${coverMetaItem(
      COVER_COPY.status[language],
      statusLabel,
      "bilingual-cover__meta-item--status",
    )}${coverMetaItem(
      COVER_COPY.handling[language],
      confidentiality[language],
    )}${renderIntegrityStrip(context.integrity, language, {
      withQr: isEnglish,
    })}</div>`;
  };
  const coverContext = {
    id: "bilingual-cover",
    alignmentKey: "bilingual.cover",
  } as PairedSection;
  return renderPairedFragment({
    section: coverContext,
    fragmentId: "bilingual-cover",
    content: { en: cellFor("en"), ar: cellFor("ar") },
    config,
    kind: "cover",
    keepTogether: true,
    keepWithNext: false,
    fragmentIndex: 0,
    fragmentCount: 1,
    breakBefore: false,
    sectionMarker: context.flattenForPrint,
    className: "bilingual-cover",
    cellClassName: "bilingual-cover__cell",
  }).replace(
    '<div class="bilingual-pair',
    '<div data-bilingual-cover role="region" aria-label="Cover page" class="bilingual-pair',
  );
}

function renderTableOfContents(
  sections: readonly PairedSection[],
  numberLabels: readonly string[],
  config: BilingualLayoutConfig,
  flattenForPrint: boolean,
): string {
  const entries = sections
    .map((section, index) => ({ section, label: numberLabels[index] ?? "" }))
    .filter((entry) => entry.section.title !== undefined);
  if (entries.length === 0) return "";

  const cellFor = (language: DocumentLanguage): string =>
    `<ol class="bilingual-toc__list">${
      entries
        .map(({ section, label }) => {
          const titleNodes = section.title![language];
          const numberSpan = label
            ? `<span class="bilingual-section-number">${escapeBilingualHtml(label)}</span> `
            : "";
          return `<li class="bilingual-toc__item"><a class="bilingual-toc__link" href="#${escapeBilingualHtml(
            section.id,
          )}--heading">${numberSpan}<span class="bilingual-toc__title">${renderSafeInline(
            titleNodes,
          )}</span><span class="bilingual-toc__leader" aria-hidden="true"></span></a></li>`;
        })
        .join("")
    }</ol>`;

  const tocContext = {
    id: "bilingual-toc",
    alignmentKey: "bilingual.toc",
  } as PairedSection;
  const headingPair = renderPairedFragment({
    section: tocContext,
    fragmentId: "bilingual-toc--heading",
    content: {
      en: `<h2 id="bilingual-toc--anchor" class="bilingual-toc__heading">Table of contents</h2>`,
      ar: `<h2 class="bilingual-toc__heading">المحتويات</h2>`,
    },
    config,
    kind: "toc-heading",
    keepTogether: true,
    keepWithNext: true,
    fragmentIndex: 0,
    fragmentCount: 2,
    breakBefore: false,
    sectionMarker: flattenForPrint,
  });
  const listPair = renderPairedFragment({
    section: tocContext,
    fragmentId: "bilingual-toc--list",
    content: { en: cellFor("en"), ar: cellFor("ar") },
    config,
    kind: "toc-list",
    keepTogether: entries.length <= 24,
    keepWithNext: false,
    fragmentIndex: 1,
    fragmentCount: 2,
    breakBefore: false,
    sectionMarker: flattenForPrint,
  });
  return `<div data-bilingual-toc>${headingPair}${listPair}</div>`;
}

const SIGNATURE_COPY = {
  heading: { en: "Approval and signature", ar: "الاعتماد والتوقيع" },
  preparedBy: { en: "Prepared by", ar: "أعدّه" },
  reviewedBy: { en: "Reviewed by", ar: "راجعه" },
  approvedBy: { en: "Authorised signatory", ar: "المفوّض بالتوقيع" },
  name: { en: "Name and title", ar: "الاسم والمنصب" },
  signature: { en: "Signature", ar: "التوقيع" },
  date: { en: "Date", ar: "التاريخ" },
  stamp: { en: "Company stamp", ar: "ختم الشركة" },
  draftNote: {
    en: "Signature lines are intentionally blank in a draft. Only a human signatory may complete them after approval.",
    ar: "تُترك خانات التوقيع فارغة عمداً في المسودة، ولا يكملها إلا موقّع بشري بعد الاعتماد.",
  },
  finalNote: {
    en: "Complete by hand or with a qualified electronic signature. The signatory remains the author of record.",
    ar: "تُستكمل بخط اليد أو بتوقيع إلكتروني معتمد. ويبقى الموقّع هو المؤلف المسجل.",
  },
} as const satisfies Readonly<Record<string, Localized<string>>>;

/**
 * Bilingual approval block rendered as a synchronized pair so it paginates
 * with the body instead of overlapping trailing chrome. Lines are empty by
 * design: the engine never fabricates names, dates, or signatures.
 */
function renderSignatureBlock(
  config: BilingualLayoutConfig,
  lifecycle: "draft" | "final",
  flattenForPrint: boolean,
): string {
  const cellFor = (language: DocumentLanguage): string => {
    const role = (label: Localized<string>): string =>
      `<div class="bilingual-signature__role"><span class="bilingual-signature__role-label">${escapeBilingualHtml(
        label[language],
      )}</span><span class="bilingual-signature__field"><span class="bilingual-signature__field-label">${escapeBilingualHtml(
        SIGNATURE_COPY.name[language],
      )}</span></span><span class="bilingual-signature__field"><span class="bilingual-signature__field-label">${escapeBilingualHtml(
        SIGNATURE_COPY.signature[language],
      )}</span></span><span class="bilingual-signature__field bilingual-signature__field--date"><span class="bilingual-signature__field-label">${escapeBilingualHtml(
        SIGNATURE_COPY.date[language],
      )}</span></span></div>`;
    const note =
      lifecycle === "final"
        ? SIGNATURE_COPY.finalNote[language]
        : SIGNATURE_COPY.draftNote[language];
    return `<h2 class="bilingual-signature__heading">${escapeBilingualHtml(
      SIGNATURE_COPY.heading[language],
    )}</h2><div class="bilingual-signature__grid">${role(
      SIGNATURE_COPY.preparedBy,
    )}${role(SIGNATURE_COPY.reviewedBy)}${role(
      SIGNATURE_COPY.approvedBy,
    )}<div class="bilingual-signature__stamp"><span class="bilingual-signature__field-label">${escapeBilingualHtml(
      SIGNATURE_COPY.stamp[language],
    )}</span></div></div><p class="bilingual-signature__note">${escapeBilingualHtml(
      note,
    )}</p>`;
  };
  const signatureContext = {
    id: "bilingual-signature",
    alignmentKey: "bilingual.signature",
  } as PairedSection;
  return renderPairedFragment({
    section: signatureContext,
    fragmentId: "bilingual-signature",
    content: { en: cellFor("en"), ar: cellFor("ar") },
    config,
    kind: "signature",
    keepTogether: true,
    keepWithNext: false,
    fragmentIndex: 0,
    fragmentCount: 1,
    breakBefore: false,
    sectionMarker: flattenForPrint,
    className: "bilingual-signature",
  }).replace(
    '<div class="bilingual-pair',
    '<div data-bilingual-signature class="bilingual-pair',
  );
}

const LIFECYCLE_FOOTER: Record<
  "draft" | "final",
  { brandEn: string; metaEn: string; brandAr: string; metaAr: string }
> = {
  draft: {
    brandEn: "Print-ready draft",
    metaEn: "Human author is final authority · Confidential",
    brandAr: "مسودة جاهزة للطباعة",
    metaAr: "المؤلف البشري هو المرجع النهائي · سري",
  },
  final: {
    brandEn: "Authoritative export",
    metaEn: "Approved content · Handle per classification · Confidential",
    brandAr: "نسخة معتمدة للتصدير",
    metaAr: "محتوى معتمد · تعامل وفق التصنيف · سري",
  },
};

function renderDocumentFooter(
  lifecycle: "draft" | "final",
  integrity: ResolvedIntegrity | null = null,
  dateLabel?: Localized<string>,
): string {
  const copy = LIFECYCLE_FOOTER[lifecycle];
  const dateFor = (language: DocumentLanguage): string => {
    const value = dateLabel?.[language]?.trim();
    return value
      ? `<span class="bilingual-document-footer__date"><bdi>${escapeBilingualHtml(
          value,
        )}</bdi></span>`
      : "";
  };
  const integrityFor = (language: DocumentLanguage): string =>
    integrity
      ? `<span class="bilingual-document-footer__integrity" dir="ltr"><span class="bilingual-integrity__label">${escapeBilingualHtml(
          integrity.label[language],
        )}</span>${
          integrity.algorithm
            ? `<span class="bilingual-integrity__algorithm">${escapeBilingualHtml(
                integrity.algorithm,
              )}</span>`
            : ""
        }<bdi class="bilingual-integrity__prefix">${escapeBilingualHtml(
          integrity.prefix,
        )}</bdi></span>`
      : "";
  return `<footer class="bilingual-document-footer" data-bilingual-footer data-lifecycle="${lifecycle}" aria-label="Document identity">
  <div class="bilingual-document-footer__cell bilingual-document-footer__cell--en" lang="en" dir="ltr">
    <span class="bilingual-document-footer__brand">${escapeBilingualHtml(copy.brandEn)}</span>
    <span class="bilingual-document-footer__meta">${escapeBilingualHtml(copy.metaEn)}</span>
    ${dateFor("en")}${integrityFor("en")}
  </div>
  <div class="bilingual-document-footer__cell bilingual-document-footer__cell--ar" lang="ar" dir="rtl">
    <span class="bilingual-document-footer__brand">${escapeBilingualHtml(copy.brandAr)}</span>
    <span class="bilingual-document-footer__meta">${escapeBilingualHtml(copy.metaAr)}</span>
    ${dateFor("ar")}${integrityFor("ar")}
  </div>
</footer>`;
}
