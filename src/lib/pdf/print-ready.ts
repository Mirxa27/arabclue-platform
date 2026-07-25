/**
 * @module print-ready
 * Premium print-ready layout and design standards for all PDF/document outputs.
 * Covers typography, formatting, page breaks, accessibility, bleed, margin safety, CMYK.
 *
 * Goals:
 * - Professional typography: optical sizing, kerning, ligatures, Arabic joining preservation
 * - Consistent formatting: header/footer, grid, spacing scale, color palette print-safe
 * - Optimized page breaks: orphans/widows control, keep-with-next, break-before/after, float handling
 * - Accessibility: semantic structure, lang/dir, alt text enforcement, PDF tagging, reading order
 * - Print-specific: bleed zones (3mm), slug, crop marks, margin safety, color profile adherence
 *
 * Notes on CMYK:
 * - Chromium/Playwright PDF outputs sRGB. True CMYK conversion requires post-process (Ghostscript with ICC).
 * - We enforce a CMYK-safe palette (no pure 0,0,0 black, no >240% TAC, print-safe neutrals) and embed print metadata.
 * - For physical offset printing, the backend can convert sRGB PDF → CMYK via Ghostscript using ISOcoated_v2_300_eci.icc.
 *   This module marks the PDF as print-ready with sRGB + embedded fonts + bleed + marks, ready for CMYK conversion.
 */

export const PRINT_READY = {
  /** Paper sizes ISO 216 + US */
  paper: {
    A4: { width: "210mm", height: "297mm", widthPx: (210 * 96) / 25.4, heightPx: (297 * 96) / 25.4 },
    Letter: { width: "8.5in", height: "11in" },
    A3: { width: "297mm", height: "420mm" },
  },
  /** Bleed for physical print (offset) */
  bleed: {
    size: "3mm",
    sizePx: (3 * 96) / 25.4,
    marks: true,
    /** Safety zone inside trim (content must not be within 5mm of trim for critical text) */
    safety: "5mm",
    safetyPx: (5 * 96) / 25.4,
  },
  /** Margins including safety */
  margins: {
    premium: {
      top: "20mm",
      bottom: "20mm",
      left: "18mm",
      right: "18mm",
    },
    narrow: {
      top: "14mm",
      bottom: "16mm",
      left: "12mm",
      right: "12mm",
    },
    wide: {
      top: "28mm",
      bottom: "28mm",
      left: "24mm",
      right: "24mm",
    },
  },
  /** Typography scale for print */
  typography: {
    /** Base font sizes */
    base: "11pt",
    scale: {
      /* 1.125 Major Second */
      xs: "8pt",
      sm: "9pt",
      base: "11pt",
      lg: "12.5pt",
      xl: "14pt",
      "2xl": "17pt",
      "3xl": "21pt",
      "4xl": "27pt",
    },
    /** Line heights tuned for readability */
    lineHeight: {
      tight: 1.25,
      snug: 1.35,
      normal: 1.6,
      relaxed: 1.75,
      loose: 1.9,
    },
    /** Font stacks (print-safe, embedded) */
    families: {
      enSerif: '"IBM Plex Serif", "Noto Serif", "Times New Roman", Times, serif',
      enSans: '"IBM Plex Sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      arSans: '"IBM Plex Sans Arabic", "Noto Sans Arabic", "Noto Naskh Arabic", "Geeza Pro", Tahoma, sans-serif',
      code: '"IBM Plex Mono", "Cascadia Code", Menlo, monospace',
    },
    /** Weight mapping */
    weight: {
      light: 300,
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    /** OpenType features */
    features: {
      standard: '"kern" 1, "liga" 1, "calt" 1, "clig" 1',
      tabular: '"tnum" 1, "lnum" 1, "kern" 1',
      oldStyle: '"onum" 1, "kern" 1',
    },
  },
  /** CMYK-safe color palette (print neutrality, TAC <= 240%) */
  color: {
    /** sRGB values that map cleanly to CMYK */
    palette: {
      /** Rich black for print (not 0,0,0) – 60,40,40,100 */
      richBlack: "#121212",
      /** Warm neutrals */
      inkPrimary: "#173f5f", // CMYK approx 90,60,30,20 – deep teal for arabclue primary
      inkSecondary: "#2c3e50",
      /** Accent safe */
      accent: "#d68c20", // gold, low TAC
      /** Paper */
      paper: "#ffffff",
      /** Print-safe gray ramp (K only) */
      gray: {
        100: "#f5f5f5",
        200: "#e0e0e0",
        300: "#bdbdbd",
        500: "#6b7280",
        700: "#374151",
        900: "#111827",
      },
      /** Error red that prints safely (not 255,0,0) */
      error: "#b91c1c",
      /** Success green safe */
      success: "#15803d",
    },
    /** Maximum Total Area Coverage (ink limit) */
    maxTac: 240,
    /** How to handle RGB→CMYK: backend Ghostscript conversion with ICC */
    iccProfile: "ISOcoated_v2_300_eci.icc or Coated_FOGRA39",
    /** Note for PDF metadata */
    profileNote: "sRGB IEC61966-2.1 output with embedded fonts, print-safe palette (TAC≤240%), ready for ISOcoated_v2_300_eci conversion for offset press.",
  },
  /** Accessibility requirements */
  accessibility: {
    /** Semantic heading hierarchy required */
    headingHierarchy: true,
    /** Language tags per element */
    langAttrs: true,
    /** Alt text enforced for images */
    altRequired: true,
    /** PDF tagging */
    taggedPdf: true,
    /** Reading order via DOM order */
    readingOrder: "DOM",
    /** Color contrast AA minimum */
    contrastAA: 4.5,
    /** Table headers scope */
    tableHeaders: true,
  },
  /** Page break optimization */
  pageBreak: {
    /** Orphans/widows */
    orphans: 3,
    widows: 3,
    /** Avoid breaks inside */
    avoidInside: [".bilingual-pair", "table", "figure", "blockquote", "ul", "ol", ".keep-together"] as const,
    /** Always break before */
    breakBefore: ["h1"] as const,
    /** Keep heading with next paragraph */
    keepWithNext: ["h2", "h3", "h4", ".section-title"] as const,
  },
} as const;

export type PrintReadyConfig = typeof PRINT_READY;

/** Generate CSS for premium typography */
export function generatePremiumTypographyCss(): string {
  const t = PRINT_READY.typography;
  return `
/* ===== Premium Typography - Print Ready ===== */
html {
  font-size: ${t.scale.base};
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
body {
  font-family: ${t.families.enSans}, ${t.families.arSans};
  font-weight: ${t.weight.normal};
  line-height: ${t.lineHeight.normal};
  font-kerning: normal;
  font-optical-sizing: auto;
  font-variant-ligatures: ${t.features.standard};
  text-rendering: optimizeLegibility;
  letter-spacing: normal;
  word-spacing: normal;
  hanging-punctuation: first last;
  font-synthesis: none;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Headings - tight, semibold, tracking tuned */
h1, h2, h3, h4, h5, h6 {
  font-family: ${t.families.enSans};
  font-weight: ${t.weight.semibold};
  line-height: ${t.lineHeight.tight};
  letter-spacing: -0.01em;
  font-kerning: normal;
  font-variant-ligatures: common-ligatures contextual;
  break-after: avoid;
  break-inside: avoid;
  page-break-after: avoid;
  page-break-inside: avoid;
}

h1 { font-size: ${t.scale["4xl"]}; line-height: ${t.lineHeight.tight}; margin: 0 0 0.6em; }
.bilingual-document h1 { font-size: 1.55rem; margin: 0; }
h2 { font-size: ${t.scale["3xl"]}; line-height: ${t.lineHeight.tight}; margin: 1.6em 0 0.5em; border-bottom: 0.5pt solid ${PRINT_READY.color.palette.gray[200]}; padding-bottom: 0.3em; }
.bilingual-document h2 {
  font-size: 0.95rem;
  margin: 0;
  border-bottom-color: color-mix(in srgb, ${PRINT_READY.color.palette.inkPrimary} 25%, ${PRINT_READY.color.palette.gray[200]});
}
h3 { font-size: ${t.scale["2xl"]}; line-height: ${t.lineHeight.snug}; margin: 1.3em 0 0.4em; }
h4 { font-size: ${t.scale.xl}; margin: 1.1em 0 0.35em; }
h5, h6 { font-size: ${t.scale.lg}; margin: 1em 0 0.3em; text-transform: uppercase; letter-spacing: 0.04em; }

/* Paragraphs - optimal measure */
p {
  font-size: ${t.scale.base};
  line-height: ${t.lineHeight.normal};
  margin: 0 0 0.85em;
  orphans: ${PRINT_READY.pageBreak.orphans};
  widows: ${PRINT_READY.pageBreak.widows};
  hyphens: auto;
  hyphenate-limit-chars: 6 3 2;
}

/* Arabic typography - preserve connected forms */
:lang(ar), [dir="rtl"] {
  font-family: ${t.families.arSans};
  line-height: ${t.lineHeight.relaxed};
  letter-spacing: normal !important;
  word-spacing: normal;
  font-kerning: normal;
  font-variant-ligatures: common-ligatures contextual;
  hyphens: none;
}

/* Lists - keep together */
ul, ol {
  margin: 0 0 1em 1.5em;
  padding: 0;
  orphans: ${PRINT_READY.pageBreak.orphans};
  widows: ${PRINT_READY.pageBreak.widows};
}
li {
  break-inside: avoid;
  page-break-inside: avoid;
  margin-bottom: 0.25em;
}

/* Tables - accessibility + break handling */
table {
  width: 100%;
  border-collapse: collapse;
  font-size: ${t.scale.sm};
  line-height: ${t.lineHeight.snug};
  margin: 1em 0 1.2em;
  break-inside: auto;
}
thead { display: table-header-group; }
tfoot { display: table-footer-group; }
th {
  font-weight: ${t.weight.semibold};
  text-align: start;
  background: ${PRINT_READY.color.palette.gray[100]};
  border-bottom: 1pt solid ${PRINT_READY.color.palette.gray[700]};
  padding: 6pt 8pt;
}
td {
  padding: 5pt 8pt;
  border-bottom: 0.5pt solid ${PRINT_READY.color.palette.gray[200]};
  vertical-align: top;
}
tr { break-inside: avoid; }

/* Bilingual packages own their table chrome — do not reintroduce box borders. */
.bilingual-document .bilingual-cell table,
.bilingual-document .bilingual-cell th,
.bilingual-document .bilingual-cell td {
  border-inline: none;
}
.bilingual-document .bilingual-cell th {
  background: linear-gradient(180deg, #EEF2F6 0%, #F8FAFC 100%);
  border-bottom: 1px solid #94A3B8;
  color: ${PRINT_READY.color.palette.inkPrimary};
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0.42rem 0.55rem;
}
.bilingual-document .bilingual-cell td {
  border-bottom: 0.5px solid ${PRINT_READY.color.palette.gray[200]};
  padding: 0.42rem 0.55rem;
}

/* Code - tabular numbers */
code, pre, .technical {
  font-family: ${t.families.code};
  font-variant-numeric: ${t.features.tabular};
  font-feature-settings: ${t.features.tabular};
}

/* Blockquotes - keep together */
blockquote {
  margin: 0.8em 0 0.8em 0;
  padding: 0.6em 1em;
  border-inline-start: 3pt solid ${PRINT_READY.color.palette.inkPrimary};
  background: ${PRINT_READY.color.palette.gray[100]};
  break-inside: avoid;
  page-break-inside: avoid;
}
`;
}

/** Generate CSS for optimized page breaks */
export function generatePageBreakCss(): string {
  const pb = PRINT_READY.pageBreak;
  return `
/* ===== Optimized Page Breaks ===== */
@page {
  orphans: ${pb.orphans};
  widows: ${pb.widows};
  margin-top: ${PRINT_READY.margins.premium.top};
  margin-bottom: ${PRINT_READY.margins.premium.bottom};
  margin-left: ${PRINT_READY.margins.premium.left};
  margin-right: ${PRINT_READY.margins.premium.right};
}

${pb.avoidInside.map((sel) => `${sel} { break-inside: avoid; page-break-inside: avoid; }`).join("\n")}

/* Never force a page before the document title inside bilingual packages. */
${pb.breakBefore
  .map(
    (sel) =>
      `${sel}:not([data-fragment-kind="document-title"]) { break-before: page; page-break-before: always; }`,
  )
  .join("\n")}

.bilingual-document h1[data-fragment-kind="document-title"] {
  break-before: auto !important;
  page-break-before: auto !important;
}

h2, h3, h4 {
  break-after: avoid;
  page-break-after: avoid;
}

h2 + *, h3 + *, h4 + * {
  break-before: avoid;
}

p, li {
  orphans: ${pb.orphans};
  widows: ${pb.widows};
}

/* Prevent last paragraph of section orphaned */
section > :last-child {
  break-after: avoid;
}

/* Figure and image keep together with caption */
figure {
  break-inside: avoid;
  page-break-inside: avoid;
  margin: 1em 0;
}
figcaption {
  font-size: ${PRINT_READY.typography.scale.sm};
  color: ${PRINT_READY.color.palette.gray[700]};
  margin-top: 0.4em;
}

/* Avoid breaking after heading at bottom of page – CSS has no direct support, use margin */
h2, h3, h4 {
  margin-bottom: 0.6em;
  padding-bottom: 0;
}

/* Print-specific resets */
@media print {
  * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  a[href^="http"]::after {
    content: " (" attr(href) ")";
    font-size: 0.85em;
    color: ${PRINT_READY.color.palette.gray[500]};
  }
  a {
    color: ${PRINT_READY.color.palette.inkPrimary};
    text-decoration: none;
  }
  .no-print { display: none !important; }
  .page-break { break-before: page; }
  .avoid-break { break-inside: avoid; }
}
`;
}

/** Generate CSS for bleed zones, crop marks, margin safety */
export function generateBleedAndSafetyCss(options?: { bleed?: string; safety?: string; marks?: boolean }): string {
  const bleed = options?.bleed ?? PRINT_READY.bleed.size;
  const safety = options?.safety ?? PRINT_READY.bleed.safety;
  const showMarks = options?.marks ?? PRINT_READY.bleed.marks;

  return `
/* ===== Bleed Zones & Margin Safety ===== */
@page {
  /* Bleed for offset printing */
  bleed: ${bleed};
  marks: ${showMarks ? "crop cross" : "none"};
  /* Trim = paper + bleed */
  size: A4;
}

@page :bleed {
  /* Visual bleed area */
  margin: 0;
}

@media print {
  /* Safety zone indicator (visible only in proof, not final trim) */
  body.print-proof::before {
    content: "";
    position: fixed;
    inset: ${safety};
    border: 0.25pt dashed rgba(0,0,0,0.08);
    pointer-events: none;
    z-index: 9999;
  }

  /* Ensure critical content stays within safe zone */
  body.print-proof .critical-content,
  body.print-proof .document-header,
  body.print-proof .document-footer,
  body.print-proof h1:not(.bilingual-document h1),
  body.print-proof h2:not(.bilingual-document h2),
  body.print-proof h3:not(.bilingual-document h3) {
    margin-inline: max(0mm, calc(${safety} - 2mm));
  }

  /* Full-bleed elements can extend to bleed */
  .full-bleed {
    margin: -${bleed};
    padding: ${bleed};
    width: calc(100% + (2 * ${bleed}));
    box-sizing: border-box;
  }

  /* Crop marks styling (when marks enabled) */
  @page {
    marks: ${showMarks ? "crop" : "none"};
  }
}

/* Screen preview of bleed (dashed outer) */
@media screen {
  .bleed-preview {
    position: relative;
    outline: 1px dashed rgba(0,0,0,0.2);
    outline-offset: ${bleed};
  }
  .safety-preview {
    outline: 0.5pt dashed rgba(220, 38, 38, 0.35);
    outline-offset: -${safety};
  }
}
`;
}

/** Generate CSS for accessibility compliance */
export function generateAccessibilityCss(): string {
  return `
/* ===== Accessibility Compliance ===== */
/* Ensure sufficient color contrast (AA) */
:root {
  --color-text: ${PRINT_READY.color.palette.gray[900]};
  --color-text-muted: ${PRINT_READY.color.palette.gray[700]};
  --color-primary: ${PRINT_READY.color.palette.inkPrimary};
  --color-accent: ${PRINT_READY.color.palette.accent};
}

/* Focus visible for screen readers (also helps tagged PDF structure) */
:focus-visible {
  outline: 2pt solid ${PRINT_READY.color.palette.inkPrimary};
  outline-offset: 2pt;
}

/* Language isolation with BDI */
bdi {
  unicode-bidi: isolate;
}

/* Semantic hiding but keep for screen readers */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Table accessibility */
table[role="table"] {
  border: 0.5pt solid ${PRINT_READY.color.palette.gray[200]};
}
th[scope="col"], th[scope="row"] {
  font-weight: ${PRINT_READY.typography.weight.semibold};
}

/* Alt text placeholder visible in HTML but not PDF */
img {
  max-width: 100%;
  height: auto;
  display: block;
}
img:not([alt]) {
  outline: 2pt solid ${PRINT_READY.color.palette.error};
}

/* Ensure reading order is DOM order - no CSS absolute positioning for main content */
.main-content {
  position: static;
}

/* Print-friendly link handling for accessibility */
@media print {
  abbr[title]::after {
    content: " (" attr(title) ")";
  }
}
`;
}

/** Generate CSS for CMYK adherence note (informative) */
export function generateCmykComplianceCss(): string {
  return `
/* ===== CMYK Safe Palette & Print Profile ===== */
/*
  PDF is generated sRGB IEC61966-2.1 with embedded OFL fonts.
  For offset press, convert via Ghostscript:
    gs -dPDFX -dBATCH -dNOPAUSE -dNOOUTERSAVE -sProcessColorModel=DeviceCMYK \
       -sDEVICE=pdfwrite -sColorConversionStrategy=CMYK \
       -sColorConversionStrategyForImages=CMYK \
       -sOutputICCProfile=${PRINT_READY.color.iccProfile} \
       -sOutputFile=output-cmyk.pdf input.pdf

  TAC is limited to ${PRINT_READY.color.maxTac}% via safe palette below.
  Avoid pure black #000000 – use rich black ${PRINT_READY.color.palette.richBlack}
  for large areas, and 100K #111827 for body text per print best practice.

  Embedded profile note: ${PRINT_READY.color.profileNote}
*/

:root {
  --print-rich-black: ${PRINT_READY.color.palette.richBlack};
  --print-ink-primary: ${PRINT_READY.color.palette.inkPrimary};
  --print-paper: ${PRINT_READY.color.palette.paper};
  --print-gray-900: ${PRINT_READY.color.palette.gray[900]};
  --print-safe-tac-limit: ${PRINT_READY.color.maxTac}%;
}

/* Use CMYK-safe colors only for critical print elements */
.print-ink-primary { color: ${PRINT_READY.color.palette.inkPrimary}; }
.print-rich-black { color: ${PRINT_READY.color.palette.richBlack}; }
.print-paper { background: ${PRINT_READY.color.palette.paper}; }

/* Never use pure black for large fills – causes over-inking */
.avoid-pure-black { background-color: ${PRINT_READY.color.palette.gray[900]} !important; }

/* Hide screen-only elements in print */
@media print {
  .screen-only { display: none !important; }
}
`;
}

/** Complete premium print CSS bundle */
export function generatePremiumPrintCss(options?: { bleed?: string; safety?: string; marks?: boolean }): string {
  return [
    generatePremiumTypographyCss(),
    generatePageBreakCss(),
    generateBleedAndSafetyCss(options),
    generateAccessibilityCss(),
    generateCmykComplianceCss(),
  ].join("\n\n");
}

/** PDF metadata for print-ready */
export interface PrintReadyPdfMetadata {
  readonly title: string;
  readonly titleAr?: string;
  readonly subject?: string;
  readonly keywords?: string[];
  readonly author?: string;
  readonly authorAr?: string;
  readonly language: "en" | "ar" | "bilingual";
  readonly producer: string;
  readonly creator: string;
  readonly creationDate: string;
  readonly pdfVersion: "1.7" | "2.0";
  readonly pdfStandard: "PDF/X-4" | "PDF/UA-1" | "PDF/A-3b" | "PDF/X-4+UA";
  readonly colorProfile: typeof PRINT_READY.color.iccProfile;
  readonly bleed: string;
  readonly tagged: boolean;
  readonly embeddedFonts: boolean;
}

export function generatePrintReadyMetadata(opts: {
  title: string;
  titleAr?: string;
  language?: "en" | "ar" | "bilingual";
  author?: string;
  subject?: string;
}): PrintReadyPdfMetadata {
  return {
    title: opts.title,
    titleAr: opts.titleAr,
    subject: opts.subject ?? "Tender proposal – print-ready premium",
    keywords: ["tender", "proposal", "print-ready", "accessible", "bleed", "CMYK-safe"],
    author: opts.author ?? "Arabclue Platform – Human Author is Final Authority",
    language: opts.language ?? "bilingual",
    producer: "Arabclue Print Engine (Chromium + OFL fonts, sRGB, embedded, TAC≤240%)",
    creator: "Arabclue Document Layout – premium print-ready",
    creationDate: new Date().toISOString(),
    pdfVersion: "1.7",
    pdfStandard: "PDF/X-4+UA",
    colorProfile: PRINT_READY.color.iccProfile,
    bleed: PRINT_READY.bleed.size,
    tagged: PRINT_READY.accessibility.taggedPdf,
    embeddedFonts: true,
  };
}
