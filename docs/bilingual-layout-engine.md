# Bilingual Layout Engine

This guide documents the Phase 2 English–Arabic layout implementation as it
exists in the repository. It covers the validated document AST, bidirectional
typography, deterministic row synchronization, the HTML/PDF adapter, and the
five React presentation components.

The engine is designed for bilingual procurement documents, but it does not
translate content, approve legal text, or prove that every browser and printer
will produce identical pixels. Treat the generated artifacts as outputs that
still require content review and visual QA.

## Module map

| Layer | File | Responsibility |
| --- | --- | --- |
| Structured document model | `src/lib/bilingual-layout.tsx` | Validates and renders a safe, immutable bilingual AST |
| Structured charts | `src/lib/document-visualizations.ts` | Supplies the validated `DocumentChartDefinition` consumed by chart blocks |
| Typography and bidi safety | `src/lib/bilingual-typography.ts` | Detects direction, removes unsafe controls, isolates mixed runs, and selects allow-listed font pairs |
| Measured row synchronization | `src/lib/layout-sync.ts` | Balances measured paired fragments and coordinates page placement |
| Canonical HTML/PDF adapter | `src/lib/bilingual-pdf.ts` | Embeds local fonts, performs structural quality checks, hashes HTML, and invokes Chromium PDF generation |
| React presentation library | `src/components/documents/bilingual/` | Provides section, header, table, list, and footer components for trusted application UI |
| Shared React styles | `src/app/bilingual-layout.css` | Defines logical-property, responsive, and print styles for the React components |
| Contract adapter | `src/lib/contract-export-bilingual.ts` | Compiles supported contract Markdown into the validated AST |

The application already imports `src/app/bilingual-layout.css` through
`src/app/globals.css`. A standalone React consumer must import the design-token
and bilingual styles itself.

## Architecture

The canonical artifact path is:

```text
typed or external data
        |
        v
validateBilingualDocument / parseBilingualDocument
        |
        v
deep-frozen BilingualDocumentSpec
        |
        +----------------------+
        |                      |
        v                      v
renderBilingualHTML     renderBilingualArtifact
                               |
                               +-- local WOFF2 @font-face rules
                               +-- structural quality inspection
                               +-- SHA-256 of canonical HTML
                               |
                               v
                       generateBilingualPdf
                               |
                               v
                       Playwright Chromium PDF
```

`layout-sync.ts` is adjacent to this pipeline rather than called implicitly by
it. A compiler or preview adapter must segment content, measure each fragment,
call `synchronizeLayout`, and apply the returned page/spacing instructions.
The base AST renderer instead relies on semantic paired grid rows, which gives
the two cells of one row the same browser layout height.

The React component library is also separate. It accepts `ReactNode` values for
trusted application composition and does not automatically run the AST
validator or PDF quality inspection.

### Design decisions

1. **Pair by meaning, not scroll position.** Each bilingual unit has one stable
   `alignmentKey`. Independent full-height language columns and proportional
   scroll synchronization are intentionally avoided.
2. **Keep content structured until the final escape boundary.** The AST accepts
   text and explicit inline nodes, not authored HTML or React nodes. Chart
   blocks likewise accept the structured chart definition rather than SVG or
   HTML.
3. **Keep English physically left and Arabic physically right in parallel
   output.** Each cell still declares its own `lang` and `dir`.
4. **Do not mirror every visual.** Logos, signatures, data, and chronological
   axes are not directional. Use `mirror-in-rtl` only for visuals whose meaning
   genuinely reverses.
5. **Let the browser shape Arabic.** OpenType joining, contextual glyphs,
   ligatures, and kerning are browser responsibilities. JavaScript supplies the
   correct font, language, direction, and isolation.
6. **Use one source for preview and PDF.** Both artifacts originate from the
   same validated AST and renderer. Print remains a distinct rendering context,
   so visual QA is still required.
7. **Fail closed at untrusted boundaries.** Links, image sources, identifiers,
   bidi controls, document size, and fragment sequences are validated before
   rendering.

## Safety boundaries

### Validated AST boundary

`parseBilingualDocument(input)` is the preferred boundary for external or
persisted data. It rejects malformed content and returns a deeply frozen
`BilingualDocumentSpec`.

The validator currently enforces:

- stable IDs of 1–128 ASCII letters, numbers, `.`, `:`, `_`, or `-`;
- unique document, section, block, list-item, and table-row IDs;
- unique section alignment keys;
- both English and Arabic content for every localized inline field;
- at most 500 sections, 5,000 blocks, and 500,000 text characters;
- at most eight nested list levels;
- safe links: HTTPS, `mailto:`, `tel:`, fragments, or safe
  application-relative paths;
- safe images: application-relative public paths, or base64 PNG/JPEG/WebP data
  URIs up to 8 MiB;
- table cells that match the declared column IDs;
- structured chart definitions that pass both English/LTR and Arabic/RTL
  rendering validation;
- no explicit Unicode bidi controls in authored inline/list/table/image text;
- column ratios where both columns are 30%–70% and total 100%.

The canonical artifact quality pass also scans the final HTML, including chart
output, for unsafe bidi controls. All authored AST text is escaped by the
renderer. Do not pre-escape it.
`parseBilingualDocument` freezes the supplied object graph, so clone mutable
editor state before parsing if it must remain editable.

### Mixed-direction safety

Do not insert Unicode embedding or override controls to fix layout. Use
`createBidiValue` and an inline `value` node. Unsafe controls are removed and
reported by the typography utilities, and the renderer emits explicit `<bdi>`
runs.

Digit conversion is opt-in. The default policy is `preserve`, which avoids
silently changing tender references, URLs, model numbers, and legal IDs.

### React component boundary

React escapes plain string children, but the component library accepts
`ReactNode`. Therefore:

- pass only trusted application components;
- do not pass user-authored `dangerouslySetInnerHTML`;
- keep `BilingualTableColumn.width`, `className`, and Next.js image
  configuration under application control;
- validate untrusted content into the structured AST instead of sending it
  directly to these components.

### PDF boundary

The PDF adapter does not request remote fonts. It loads pinned local packages
and embeds WOFF2 data URLs. It checks document structure and the returned PDF
signature, but these checks are not a substitute for visual review, PDF/A
validation, accessibility tagging inspection, or legal approval.

## Quick start

```ts
import {
  renderBilingualHTML,
  type BilingualDocumentSpec,
  type BilingualInlineNode,
} from "@/lib/bilingual-layout";

const text = (value: string): readonly BilingualInlineNode[] => [
  { type: "text", text: value },
];

const document: BilingualDocumentSpec = {
  id: "proposal-2026-18",
  title: {
    en: text("Technical Proposal"),
    ar: text("العرض الفني"),
  },
  sections: [
    {
      id: "scope",
      alignmentKey: "proposal.scope",
      title: {
        en: text("Scope"),
        ar: text("نطاق العمل"),
      },
      blocks: [
        {
          type: "paragraph",
          id: "scope-summary",
          content: {
            en: text("Managed services and transition support."),
            ar: text("الخدمات المُدارة ودعم الانتقال."),
          },
        },
      ],
    },
  ],
};

const html = renderBilingualHTML(document, {
  target: "screen",
  includeDocumentShell: true,
});
```

`renderBilingualHTML` validates before rendering and throws
`BilingualLayoutValidationError` when the document is invalid.

## Public API reference

### `src/lib/bilingual-layout.tsx`

#### Core model

| Export | Purpose |
| --- | --- |
| `Localized<T>` | Immutable `{ en: T; ar: T }` pair |
| `BilingualLayoutMode` | `"parallel"`, `"serial-ar-first"`, or `"serial-en-first"` |
| `BilingualMode` | Compatibility alias for `BilingualLayoutMode` |
| `BilingualViewerMode` | `"both"` or declarative `"tabs"` |
| `TextDirectionOverride` | `"auto"`, `"ltr"`, or `"rtl"` for headings and paragraphs |
| `DirectionalVisualBehavior` | `"never"` or `"mirror-in-rtl"` |
| `BilingualDocumentSpec` | Root document with `id`, localized title, sections, and optional layout overrides |
| `PairedSection` | Stable semantic section with `id`, `alignmentKey`, optional title, and paired blocks |
| `PairedBlock` | Union of heading, paragraph, list, table, image, and chart blocks |

Inline nodes are a discriminated union:

| Type | Fields and behavior |
| --- | --- |
| `TextInlineNode` | `{ type: "text"; text }`; escaped as plain text |
| `ValueInlineNode` | `{ type: "value"; value: BidiValue; valueKind? }`; rendered inside `<bdi>` |
| `StrongInlineNode` | Nested inline children rendered as `<strong>` |
| `EmphasisInlineNode` | Nested inline children rendered as `<em>` |
| `CodeInlineNode` | Escaped text rendered as `<code>` |
| `LinkInlineNode` | Safe `href` plus nested children |
| `LineBreakInlineNode` | Renders `<br />` |
| `BilingualInlineNode` | Union of all inline node types |
| `BilingualValueKind` | Semantic class: identifier, number, currency, date, URL, email, or technical term |

Block-specific exports are:

- `PairedHeadingBlock`: heading levels 2–6, optional direction override and
  `keepWithNext`;
- `PairedParagraphBlock`: localized inline content and optional direction;
- `BilingualListItem` and `PairedListBlock`: recursive paired items, ordered or
  unordered, with an optional positive start number;
- `BilingualTableColumn`, `BilingualTableCell`, `BilingualTableRow`, and
  `PairedTableBlock`: keyed table model, optional caption, widths, alignment,
  and repeated-header preference;
- `SafeImageSource` and `PairedImageBlock`: safe public/data source, localized
  alt text and caption, decorative state, visual behavior, and width.
- `PairedChartBlock`: a stable block ID plus a structured
  `DocumentChartDefinition` from `document-visualizations.ts`. The renderer
  produces a localized accessible SVG and data-table fallback in each language
  cell; raw SVG is not accepted.

Configuration exports:

| Export | Notes |
| --- | --- |
| `BilingualViewerConfig` | Viewer mode and default language |
| `BilingualLayoutConfig` | Fully resolved layout configuration |
| `BilingualLayoutOverrides` | Partial per-document or constructor overrides |
| `RenderBilingualDocumentOptions` | `target` (`screen`/`print`) and `includeDocumentShell` |
| `DEFAULT_BILINGUAL_CONFIG` | Parallel 50/50, 768 px breakpoint, Arabic-first mobile order, both languages visible |
| `createColumnRatio(englishPercent)` | Returns frozen `[English, Arabic]`; validates the 30–70% constraint |

Validation exports:

| Export | Behavior |
| --- | --- |
| `BilingualValidationIssueCode` | Stable issue-code union |
| `BilingualValidationIssue` | Code, severity, JSON-like path, and message |
| `BilingualValidationResult` | `{ valid, issues }` |
| `validateBilingualDocument(input)` | Non-throwing validation report |
| `parseBilingualDocument(input)` | Throws on errors and deeply freezes valid input |
| `BilingualLayoutValidationError` | Error with an `issues` collection |

Rendering exports:

| Export | Behavior |
| --- | --- |
| `escapeBilingualHtml(value)` | Escapes text for HTML contexts |
| `renderSafeInline(nodes)` | Renders the inline AST; still use the document validator before calling it on external data |
| `generateBilingualCSS(config?)` | Deterministic responsive/print CSS using Phase 1 design tokens |
| `BilingualLayoutEngine` | Stateful configuration wrapper with `validate` and `render` methods |
| `renderBilingualHTML(document, options?)` | Convenience validation and render entry point |

`BilingualLayoutEngine.render` emits
`data-bilingual-layout-ready="true"`. Screen tab mode emits declarative buttons
and data attributes; the host application is responsible for tab interaction.
Print target always includes both languages. Rendered pairs also expose
fragment index/count and keep-with-next metadata for measurement adapters; the
renderer still does not call `synchronizeLayout` itself.

### `src/lib/layout-sync.ts`

The synchronization API is pure and DOM-free. All heights must use the same
unit, and `pageContentHeight` must already exclude page margins, headers, and
footers.

| Export | Purpose |
| --- | --- |
| `AlignmentKey` | Branded semantic key |
| `createAlignmentKey(value)` | Rejects empty, trimmed/whitespace-containing, control-containing keys |
| `BilingualLanguage` | `"EN"` or `"AR"` |
| `PairedFragmentKind` | Heading, paragraph, list item, table header/row, callout, caption, signature, image, or other |
| `ColumnMeasurement` | `contentHeight` and optional renderer-approved `adjustableGaps` |
| `PairedRowInput` | One atomic compiler-created fragment |
| `LayoutSyncOptions` | Page height, row gap, bounded spacing, tolerance, and continuation labels |
| `synchronizeLayout(rows, options)` | Returns synchronized rows, pages, warnings, and metrics |
| `LayoutSyncResult` | `pages`, flattened `rows`, `warnings`, and `metrics` |
| `SynchronizedColumn` | Added spacing per gap and residual trailing space |
| `OverflowClassification` | None, column imbalance, page overflow, or both |
| `SynchronizedPairedRow` | Shared row height and synchronized columns |
| `PaginatedPairedRow` | Row plus page, offset, and continuation metadata |
| `SynchronizedPage` | Used, remaining, and overflow height |
| `LocalizedContinuationLabel`, `ContinuationLabels`, and `ContinuationMetadata` | Localized continuation markers |
| `LayoutSyncWarning` | Residual imbalance, oversized fragment, or unsatisfied keep-with-next |
| `LayoutSyncMetrics` | Input rows, pages, overflow rows, and continuation breaks |
| `LAYOUT_SYNC_ERROR_CODES` / `LayoutSyncErrorCode` | Stable malformed-input codes |
| `LayoutSyncError` | Domain error with code and optional row index |

Dynamic spacing is distributed only across `adjustableGaps`; text line spacing
is not altered. Each fragment remains atomic. Split long content at paragraphs,
list items, or table rows before measurement.

```ts
import {
  createAlignmentKey,
  synchronizeLayout,
  type PairedRowInput,
} from "@/lib/layout-sync";

const rows: readonly PairedRowInput[] = [
  {
    alignmentKey: createAlignmentKey("contract.scope.1"),
    fragmentIndex: 0,
    fragmentCount: 2,
    kind: "paragraph",
    en: { contentHeight: 180, adjustableGaps: 3 },
    ar: { contentHeight: 204, adjustableGaps: 4 },
    keepWithNext: true,
  },
  {
    alignmentKey: createAlignmentKey("contract.scope.1"),
    fragmentIndex: 1,
    fragmentCount: 2,
    kind: "paragraph",
    en: { contentHeight: 260, adjustableGaps: 4 },
    ar: { contentHeight: 252, adjustableGaps: 3 },
  },
];

const synchronized = synchronizeLayout(rows, {
  pageContentHeight: 700,
  rowGap: 12,
  maxSpacingPerGap: 4,
  maxDynamicSpacingPerRow: 24,
  balanceTolerance: 0.5,
});

for (const warning of synchronized.warnings) {
  console.warn(warning.code, warning.alignmentKey);
}
```

### `src/lib/bilingual-typography.ts`

#### Direction, sanitization, and digit APIs

| Export | Behavior |
| --- | --- |
| `BilingualLocale` / `DocumentLanguage` | Aliases for `"ar" \| "en"` |
| `StrongDirection` | Arabic, Latin, mixed, or neutral |
| `HtmlDirection` | RTL or LTR |
| `analyzeStrongDirection(text)` | Counts strong Arabic and Latin letters |
| `detectStrongDirection(text)` | Returns only the classification |
| `UNSAFE_BIDI_CONTROLS` | Metadata for rejected Unicode controls |
| `sanitizeBidiControls(text)` | Removes controls and returns safe text plus findings |
| `findUnsafeBidiControls(text)` | Returns findings only |
| `sanitizeBidiText(text)` | Compatibility name returning the structured result |
| `removeUnsafeBidiControls(text)` | Returns sanitized text only |
| `DIGIT_POLICIES` / `DigitPolicy` | Preserve, locale, western, or Arabic-Indic |
| `DEFAULT_DIGIT_POLICY_BY_LOCALE` | Arabic-Indic for Arabic, western for English when policy is `locale` |
| `resolveDigitPolicy(policy, locale)` | Resolves the `locale` policy |
| `applyDigitPolicy(text, policy?, locale?)` | Converts supported digit forms explicitly |
| `createSafeTextRuns(text, options?)` | Produces sanitized, direction-resolved text runs |
| `renderSafeBdiHtml(text, options?)` | Adds escaped `<bdi>` markup plus diagnostics |
| `renderBdiHtml(text, options?)` | Returns only the safe HTML |
| `createBidiValue(text, languageOrOptions?)` | Produces the complete `BidiValue` used by the AST |

`StrongDirectionAnalysis`, `UnsafeBidiControlDefinition`,
`RemovedBidiControl`, `BidiSanitizationResult`, `NumeralSystem`,
`ResolvedDigitPolicy`, `SafeTextRun`, `SafeTextRunOptions`,
`SafeTextRunsResult`, `SafeBdiHtmlResult`, and `BidiValue` expose the
structured metadata and results. Numbers resolve LTR inside mixed content; the
enclosing direction still follows the selected base locale.

#### Font and flow APIs

| Export | Behavior |
| --- | --- |
| `SupportedFontWeight` | 300, 400, 500, 600, or 700 |
| `BilingualFontFace` / `BilingualFontPair` | Allow-listed family metadata |
| `BILINGUAL_FONT_PAIRS` / `DOCUMENT_FONT_PAIRS` | Noto Sans and IBM Plex Sans pair definitions |
| `BilingualFontPairId` | `"noto-sans" \| "ibm-plex-sans"` |
| `DEFAULT_BILINGUAL_FONT_PAIR_ID` | `"ibm-plex-sans"` |
| `BROWSER_SHAPING_RESPONSIBILITY` | Explicit shaping-responsibility statement |
| `getBilingualFontPair` / `resolveFontPair` | Resolve allow-listed pair metadata |
| `getFontPairStack(pair, locale)` | Safe CSS font-family stack |
| `TextContentKind` | Prose or technical |
| `TEXT_FLOW_POLICIES` / `getTextFlowPolicy` | Locale-specific hyphenation and overflow policy |
| `getTypographyStyle(locale, options?)` | Framework-neutral style object |
| `generateBilingualTypographyCss(options?)` | Deterministic HTML/print typography CSS |

`normalizedLineHeight` must be finite and between 1 and 3. Arabic uses no
hyphenation and keeps tracking at `normal`; technical content uses
`overflow-wrap: anywhere` and tabular lining numerals.
`TextFlowPolicy`, `TypographyStyleOptions`, `BilingualTypographyStyle`, and
`BilingualTypographyCssOptions` are the corresponding public option/result
types.

### `src/lib/bilingual-pdf.ts`

| Export | Behavior |
| --- | --- |
| `BILINGUAL_FONT_LICENSES` | Package, OFL license name, and upstream metadata |
| `BILINGUAL_PRINT_PROFILE` | A4, sRGB, vector-text, and 300-DPI raster target metadata |
| `BILINGUAL_PERFORMANCE_TARGETS` | 50-page HTML, PDF, and heap budgets used by benchmarks |
| `getEmbeddedBilingualFontCss(pair?)` | Reads local WOFF2 assets, emits data-URL `@font-face` CSS, and caches its promise |
| `BilingualPdfQualityCode` / `BilingualPdfQualityIssue` | Structural quality issue model |
| `BilingualHtmlQualityReport` | Pair/language/font counts and issues |
| `BilingualPdfQualityError` | Error carrying quality issues |
| `inspectBilingualHtml(html)` | Checks readiness marker, paired cells, one `h1`, remote fonts, and unsafe bidi controls |
| `BilingualRenderOptions` | Screen/print target and font pair |
| `BilingualRenderArtifact` | Frozen document, canonical HTML, SHA-256, pair, and quality report |
| `renderBilingualArtifact(input, options?)` | Validates, renders, embeds fonts, inspects, and hashes HTML |
| `GenerateBilingualPdfOptions` | Render options plus shared `HtmlToPdfOptions` |
| `BilingualPdfArtifact` | Render artifact plus a PDF `Buffer` |
| `generateBilingualPdf(input, options?)` | Generates canonical print HTML and a Chromium PDF |

`generateBilingualPdf` defaults to A4, print backgrounds, bilingual footer,
14 mm inline margins, no fixed wait, and the explicit
`[data-bilingual-layout-ready]` readiness selector. The shared PDF utility also
waits for `document.fonts.ready` within a bounded timeout.

This module uses Node.js filesystem, crypto, module resolution, and `Buffer`.
Run it in a Node runtime, not a browser component or Edge runtime.

### React components

Import from the barrel:

```tsx
import {
  BilingualFooter,
  BilingualHeader,
  BilingualList,
  BilingualSection,
  BilingualTable,
} from "@/components/documents/bilingual";
```

#### `BilingualSection`

`BilingualSectionProps`:

| Prop | Type | Notes |
| --- | --- | --- |
| `alignmentKey` | `string` | Required semantic pairing key |
| `english` / `arabic` | `ReactNode` | Required trusted content |
| `title` | `LocalizedNode?` | Optional paired heading |
| `headingLevel` | `1`–`6` | Defaults to 2 |
| `layout` | `BilingualLayoutMode?` | Defaults to parallel |
| `columnRatio` | `[number, number]?` | Positive CSS `fr` weights; invalid values fall back to 1/1 |
| `continuation` | `BilingualContinuation?` | Fragment and total-fragment metadata |
| `className` | `string?` | Trusted styling hook |
| `keepWithNext` | `boolean?` | Adds print avoidance class |

This ratio is a React layout weight, not the AST percentage ratio. It does not
enforce the AST engine's 30%–70% and total-100 rules.

#### `BilingualHeader`

`BilingualHeaderProps` requires a localized title and optionally accepts a
localized subtitle, eyebrow, logo, and class name. `BilingualHeaderLogo` has
`src`, `alt`, and optional width/height. The center logo slot is never mirrored.
Remote images remain subject to the application's Next.js image configuration;
data URLs are rendered unoptimized.

#### `BilingualTable`

`BilingualTableColumn` contains `key`, localized header, optional trusted CSS
width, and a numeric flag. `BilingualTableRow` contains a stable key and a cell
record. Each `BilingualTableCell` has English and Arabic `ReactNode` values.

`BilingualTableProps` accepts columns, rows, optional caption, class name, and
localized empty state. English columns render in source order; Arabic columns
render in reverse physical order. One shared `<tr>` aligns both language halves,
and `<thead>` uses the repeatable table-header display mode.

#### `BilingualList`

`BilingualListProps` accepts keyed English/Arabic items, optional ordered mode,
start number, class name, and accessible label. Markers are placed in `<bdi>`.
The component uses ARIA list roles so paired grid rows retain list semantics.

#### `BilingualFooter`

`BilingualFooterProps` accepts localized company/notice, explicit page and total
numbers, CSS-counter mode, and a class name. Explicit pagination appears only
when both numbers are present. CSS counters use
`.bilingual-page-number::before` and `.bilingual-total-pages::before`; verify
counter support in the actual print engine before relying on them.

Supporting barrel exports are `LocalizedNode`, React
`BilingualLayoutMode`, `BilingualContinuation`, and
`normalizeColumnRatio`.

## Content examples

### Mixed identifiers and technical terms

Use value nodes for references, dates, currencies, URLs, emails, and embedded
Latin technical terms:

```ts
import {
  type BilingualInlineNode,
  type BilingualValueKind,
} from "@/lib/bilingual-layout";
import {
  createBidiValue,
  type DocumentLanguage,
} from "@/lib/bilingual-typography";

function isolatedValue(
  value: string,
  language: DocumentLanguage,
  valueKind: BilingualValueKind
): BilingualInlineNode {
  return {
    type: "value",
    value: createBidiValue(value, {
      baseLocale: language,
      digitPolicy: "preserve",
    }),
    valueKind,
  };
}

const arabicReference: readonly BilingualInlineNode[] = [
  { type: "text", text: "مرجع المنافسة: " },
  isolatedValue("RFP-2026-018/API-v2", "ar", "identifier"),
  { type: "text", text: " — البريد: " },
  isolatedValue("bids@example.sa", "ar", "email"),
];
```

### Lists

```ts
import type { PairedListBlock } from "@/lib/bilingual-layout";

const deliverables: PairedListBlock = {
  type: "list",
  id: "deliverables",
  ordered: true,
  start: 1,
  items: [
    {
      id: "transition-plan",
      content: {
        en: [{ type: "text", text: "Transition plan" }],
        ar: [{ type: "text", text: "خطة الانتقال" }],
      },
    },
    {
      id: "monthly-report",
      content: {
        en: [{ type: "text", text: "Monthly service report" }],
        ar: [{ type: "text", text: "تقرير الخدمة الشهري" }],
      },
    },
  ],
};
```

### Tables

```ts
import type { PairedTableBlock } from "@/lib/bilingual-layout";

const serviceLevels: PairedTableBlock = {
  type: "table",
  id: "service-levels",
  caption: {
    en: [{ type: "text", text: "Service levels" }],
    ar: [{ type: "text", text: "مستويات الخدمة" }],
  },
  repeatHeader: true,
  columns: [
    {
      id: "measure",
      header: {
        en: [{ type: "text", text: "Measure" }],
        ar: [{ type: "text", text: "المقياس" }],
      },
      widthPercent: 60,
    },
    {
      id: "target",
      header: {
        en: [{ type: "text", text: "Target" }],
        ar: [{ type: "text", text: "المستهدف" }],
      },
      align: "numeric",
      widthPercent: 40,
    },
  ],
  rows: [
    {
      id: "availability",
      cells: {
        measure: {
          content: {
            en: [{ type: "text", text: "Availability" }],
            ar: [{ type: "text", text: "التوافر" }],
          },
        },
        target: {
          content: {
            en: [{ type: "text", text: "99.95%" }],
            ar: [{ type: "text", text: "99.95%" }],
          },
        },
      },
    },
  ],
};
```

For very long tables, create compiler fragments at row boundaries and use
`layout-sync`. The AST `repeatHeader` flag defaults to true in rendered markup,
but actual page-break behavior still depends on the print engine and row sizes.

### Images

```ts
import type { PairedImageBlock } from "@/lib/bilingual-layout";

const architectureDiagram: PairedImageBlock = {
  type: "image",
  id: "architecture-diagram",
  source: { kind: "public", path: "/documents/architecture.png" },
  alt: {
    en: "Service architecture and trust boundaries",
    ar: "بنية الخدمة وحدود الثقة",
  },
  caption: {
    en: [{ type: "text", text: "Target architecture" }],
    ar: [{ type: "text", text: "البنية المستهدفة" }],
  },
  visualBehavior: "never",
  widthPercent: 90,
};
```

Use `mirror-in-rtl` only for a directional illustration such as a process arrow.
Keep `never` for logos, signatures, screenshots, charts with chronological
axes, and diagrams where mirroring would change facts.

### React composition

```tsx
import {
  BilingualFooter,
  BilingualHeader,
  BilingualList,
  BilingualSection,
} from "@/components/documents/bilingual";

export function ProposalPreview() {
  return (
    <article>
      <BilingualHeader
        eyebrow={{ en: "Technical proposal", ar: "العرض الفني" }}
        title={{ en: "Managed Services", ar: "الخدمات المُدارة" }}
      />
      <BilingualSection
        alignmentKey="proposal.scope"
        title={{ en: "Scope", ar: "نطاق العمل" }}
        english={<p>Transition and operate the service.</p>}
        arabic={<p>انتقال الخدمة وتشغيلها.</p>}
      />
      <BilingualList
        ordered
        ariaLabel="Deliverables / المخرجات"
        items={[
          { key: "plan", en: "Transition plan", ar: "خطة الانتقال" },
          { key: "report", en: "Monthly report", ar: "التقرير الشهري" },
        ]}
      />
      <BilingualFooter
        company={{ en: "Example Co.", ar: "شركة مثال" }}
        pageNumber={1}
        totalPages={4}
      />
    </article>
  );
}
```

### Canonical artifact and PDF

```ts
import {
  generateBilingualPdf,
  renderBilingualArtifact,
} from "@/lib/bilingual-pdf";
import type { BilingualDocumentSpec } from "@/lib/bilingual-layout";

async function exportDocument(document: BilingualDocumentSpec) {
  const preview = await renderBilingualArtifact(document, {
    target: "screen",
    fontPair: "ibm-plex-sans",
  });

  const printable = await generateBilingualPdf(document, {
    fontPair: "ibm-plex-sans",
    pdf: {
      format: "A4",
      printBackground: true,
    },
  });

  return {
    previewHtml: preview.html,
    previewSha256: preview.sha256,
    pdf: printable.pdf,
  };
}
```

### Existing contract adapter

The contract adapter accepts the canonical paired article format and the
legacy adjacent `:::en`/`:::ar` form. Canonical input is:

```ts
import {
  buildContractBilingualDocument,
  buildEnhancedBilingualContractHTML,
  generateEnhancedBilingualContractPDF,
} from "@/lib/contract-export-bilingual";

const contentMd = `### Article 1 — Scope | المادة 1 — النطاق
:::en
The supplier will provide managed support.
:::
:::ar
يقدم المورد خدمات الدعم المُدار.
:::
`;

const options = {
  title: "Managed Services Agreement",
  titleAr: "اتفاقية الخدمات المُدارة",
  contentMd,
  projectTitle: "Operations 2026",
  etimadRef: "RFP-2026-018",
  layoutMode: "side-by-side" as const,
  columnRatio: [50, 50] as const,
};

const compiled = buildContractBilingualDocument(options);
const html = buildEnhancedBilingualContractHTML(options);
const pdf = await generateEnhancedBilingualContractPDF(options);

console.log(compiled.sourceFormat, compiled.diagnostics, html.length, pdf.length);
```

`side-by-side` maps to parallel, `stacked` and `legacy` map to Arabic-first
serial, and `tabbed` maps to parallel screen output with declarative viewer
metadata. Missing bilingual articles or empty article bodies block compilation.
A missing Arabic document title produces a warning and an explicit unavailable
label; it is not silently invented.

## HTML and PDF parity

Parity is based on a shared source and renderer:

- `parseBilingualDocument` produces the canonical immutable AST;
- `renderBilingualArtifact` adds local font faces and a stable SHA-256 for the
  exact HTML string;
- screen and print artifacts preserve the same document and paired language
  cells;
- `generateBilingualPdf` uses print-target HTML from that same path;
- Chromium waits for the readiness selector and for the browser font set.

This architecture reduces divergence; it does not guarantee pixel identity.
Screen viewport width, print media queries, page margins, headers/footers,
browser versions, and printer rasterization can change geometry. Compare the
screen artifact in print emulation with the generated PDF and run the
Playwright visual suite for release candidates.

### Local fonts and licenses

The current pinned packages are:

| Pair | Packages | Repository version | License |
| --- | --- | --- | --- |
| Noto Sans | `@fontsource/noto-sans`, `@fontsource/noto-sans-arabic` | 5.3.0 | OFL-1.1 |
| IBM Plex Sans | `@ibm/plex-sans`, `@ibm/plex-sans-arabic` | 1.1.0 | OFL-1.1 |

Local license texts are installed at:

- `node_modules/@fontsource/noto-sans/LICENSE`
- `node_modules/@fontsource/noto-sans-arabic/LICENSE`
- `node_modules/@ibm/plex-sans/LICENSE.txt`
- `node_modules/@ibm/plex-sans-arabic/LICENSE.txt`

`BILINGUAL_FONT_LICENSES` also records the upstream project URLs. Preserve
required license notices when redistributing font software and review the
actual license text for the intended distribution. This documentation is not a
legal opinion.

Each pair embeds Arabic and Latin faces at weights 300, 400, 500, 600, and 700.
The print profile's 300-DPI value is a raster target. Text remains vector text;
the adapter does not increase the native resolution of supplied images.

## Performance and 50-page guidance

`BILINGUAL_PERFORMANCE_TARGETS` defines benchmark budgets, not universal
guarantees:

| Budget | Target |
| --- | ---: |
| 50-page canonical HTML render | under 2,000 ms |
| 50-page Chromium PDF render | under 30,000 ms |
| 50-page heap delta | under 128 MiB |

The HTML and heap test runs in the regular performance suite. The real PDF
benchmark is opt-in and depends on local Chromium and the host machine. Re-run
it in the intended deployment/runtime class rather than treating a development
laptop result as production evidence.

For large documents:

1. Segment long clauses at semantic paragraph, list-item, and table-row
   boundaries before measurement.
2. Keep each `alignmentKey` group contiguous and number fragments from zero to
   `fragmentCount - 1`.
3. Measure after the selected fonts load. Use one unit for both columns and
   `pageContentHeight`.
4. Reserve margins, headers, and footers before passing page body height to
   `synchronizeLayout`.
5. Inspect every `LayoutSyncWarning`; do not hide residual imbalance or
   oversized-fragment warnings.
6. Avoid large repeated base64 images. Public bundled assets reduce duplicated
   HTML size, while data images remain capped at 8 MiB each.
7. Reuse a font pair within a process so the embedded-font promise cache avoids
   repeated disk reads.
8. Use explicit page starts only when required. Fifty forced page breaks are a
   benchmark fixture, not a recommendation for normal flow.
9. Test representative Arabic expansion, dense tables, long identifiers, and
   actual letterhead margins—not only short synthetic text.

The synchronization algorithm is O(n) time and O(n) memory in the number of
compiler-created fragments.

## Accessibility, browser, and print guidance

### WCAG-oriented practices

The implementation provides useful WCAG 2.1 AA foundations, but it is not a
certification:

- keep `lang="en"`/`dir="ltr"` and `lang="ar"`/`dir="rtl"` on the smallest
  meaningful regions;
- provide meaningful localized alt text, or set `decorative: true` and leave
  both alt strings empty;
- preserve one document-level `h1` and a logical heading hierarchy;
- use real tables, headers, captions, lists, and links rather than visual
  imitations;
- ensure brand overrides retain AA contrast in both screen and print themes;
- do not rely on position, direction, or color alone to convey meaning;
- provide working keyboard/state behavior if the host enables screen tabs;
- inspect the resulting PDF separately for reading order and tagging needs.

The generated HTML quality report checks structure, not contrast, keyboard
operation, PDF tags, or the accuracy of translations and alt text.

### Browser scope

The HTML/CSS target is current Chrome, Safari, Firefox, and Edge. The automated
geometry and PDF paths currently use Playwright Chromium when enabled. Treat
Safari, Firefox, and Edge as manual or separately automated compatibility
checks until evidence exists for the exact release/browser matrix.

Chromium is the authoritative PDF engine. A browser's print preview is useful
for inspection but is not evidence that another browser will paginate
identically.

### Print guidance

- Use print target for final preview; tab mode is forced to show both languages.
- Keep table rows and bounded callouts together, but do not apply
  `break-inside: avoid` to an unbounded article.
- Use `repeatHeader` and real `<thead>` elements for tables.
- Do not depend on CSS page counters without testing the selected engine.
- Keep logos and factual graphics unmirrored.
- Supply raster images at sufficient native pixel dimensions for their printed
  size; the 300-DPI profile does not resample them.
- Verify selectable Arabic text, connected glyphs, page breaks, clipping,
  headers/footers, and physical margins in the generated PDF.

## Troubleshooting

### RTL/LTR and mixed values

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Tender ID or email appears reordered | Plain mixed text was placed directly in an RTL run | Build a `BidiValue` and use a `value` inline node |
| Invisible characters change display order | Authored text contains bidi controls | Inspect `sanitizeBidiControls` findings; store the sanitized text and audit the source |
| Digits unexpectedly change form | `locale` or explicit digit conversion was selected | Use `digitPolicy: "preserve"` for IDs, URLs, dates, and legal references |
| Arabic paragraph is LTR | Incorrect language or forced direction | Keep Arabic in `content.ar`; use `direction: "rtl"` only for a justified override |
| Logo or chart is backwards | `mirror-in-rtl` was applied indiscriminately | Set `visualBehavior: "never"` |
| English/Arabic mobile order is wrong | Layout/mobile order configuration mismatch | Check `mobileOrder` and serial layout mode |

### Pagination and synchronization

| Symptom | Likely cause | Action |
| --- | --- | --- |
| One legal clause splits unpredictably | Fragment is too large or not segmented | Split at safe semantic boundaries before synchronization |
| `OVERSIZED_FRAGMENT` | A row exceeds `pageContentHeight` | Reduce the fragment or deliberately allocate a larger page body |
| `KEEP_WITH_NEXT_UNSATISFIABLE` | The pair cannot fit on one empty page | Remove the hint or split the content |
| Residual blank space remains | Adjustable-gap capacity was exhausted | Review `trailingSpace`, increase approved gaps carefully, or accept/report the imbalance |
| Continuation label is missing | Same-key fragments did not cross a page contiguously | Keep an alignment-key group contiguous and validate fragment indexes |
| Table header does not repeat | Print engine or table structure prevents repetition | Confirm a real `<thead>`, `repeatHeader`, and that rows are not wrapped in incompatible containers |

`overflowRowCount` includes any non-`none` overflow classification, including
residual column imbalance; it is not limited to physical page overflow.

### Fonts and PDF

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Chromium executable is missing | Local browser was not installed | Run `bun run setup:pdf` |
| Font module cannot resolve | Dependencies or lockfile install is incomplete | Run `bun install`; verify the pinned font packages and local license files |
| Remote-font quality error | HTML includes Google Fonts URLs | Remove remote font imports and use `getEmbeddedBilingualFontCss` |
| Arabic falls back or shapes poorly | Wrong pair/weight, fonts not loaded, or unsupported glyph | Use an allow-listed pair/weight and await `document.fonts.ready`; inspect the actual text |
| PDF readiness times out | Marker selector was overridden/missing or layout never settled | Keep `[data-bilingual-layout-ready]`, inspect HTML, and review bounded timeout settings |
| Structural quality error | Missing pair/language cell, readiness marker, or exactly one `h1` | Inspect `quality.issues` and fix the canonical renderer input |
| Valid signature but bad layout | Signature checks only `%PDF-` | Run visual QA; inspect fonts, overflow, and page geometry |

### Overflow

- Represent long URLs, emails, identifiers, and technical terms as semantic
  value nodes; their CSS allows `overflow-wrap: anywhere`.
- Keep prose as prose so English hyphenation remains available and Arabic
  hyphenation remains disabled.
- Reduce table columns, choose serial layout, or redesign the table when fixed
  layout makes content unreadable.
- The React table scrolls horizontally on screen but switches overflow to
  visible for print; a too-wide print table still requires template work.
- Constrain images with `widthPercent` and verify their intrinsic dimensions.

## Migration guide

### From raw HTML strings

1. Map each semantic section to a `PairedSection` with a stable
   `alignmentKey`.
2. Convert headings, paragraphs, lists, tables, and images to discriminated AST
   blocks.
3. Convert emphasis, code, links, and mixed identifiers to inline nodes.
4. Keep source text unescaped; let the renderer escape it.
5. Replace arbitrary remote image URLs with trusted public assets or approved
   data images.
6. Run `validateBilingualDocument`, resolve every error, then switch to
   `parseBilingualDocument` or `renderBilingualHTML`.
7. Remove `dangerouslySetInnerHTML` from the untrusted document path.

### From independent columns or scroll synchronization

1. Pair translations by semantic key rather than DOM position or scroll ratio.
2. Split both languages into the same count of compiler-approved fragments.
3. Measure fragments after fonts load.
4. Call `synchronizeLayout` and apply its row height, gap spacing, page, offset,
   and continuation metadata.
5. Keep each alignment-key group contiguous.
6. Report warnings instead of silently stretching line height.

### From legacy contract markers

Use `buildContractBilingualDocument` as the transition adapter. It recognizes
canonical paired article Markdown and legacy adjacent `:::en`/`:::ar` blocks,
then routes both through the AST validator. Review
`ContractDocumentBuildResult.diagnostics`; a
`LEGACY_MARKER_ADAPTED` warning is expected until source content is migrated.

### From remote fonts

Remove Google Fonts links from generated HTML. Select
`"ibm-plex-sans"` or `"noto-sans"` and render through
`renderBilingualArtifact`/`generateBilingualPdf` so the local WOFF2 files are
embedded deterministically.

## Testing and QA commands

Install dependencies and local Chromium:

```bash
bun install
bun run setup:pdf
```

Run the non-browser Phase 2 suite:

```bash
bun run test:bilingual
```

Run real Chromium visual/PDF checks:

```bash
bun run test:bilingual:visual
```

Run the 50-page benchmark, including the opt-in PDF measurement:

```bash
bun run benchmark:bilingual
```

Generate inspectable HTML and PDF QA artifacts under
`/tmp/arabclue-bilingual-qa` by default:

```bash
bun run samples:bilingual
```

Run individual suites while developing:

```bash
bun test src/lib/__tests__/bilingual-layout.test.ts
bun test src/lib/__tests__/layout-sync.test.ts
bun test src/lib/__tests__/bilingual-typography.test.ts
bun test src/lib/__tests__/bilingual-components.test.tsx
bun test src/lib/__tests__/bilingual-pdf.test.ts
bun test src/lib/__tests__/contract-export-bilingual.test.ts
```

Run coverage and static gates:

```bash
bun test --coverage src/lib/__tests__/bilingual-layout.test.ts \
  src/lib/__tests__/layout-sync.test.ts \
  src/lib/__tests__/bilingual-typography.test.ts \
  src/lib/__tests__/bilingual-components.test.tsx \
  src/lib/__tests__/bilingual-pdf.test.ts
bunx tsc --noEmit
bun run lint
```

Read module-level coverage rather than inferring a global threshold from one
focused command. Browser/PDF tests are skipped unless their scripts set
`PLAYWRIGHT_CHROMIUM=1`.

For release QA, retain the HTML hash, browser/Chromium version, font pair,
quality report, PDF checksum, test fixture identity, and screenshots. Review
actual Arabic and English content with qualified humans.

## Known non-goals

Phase 2 does not provide:

- machine translation or translation-quality review;
- legal advice, legal approval, or procurement compliance approval;
- arbitrary authored HTML in the validated AST;
- automatic DOM measurement or automatic splitting inside a fragment;
- ratio-based scroll synchronization;
- JavaScript Arabic shaping;
- a complete tab-view state controller;
- guaranteed pixel identity across screen, browsers, Chromium versions, and
  printers;
- automatic raster-image upsampling, CMYK conversion, PDF/A conformance, or
  complete tagged-PDF remediation;
- automatic mirroring decisions for charts, diagrams, signatures, or logos;
- evidence of Saudi data residency or any deployment topology;
- proof of production deployment or certification for a latest-two-browser
  matrix.

Those concerns require separate product, infrastructure, compliance, browser,
and human-review work.
