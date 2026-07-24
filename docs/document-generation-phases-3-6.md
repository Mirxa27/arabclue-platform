# Document Generation: Phases 3–6

This document describes the implemented Phase 3–6 document-generation
surfaces as of 2026-07-24. It is an API and integration reference, not a claim
that a generated contract has received legal approval, that every declared
output channel has a writer, or that the output has been certified in every
browser or office application.

Phase 2 is the shared rendering foundation. See
[Bilingual Layout Engine](./bilingual-layout-engine.md) for its AST, layout,
typography, HTML, and PDF APIs.

## Architecture

The four phases use the same fail-closed pattern:

```text
verified source records or immutable snapshots
  -> schema and provenance validation
  -> deterministic catalog, plan, or bilingual AST
  -> explicit export gate
  -> channel-specific renderer
```

| Phase | Source model | Validated intermediate form | Implemented output boundary |
| --- | --- | --- | --- |
| 3: Contract templates | Explicit template bindings | `BoundContractDocument`, then `BilingualDocumentSpec` | Draft HTML and font-embedded draft PDF |
| 4: Proposal layouts | `ProposalSnapshot` with source references | `CompiledProposalLayout` | PPTX buffer |
| 5: Tables and charts | Structured table/chart definitions | `PreparedDocumentTable` or normalized chart geometry | Escaped HTML table and accessible SVG plus data-table fallback |
| 6: Capability statements | `BusinessProfileSnapshot` | `CapabilityStatementBuildResult` containing a `BilingualDocumentSpec` | Authenticated HTML/PDF business-profile export |

The modules accept structured data, not authored HTML. They do not translate
missing text, invent evidence, calculate commercial values, or infer legal
approval. Canonical hashes make changes detectable; they are not digital
signatures and do not prove that source content is true.

## Phase 3: Contract Template System

Sources:

- [Contract catalog and binding API](../src/lib/document-templates/contract-templates.ts)
- [Bilingual contract renderer](../src/lib/document-templates/contract-template-renderer.ts)
- [Catalog and binding tests](../src/lib/__tests__/contract-templates.test.ts)
- [Renderer and live PDF tests](../src/lib/__tests__/contract-template-renderer.test.ts)

### Catalog

The frozen catalog contains seven versioned template families and 33 reusable
bilingual clauses:

| Template key | Intended drafting family |
| --- | --- |
| `it-services-v1` | IT implementation, integration, and managed services |
| `goods-supply-v1` | Equipment and product supply |
| `professional-services-v1` | Consulting and advisory services |
| `nda-v1` | Mutual or unilateral confidentiality arrangements |
| `subcontract-v1` | Prime-contractor and subcontractor delivery |
| `framework-calloff-v1` | Recurring framework and call-off work |
| `saas-data-v1` | SaaS subscriptions and data schedules |

Every template and clause has:

- lifecycle `DRAFT`;
- legal-review status `UNREVIEWED`;
- `counselReviewRequired: true`;
- bilingual text with unspecified language precedence;
- a deterministic `versionId` and `canonicalHash`; and
- pending official-source review rather than seeded statutory citations.

The catalog does not seed tender-specific prices, penalties, or percentages.

### Binding model

`TemplateVariableDefinition` describes each variable's type, required status,
source policy, validation bounds, and direction policy.

- `LOCALIZED` values require independently supplied `en` and `ar` strings or
  lists. A missing locale is an error; one language is never copied into the
  other.
- `DIRECTION_NEUTRAL` is limited to values that are semantically identical in
  both columns, such as identifiers, entities, dates, booleans, numbers, and
  money.
- Money is `{ amount: number, currency: string }`, with a finite non-negative
  amount and a three-letter uppercase currency.
- Dates use the `YYYY-MM-DD` calendar form.
- Raw markup, unresolved token syntax, control characters, and bidi override
  characters are rejected.

`PREVIEW` may return `READY_WITH_DIAGNOSTICS` and visible structured
placeholders. `FINAL` blocks when any error remains. In this API, `FINAL` means
variable-complete; the resulting document still remains a visibly unreviewed
draft.

### Public API

| Export | Contract |
| --- | --- |
| `CONTRACT_TEMPLATE_KEYS`, `CONTRACT_CLAUSE_IDS` | Stable key lists for catalog discovery. |
| `CONTRACT_TEMPLATE_CATALOG`, `CONTRACT_CLAUSE_CATALOG` | Deep-frozen template and clause definitions. |
| `getContractTemplate(key)` | Returns a known frozen template or `undefined`; prototype-chain names are not accepted. |
| `getContractClause(id)` | Returns a known frozen clause or `undefined`. |
| `computeCanonicalHash(value)` | Returns a deterministic `sha256:` hash for finite JSON-compatible plain data. It throws for cycles, accessors, symbols, non-finite numbers, and unsupported objects. |
| `computeContractTemplateHash(template)` | Recomputes a template hash without recursively including its stored hash. |
| `bindContractTemplate(key, bindings, options)` | Validates values and returns `READY`, `READY_WITH_DIAGNOSTICS`, or `BLOCKED`. |
| `compileContractTemplateDocument(key, bindings, options)` | Binds a template and converts a non-blocked result into the validated bilingual AST. |
| `renderContractTemplateDocumentHTML(compilation, options?)` | Renders the same draft AST used by PDF. Throws `ContractTemplateRenderError` for blocked compilations. |
| `generateContractTemplateDocumentPdf(compilation, options?)` | Generates a `BilingualPdfArtifact`; blocked compilations throw `ContractTemplateRenderError`. |
| `BindingDiagnostic` and `ContractTemplateDocumentCompilation` | Typed status and diagnostic unions for exhaustive handling. |

Binding diagnostics are:

`UNKNOWN_TEMPLATE`, `UNKNOWN_VARIABLE`, `MISSING_REQUIRED_VARIABLE`,
`OPTIONAL_VARIABLE_OMITTED`, `MISSING_BINDING_LOCALE`,
`INVALID_VARIABLE_TYPE`, and `UNSAFE_BINDING_VALUE`.

### Example: render a variable-complete draft

```typescript
import {
  compileContractTemplateDocument,
  generateContractTemplateDocumentPdf,
  renderContractTemplateDocumentHTML,
} from "@/lib/document-templates/contract-template-renderer";
import type { TemplateBindingValue } from "@/lib/document-templates/contract-templates";

export async function renderVariableCompleteDraft(
  templateKey: string,
  verifiedBindings: Readonly<Record<string, TemplateBindingValue>>
) {
  const compilation = compileContractTemplateDocument(
    templateKey,
    verifiedBindings,
    { mode: "FINAL" }
  );

  if (compilation.status === "BLOCKED") {
    return { ok: false as const, diagnostics: compilation.diagnostics };
  }

  const html = renderContractTemplateDocumentHTML(compilation);
  const pdf = await generateContractTemplateDocumentPdf(compilation);
  return { ok: true as const, html, pdf: pdf.pdf };
}
```

Supply localized narrative values independently:

```typescript
import type { TemplateBindingValue } from "@/lib/document-templates/contract-templates";

const localizedBindingFragment = {
  "input.scopeDescription": {
    en: "Verified English scope.",
    ar: "نطاق عربي موثق ومستقل.",
  },
  "input.governanceContacts": {
    en: ["English owner", "English approver"],
    ar: ["المالك العربي", "المعتمد العربي"],
  },
} satisfies Record<string, TemplateBindingValue>;
```

This fragment is not a complete template binding. Inspect
`getContractTemplate(templateKey)?.variables` and supply every required value
from verified project, workspace, approved-knowledge, or explicit user-entry
sources before using `FINAL`.

## Phase 4: Proposal Layouts and PPTX

Sources:

- [Proposal layout and PPTX API](../src/lib/proposal-layouts.ts)
- [Proposal tests](../src/lib/__tests__/proposal-layouts.test.ts)

### Presets and modules

The six frozen presets are `government-formal`, `executive-impact`,
`technical-deep-dive`, `compliance-evidence`, `bilingual-parallel`, and
`compact-addendum`. Each preset orders all 16 known module identities and marks
the required subset, role, orientation, rank, and channel treatment.

Intent selects a preset deterministically:

| `ProposalIntent` | Default preset |
| --- | --- |
| `FULL_SUBMISSION` | `government-formal` |
| `EXECUTIVE_REVIEW` | `executive-impact` |
| `TECHNICAL_EVALUATION` | `technical-deep-dive` |
| `COMPLIANCE_RESPONSE` | `compliance-evidence` |
| `BILINGUAL_SUBMISSION` | `bilingual-parallel` |
| `ADDENDUM` | `compact-addendum` |

A `ProposalSnapshot` carries its bilingual project identity, brand colors,
source registry, and module blocks. Blocks may be narrative, bullet list,
table, KPI, evidence register, commercial handoff, or diagram. References are
resolved only against the snapshot's explicit source registry. A
`VERIFIED` evidence status is still source data supplied to the snapshot; the
layout engine does not independently authenticate the evidence.

### Public API

| Export | Contract |
| --- | --- |
| `PROPOSAL_LAYOUT_KEYS`, `PROPOSAL_MODULE_KEYS` | Stable preset and module key lists. |
| `PROPOSAL_LAYOUT_PRESETS` | Deep-frozen plans for the six presets. |
| `PROPOSAL_CHANNEL_CAPABILITIES` | Explicit block support matrix with no implicit fallback. |
| `getProposalLayoutPreset(key)` | Returns a known preset or `undefined`. |
| `selectProposalLayout(snapshot, requested?)` | Chooses the explicit override or the intent-mapped preset. |
| `contrastRatio(first, second)` | Calculates the WCAG contrast ratio for intended six-digit hexadecimal inputs. |
| `resolveProposalPalette(input?)` | Normalizes colors, falls back to the default palette, and selects foregrounds with at least 4.5:1 contrast. Invalid supplied colors are also reported when a snapshot is validated. |
| `validateProposalSnapshot(snapshot, options)` | Returns sorted error diagnostics without changing the snapshot. |
| `compileProposalLayout(snapshot, options)` | Returns a deterministic `VALID` or `INVALID` channel plan, source/snapshot hash, plan hash, palette, modules, and diagnostics. It does not render content. |
| `generateProposalPptx(snapshot, options?)` | Validates and writes a real PPTX `Buffer`, or throws `ProposalLayoutValidationError` before producing a partial deck. |

The validator checks schema version, language parity, module/block identity,
required content, source references, brand colors, unsafe markup, unresolved
tokens, bidi controls, channel support, and commercial provenance. Populated
commercial values require a tender, workspace, or explicit user-entry source.
It does not calculate, round, or manufacture prices.

For PPTX, aggregated narrative, bullet-list, and table text is limited to 2,400
characters per language per block. Each rendered block becomes one slide with
English and Arabic columns. Source IDs plus snapshot and plan hashes are stored
in slide notes.

### Channel capability and current writers

| Block | HTML | PDF | PPTX | XLSX |
| --- | --- | --- | --- | --- |
| Narrative | Native | Native | Native | Manifest only |
| Bullet list | Native | Native | Native | Manifest only |
| Table | Native | Native | Native | Native |
| KPI | Native | Native | Native | Native |
| Evidence register | Native | Native | Native | Native |
| Commercial handoff | Native | Native | Native | Native |
| Diagram | Native | Native | Unsupported | Unsupported |

This matrix is a validation and adapter contract. The Phase 4 module currently
exports a concrete writer only for PPTX. It does not export proposal HTML, PDF,
or XLSX writers or an HTTP proposal-export route. A `NATIVE` matrix entry must
not be interpreted as proof that such a writer or route exists.

The PPTX writer lays supported block content out as bilingual text. A `TABLE`
capability does not mean that the writer creates an editable PowerPoint table
shape. The file references Aptos and Noto Sans Arabic by name; it does not
embed those fonts. Office applications may substitute fonts, so visual QA in
the intended presentation application remains required.

### Example: validate and generate a deck

```typescript
import {
  ProposalLayoutValidationError,
  compileProposalLayout,
  generateProposalPptx,
  type ProposalSnapshot,
} from "@/lib/proposal-layouts";

export async function createProposalDeck(snapshot: ProposalSnapshot) {
  const plan = compileProposalLayout(snapshot, { channel: "PPTX" });
  if (plan.status === "INVALID") {
    throw new ProposalLayoutValidationError(plan.diagnostics);
  }

  return {
    planHash: plan.planHash,
    snapshotHash: plan.snapshotHash,
    bytes: await generateProposalPptx(snapshot),
  };
}
```

Persist or log the snapshot version, snapshot hash, plan hash, and selected
preset with the artifact. Do not silently drop an unsupported block; route it
to a supported channel or block export.

## Phase 5: Tables and Charts

Sources:

- [Table and chart API](../src/lib/document-visualizations.ts)
- [Visualization tests](../src/lib/__tests__/document-visualizations.test.ts)
- [Bilingual chart-block integration](../src/lib/bilingual-layout.tsx)

### Public API

| Export | Contract |
| --- | --- |
| `formatDocumentNumber(value, locale, format?)` | Formats a finite number with explicit English or Saudi Arabic digits and removes formatter-inserted bidi controls. |
| `prepareDocumentTable(input, options?)` | Validates, localizes, formats, chunks, and recommends portrait or landscape orientation. It returns one empty page when there are no rows. |
| `renderDocumentTable(input, options?)` | Returns the prepared model and escaped, semantic HTML with caption, repeated page headers, row/column header scopes, and `<bdi>` values. |
| `renderDocumentChart(input, options?)` | Returns deterministic SVG, a visible HTML data table, combined figure HTML, alt text, direction, and resolved axis/category ordering. |
| `DOCUMENT_VISUALIZATION_LIMITS` | Public hard limits for identifiers, labels, tables, charts, points, and value magnitude. |
| `CHART_PATTERN_KEYS` | Eight non-color patterns used for series/slice differentiation. |
| `DocumentVisualizationError` | Thrown with `code` (`INVALID_INPUT` or `LIMIT_EXCEEDED`) and a machine-readable `path`. |

Table columns are discriminated as `text`, `number`, or `boolean`. Number
formats are `number`, `integer`, `percent`, or `currency`. A cell must be a
string, finite number, boolean, or `null`, matching its column.

Charts support `bar`, `line`, and `pie` types. Categorical RTL charts reverse
the visual category order. Chronological axes always sort increasing values
from physical left to right, including inside RTL documents. Color is never
the only series distinction: patterns, line styles, and markers provide
non-color cues. The SVG has a title and description, and every chart includes
a visible data-table fallback.

The public limits are:

| Limit | Value |
| --- | ---: |
| Identifier length | 64 characters |
| Bilingual label length | 500 characters per value |
| Table columns | 20 |
| Table rows | 5,000 |
| Rows per page | 100 |
| Chart categories | 60 |
| Pie categories | 8 |
| Chart series | 8 |
| Total chart data points | 480 |
| Absolute numeric value | 1,000,000,000,000 |

### Example: render a localized table

```typescript
import {
  renderDocumentTable,
  type DocumentTableDefinition,
} from "@/lib/document-visualizations";

const scoreTable = {
  id: "evaluation_scores",
  title: { en: "Evaluation scores", ar: "درجات التقييم" },
  columns: [
    {
      id: "criterion",
      kind: "text",
      label: { en: "Criterion", ar: "المعيار" },
    },
    {
      id: "score",
      kind: "number",
      label: { en: "Score", ar: "الدرجة" },
      format: { style: "integer" },
    },
  ],
  rows: [
    {
      id: "technical",
      cells: { criterion: "Technical", score: 88 },
    },
  ],
} satisfies DocumentTableDefinition;

const { html, prepared } = renderDocumentTable(scoreTable, {
  locale: "ar",
  rowsPerPage: 28,
});

console.log(prepared.recommendedOrientation, html);
```

### Example: embed a safe chart in the bilingual AST

```typescript
import type { PairedChartBlock } from "@/lib/bilingual-layout";

const progressChart = {
  type: "chart",
  id: "delivery_progress",
  chart: {
    id: "delivery_progress_chart",
    type: "bar",
    title: { en: "Delivery progress", ar: "تقدم التنفيذ" },
    summary: {
      en: "Verified completion by workstream.",
      ar: "نسب الإنجاز الموثقة حسب مسار العمل.",
    },
    categories: [
      { id: "design", label: { en: "Design", ar: "التصميم" } },
      { id: "build", label: { en: "Build", ar: "التنفيذ" } },
    ],
    series: [
      {
        id: "completion",
        label: { en: "Completion", ar: "الإنجاز" },
        values: [0.8, 0.55],
        pattern: "diagonal",
        color: "#20639B",
      },
    ],
    valueFormat: { style: "percent" },
  },
} satisfies PairedChartBlock;
```

The bilingual renderer validates and renders a chart independently for English
LTR and Arabic RTL output. Do not concatenate arbitrary markup into the
returned HTML or SVG.

## Phase 6: Capability Statements

Sources:

- [Capability-statement adapter](../src/lib/capability-statement.ts)
- [Business-profile integration](../src/lib/business-profile.ts)
- [Authenticated export route](../src/app/api/business-profile/export/route.ts)
- [Adapter tests](../src/lib/__tests__/capability-statement.test.ts)
- [Business-profile library tests](../src/lib/__tests__/business-profile-bilingual.test.ts)
- [Export-route tests](../src/lib/__tests__/business-profile-export-route.test.ts)

### Document model and export policy

`buildCapabilityStatement` is a pure
`BusinessProfileSnapshot -> CapabilityStatementBuildResult` adapter. Its
parallel bilingual document contains nine stable sections:

1. cover and company identity;
2. verified statistics;
3. projects;
4. team;
5. certificates;
6. partnerships;
7. target sectors;
8. methodologies; and
9. readiness evidence.

Missing translations remain explicit placeholders and diagnostics; English is
not copied into Arabic. Shared identifiers, counts, percentages, and dates are
isolated as bidi-aware values. Unsafe bidi controls are removed. Remote logos
are omitted; accepted logo sources are trusted application-relative paths or
base64 PNG, JPEG, or WebP data images up to 8 MiB.

The default policy blocks missing translations, missing source records, unsafe
text, unsafe assets, invalid values, and incomplete profile readiness. The
named draft policy changes those diagnostics to non-blocking warnings while
retaining them in the result and placeholders in the document. Draft output
therefore remains visibly incomplete and requires an explicit caller opt-in.

### Public library API

| Export | Contract |
| --- | --- |
| `buildCapabilityStatement(profile, options?)` | Builds a deterministic, frozen AST plus all diagnostics and blocking diagnostics. |
| `assertCapabilityStatementExportable(result)` | Narrows an exportable result or throws `CapabilityStatementExportBlockedError`. |
| `DEFAULT_CAPABILITY_STATEMENT_POLICY` | Strict, all-blocking default. |
| `CAPABILITY_DIAGNOSTIC_HANDLING` | Stable `block` and `allow` policy values. |
| `TRANSLATION_UNAVAILABLE` | The explicit English/Arabic placeholder used when a source translation is absent. |
| `compileBilingualBusinessProfile(profile, quality?)` | Applies `strict` by default or the explicit permissive `draft` policy. |
| `renderBilingualBusinessProfileHTML(compilation)` | Requires an exportable compilation and renders a complete screen HTML document. |
| `generateBilingualBusinessProfilePDF(compilation)` | Requires an exportable compilation and renders a font-embedded PDF through the Phase 2 PDF engine. |
| `BILINGUAL_BUSINESS_PROFILE_DRAFT_POLICY` | Immutable all-allow policy used only for explicit draft exports. |

Capability diagnostic codes are `MISSING_TRANSLATION`, `MISSING_SOURCE`,
`UNSAFE_BIDI_CONTROL_REMOVED`, `UNSAFE_ASSET_OMITTED`,
`INVALID_SOURCE_VALUE`, and `PROFILE_NOT_READY`. Each diagnostic contains a
machine-readable source path, localized message, severity, and blocking flag.

### HTTP export API

`GET /api/business-profile/export` requires an authenticated session and the
session's tenant workspace.

Route-level exports are:

| Export | Contract |
| --- | --- |
| `resolveBusinessProfileExportFormat(value)` | Applies the exact HTML versus legacy-PDF fallback described below. |
| `resolveBusinessProfileExportLocale(value)` | Applies the bilingual, English, or legacy-Arabic resolution described below. |
| `resolveBusinessProfileExportQuality(value)` | Requires exact `draft`; every other value resolves to `strict`. |
| `handleBusinessProfileExport(request, dependencies?)` | Implements the route with an injectable dependency boundary for deterministic tests. |
| `GET(request)` | Next.js route entry point using production authentication, tenant, profile, renderer, and audit dependencies. |
| `BILINGUAL_CAPABILITY_EXPORT_BLOCKED_CODE` and `BILINGUAL_CAPABILITY_EXPORT_BLOCKED_MESSAGE` | Stable strict-gate response identifiers. |
| `BusinessProfileExportDependencies` | Typed seam for authentication, tenant lookup, profile loading, renderers, PDF generation, and audit recording. |

| Query | Accepted values | Resolution |
| --- | --- | --- |
| `format` | `html`, `pdf` | Exact `html` selects HTML; any other or missing value preserves the legacy PDF fallback. |
| `locale` | `ar`, `en`, `bilingual` | Exact `bilingual` selects the new engine, exact `en` selects legacy English, and any other or missing value preserves the legacy Arabic fallback. |
| `quality` | `strict`, `draft` | Applies only to bilingual output. Exact `draft` opts in to placeholders/warnings; any other or missing value is strict. |

| Outcome | Response |
| --- | --- |
| No session | `401` JSON without loading profile data |
| Strict bilingual diagnostics | `422` JSON with code `BILINGUAL_CAPABILITY_EXPORT_BLOCKED` and blocking diagnostics |
| Bilingual HTML success | `200 text/html`, inline bilingual capability-statement filename |
| Bilingual PDF success | `200 application/pdf`, attachment filename |
| PDF runtime failure | `503` JSON with code `PDF_UNAVAILABLE` |

Successful downloads emit the existing artifact-download audit event with
format, locale, and bilingual quality. A failed audit sink does not convert an
otherwise successful export into a failed response. Blocked and unauthorized
requests are not recorded as successful downloads.

### Example: strict library integration

```typescript
import {
  compileBilingualBusinessProfile,
  generateBilingualBusinessProfilePDF,
  renderBilingualBusinessProfileHTML,
  type BusinessProfileSnapshot,
} from "@/lib/business-profile";

export async function exportCapabilityStatement(
  profile: BusinessProfileSnapshot
) {
  const compilation = compileBilingualBusinessProfile(profile, "strict");
  if (!compilation.canExport) {
    return {
      ok: false as const,
      diagnostics: compilation.blockingDiagnostics,
    };
  }

  return {
    ok: true as const,
    html: renderBilingualBusinessProfileHTML(compilation),
    pdf: await generateBilingualBusinessProfilePDF(compilation),
  };
}
```

For an authenticated application request:

```text
GET /api/business-profile/export?format=html&locale=bilingual
GET /api/business-profile/export?format=pdf&locale=bilingual
GET /api/business-profile/export?format=html&locale=bilingual&quality=draft
```

The third request is an explicit draft opt-in. Do not use it as a substitute
for completing translations, source evidence, or readiness requirements.

## Safe Migration and Integration

1. Keep existing Arabic-only and English-only business-profile exports in
   place while adding `locale=bilingual`; the route already preserves those
   legacy branches.
2. Convert raw document inputs into the typed snapshot or definition for the
   target phase. Do not pass HTML through a string field.
3. Preserve independent Arabic and English source fields. Treat a missing
   translation as missing data, not permission to duplicate another language.
4. Register proposal source records first, then refer to their IDs from blocks.
   A source ID proves only that the reference resolves inside the snapshot.
5. Run the target channel's validator before rendering. Surface diagnostic
   `code`, `path`, and localized message to the author.
6. Pin contract `template.key`, `versionId`, and `canonicalHash`, and proposal
   `snapshotVersion`, `snapshotHash`, `planHash`, and `presetKey` with stored
   artifacts.
7. Use preview/draft modes only for authoring. Require a clean binding or
   strict capability compilation at the final export boundary.
8. Keep legal approval as a separate, auditable workflow. The current contract
   data model has no legally approved lifecycle state.
9. Keep channel fallbacks explicit. Never drop a diagram, evidence block, or
   commercial entry merely because the selected writer cannot represent it.
10. Re-run targeted tests, type checking, lint, the full test suite, and build
    after wiring a new route or template consumer.

No database migration is required by these library modules. Do not run Prisma
schema mutation commands merely to adopt them, especially against a shared
database. The in-code contract catalog is the only documented catalog source;
no database seed or publication workflow for these unreviewed clauses is
approved.

## Current Constraints

- Contract templates and rendered artifacts remain draft-only and unreviewed.
  Qualified Saudi counsel must review the completed terms and official sources
  before signature, execution, or representation as legally approved.
- The jurisdiction label in a template is not evidence of infrastructure,
  processing, or storage residency.
- The proposal module has a concrete PPTX writer only. HTML, PDF, and XLSX
  proposal writers and a proposal-export endpoint are not part of this phase.
- PPTX diagrams are blocked. PPTX content uses referenced fonts, not embedded
  fonts, and supported tables are currently presented as bilingual text.
- Capability-statement HTTP export is implemented only on the existing
  authenticated business-profile route.
- Tests verify deterministic structure, validation, escaping, bidi behavior,
  accessibility markup, route status contracts, and representative PDF/PPTX
  file generation. They are not certification for the latest two versions of
  every browser or every PowerPoint-compatible application.
- PDF generation depends on a working Chromium runtime. The route reports a
  stable `503 PDF_UNAVAILABLE` response when that runtime fails.

## Verification

Install dependencies with Bun. Install Chromium once before live PDF tests:

```bash
bun install
bun run setup:pdf
```

Run the focused Phase 3–6 suite:

```bash
bun test \
  src/lib/__tests__/contract-templates.test.ts \
  src/lib/__tests__/contract-template-renderer.test.ts \
  src/lib/__tests__/proposal-layouts.test.ts \
  src/lib/__tests__/document-visualizations.test.ts \
  src/lib/__tests__/capability-statement.test.ts \
  src/lib/__tests__/business-profile-bilingual.test.ts \
  src/lib/__tests__/business-profile-export-route.test.ts
```

Run the real Chromium contract-PDF test:

```bash
PLAYWRIGHT_CHROMIUM=1 bun test \
  src/lib/__tests__/contract-template-renderer.test.ts
```

Generate focused coverage and inspect the rows for the Phase 3–6 modules and
route; Bun's aggregate also includes transitively imported application code:

```bash
bun test --coverage \
  src/lib/__tests__/contract-templates.test.ts \
  src/lib/__tests__/contract-template-renderer.test.ts \
  src/lib/__tests__/proposal-layouts.test.ts \
  src/lib/__tests__/document-visualizations.test.ts \
  src/lib/__tests__/capability-statement.test.ts \
  src/lib/__tests__/business-profile-bilingual.test.ts \
  src/lib/__tests__/business-profile-export-route.test.ts
```

Run repository-wide static and build gates:

```bash
bunx tsc --noEmit
bun run lint
bun run test
bun run build
```

Do not run `bun run dev` and `bun run build` concurrently because both write to
`.next`.
