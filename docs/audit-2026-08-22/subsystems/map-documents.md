# ArabClue — Document-Generation Subsystem Audit

**Repo:** `/Users/abdullahmirxa/Documents/GitHub/arabclue-platform`
**Scope:** `src/lib/` (bilingual/layout/typography, documents, contracts, proposals), `src/lib/pdf/**`, `src/lib/document-templates/**`, `src/components/documents/**`
**Total in-scope LOC:** ~33,400 (27,888 in the enumerated `src/lib` files + 4,438 in `pdf/`, `document-templates/`, `components/documents/` + 1,061 in `design-tokens.ts`/support)
**Method:** full reads with the Read tool; cross-references via ripgrep across `src/`. No repository file was modified; no build, dev server, or PDF render was executed.

---

## 0. Executive orientation

There are **two parallel document engines** in this codebase, and understanding that split is the key to reading everything else:

1. **The structured engine (new, good).** A validated immutable AST (`BilingualDocumentSpec`) → `bilingual-layout.tsx` renders HTML with universal escaping → `bilingual-pdf.ts` embeds fonts as base64 data URLs → `html-to-pdf.ts` renders in a network-isolated, JS-disabled Chromium → `layout-sync.ts` performs measured bilingual pagination. This path is genuinely well-engineered: escape-by-construction, no raw HTML accepted anywhere, deterministic, and it has its own output quality gate (`inspectBilingualHtml`).

2. **The legacy engine (old, risky).** `generators.ts` + `letterhead.ts` + `markdown.ts` build HTML by string concatenation and hand it to the *same* `htmlToPdf`. It is not covered by the quality gate, and it violates two of that gate's own rules — most importantly it links **remote Google Fonts into a renderer that blocks all network traffic**, which is the single highest-impact defect found (see D1).

Escaping discipline is, overall, better than typical for this class of system: I found **no exploitable HTML-injection sink**. Brand colors, fonts, and logo URLs are all funnelled through allow-list validators (`brand-policy.ts`, `brand-logo.ts`) before reaching any string-concatenated `style=` attribute, and every PDF path inlines logos as data URIs rather than leaving `/api/files` paths that the network block would kill. The real problems are **correctness, determinism, integrity-claim accuracy, and resource management**, not injection.

---

## 1. File-by-file map

> `LOC` is `wc -l`. "Imported by" excludes `src/lib/__tests__/**` unless the *only* importer is a test, which is called out explicitly because it identifies dead code.

### 1.1 PDF runtime — `src/lib/pdf/**`

#### `src/lib/pdf/html-to-pdf.ts` — 533 LOC
**Purpose.** The single Chromium boundary for the whole product. Validates PDF options, computes printable content dimensions, launches Chromium (local `playwright` vs serverless `playwright-core` + `@sparticuz/chromium`), isolates the page from the network, waits for font/image readiness, optionally drives bilingual layout synchronization, and emits the PDF buffer.

**Exports.**
- `pdfMarginSchema: ZodObject` — per-field defaults `top/bottom "18mm"`, `left/right "14mm"` (`:24-29`).
- `htmlToPdfOptionsSchema: ZodObject`; `HtmlToPdfOptions = z.input<...>` (`:31-65`). Note `margin` is `.optional()` with **no** object-level default (`:39`).
- `cssLengthToPixels(value: string): number` (`:90`)
- `resolvePdfContentHeight(options): number` (`:109`)
- `resolvePdfContentDimensions(options): {width, height}` (`:121`) — falls back to `pdfMarginSchema.parse({})` at `:124`.
- `resolvePdfLayoutSyncOptions(options): {pageContentWidth, pageContentHeight}` (`:144`)
- `class PdfGenerationError extends Error` with `code = "PDF_UNAVAILABLE"` (`:157`)
- `isolatePdfPageNetwork(page): Promise<void>` (`:265`)
- `waitForPdfReadiness(page, options): Promise<PdfReadinessResult>` (`:328`)
- `htmlToPdf(html: string, opts?: HtmlToPdfOptions): Promise<Buffer>` (`:418`)
- `isPdfBuffer(bytes: Buffer): boolean` (`:525`)
- `generatePrintReadyMetadata` (re-exported concept; see `print-ready.ts:637`)

**Key imports.** `node:timers/promises`, `node:path`, `zod`; dynamic `playwright` / `playwright-core` / `@sparticuz/chromium` / `../layout-sync`.

**Imported by.** `bilingual-pdf.ts`, `generators.ts`, `business-profile.ts`, `contract-export.ts` (transitively), `proposal-layout-export.ts` (via `bilingual-pdf`).

**I/O contract.** In: an HTML string (must be non-empty, `:422`) plus options. Out: `Buffer` beginning `%PDF`. Throws `PdfGenerationError` for every failure mode.

**Edge cases handled.** Empty HTML; option validation via Zod including a 2000px cap on any single length (`:20`); margins that leave <96px of content throw `RangeError` (`:133-140`); font readiness timeout → explicit error (`:449`); undecoded images → explicit error (`:456`); `context.close()` and `browser.close()` in nested `finally` blocks (`:505-510`) so the browser is released on every path including throw.

**Edge cases NOT handled.** Browser reuse — a fresh Chromium is launched per call (`:430`), so every export pays a full cold start. No global concurrency cap at this layer (that lives in `document-export-guard.ts`, which only three routes use). `bleedSize` / `displayCropMarks` / `colorProfile` / `omitBackground` / `generateTaggedPdf` are accepted by the schema (`:53-61`) but never passed to `page.pdf()` (`:483-503`) — silently inert. The two default margin sets diverge (see D5). Any non-`PdfGenerationError` is rewritten into a misleading "Playwright/Chromium unavailable" message (`:511-521`).

---

#### `src/lib/pdf/print-ready.ts` — 645 LOC
**Purpose.** Print-production standards: margin presets, typographic scale, bleed/safety geometry, crop marks, CMYK/ICC notes, accessibility hints. Generates CSS injected into print artifacts.

**Exports.** `PRINT_READY` (frozen constant tree — `margins.premium = 20/20/18/18mm` at `:38-43`, `margins.narrow = 14/16mm...`, `bleed.size`, `bleed.marks`, `color.palette`, `color.profileNote`), `generatePremiumPrintCss(opts)`, `generateBleedAndSafetyCss(...)` (`:416-424`), `generatePrintReadyMetadata()` (`:637`).

**Imported by.** `bilingual-pdf.ts` (`:489`), `components/documents/document-components.tsx` (comment only).

**I/O contract.** Pure string generation from a fixed vocabulary. No user data enters.

**Edge cases handled.** All colors/sizes are module constants — no injection surface.

**Edge cases NOT handled.** `@page { bleed: …; marks: crop cross }` (`:418-419`, `:460`) and `@page :bleed` (`:424`) are **not implemented by Chromium**; the crop-mark/bleed feature is cosmetic CSS that produces no marks in the output PDF (D9). `generatePrintReadyMetadata` stamps `creationDate: new Date().toISOString()` (`:637`), which is non-deterministic (D8). The `@page` blocks hardcode A4 geometry regardless of the `format` option actually given to `htmlToPdf`.

---

### 1.2 Bilingual engine

#### `src/lib/bilingual-layout.tsx` — 2,847 LOC
**Purpose.** The heart of the structured engine. Defines the immutable bilingual document AST, validates it exhaustively, and renders it to HTML with escape-by-construction.

**Exports (principal).**
- Types: `BilingualDocumentSpec`, `PairedSection`, `PairedBlock` (paragraph | heading | list | table | image | chart | spacer), `BilingualInlineNode` (text | strong | emphasis | code | value | link | line-break), `BilingualTableColumn/Row/Cell`, `SafeImageSource` (`:157-170`), `Localized<T>`, `BilingualLayoutOverrides`, `BilingualValueKind`, `RenderBilingualDocumentOptions`, `BilingualValidationIssue`.
- `parseBilingualDocument(input: unknown): BilingualDocumentSpec` — throws on any structural violation.
- `renderBilingualHTML(doc, options): string`
- `escapeBilingualHtml(text: string): string`
- `isSafeHref(href: string): boolean`

**Key imports.** `./design-tokens`, `./typography`, `./bilingual-typography`, `./document-visualizations`.

**Imported by.** `bilingual-pdf.ts`, `capability-statement.ts`, `contract-export-bilingual.ts`, `proposal-layout-export.ts`, `business-profile.ts`, `document-templates/contract-template-renderer.ts`.

**I/O contract.** In: `unknown` (parsed defensively). Out: HTML string. Never accepts raw HTML from a caller — this is the module's central invariant and it holds.

**Edge cases handled.** Every string is escaped (`&<>"'`). `isSafeHref` restricts links to `https:`, `mailto:`, `tel:`, fragments, and safe app-relative paths — no `javascript:`, `data:`, or `file:`. `SafeImageSource` public paths reject `//`, backslashes, and `..` traversal (`:694-702`); data URIs are type- and size-checked. Column ratios are validated numerics before entering CSS. Text is fragmented at semantic boundaries for pagination; tables and lists are chunked row-by-row.

**Edge cases NOT handled.** Images and charts are **never fragmented** — a figure taller than the page content box can only produce an `OVERSIZED_FRAGMENT` warning from `layout-sync`, not a graceful split. Arabic headings deliberately carry no `id` (English does), so Arabic-side anchor links have no target.

---

#### `src/lib/bilingual-pdf.ts` — 750 LOC
**Purpose.** Turns a validated AST into a print artifact and then a PDF: embeds fonts as base64 `@font-face` data URLs so no network is needed, applies premium print CSS, calls `htmlToPdf`, and runs a post-render quality inspection.

**Exports.** `generateBilingualPdf(input: unknown, options?: GenerateBilingualPdfOptions): Promise<BilingualPdfArtifact>` (`:692`), `renderBilingualArtifact(...)`, `prepareBilingualPdfDocument(...)`, `inspectBilingualHtml(html): BilingualPdfQualityIssue[]` (`:~400-460`), `BilingualPdfQualityError`, `BilingualPdfQualityCode` (`:342-354`), `GenerateBilingualPdfOptions`, `BilingualPdfArtifact`.

**Imported by.** `business-profile.ts`, `contract-export-bilingual.ts`, `proposal-layout-export.ts`, `document-templates/contract-template-renderer.ts`.

**I/O contract.** In: AST + optional `{ fontPair, pdf, resolvePublicImage }`. Out: `{ pdf: Buffer, html, … }`. Throws `BilingualPdfQualityError` with structured codes.

**Edge cases handled.** Fonts read from local `node_modules` and inlined — never fetched. Explicit margins are always set (`:717-722`, from `PRINT_READY.margins.premium`), so this path avoids the default-margin divergence. `...options.pdf` is spread *after* the defaults (`:725`) and *before* the non-negotiable `synchronizeBilingualLayout`/`readySelector`/`tagged` flags (`:726-728`), so callers can override geometry but not safety. Content dimensions are recomputed from the *same* parsed options that reach `page.pdf()` (`:730-731`) — this is the correct pattern. `isPdfBuffer` verifies the `%PDF` signature before returning (`:741`).
`inspectBilingualHtml` catches: missing document shell, missing layout marker, missing language, unpaired cells, wrong `h1` count, **remote font requests** (`:437-443`), unsafe BIDI controls, unresolved public images, invalid/oversized images, bad PDF signature.

**Edge cases NOT handled.** The quality gate is only wired into *this* path; the legacy `generators.ts` HTML never passes through it (D1). Fonts are re-read and re-base64-encoded on every single render — no module-level cache (D11).

---

#### `src/lib/layout-sync.ts` — 1,591 LOC
**Purpose.** A pure, DOM-free bilingual row-synchronization and pagination engine, plus thin browser-side adapters that Playwright evaluates in-page.

**Exports.** `synchronizeLayout(rows, options): LayoutSyncResult` (`:~330`), `synchronizeBrowserMeasurement(measurement, options)`, `measureBilingualLayoutInPage(...)`, `applyBilingualLayoutInPage(input, targetDocument?)` (`:1195`), `synchronizeBilingualLayoutInBrowser(...)` (`:~1540`), `synchronizeBilingualLayoutPage(page, options)` (`:~1575`), `LayoutSyncError`, `BILINGUAL_LAYOUT_READY_SELECTOR`, `DEFAULT_BILINGUAL_RENDER_SYNC_OPTIONS` (`:~905-924`), `createAlignmentKey`, types `LayoutSyncOptions`, `LayoutSyncResult`, `SynchronizedPage`, `PairedRowInput`, `LayoutSyncWarning`.

**Imported by.** `html-to-pdf.ts` (dynamic, `:467`), `bilingual-layout.tsx`, `proposal-layout-export.ts`.

**I/O contract.** In: measured row heights + `pageContentHeight` in CSS pixels. Out: page assignments, per-row offsets, spacing distribution, and warnings. The browser adapter rewrites the DOM into absolutely-positioned synthetic page `div`s with `blockSize: ${pageContentHeight}px` and `breakAfter: page` (`:1376-1387`) — i.e. **custom pagination, not native CSS page breaks**.

**Edge cases handled.** Option validation rejects non-finite/negative values (`:385-395`). `KEEP_WITH_NEXT_UNSATISFIABLE` warning when a heading + following block can't fit (`:755-762`). `OVERSIZED_FRAGMENT` warning with the row isolated on its own page (`:771-783`). Row-count guard `maxRows: 6_000` (`:920`). `applyBilingualLayoutInPage` re-validates that the measured row count still matches the DOM (`:1214`) and that the page height is finite and ≤100,000px (`:1217-1223`).

**Edge cases NOT handled.** `OVERSIZED_FRAGMENT` and `KEEP_WITH_NEXT_UNSATISFIABLE` are only **warnings** — nothing in `bilingual-pdf.ts` inspects `result.warnings` (grep for `warnings` in that file returns nothing), so a fragment that overflows the page is silently clipped or spilled in the delivered PDF with no diagnostic surfaced to the user (D6). `DEFAULT_BILINGUAL_RENDER_SYNC_OPTIONS` (`:914`, `:919`) encodes a *third* margin assumption — 14/14mm horizontal, 16/18mm vertical — that matches neither `pdfMarginSchema` nor `page.pdf()`'s fallback (D5).

---

#### `src/lib/bilingual-typography.ts` — 868 LOC
**Purpose.** Arabic/English typographic primitives: bidirectional run analysis, unsafe BIDI control stripping, digit-system policy, font-pair resolution, safe `<bdi>` rendering.

**Exports.** `sanitizeBidiText(text): {sanitizedText, removedControls}`, `createBidiValue(text, localeOrOptions)`, `createSafeTextRuns(...)`, `renderSafeBdiHtml(...)`, `applyDigitPolicy(...)`, `escapeHtmlText(text)`, `resolveFontPair(id)`, `findUnsafeBidiControls(html)`, types `DocumentLanguage`, `BilingualFontPairId`, `SupportedFontWeight`.

**Imported by.** `bilingual-layout.tsx`, `bilingual-pdf.ts`, `capability-statement.ts`, `contract-export-bilingual.ts`, `document-templates/contract-template-renderer.ts`.

**Edge cases handled.** This is the strongest module in the subsystem. It strips `U+202A–U+202E`, `U+2066–U+2069`, `U+200E/F`, `U+061C` — closing the classic "invisible text reordering" attack where a rendered contract reads differently from its stored bytes. Text is split into explicit direction runs with `dir`/`lang` and isolated in `<bdi>`. `escapeHtmlText` correctly escapes `'` as `&#39;` (unlike `markdown.ts`).

**Edge cases NOT handled.** `applyDigitPolicy` supports a `"preserve"` mode that callers use liberally (e.g. `contract-template-renderer.ts:194`), which means the numeral system is decided upstream by `Intl` and not re-checked here.

---

#### `src/lib/typography.ts` — 442 LOC
**Purpose.** Locale-aware number/currency/date/percentage formatting, font stacks, direction/alignment helpers, numeral transliteration, truncation, file-size formatting.

**Exports.** `getGoogleFontsUrl(fonts)` (`:37`), `getFontStack(locale, customFont?)` (`:78`), `getFontStackFromBrand(brand, locale)` (`:105`), `formatNumber` (`:135`), `formatCurrency` (`:165`), `formatDate` (`:197`), `formatPercentage` (`:243`), `getTextDirection` (`:275`), `getAlignmentForLocale` (`:293`), `getTextAlign` (`:313`), `toEasternArabicNumerals` (`:343`), `toWesternArabicNumerals` (`:371`), `truncateText` (`:401`), `formatFileSize` (`:423`), type `Locale`.

**Imported by.** `bilingual-layout.tsx`, `bilingual-pdf.ts`, `bilingual-typography.ts`, `capability-statement.ts`, `contract-export-bilingual.ts`, `document-layout.ts`, `document-visualizations.ts`, `proposal-layout-export.ts`, `proposal-snapshot-hydration.ts`, `components/documents/document-components.tsx`, `document-templates/contract-template-renderer.ts`.

**Edge cases handled.** `formatDate` explicitly pins `calendar: "gregory"` for **both** locales (`:203`) — the correct decision for tender/contract documents, and the reference behaviour the rest of the codebase should follow. `getFontStack` only honours a custom font if it is in `DOCUMENT_BRAND_FONT_FAMILIES` (`:86-92`).

**Edge cases NOT handled.** `getGoogleFontsUrl` produces a remote URL that is unusable in any PDF path (network-blocked); it exists as a second remote-font helper alongside `letterhead.googleFontsHref`. `:203` is written as `locale === "ar" ? "gregory" : "gregory"` — a no-op ternary that reads as an unfinished decision (D14).

---

#### `src/lib/letterhead.ts` — 180 LOC
**Purpose.** Client letterhead helpers for the legacy engine: company-name resolution, brand font stacks, Google Fonts href, letterhead bar HTML, Playwright header/footer templates, Office colour conversion.

**Exports.** `letterheadCompanyName(locale, brand, company)`, `resolveBrandFontStack(fontFamily?)` (`:51`), `googleFontsHref(fontFamily?)` (`:56`), `letterheadBarHtml(opts)` (`:142`), `pdfHeaderTemplate(opts)`, `pdfFooterTemplate(opts)`, `brandArgb(...)`, `officeColor(...)`, `resolveOfficeFontFace(...)`, type `LetterheadBrand`.

**Imported by.** `generators.ts`, `contract-export.ts`, `contract-export-bilingual.ts`, `app/api/proposals/[id]/download/route.ts`, and four dashboard components.

**Edge cases handled.** `escapeAttr` (`:134-140`) escapes `&<>"`; since every attribute in this file is double-quoted, omitting `'` is safe here. All colours pass through `normalizeDocumentBrandColor`, which enforces `/^#[0-9A-Fa-f]{6}$/`, so the interpolated `style="…color: ${primary}…"` strings cannot be broken out of.

**Edge cases NOT handled.** `googleFontsHref` (`:56-66`) is the origin of D1 — it is consumed by `generators.ts:91` and `:529` and emitted into HTML that is then rendered with the network blocked.

---

### 1.3 Document utilities

#### `src/lib/markdown.ts` — 191 LOC
**Purpose.** Minimal GFM-ish Markdown → HTML for legacy proposal/contract bodies and emails.

**Exports.** `escapeHtml(text: string): string`, `markdownToHtml(md: string, opts?): string`.

**Imported by.** `generators.ts`, `business-profile.ts`, `account-verification-email.ts`, `invitation-email.ts`, `components/dashboard/markdown-studio-editor-inner.tsx`.

**Edge cases handled.** Inline escaping runs before emphasis/code substitution, so user text cannot forge tags. `opts.headingColor`/`accentColor` reach inline `style=` attributes, but every caller sources them from `normalizeDocumentBrandColor`, so only 6-digit hex can arrive.

**Edge cases NOT handled.** `escapeHtml` does not escape `'`. This is currently unexploitable because no single-quoted attribute is built from it, but it is a latent trap: any future single-quoted attribute would immediately become injectable, and this function is exported and reused by four other modules including two e-mail builders (D13).

#### `src/lib/text-quality.ts` — 139 LOC
Heuristics to reject LLM output that is placeholder-y, interrogative, or a mid-sentence fragment. Exports `isPlaceholderText`, `isQuestionText`, `isMidSentenceFragment`, and related predicates. Imported by `download/route.ts`, `letterhead.ts`, `requirements.ts`, and six `lib/agents/*` modules. Pure string analysis; no rendering, no injection surface. Handles Arabic and English punctuation; does not handle mixed-script fragments.

#### `src/lib/document-visualizations.ts` — 1,815 LOC
Deterministic, print-safe SVG/HTML charts and tables from structured data. Exports `renderDocumentChart`, `renderDocumentTable`, chart spec types and validators. Imported only by `bilingual-layout.tsx`. **Strong module:** every id/label is `escapeText`/`escapeAttribute`-processed, colours are gated by `/^#[0-9A-Fa-f]{6}$/`, currency codes are probed against `Intl.NumberFormat` before use (`:483-488`), and locale numerals are explicit (`ar-SA-u-nu-arab` / `en-US-u-nu-latn`, `:517`). SVG is built programmatically, never templated from raw input. Not handled: charts have no fragmentation strategy, so a tall chart becomes an `OVERSIZED_FRAGMENT`.

#### `src/lib/document-version-integrity.ts` — 38 LOC
`verifyDocumentVersionBytes(bytes, declaredSize)` → size check + `createHash("sha256").update(bytes).digest("hex")`. Imported by the three `api/documents/[id]/versions/**` routes. Correct and minimal. Does not authenticate the hash (no HMAC/signature), so it detects corruption, not tampering by anyone who can also rewrite the stored hash.

#### `src/lib/export-manifest.ts` — 147 LOC
Builds the `Export_Manifest.json` audit artifact. Exports `buildExportManifest(opts)`, `manifestToJson`, `validationReportToJson`, `sha256Hex`, `GENERATOR_VERSION`, type `ExportManifest`. Imported by `download/route.ts` and `structured-bid-package.ts`. Hashes each artifact's bytes (`:133`) and the proposal `contentMd` (`:112`). `generatedAt` falls back to `new Date().toISOString()` (`:93`) — non-deterministic. `approvalStatus` is derived purely from caller-supplied fields (`:107-111`) with no verification against the database.

#### `src/lib/document-export-guard.ts` — 298 LOC
Admission control for CPU-heavy rendering: source-character ceiling, local concurrent-render counter, distributed rate limit. Exports `DocumentExportGate`, `documentExportGate` singleton (`:298`), `DocumentExportAdmission`, `DocumentExportPermit`, error codes `EXPORT_SOURCE_TOO_LARGE` / `EXPORT_RATE_LIMITED` / `EXPORT_CAPACITY_EXHAUSTED`. Validates the `kind` string (rejects newline injection) and `sourceCharacters` (rejects `NaN`). **Only three routes use it** — `proposals/[id]/download`, `business-profile/export`, `contracts/templates/[key]/preview` (D7).

#### `src/lib/document-chunks.ts` — 174 LOC
RAG chunking/embedding for uploaded tender documents. Exports `chunkText`, `indexDocumentChunks`, `searchWorkspaceChunks`, `loadProjectTenderCorpus`. Caps at `MAX_CHUNKS_PER_DOC = 40` (`:11`) × ~900 chars ≈ 31KB indexed per document — larger tender PDFs are silently truncated. `indexDocumentChunks` does `deleteMany` (`:44`) then a serial `for` loop of `await embedText` + `await db.create` (`:47-50`), outside any transaction (D12).

#### `src/lib/pdf-preview-view.ts` — 12 LOC
`buildPdfPreviewUrl(blobUrl, zoom)` — appends a `#zoom=` fragment. Imported by `document-file-viewer.tsx`, `document-preview-frame.tsx`. No risk.

#### `src/lib/download-artifact.ts` — 181 LOC
Client-side fetch + `Content-Disposition` filename parsing + blob download. Imported by five dashboard components and `hooks/use-artifact-download.ts`. Parses `filename*=UTF-8''…` and quoted forms defensively and falls back to a safe default. Client-only; no server risk.

#### `src/lib/design-tokens.ts` — 599 LOC
Frozen design-token tree (colour ramps, spacing, radii, type scale). Exports `designTokens` plus derived helpers. Imported by `bilingual-layout.tsx`, `document-layout.ts`, `document-visualizations.ts`, `letterhead.ts`, `components/brand/logo-variants.ts`. Pure constants.

#### `src/lib/document-layout.ts` — 662 LOC — **DEAD CODE**
Page sizes, margin presets, `@page` CSS, header/footer HTML builders, content-dimension math, bilingual grid CSS. Exports `getPageDimensions`, `generatePageCSS`, `generatePrintCSS`, `generateDocumentHeader`, `generateDocumentFooter`, `generatePDFHeaderTemplate`, `generatePDFFooterTemplate`, `calculateContentWidth`, `calculateContentHeight`, `generateSectionDivider`, `wrapInPageContainer`, `generateBilingualLayoutCSS`, `DEFAULT_MARGINS` (18/14mm), `NARROW_MARGINS`, `WIDE_MARGINS`.
**Imported by: `src/lib/__tests__/document-layout.test.ts` only.** Nothing in the shipping pipeline references it (D10). It also carries a live-looking injection shape that no validator protects: `generatePDFHeaderTemplate(companyName, color)` interpolates `color` raw into a `style="…color: ${headerColor};…"` attribute (`:438`) — harmless today only because the function is never called.

#### `src/lib/structured-bid-package.ts` — 120 LOC
Orchestrates the structured ZIP: `exportProposalLayout` for PDF/PPTX/XLSX, plus `generateComplianceMatrixXLSX`, `generateBoQXLSX`, validation report, and export manifest. Exports `generateStructuredBidPackageZIP(opts): Promise<Buffer>`. Imported by `download/route.ts:964`. Two integrity defects: `status: "APPROVED"` is hardcoded (`:102`, D2) and `contentMd: ""` makes the manifest's proposal `contentHash` a constant (`:104`, D3). Everything is buffered in memory before `zip.generateAsync` (`:119`).

#### `src/lib/capability-statement.ts` — 1,657 LOC
Pure `BusinessProfileSnapshot` → bilingual AST adapter for capability statements. Exports `buildCapabilityStatement(profile, options)`, `assertCapabilityStatementExportable(result)`, `CapabilityStatementExportBlockedError`, `DEFAULT_CAPABILITY_STATEMENT_POLICY`, `TRANSLATION_UNAVAILABLE`, and a rich diagnostic union. Imported by `business-profile.ts`.
**Best-designed adapter in the audit.** It accepts no HTML, invents no translations (missing ones become visible `TRANSLATION_UNAVAILABLE` placeholders plus a blocking diagnostic), sanitizes BIDI on every source string (`:468-481`), validates counts/percentages/dates (`:548-613`), gates logos through `safeLogoSource` (`:651-670`), separates evidence-reviewed from user-entered records, and generates stable IDs via FNV-1a (`:623-640`). Deterministic by construction — same snapshot, byte-identical output.
Not handled: `sharedDate` (`:599-613`) emits the raw ISO string in both columns rather than a locale-formatted date; document `version` is hardcoded `"phase-6-v1"` (`:1611`).

#### `src/lib/generators.ts` — 1,103 LOC
The legacy engine. Exports `generateProposalHTMLPreview`, `generateProposalPDF` (`:244`), `generateComplianceMatrixXLSX` (`:~300`), `generateBoQXLSX` (`:~400`), `generateSlidesHTML` (`:~520`), `generateProposalPPTX` (`:~800`), `generateBidPackageZIP` (`:~890`), `resolveLocale`, `saudizationExportLabel`. Imported by `download/route.ts` and `structured-bid-package.ts`.
**Handled:** all interpolated text goes through `escapeHtml`; brand colours through `normalizeDocumentBrandColor`; logos through `inlineBrandLogoForPdf` + `safeBrandLogoUrlForDocument` with `trustedEmbeddedLogo: true` (`:251-264`), so PDF logos are real data URIs rather than blocked `/api/files` paths.
**Not handled:** remote Google Fonts (`:168-169`, `:613`, D1); `toLocaleString("ar-SA")` without a calendar override → Hijri dates (`:214`, `:218`, D4); bare `toLocaleString()` with no locale at `:585`, `:839`, `:910`; `Date.now()` fallback at `:218` and `new Date()` at `:313`, `:407`, `:911`; whole-package in-memory buffering in `generateBidPackageZIP`.

---

### 1.4 Contracts

| File | LOC | Purpose | Notable |
|---|---|---|---|
| `contract-artifacts.ts` | 50 | `parseContractArtifacts(json)` → typed articles/milestones | Fails closed on malformed JSON |
| `contract-draft-admission.ts` | 133 | Admission rules for contract drafting (plan/quota/state) | Pure predicates |
| `contract-export.ts` | 183 | Public contract export API + ZIP packaging | `new Date()` at `:88`, `:128` → non-deterministic manifest; all buffers held in memory |
| `contract-export-bilingual.ts` | 486 | Contract Markdown → bilingual AST adapter | Uses `inlineText`/`valueNode` so all text crosses the `escapeBilingualHtml` boundary; `partitionParagraphs` fragments articles; emits diagnostics for empty EN/AR text and missing Arabic titles |
| `contract-format.ts` | 40 | `parseContractArticles(md)` — heading-delimited split | No nesting support |
| `contract-obligations.ts` | 92 | `extractObligations(articles, milestones)` → stable obligation IDs | Deterministic IDs |
| `contract-render-snapshot.ts` | 481 | Immutable render snapshot + canonical hash | See below |
| `contract-review.ts` | 60 | Review-state predicates | — |
| `contract-template-authoring.ts` | 808 | Authoring-time validation of workspace contract templates | Zod-strict |
| `contract-template-persistence.ts` | 1,605 | Template CRUD, versioning, publish/deprecate lifecycle | Largest contract module |
| `contract-template-schema.ts` | 920 | Template + variable schemas (`STRING`/`NUMBER`/`PERCENT`/`MONEY`/`DATE`/`BOOLEAN`/`ENTITY`/`RICH_TEXT`/`LIST`), direction metadata | Strict enums |
| `contract-versioning.ts` | 748 | Version compare/diff/revert | — |

**`contract-render-snapshot.ts` detail.** Exports `contractRenderSnapshotSchema`, `createContractRenderSnapshot(source, {revision, capturedAt})` (`:230`), `validatePersistedContractRenderSnapshot(value, binding)` (`:351`), `contractExportOptionsFromSnapshot(snapshot)` (`:446`), `ContractRenderSnapshotError`, `CONTRACT_RENDER_SNAPSHOT_INVALIDATION` (`:477`). This is the integrity model done right: strict Zod with per-field length caps, cross-field identity refinement (proposal↔project↔workspace, `:92-105`), obligation-ID uniqueness (`:106-116`), a 2MB byte budget enforced on both write and read (`:215-223`, `:383-395`), and a canonical hash re-verified on load (`:423-435`). `capturedAt` is injected by the caller rather than read from the clock, which keeps the hash reproducible. The invalidation constant atomically nulls the snapshot and increments the revision.

---

### 1.5 Proposals

| File | LOC | Purpose | Notable |
|---|---|---|---|
| `proposal-builder-draft.ts` | 84 | Draft state helpers | — |
| `proposal-builder-engine.ts` | 326 | Section assembly from agent output | — |
| `proposal-builder-types.ts` | 167 | Shared builder types | — |
| `proposal-edit-precondition.ts` | 20 | Edit-allowed predicate | — |
| `proposal-final-export.ts` | 68 | `hasCompleteBoundProposalApproval(proposal, reviews, expectedSteps)` | Rigorous: requires every step APPROVED, exact step/reviewer/role match, identical `submissionHash` + version + snapshot hash + snapshot revision across all reviews, unique step indices, and a binding match to current proposal state |
| `proposal-layout-export.ts` | 1,351 | Main export entry: HTML / PDF / PPTX / XLSX from the AST | `requireValidNativePlan` blocks non-bilingual export; `generatedAt: new Date()` at `:1223` |
| `proposal-layouts.ts` | 2,245 | Layout presets and section templates | Largest proposal module |
| `proposal-review-integrity.ts` | 119 | `proposalMatchesReviewBinding(...)` | Used by `proposal-final-export.ts` |
| `proposal-review-service.ts` | 289 | Review workflow orchestration | — |
| `proposal-snapshot-evidence.ts` | 318 | Evidence linkage for snapshot claims | — |
| `proposal-snapshot-hydration.ts` | 509 | DB rows → snapshot | — |
| `proposal-snapshot-identity.ts` | 214 | Snapshot identity + canonical hashing | — |
| `proposal-snapshot-persistence.ts` | 872 | Snapshot storage, revisioning, invalidation | — |
| `proposal-status.ts` | 29 | Status enum + transitions | — |
| `proposal-studio.ts` | 323 | Studio-view assembly | — |
| `proposal-submit-client.ts` | 95 | Client submit helper | — |
| `proposal-workbook-plan.ts` | 1,145 | Deterministic XLSX plan (sheets/rows/cells) | Enforces row ceilings |
| `proposal-workbook-xlsx.ts` | 294 | Plan → XLSX via ExcelJS | Cells written as literal strings (no formula injection); `workbookContainsNoFormulas` guard; `wb.created = new Date(plan.generatedAt)` |

---

### 1.6 Templates — `src/lib/document-templates/**`

#### `contract-templates.ts` — 2,680 LOC
The contract catalog plus the binding engine. Exports `getContractTemplate(key)`, `bindContractTemplate(key, bindings, {mode})`, `computeCanonicalHash(value)`, and types `BoundContractDocument`, `BoundInlineNode`, `BoundRenderableValue`, `MoneyBindingValue`, `TemplateVariableDefinition`, `TemplateVariableType`, `BindingDiagnostic`, `ContractBindingResult`. Each template carries a `canonicalHash` and `versionId`; binding returns `READY` / `READY_WITH_DIAGNOSTICS` / `BLOCKED`. Variables are typed and direction-annotated; unfilled required variables become blocking diagnostics rather than empty strings.

#### `contract-template-renderer.ts` — 445 LOC
Template → bilingual AST adapter. Exports `compileContractTemplateDocument(templateKey, bindings, options)` (`:391`), `renderContractTemplateDocumentHTML(compilation, options)` (`:426`), `generateContractTemplateDocumentPdf(compilation, options)` (`:440`), `ContractTemplateRenderError`, types `CompileContractTemplateDocumentOptions`, `ContractTemplateDocumentCompilation`. Imported by `api/contracts/templates/[key]/preview/route.ts`.

**Handled.** Every artifact carries a mandatory DRAFT title, disclaimer, "UNREVIEWED — qualified Saudi counsel review is required" warning, and the pinned template version (`:270-331`) — a genuinely careful legal-safety design. Template identity is re-verified against the catalog hash at compile time (`:261-265`). Placeholders render as visible `[Required: …]` / `[Optional: …]` markers (`:204-226`) instead of blanks. Values route through `createBidiValue`, so escaping is the layout engine's job and is applied uniformly.

**Not handled.** `formatNumber` (`:107-116`) uses `Intl.NumberFormat("ar-SA")`, producing **Arabic-Indic digits with `٬`/`٫` separators for contract money amounts** (D4b). `maximumFractionDigits: 20` on IEEE-754 `number` money (`:112`) can surface float artifacts in a legal figure. `DATE`-typed variables get no formatting at all — `formatScalarValue` returns the raw string (`:166`) — so a template date renders exactly as stored, with no Gregorian/Hijri policy applied.

---

### 1.7 React document components — `src/components/documents/**` — **DEAD CODE**

| File | LOC |
|---|---|
| `document-components.tsx` | 673 |
| `bilingual/BilingualTable.tsx` | 164 |
| `bilingual/BilingualSection.tsx` | 105 |
| `bilingual/BilingualHeader.tsx` | 82 |
| `bilingual/BilingualList.tsx` | 63 |
| `bilingual/BilingualFooter.tsx` | 60 |
| `bilingual/types.ts` | 35 |
| `bilingual/index.ts` | 7 |
| **Total** | **1,189** |

`document-components.tsx` exports `DocumentContainer`, `DocumentSection`, `DocumentTable`, `StatCard`, `StatusBadge`, `InfoBox`, `Timeline`, `ProgressBar`, `BilingualText`, `PageBreak`, `SectionDivider`. The `bilingual/` barrel exports `BilingualSection`, `BilingualHeader`, `BilingualTable`, `BilingualList`, `BilingualFooter`, `LocalizedNode`.

**The only importer of anything in this tree is `src/lib/__tests__/bilingual-components.test.tsx`.** The shipping pipeline renders HTML strings via `bilingual-layout.tsx`, not React. `BilingualTable` is a genuinely good design — one semantic `<table>` with mirrored halves in a shared `<tr>` so Chromium keeps AR/EN rows at identical heights and repeats `<thead>` across breaks — but it is unreachable (D10). `document-components.tsx:547` also carries the same Hijri bug as `generators.ts` (`toLocaleDateString("ar-SA")` with no calendar override).

---

## 2. Architecture narrative

### 2.1 Structured proposal PDF — end to end

```
Prisma (Proposal, Project, Workspace, BrandProfile)
  → proposal-snapshot-hydration.ts      (rows → snapshot object)
  → proposal-snapshot-identity.ts       (canonical JSON + snapshotHash)
  → proposal-snapshot-persistence.ts    (immutable store + revision)
  → api/proposals/[id]/download/route.ts:628  documentExportGate.acquire(...)
  → proposal-layout-export.ts           exportProposalLayout(snapshot, {channel:"PDF", presetKey})
      → proposal-layouts.ts             preset → PairedSection[]
      → bilingual-layout.tsx            parseBilingualDocument()  ← validation gate
  → bilingual-pdf.ts:692                generateBilingualPdf()
      → brand-logo.ts                   inlineBrandLogoForPdf()  → data: URI
      → bilingual-typography.ts         font pair → base64 @font-face
      → pdf/print-ready.ts:489          generatePremiumPrintCss()
      → bilingual-layout.tsx            renderBilingualHTML({target:"print"})
      → pdf/html-to-pdf.ts:418          htmlToPdf(html, pdfOptions)
          :430  chromium.launch()                    ← fresh browser per request
          :432  newContext({javaScriptEnabled:false, serviceWorkers:"block"})
          :439  isolatePdfPageNetwork()              ← every request aborted
          :441  setContent(html, {waitUntil:"networkidle"})
          :445  waitForDocumentFonts()
          :452  waitForDocumentImages()              ← throws on any undecoded image
          :473  layout-sync.ts synchronizeBilingualLayoutPage()
          :476  waitForSelector("[data-bilingual-layout-ready]")
          :483  page.pdf({...})
      → bilingual-pdf.ts:741            isPdfBuffer() signature check
      → inspectBilingualHtml()          quality gate → BilingualPdfQualityError
  → route: NextResponse(Buffer, Content-Disposition: attachment)
  → download-artifact.ts (client)       blob → file save
```

Nothing is written to disk; the buffer goes straight to the HTTP response. There is no artifact cache — an identical request re-renders from scratch.

### 2.2 Legacy proposal PDF

`download/route.ts:683` → `generators.ts:244 generateProposalPDF` → `inlineBrandLogoForPdf` → `buildProposalHTML` (string concatenation, `escapeHtml` on every value, **plus a remote Google Fonts `<link>`**) → `markdown.ts markdownToHtml` for the body → `htmlToPdf` with `letterhead.ts` header/footer templates. Same Chromium boundary, but no AST validation, no font embedding, and no output quality gate.

### 2.3 Contracts

`download/route.ts:674` → `contract-export.ts generateBilingualContractPDF` → `contract-export-bilingual.ts` adapts stored contract Markdown (`contract-format.ts parseContractArticles` + `contract-artifacts.ts`) into `PairedSection[]`, with `partitionParagraphs` handling fragmentation → `bilingual-layout.tsx parseBilingualDocument` → `bilingual-pdf.ts generateBilingualPdf` with contract-specific margins. Template-originated contracts take a parallel route: `contract-templates.ts bindContractTemplate` → `contract-template-renderer.ts compileContractTemplateDocument` → the same `generateBilingualPdf`. Every template artifact is force-labelled DRAFT/UNREVIEWED.

`generateContractPackageZIP` (`contract-export.ts`) assembles Markdown + HTML + PDF + manifest into a JSZip archive, all in memory.

### 2.4 XLSX and PPTX

**Structured XLSX:** `proposal-workbook-plan.ts` builds a fully deterministic plan (sheet names, column widths, typed cells, row ceilings) → `proposal-workbook-xlsx.ts` serializes it with ExcelJS. Cells are written as literal strings, so a leading `=` can never become a formula, and `workbookContainsNoFormulas` asserts this.
**Legacy XLSX:** `generators.ts generateComplianceMatrixXLSX` / `generateBoQXLSX` build workbooks directly from proposal data.
**PPTX:** `proposal-layout-export.ts generateProposalPptx` (structured) and `generators.ts generateProposalPPTX` (legacy), both via pptxgenjs.
**Full package:** `structured-bid-package.ts generateStructuredBidPackageZIP` — PDF + PPTX + XLSX + compliance matrix + BoQ + validation report + export manifest.

### 2.5 Snapshot / versioning / integrity model

Three layers, of uneven quality.

**Contract render snapshot (strongest).** `createContractRenderSnapshot` captures every mutable input — proposal content, project, workspace, brand, artifacts, milestones, derived obligations with their current open/done state — validates it against a strict schema with cross-field identity refinement, enforces a 2MB budget, and computes `computeCanonicalHash`. On export, `validatePersistedContractRenderSnapshot` re-parses, re-checks the budget, verifies proposal identity, verifies the revision, and **recomputes the hash and compares** it. `capturedAt` is caller-supplied, so the hash is reproducible. Mutations invalidate atomically via `CONTRACT_RENDER_SNAPSHOT_INVALIDATION` (null the snapshot, null the hash, increment the revision).

**Proposal snapshot.** `proposal-snapshot-identity.ts` produces canonical JSON + `snapshotHash`; `proposal-layout-export.ts` adds a `planHash`. `proposal-final-export.ts hasCompleteBoundProposalApproval` binds the approval chain to an exact `(submissionHash, version, snapshotHash, snapshotRevision)` tuple that every reviewer must share — a well-designed guard against approving one version and shipping another.

**Export manifest (weakest).** `buildExportManifest` records artifact SHA-256 hashes (real and useful) alongside a proposal `contentHash` and `approvalStatus` that are **whatever the caller passes**. `structured-bid-package.ts` passes `status: "APPROVED"` unconditionally and `contentMd: ""`, so for structured packages the manifest's approval claim is fabricated and its content hash is the constant SHA-256 of the empty string. Combined with `generatedAt: new Date()` defaults, the manifest documents *that* files were produced, not *that they were approved* or *that they are reproducible*.

**What "integrity" actually guarantees today:** the bytes in the ZIP match their listed hashes, and a contract's render inputs match their stored canonical hash. It does **not** guarantee that re-running an export produces identical bytes (timestamps differ), nor that the approval status in the manifest reflects reality.

### 2.6 Template system

Catalog templates live in `contract-templates.ts`, each with a `key`, `versionId`, and `canonicalHash`. Variables are strongly typed (`STRING`, `NUMBER`, `PERCENT`, `MONEY`, `DATE`, `BOOLEAN`, `ENTITY`, `RICH_TEXT`, `LIST`) and annotated with a direction hint (`DIRECTION_NEUTRAL` marks identifiers that must not be bidi-reordered). Substitution is **not** string replacement: `bindContractTemplate` walks a structured clause tree and emits `BoundInlineNode`s of type `TEXT` / `PLACEHOLDER` / `VALUE`, each `VALUE` tagged with its language column. `contract-template-renderer.ts` then converts those into AST nodes, so no template value ever transits an HTML string. Missing required variables produce blocking diagnostics; optional ones render as visible bracketed markers. The renderer re-verifies the catalog hash before compiling, so a bound document cannot be rendered against a drifted template. Workspace-authored templates go through `contract-template-authoring.ts` (validation), `contract-template-persistence.ts` (CRUD + publish lifecycle), and `contract-versioning.ts` (diff/revert).

### 2.7 Bilingual / RTL strategy

**Fonts.** The structured path reads OTF/TTF from `node_modules` and inlines them as base64 `@font-face` data URLs — the only approach that works given the network block. The legacy path links Google Fonts, which cannot work (D1).

**Mirroring.** Not achieved with `direction: rtl` on a shared container. Instead each language column carries explicit `dir` and `lang`, values are wrapped in `<bdi>` with computed direction runs, and unsafe BIDI control characters are stripped from source text before rendering. `BilingualTable` (the dead React version) mirrors column order by reversing the Arabic half so both halves read outward from the centre gutter.

**Baseline sync.** This is the distinctive piece. `layout-sync.ts` measures every paired row in-page, computes per-row spacing distribution so the English and Arabic cells of a semantic pair end at the same vertical offset (bounded by `maxSpacingPerGap: 4` and `maxDynamicSpacingPerRow: 24`), then assigns rows to synthetic page containers of exactly `pageContentHeight` pixels with `breakAfter: page`. Pagination is therefore **computed, not delegated to Chromium's CSS fragmentation**.

**Page breaks.** Long text splits at semantic boundaries with localized continuation labels; lists and tables chunk row-by-row; headings honour `keepWithNext`. Images and charts are atomic and can overflow.

**Numerals and calendars.** Inconsistent across the codebase. `typography.ts:203` pins Gregorian for both locales. `document-visualizations.ts:517` pins numbering systems explicitly. But `generators.ts:214/218`, `contract-template-renderer.ts:107-116`, and `document-components.tsx:547` call `Intl` with `"ar-SA"` and no calendar/numbering override, which yields Arabic-Indic digits and — for dates — the Umm al-Qura Hijri calendar.

---

## 3. Cross-cutting observations

### Injection

**No exploitable sink found.** I traced every place HTML is built by concatenation.

The structured engine cannot be injected by construction: `bilingual-layout.tsx` accepts only a validated AST and escapes every string at render time; `isSafeHref` blocks `javascript:`, `data:`, and `file:` in links; `SafeImageSource` rejects `//`, backslashes, and `..`; `document-visualizations.ts` builds SVG programmatically with escaped text and hex-validated colours.

The legacy engine concatenates, but every interpolation is guarded:
- Text → `escapeHtml` (`generators.ts` throughout, `business-profile.ts:543-548`).
- Colours → `normalizeDocumentBrandColor`, `/^#[0-9A-Fa-f]{6}$/` (`brand-policy.ts:27`). This is what neutralizes the otherwise-dangerous `style="…color: ${brandColor}…"` patterns in `letterhead.ts` and `markdown.ts`.
- Fonts → `normalizeDocumentBrandFont` against a closed allow-list.
- Logos → `safeBrandLogoUrlForDocument` (`brand-policy.ts:157`), which permits only workspace-scoped `/api/files` paths or size-checked `data:image/(png|jpeg|webp);base64` URIs, and rejects `https://attacker.example/logo.png` (covered by `brand-logo.test.ts:53-59`).

**SSRF / local file read: closed.** `htmlToPdf` aborts *every* subresource request (`:268-270`) before content is installed, JavaScript is disabled (`:433`), service workers are blocked, and content arrives via `setContent` (base URL `about:blank`) rather than `goto`, so relative and `file://` references cannot resolve. Both PDF entry points additionally pre-inline logos into data URIs (`generators.ts:251`, `business-profile.ts:706`, `business-profile.ts:230-244`), which is the right belt-and-braces given the block.

**Residual risks, both latent rather than live:** `markdown.ts escapeHtml` omits `'` (D13), and the unused `document-layout.ts:438` interpolates an unvalidated `color` parameter into a `style` attribute.

### Playwright / serverless

- **Launch args.** Serverless uses `Sparticuz.args` with `setGraphicsMode = false` and a patched `LD_LIBRARY_PATH` (`:388-404`) — correct. Local uses `["--no-sandbox", "--disable-setuid-sandbox"]` (`:410`), disabling the Chromium sandbox (D15).
- **Isolation.** `javaScriptEnabled: false`, `serviceWorkers: "block"`, `acceptDownloads: false` (`:432-436`), plus a blanket route abort. Strong.
- **Cleanup.** Nested `try/finally` closes the context and then the browser on every path (`:505-510`). No leak on throw.
- **Reuse.** None. `launchBrowser()` runs per call (`:430`) — full Chromium cold start on every export (D11).
- **Resource limits.** `timeoutMs` 5s–120s (default 60s), `readinessTimeoutMs` 100ms–30s (default 5s). `maxDuration = 60` on the export routes. No memory cap and no page-count cap.
- **`page.evaluate` under `javaScriptEnabled: false`.** This is the one behaviour I could not confirm statically; see "Needs verification" NV1. Playwright's flag controls page-originated scripts, and `evaluate` is normally still honoured via CDP — but the entire bilingual pagination depends on it, so it deserves an explicit runtime test.

### Performance

- Chromium cold start per export (D11).
- Fonts re-read from disk and re-base64-encoded on every render — no cache (D11).
- No caching of deterministic renders: identical snapshot + preset re-renders end to end each time, even though the whole point of `snapshotHash`/`planHash` is that the output is a pure function of those inputs.
- `document-chunks.ts:47-50` runs embeddings serially — up to 40 sequential LLM round-trips plus 40 individual inserts on one request (D12).
- `searchWorkspaceChunks` pulls 400 rows and `JSON.parse`s 400 embedding vectors in-process per query.
- ZIP builders hold every artifact in memory simultaneously (D16).
- OCR (`tesseract.js`) and `sharp` are outside this scope but feed `document-chunks`; only `sharp` appears on a document-generation path, inside logo normalization, which is bounded at 8MiB.

### Correctness

- Two divergent default margin sets inside `html-to-pdf.ts` (D5).
- `layout-sync` warnings (`OVERSIZED_FRAGMENT`, `KEEP_WITH_NEXT_UNSATISFIABLE`) are never inspected by any caller (D6).
- Hijri dates leak into Arabic legacy exports (D4).
- Arabic-Indic digits with `٬`/`٫` separators for contract money (D4b), and `maximumFractionDigits: 20` on float money.
- Template `DATE` values receive no formatting at all.
- `generators.ts:171` declares `@page { margin: 18mm 14mm }` but `page.pdf()` overrides it with 20/18mm because `preferCSSPageSize` is false — HTML preview and PDF disagree on geometry.
- `truncateText` (`typography.ts:401`) slices by UTF-16 code unit, which can split a surrogate pair or an Arabic combining sequence.

### Determinism

Exports are **not** byte-reproducible, which undercuts the hash-based integrity story:
- `export-manifest.ts:93` — `new Date().toISOString()` default.
- `proposal-layout-export.ts:1223` — `generatedAt: new Date()`.
- `contract-export.ts:88`, `:128` — `new Date()`.
- `generators.ts:218` — `Date.now()` fallback; `:313`, `:407` — `wb.created = new Date()`; `:911` — `new Date().toISOString()` in the package README.
- `print-ready.ts:637` — `creationDate: new Date().toISOString()`.
- **No `Math.random()` anywhere in scope** — good.

Counter-examples done right: `contract-render-snapshot.ts` takes `capturedAt` as a parameter, and `capability-statement.ts` derives everything from the snapshot.

### Error handling

- `htmlToPdf`'s catch-all (`:511-521`) rewrites *any* unexpected error — including a `LayoutSyncError` or a DOM-mismatch throw from `applyBilingualLayoutInPage` — as "PDF generation failed (Playwright/Chromium unavailable) … Run `bun run setup:pdf`". Operators chase a browser-install problem that does not exist (D6).
- Routes map failures to `503 PDF_UNAVAILABLE` with the raw message echoed to the client (`business-profile/export/route.ts:290-296`, `:331-337`). Internal detail leaks, but nothing secret.
- Structured blocked exports return a clean `422` with typed diagnostics — good UX.
- **No partial-write risk:** everything is buffered and returned in one response; no file is written until the client saves it.

### Memory

- `generateBidPackageZIP`, `generateContractPackageZIP`, and `generateStructuredBidPackageZIP` each hold PDF + PPTX + 3× XLSX + HTML + JSON in memory, then JSZip builds the full archive as another buffer — roughly 2× peak (D16).
- Bounded elsewhere: contract render snapshot 2MB, embedded logo 8MiB, embedded capability image 8MiB, `maxRows: 6_000`, `MAX_CHUNKS_PER_DOC: 40`, workbook row ceiling, `documentExportGate` source-character limit.
- No streaming anywhere; no `Content-Length`-driven backpressure.

---

## 4. Gaps and defects

### D1 — Remote Google Fonts injected into a network-blocked renderer
**Critical · i18n-rtl / correctness · `src/lib/generators.ts:168-169`** (also `:613`, origin `src/lib/letterhead.ts:56-66`)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="${fontsHref}" rel="stylesheet">
```

`generators.ts:274` hands this HTML to `htmlToPdf`, and `html-to-pdf.ts:268-270` aborts **every** request:

```ts
await page.route("**/*", async (route) => { await route.abort("blockedbyclient"); });
```

The stylesheet never loads, so no `@font-face` for IBM Plex Sans Arabic is ever registered. `waitForDocumentFonts` still resolves (there are no pending font loads to wait for), so nothing fails — Chromium silently falls back. On `@sparticuz/chromium`, which ships a minimal font set, Arabic text has no covering family and renders as `.notdef` boxes. Arabic-language government tender submissions are the product's core deliverable.

This is not a judgement call: the codebase's own quality gate declares exactly this an error — `bilingual-pdf.ts:437-443` raises `REMOTE_FONT_REQUEST` for `/fonts\.(googleapis|gstatic)\.com/i` with the message "Remote font requests are not allowed in deterministic PDF output." That gate simply never runs on the legacy path.

**Fix.** Reuse the embedding helper the structured path already has: build the base64 `@font-face` block from `bilingual-typography.ts`'s font-pair resolver and inline it in `buildProposalHTML` / `generateSlidesHTML` instead of the `<link>`. Delete `letterhead.googleFontsHref` and `typography.getGoogleFontsUrl`, or restrict them to a `target: "screen"` code path. Then run `inspectBilingualHtml` (or at minimum its remote-font check) over legacy PDF HTML before rendering, so this cannot regress.

---

### D2 — Export manifest hardcodes `status: "APPROVED"`
**High · security / correctness (integrity) · `src/lib/structured-bid-package.ts:102`**

```ts
proposal: { id: opts.proposalId, version: opts.proposalVersion, status: "APPROVED", locale, contentMd: "", approvedAt: null },
```

`export-manifest.ts:107-111` then derives `approvalStatus: "APPROVED"` from it. Every structured bid package therefore ships an audit manifest asserting the proposal was approved — regardless of its actual `ProposalStatus`, and with `approvedAt: null` sitting right next to the claim. For a Saudi government tender submission this is a false attestation in the very artifact meant to establish provenance.

**Fix.** Thread the real proposal status and `approvedAt` through `StructuredBidPackageOptions` from the caller in `download/route.ts`, which already loaded the proposal. Better: have `buildExportManifest` reject `status: "APPROVED"` when `approvedAt` is null, so the inconsistency cannot be expressed.

---

### D3 — Manifest `contentHash` is the SHA-256 of the empty string
**High · correctness (integrity) · `src/lib/structured-bid-package.ts:104`**

```ts
contentMd: "",
```

`export-manifest.ts:112` computes `contentHash: sha256Hex(opts.proposal.contentMd ?? "")`, so every structured package publishes the constant `e3b0c442…b855` as its proposal content hash. The field looks like a tamper-evidence control and provides none.

**Fix.** Pass the structured snapshot's canonical JSON (or its existing `snapshotHash`) as the hashed content. If a structured proposal genuinely has no Markdown body, rename the manifest field to `snapshotHash` and populate it from `structuredSnapshot.canonicalJson` rather than emitting a meaningless constant.

---

### D4 — Arabic exports print Hijri (Umm al-Qura) dates
**High · i18n-rtl / correctness · `src/lib/generators.ts:218`** (also `:214`, and `src/components/documents/document-components.tsx:547`)

```ts
${new Date(proposal.generatedAt ?? proposal.updatedAt ?? Date.now()).toLocaleString(locale === "ar" ? "ar-SA" : "en-US")}
```

`ar-SA` resolves to `calendar: islamic-umalqura` and `numberingSystem: arab` under full-ICU Node. The Arabic proposal PDF therefore stamps a Hijri date in Arabic-Indic digits while the English PDF of the same document stamps a Gregorian date — the two language versions of one submission disagree on when it was produced. Etimad workflows are Gregorian-dated.

The codebase already knows the right answer: `typography.ts:197-226 formatDate` explicitly sets `calendar: "gregory"` for both locales. The legacy path just does not use it.

**Fix.** Replace every bare `toLocaleString`/`toLocaleDateString` in export code with `typography.formatDate` / `formatNumber`, which pin the calendar. If Hijri is ever wanted, render it as an explicit second value ("12 Rajab 1447 / 2026-01-01"), never as a silent substitution.

---

### D4b — Contract money amounts render in Arabic-Indic digits
**Medium · i18n-rtl / correctness · `src/lib/document-templates/contract-template-renderer.ts:107-116`**

```ts
const formatted = new Intl.NumberFormat(language === "ar" ? "ar-SA" : "en-US",
  { useGrouping: true, maximumFractionDigits: 20 }).format(value);
```

`Intl.NumberFormat("ar-SA")` emits `١٬٥٠٠٬٠٠٠٫٥٠` — Arabic-Indic digits with `U+066C` group and `U+066B` decimal separators. Applied at `:148` to `MONEY` values, so a contract clause states its consideration in a numeral system that Saudi commercial and banking documents conventionally write in Western digits, and the AR and EN columns of the same clause show visually different figures. Separately, `maximumFractionDigits: 20` over an IEEE-754 `number` can expose float representation artifacts in a legal amount.

**Fix.** Force `numberingSystem: "latn"` for money and identifiers (keep Arabic-Indic, if wanted, only for prose counts), and cap `maximumFractionDigits` at the currency's minor-unit count. Longer term, carry money as integer minor units or a decimal string rather than `number`.

---

### D5 — Two different default margin sets inside one module
**Medium · correctness · `src/lib/pdf/html-to-pdf.ts:124` vs `:493-498`**

```ts
// :124 — used to compute the layout engine's page box
const margin = options.margin ?? pdfMarginSchema.parse({});   // 18/18/14/14 mm

// :493 — used for the actual print
margin: options.margin ?? { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" },
```

When a caller omits `margin` (it is `.optional()` at `:39` with no object-level default), the layout engine paginates against a 261×182mm box while Chromium prints into 257×174mm — 4mm of vertical and 8mm of horizontal overflow on every page. Because `layout-sync.ts:1382` hard-sets each synthetic page to `blockSize: ${pageContentHeight}px` with `breakAfter: page`, that surplus does not reflow; it spills or clips.

This is latent rather than live only because `bilingual-pdf.ts:717-722` always passes explicit margins. It is live in a milder form for `generators.ts:274` and `business-profile.ts:721`, which omit `margin` and so silently get 20/18mm instead of the 18/14mm their own `@page` CSS declares. `layout-sync.ts:914/919` documents yet a third assumption (14/14mm and 16/18mm).

**Fix.** Give `margin` an object-level default in the schema (`pdfMarginSchema.default({})` or an explicit `PRINT_READY.margins.premium`) and delete the inline fallback at `:493` so `page.pdf()` and `resolvePdfContentDimensions` provably read the same value. Derive `DEFAULT_BILINGUAL_RENDER_SYNC_OPTIONS` from that same constant instead of restating millimetres.

---

### D6 — Pagination overflow warnings are computed and then discarded
**Medium · reliability · `src/lib/layout-sync.ts:774-780` + `src/lib/bilingual-pdf.ts` (no reader)**

```ts
warnings.push({ code: "OVERSIZED_FRAGMENT", alignmentKey: row.alignmentKey,
                fragmentIndex: row.fragmentIndex, rowHeight: row.rowHeight,
                pageContentHeight: options.pageContentHeight });
```

`synchronizeLayout` correctly detects a fragment taller than the page and a `keepWithNext` pair that cannot fit (`:755-762`). But grepping `bilingual-pdf.ts` for `warnings` returns nothing — no caller reads `LayoutSyncResult.warnings`. Since images and charts are never fragmented, an oversized figure produces a clipped page in a delivered tender document with no signal anywhere. `inspectBilingualHtml` runs on the HTML and cannot see this.

Compounding it, `html-to-pdf.ts:511-521` converts any error that *is* thrown from the sync layer into "PDF generation failed (Playwright/Chromium unavailable) … Run `bun run setup:pdf`", pointing operators at a nonexistent browser-install problem.

**Fix.** Return `warnings` from `generateBilingualPdf` on the artifact and promote `OVERSIZED_FRAGMENT` to a `BilingualPdfQualityIssue` so the export gate can block or the UI can flag it. Separately, re-throw `LayoutSyncError` unchanged in the `htmlToPdf` catch (`instanceof` check alongside `PdfGenerationError`) instead of relabelling it.

---

### D7 — Export admission control covers only three of the render entry points
**Medium · reliability / performance · `src/lib/document-export-guard.ts:298`**

`documentExportGate` is acquired in exactly three places: `api/proposals/[id]/download/route.ts:628`, `api/business-profile/export/route.ts:114`, and `api/contracts/templates/[key]/preview/route.ts:84`. Within the download route it is acquired only for `pdf`, `zip`, and `pptx` (`:615`) — `html`, `xlsx`, `xlsx-matrix`, `xlsx-boq`, and `slides` bypass it, and `xlsx` still runs the full `exportProposalLayout` pipeline. Any other current or future caller of `htmlToPdf` launches an unbounded Chromium with no rate limit.

**Fix.** Move admission into `htmlToPdf` itself (or a thin wrapper every path must use) so the concurrency ceiling is enforced at the resource, not at each route. Extend coverage to the XLSX and HTML formats, which are also CPU-bound over the same snapshots.

---

### D8 — Timestamps make exports non-reproducible, defeating the hash claims
**Medium · correctness (determinism) · `src/lib/export-manifest.ts:93`, `src/lib/proposal-layout-export.ts:1223`, `src/lib/contract-export.ts:88` and `:128`, `src/lib/generators.ts:218`/`:313`/`:407`/`:911`, `src/lib/pdf/print-ready.ts:637`**

```ts
// export-manifest.ts:93
: new Date().toISOString(),
```

Re-exporting the same approved snapshot yields different bytes and therefore different artifact hashes. The manifest advertises SHA-256 per artifact, but those hashes cannot be independently reproduced by a reviewer, which is the usual reason to publish them. `wb.created = new Date()` also lands inside the XLSX ZIP metadata.

**Fix.** Follow the pattern `contract-render-snapshot.ts:230` already uses — require `capturedAt`/`generatedAt` as a parameter rather than defaulting to the clock. Derive it from the snapshot's `createdAt` so a given snapshot always exports identically, and set `wb.created`/`wb.modified` from the same value.

---

### D9 — Bleed and crop marks are non-functional CSS
**Medium · missing-feature · `src/lib/pdf/print-ready.ts:416-424`, `:459-460`**

```css
@page { bleed: ${bleed}; marks: ${showMarks ? "crop cross" : "none"}; }
@page :bleed { ... }
```

`bleed`, `marks`, and the `:bleed` page selector are CSS Paged Media Level 3 features that Chromium does not implement, and `htmlToPdf` never passes any bleed value to `page.pdf()` (the `bleedSize` and `displayCropMarks` options at `html-to-pdf.ts:56-57` are parsed and then unused). The `PRINT_READY` API and its documentation promise print-production output that the pipeline cannot produce, so a document sent to a commercial printer arrives with no bleed area and no crop marks. The `@page` blocks additionally hardcode A4 regardless of the requested `format`.

**Fix.** Either drop the bleed/marks surface and document that output is trim-size only, or implement it properly: request a page `width`/`height` enlarged by 2× bleed in `page.pdf()`, draw registration marks as real positioned elements in the safety zone, and derive the page size from `options.format` rather than hardcoding A4.

---

### D10 — ~1,850 LOC of dead, divergent document-rendering code
**Medium · maintainability · `src/lib/document-layout.ts` (662 LOC), `src/components/documents/**` (1,189 LOC)**

Neither has a non-test importer. `rg "document-layout" src/` returns only `src/lib/__tests__/document-layout.test.ts:26`; the only importer of `@/components/documents/bilingual` is `src/lib/__tests__/bilingual-components.test.tsx:9`. Both trees implement a *second*, incompatible answer to the same problem the live engine solves — different margin defaults (`DEFAULT_MARGINS = 18/14mm`), a different escaping helper, a different bilingual table strategy — and both are covered by passing tests, so the suite reports health for code that ships to nobody. `document-layout.ts:438` also contains the subsystem's only unguarded colour interpolation into a `style` attribute, kept harmless purely by being unreachable.

Worth noting: `BilingualTable.tsx` is a better answer to AR/EN row-height sync than the measured-JS approach, since a shared `<tr>` gives identical heights for free and lets Chromium repeat `<thead>` natively.

**Fix.** Delete both trees along with their tests, or wire `BilingualTable`'s shared-row technique into the live renderer and delete the rest. Leaving them raises the cost of every future change and misleads anyone reading for the real pipeline.

---

### D11 — Chromium cold start and font re-encoding on every single export
**Medium · performance · `src/lib/pdf/html-to-pdf.ts:430`**

```ts
const browser = await launchBrowser();
```

Every PDF request launches, uses, and closes a full Chromium. On Vercel Fluid Compute, instances are reused across requests, so a module-level singleton with idle-timeout teardown would eliminate most of that cost. `bilingual-pdf.ts` additionally re-reads the font files from `node_modules` and re-base64-encodes them per render. And because renders are pure functions of `snapshotHash` + `planHash` + preset, identical exports are recomputed from scratch every time with no cache.

**Fix.** Hold a lazily-created browser in module scope, guarded by the export gate's concurrency limit, with a `finally` that closes the *context* (not the browser) and an idle timer that closes the browser. Memoize the base64 font blocks at module load. Cache rendered artifacts keyed by `${snapshotHash}:${planHash}:${presetKey}:${channel}` in blob storage.

---

### D12 — Non-transactional, fully serial document indexing
**Medium · performance / reliability · `src/lib/document-chunks.ts:44-50`**

```ts
await db.documentChunk.deleteMany({ where: { documentId: opts.documentId } });
...
for (let i = 0; i < parts.length; i++) {
  const embedding = await embedText(`${opts.title}\n${content}`);
  await db.documentChunk.create({ ... });
}
```

Up to 40 sequential embedding round-trips plus 40 individual inserts on one request path. If the process dies or a provider call fails at chunk 20, the `deleteMany` has already committed and the document is left with 19 chunks and no error state — silently degraded RAG for the tender it was supposed to index. Related: `MAX_CHUNKS_PER_DOC = 40` (`:11`) at ~900 chars caps indexing at roughly 31KB, so anything past the first few pages of a large tender document is dropped without warning.

**Fix.** Batch the embeddings (`embedTexts(parts)`) or bound the concurrency at 4–8, write with `createMany`, and wrap delete+insert in a single transaction so indexing is atomic. Move it off the request path into a queue. Surface truncation as a visible document-level warning rather than silently discarding content.

---

### D13 — `escapeHtml` does not escape single quotes
**Low · security (latent) · `src/lib/markdown.ts` (`escapeHtml`)**

The function escapes `&`, `<`, `>`, `"` but not `'`. No current caller places its output in a single-quoted attribute, so nothing is exploitable today — but the function is exported and reused by `generators.ts`, `business-profile.ts`, `account-verification-email.ts`, and `invitation-email.ts`, and the first single-quoted attribute anyone adds turns it into an injection point. `bilingual-typography.escapeHtmlText` already does this correctly, as does `document-layout.ts:608-615`.

**Fix.** Add `.replace(/'/g, "&#39;")`. One line, no behavioural downside.

---

### D14 — No-op ternary hides an unmade calendar decision
**Low · maintainability · `src/lib/typography.ts:203`**

```ts
const calendar = locale === "ar" ? "gregory" : "gregory"; // Use Gregorian for both
```

The behaviour is right, but written as an unresolved branch. Given D4 shows the rest of the codebase disagreeing about calendars, this should be an explicit, named, documented constant rather than a ternary that reads like a placeholder.

**Fix.** `const DOCUMENT_CALENDAR = "gregory" as const;` with a comment recording *why* (Etimad and Saudi commercial registration dates are Gregorian), and reuse it wherever `Intl.DateTimeFormat` is constructed.

---

### D15 — Chromium sandbox disabled on the local/self-hosted path
**Low · security · `src/lib/pdf/html-to-pdf.ts:410`**

```ts
return chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
```

This is the non-serverless branch, so it covers local development and any self-hosted or containerized deployment. Risk is materially reduced by `javaScriptEnabled: false` and the total network block — a renderer exploit would need to come through a Chromium parsing bug on HTML/CSS/fonts rather than script — but the sandbox is the defence-in-depth layer specifically designed for the case where those assumptions fail, and the process has database credentials in its environment.

**Fix.** Drop the flags by default and re-enable them only behind an explicit `PLAYWRIGHT_DISABLE_SANDBOX=1` opt-in for CI containers that genuinely cannot provide user namespaces. In Docker, prefer `--cap-add=SYS_ADMIN` or a seccomp profile over disabling the sandbox.

---

### D16 — Full document packages assembled entirely in memory
**Low · performance / reliability · `src/lib/structured-bid-package.ts:119`, `src/lib/generators.ts` (`generateBidPackageZIP`), `src/lib/contract-export.ts` (`generateContractPackageZIP`)**

```ts
return zip.generateAsync({ type: "nodebuffer" });
```

PDF + PPTX + three XLSX + HTML + JSON are all held as buffers, then JSZip materializes the complete archive as another buffer — roughly 2× peak — and the route holds that while constructing the response. There is no size ceiling on the package as a whole, unlike the per-input limits elsewhere. On a memory-constrained function this is the most likely OOM path in the subsystem. `structured-bid-package.ts:119` also omits the compression options used by the other ZIP builders.

**Fix.** Use JSZip's `generateNodeStream` (or switch to `archiver`) and pipe into the response so only one artifact is resident at a time. Add a cumulative byte budget checked as each artifact is added, failing with a typed error rather than an OOM. Set consistent `compression: "DEFLATE"` across all three builders.

---

## 5. Needs verification

These are unresolved by static reading and need a runtime check before being treated as findings.

**NV1 — Does `page.evaluate` execute when `javaScriptEnabled: false`?**
`html-to-pdf.ts:433` disables JS; `:445`, `:452`, and `:473` all depend on `page.evaluate` (font readiness, image decode, and the entire bilingual pagination). Playwright's flag is documented as affecting page-originated scripts while `evaluate` goes through CDP, so this most likely works — but if it does not, `synchronizeBilingualLayoutPage` is a no-op and every bilingual PDF is silently unpaginated. Test: render a two-page bilingual fixture and assert `data-bilingual-sync-page` attributes exist in the rendered DOM.

**NV2 — Which Arabic fonts does `@sparticuz/chromium` actually provide?**
D1's *severity* depends on this. If the bundled font set covers Arabic, the legacy path degrades to wrong-typeface rather than tofu. Test: render an Arabic string on the deployed Lambda with no `@font-face` and inspect the output glyphs.

**NV3 — Does `preferCSSPageSize: false` fully override `@page` margins?**
Assumed in D5's secondary claim about `generators.ts:171`. Confirm by rendering with mismatched CSS and `page.pdf()` margins and measuring the result.

**NV4 — Sheet-name validity in `proposal-workbook-xlsx.ts`.**
`workbook.addWorksheet(sheet.name)` passes plan-supplied names straight to ExcelJS, which rejects names over 31 characters, containing `[]:*?/\`, or duplicated. I did not confirm whether `proposal-workbook-plan.ts` enforces those constraints; if it does not, a long section title becomes an unhandled throw mid-export.

**NV5 — `chunkText` with caller-supplied `size <= overlap`.**
`document-chunks.ts` advances via `start = end - overlap`. With the exported function's parameters set so `size <= overlap`, `start` does not advance. `MAX_CHUNKS_PER_DOC` bounds the loop at 40 iterations so it cannot hang, but the output would be 40 copies of the same slice. No current caller does this; worth an argument guard.

**NV6 — Are `layout-sync` warnings surfaced anywhere outside `bilingual-pdf.ts`?**
I grepped only that module. Confirm no route or UI layer reads them before finalizing D6's "never inspected" claim.
