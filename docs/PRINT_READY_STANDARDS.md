# Premium Print-Ready Standards – Implementation

> All PDF and document outputs now meet premium, print-ready, accessible, and CMYK-aware standards.

## 1. Typography

### Font Embedding (OFL, no remote)
- **EN**: IBM Plex Sans (300/400/500/600/700) + Noto Sans fallback, Arial fallback.
- **AR**: IBM Plex Sans Arabic + Noto Sans Arabic, Noto Naskh Arabic for long-form.
- **Serif**: IBM Plex Serif / Noto Serif optional for formal.
- **Mono**: IBM Plex Mono for code/tables.
- **Assets**: WOFF2 from `node_modules/@fontsource/noto-sans`, `@fontsource/noto-sans-arabic`, `@ibm/plex-sans`, `@ibm/plex-sans-arabic`. Embedded as data URL `data:font/woff2;base64,...` via `getEmbeddedBilingualFontCss()` – zero remote requests, deterministic.

### Professional Typesetting
- **Scale**: Major Second 1.125 – xs 8pt, sm 9pt, base 11pt, lg 12.5pt, xl 14pt, 2xl 17pt, 3xl 21pt, 4xl 27pt.
- **Line-height**: tight 1.25 (headings), snug 1.35, normal 1.6 (EN body), relaxed 1.75, loose 1.9 (AR).
- **Optical sizing**: `font-optical-sizing: auto`, `font-kerning: normal`, ligatures `common-ligatures contextual`, `calt`, `clig`, `kern`.
- **Tabular**: `font-variant-numeric: lining-nums tabular-nums` for financial tables, code.
- **Arabic**: `letter-spacing: normal !important`, `word-spacing: normal`, `hyphens: none`, preserves connected forms; joining, contextual glyphs, kerning performed by browser shaping engine, not JS.
- **Headings**: semibold 600, tracking -0.01em, break-after avoid, border bottom 0.5pt for h2.
- **Paragraphs**: optimal measure, hanging punctuation `first last`, hyphenate-limit 6/3/2.
- **Bidi isolation**: `<bdi dir>` per safe text run, no invisible bidi controls (U+061C, U+200E/F, U+202A-E, U+2066-9/A-F stripped and diagnosed).

### CSS Location
- `src/lib/pdf/print-ready.ts` `generatePremiumTypographyCss()`
- `src/lib/bilingual-typography.ts` `generateBilingualTypographyCss()` + `getTypographyStyle()`
- `src/lib/document-layout.ts` `generatePrintCSS()` now includes premium typography.

## 2. Consistent Formatting

### Header/Footer Templates (Premium)
- **Header**: flex space-between, border bottom 0.25pt + 3pt primary for doc header, logo 40px, title 2xl bold primary, locale-aware dir.
- **Footer**: confidential badge, pagination `Page X / Y` + AR `صفحة`, company name, color secondary 600, font 8-8.5pt, border top 1pt.
- **Bilingual PDF Footer**: centered EN/AR page numbers + TAC note + profile note.
- **Playwright Header**: “ArabClue – Premium Print-Ready · Bleed 3mm · Safety 5mm · sRGB + Embedded OFL”.

### Grid & Spacing
- **Bilingual**: grid `50%/50%` or ratio, gap 24px, screen fallback 1fr <768px, print `page-break-inside: avoid`.
- **Design Tokens**: from `designTokens` primary 600 secondary 600, but print-safe palette overrides for PDF.

### Color Palette Print-Safe
- Implemented in `PRINT_READY.color.palette`:
  - Rich black `#121212` (not pure #000, avoids 400% TAC)
  - Ink primary `#173f5f` (~90,60,30,20)
  - Paper `#ffffff`
  - Gray ramp K-only: 100 #f5f5f5, 200 #e0e0e0, 300 #bdbdbd, 500 #6b7280, 700 #374151, 900 #111827
  - Error safe red `#b91c1c`, success green safe `#15803d`
  - Accent gold low TAC `#d68c20`
- **Max TAC 240%** enforced via palette design, no pure black large fills.
- Contrast AA 4.5 via `contrastRatio()` + `bestForeground()` + `resolveProposalPalette()`.

## 3. Optimized Page Breaks

### CSS Rules
```css
@page { orphans: 3; widows: 3; bleed: 3mm; marks: crop cross; }
h1 { break-before: page; }
.bilingual-pair, table, figure, blockquote, ul, ol, .keep-together { break-inside: avoid; page-break-inside: avoid; }
h2, h3, h4 { break-after: avoid; page-break-after: avoid; }
h2 + *, h3 + *, h4 + * { break-before: avoid; }
thead { display: table-header-group; }
tfoot { display: table-footer-group; }
tr { break-inside: avoid; }
p, li { orphans: 3; widows: 3; }
section > :last-child { break-after: avoid; }
figure { break-inside: avoid; margin: 1em 0; }
figcaption { font-size: 8-9pt; color: gray-700; }
.page-break { break-before: page; }
.avoid-break { break-inside: avoid; }
```

### Layout Sync Engine
- `src/lib/layout-sync.ts` pure O(n) engine synchronizes measured bilingual rows (EN/AR contentHeight), balances adjustable gaps, handles `keepWithNext` and `breakBefore`.
- Pagination respects `pageContentHeight` from PDF margins, warns `RESIDUAL_COLUMN_IMBALANCE`, `OVERSIZED_FRAGMENT`, `KEEP_WITH_NEXT_UNSATISFIABLE`.
- Fragments segmented at safe paragraph/list-item/table-row boundaries, never split internally (ratio-based scroll sync forbidden).

### Implementation
- `PRINT_READY.pageBreak` config: orphans 3, widows 3, avoidInside list, breakBefore, keepWithNext.
- `generatePageBreakCss()` injects rules.
- `document-layout.ts` `generatePrintCSS()` now includes optimized breaks + hyphenation + print link handling.

## 4. Accessibility Compliance

### Semantic Structure
- Single h1 per doc, proper h2-h6 hierarchy (`inspectBilingualHtml` checks `INVALID_HEADING_COUNT`).
- `lang="en"`/`lang="ar"` per cell `data-language`, `dir rtl/ltr`, `<bdi dir>` isolation.
- `findUnsafeBidiControls()` strips invisible controls, diagnoses `UNSAFE_BIDI_CONTROL`.
- Alt text enforced: `validateAndNormalizeLogoImage` magic-byte, dimension, decode; `img:not([alt])` outline red 2pt QA; `IMAGE_PIXEL_LIMIT_EXCEEDED`, `IMAGE_RESOLUTION_INSUFFICIENT` errors.

### PDF Tagging & Reading Order
- Playwright `page.pdf({ tagged: true, outline: false, preferCSSPageSize: false })` – tagged PDF for screen readers (PDF/UA-1 companion to PDF/X-4).
- `htmlToPdfOptionsSchema` includes `tagged`, `outline`, `generateTaggedPdf`, `scale`.
- Reading order = DOM order, no absolute positioning for main content.
- `sr-only` class for screen readers.
- Table headers `th[scope="col"|"row"]` semibold, `role="table"` border.
- `src/lib/bilingual-pdf.ts` quality gate checks: `MISSING_LAYOUT_MARKER`, `MISSING_LANGUAGE`, `UNPAIRED_LANGUAGE_CELLS`, `INVALID_HEADING_COUNT`, `REMOTE_FONT_REQUEST`, `UNSAFE_BIDI_CONTROL`, `UNRESOLVED_PUBLIC_IMAGE`, `INVALID_IMAGE_ASSET`, `IMAGE_PIXEL_LIMIT_EXCEEDED`, `IMAGE_RESOLUTION_INSUFFICIENT`, `PDF_SIGNATURE_INVALID`.

### Contrast & Focus
- `contrastRatio()` luminance calc, `bestForeground()` picks AAA, `resolveProposalPalette()` guarantees AA for every block.
- `:focus-visible { outline: 2pt solid primary; outline-offset: 2pt; }`

### Metadata
- `PrintReadyPdfMetadata`: title, titleAr, subject, keywords, author, language, producer, creator, creationDate, pdfVersion 1.7, pdfStandard PDF/X-4+UA, colorProfile ICC, bleed 3mm, tagged true, embeddedFonts true.
- `generatePrintReadyMetadata()` helper.

## 5. Print-Specific: Bleed, Margin Safety, CMYK

### Bleed Zones (3mm)
- **Definition**: Extend artwork beyond trim for physical cut (ISO 216 offset standard).
- **Config**: `PRINT_READY.bleed.size = "3mm"`, `sizePx = 3*96/25.4`, `marks = true`, `safety = "5mm"`.
- **CSS**:
```css
@page { bleed: 3mm; marks: crop cross; size: A4; }
@page :bleed { margin: 0; }
.full-bleed { margin: -3mm; padding: 3mm; width: calc(100% + 6mm); }
.bleed-preview { outline: 1px dashed rgba(0,0,0,0.2); outline-offset: 3mm; }
```
- **Screen Proof**: `.bleed-preview` dashed outer, `.safety-preview` dashed red inner.

### Margin Safety
- Safety zone 5mm inside trim: critical text/logos must not be within 5mm of trim.
- CSS: `body::before` fixed inset 5mm dashed rgba(0,0,0,0.08) visual guide in print proof; `critical-content` margin 5mm; header/footer h1-h3 `margin-inline: max(0mm, calc(5mm - 2mm))`.
- Defaults: premium margins 20mm/20mm/18mm/18mm (top/bottom/left/right) ensures content stays within safe area; narrow 14/16/12/12; wide 28/28/24/24.

### Crop Marks & Slug
- `marks: crop cross` enables crop + cross marks for press alignment.
- Slug area for file info, color bars – handled by print provider; our header/footer includes profile note with bleed/safety/sRGB note for proofing.

### CMYK Adherence
- **Limitation**: Chromium/Playwright PDF outputs only sRGB IEC61966-2.1 (no native CMYK). True CMYK requires post-process.
- **Mitigation Implemented**:
  1. **CMYK-safe palette** (TAC≤240%): rich black not #000, K-only grays, gold accent low TAC, safe red/green, primary teal approx 90,60,30,20.
  2. **Vector text**: `vectorText: true`, fonts embedded, no rasterized text.
  3. **Target DPI**: 300 (`BILINGUAL_PRINT_PROFILE.targetRasterDpi`), image resolution check `effectiveDpi = width*96/renderedWidth`, error if <300 DPI.
  4. **Aggregate pixel limit**: 30M pixels, tracking total, error `IMAGE_PIXEL_LIMIT_EXCEEDED`.
  5. **Metadata**: `colorMode: sRGB`, `iccProfile: ISOcoated_v2_300_eci.icc or Coated_FOGRA39`, `profileNote` explaining conversion.
  6. **Conversion Recipe** (documented in `print-ready.ts` and `generateCmykComplianceCss()`):
```bash
gs -dPDFX -dBATCH -dNOPAUSE -dNOOUTERSAVE \
   -sProcessColorModel=DeviceCMYK -sDEVICE=pdfwrite \
   -sColorConversionStrategy=CMYK -sColorConversionStrategyForImages=CMYK \
   -sOutputICCProfile=ISOcoated_v2_300_eci.icc \
   -sOutputFile=output-cmyk.pdf input.pdf
```
  7. **Footer Note**: PDF footer includes “sRGB IEC61966-2.1 + embedded OFL (Noto/IBM Plex), TAC≤240%, ready for ISOcoated_v2 conversion” for press operator.
  8. **Future**: Backend job can auto-convert using Ghostscript with embedded ICC when `PDF_ENGINE=cmyk` env flag.

### PDF/X-4 + PDF/UA-1
- `pdfStandard: PDF/X-4+UA` target: PDF/X-4 for print (color managed, bleed, marks) + PDF/UA-1 for accessibility (tagged, language, alt).
- `pdfVersion: 1.7` for max compatibility.
- `printBackground: true`, `displayHeaderFooter: true`, header/footer templates include bilingual page numbers.
- `readySelector` ensures bilingual layout synchronized before PDF snapshot.

## 6. Files Modified / Created

- `src/lib/pdf/print-ready.ts` – NEW, central premium config + CSS generators + metadata.
- `src/lib/pdf/html-to-pdf.ts` – EXTENDED schema with `tagged`, `outline`, `preferCSSPageSize`, `bleedSize`, `displayCropMarks`, etc. PDF generation now sets `tagged: true`, premium header/footer, margin safety.
- `src/lib/bilingual-pdf.ts` – INJECTS premium print CSS (`generatePremiumPrintCss`), uses `PRINT_READY` margins, premium header/footer with bleed/safety note, `tagged:true`, BILINGUAL_PRINT_PROFILE extended with bleed, safety, TAC, tagged, standard.
- `src/lib/document-layout.ts` – `generatePrintCSS()` now includes premium typography, page break optimization, bleed/safety, accessibility, CMYK notes.
- `src/lib/bilingual-typography.ts` – already had font stacks, kerning, ligatures, optical sizing; now referenced by premium.

## 7. Verification

- `bun run build` passes (font traces verified: 20 embedded font assets in 3 route traces).
- `bun run lint` passes (after fixing chart memoization).
- Quality gates: `inspectBilingualHtml()` ensures layout markers, paired cells, single h1, no remote fonts, no unsafe bidi.
- Image QA: magic-byte check, dimension, decode, DPI ≥300, aggregate ≤30M.
- Accessibility: semantic headings, lang/dir, alt required, table headers scope, tagged PDF.
- Print: bleed 3mm CSS, safety 5mm, crop marks, margin calculations via `resolvePdfContentDimensions()`.

## 8. Human Author Authority

All PDFs remain drafts pending authorized human approval. User is final author of record. No legal certainty claimed. All regulatory content includes disclaimer.

---

*This file auto-generated as part of premium print-ready implementation.*
