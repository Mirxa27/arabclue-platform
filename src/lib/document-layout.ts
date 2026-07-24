/**
 * Document Layout Utilities
 * 
 * Provides utilities for:
 * - Page layout configuration (A4, Letter, margins)
 * - CSS generation for print media
 * - Header and footer generators
 * - Layout calculations
 * 
 * @see plans/2026-07-24-document-generation-architecture-design-part2.md
 */

import type { BrandProfile } from "@prisma/client";
import { designTokens } from "./design-tokens";
import { getFontStack, getTextDirection, type Locale } from "./typography";

// ============================================================================
// Type Definitions
// ============================================================================

export type PageSize = "A4" | "Letter";
export type PageOrientation = "portrait" | "landscape";

export interface PageMargins {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

export interface PageOptions {
  size: PageSize;
  orientation: PageOrientation;
  margins: PageMargins;
}

export interface PageDimensions {
  width: string;
  height: string;
}

export interface DocumentHeaderOptions {
  title: string;
  titleAr?: string;
  logo?: string;
  locale: Locale;
  brand?: BrandProfile | null;
}

export interface DocumentFooterOptions {
  pageNumber?: number;
  totalPages?: number;
  confidential?: boolean;
  locale: Locale;
  companyName?: string;
  brand?: BrandProfile | null;
}

// ============================================================================
// Page Layout Constants
// ============================================================================

const PAGE_DIMENSIONS: Record<PageSize, Record<PageOrientation, PageDimensions>> = {
  A4: {
    portrait: {
      width: "210mm",
      height: "297mm",
    },
    landscape: {
      width: "297mm",
      height: "210mm",
    },
  },
  Letter: {
    portrait: {
      width: "8.5in",
      height: "11in",
    },
    landscape: {
      width: "11in",
      height: "8.5in",
    },
  },
};

/**
 * Default page margins for professional documents
 */
export const DEFAULT_MARGINS: PageMargins = {
  top: "18mm",
  right: "14mm",
  bottom: "18mm",
  left: "14mm",
};

/**
 * Narrow margins for content-heavy documents
 */
export const NARROW_MARGINS: PageMargins = {
  top: "12mm",
  right: "10mm",
  bottom: "12mm",
  left: "10mm",
};

/**
 * Wide margins for formal documents
 */
export const WIDE_MARGINS: PageMargins = {
  top: "25mm",
  right: "20mm",
  bottom: "25mm",
  left: "20mm",
};

// ============================================================================
// Page Layout Functions
// ============================================================================

/**
 * Get page dimensions for a given size and orientation
 * 
 * @param size - Paper size (A4 or Letter)
 * @param orientation - Page orientation
 * @returns Page dimensions
 * 
 * @example
 * ```typescript
 * getPageDimensions("A4", "portrait")
 * // => { width: "210mm", height: "297mm" }
 * ```
 */
export function getPageDimensions(
  size: PageSize,
  orientation: PageOrientation
): PageDimensions {
  return PAGE_DIMENSIONS[size][orientation];
}

/**
 * Generate CSS for @page rule
 * 
 * Creates complete CSS for print media page setup
 * 
 * @param options - Page configuration options
 * @returns CSS string for @page rule
 * 
 * @example
 * ```typescript
 * generatePageCSS({ size: "A4", orientation: "portrait", margins: DEFAULT_MARGINS })
 * // => "@page { size: A4 portrait; margin: 18mm 14mm 18mm 14mm; }"
 * ```
 */
export function generatePageCSS(options: PageOptions): string {
  const { size, orientation, margins } = options;
  
  return `@page {
  size: ${size} ${orientation};
  margin: ${margins.top} ${margins.right} ${margins.bottom} ${margins.left};
}`;
}

/**
 * Generate complete print styles for a document
 * 
 * @param options - Page configuration
 * @param additionalCSS - Optional additional print styles
 * @returns Complete CSS string for print media
 * 
 * @example
 * ```typescript
 * const printStyles = generatePrintCSS({
 *   size: "A4",
 *   orientation: "portrait",
 *   margins: DEFAULT_MARGINS
 * });
 * ```
 */
export function generatePrintCSS(
  options: PageOptions,
  additionalCSS?: string
): string {
  const pageCSS = generatePageCSS(options);
  
  return `
@media print {
  ${pageCSS}
  
  body {
    margin: 0;
    padding: 0;
    background: white;
    color: black;
  }
  
  * {
    box-shadow: none !important;
  }
  
  .page-break {
    page-break-before: always;
  }
  
  .avoid-break {
    page-break-inside: avoid;
  }
  
  .no-print {
    display: none !important;
  }
  
  a {
    text-decoration: none;
    color: inherit;
  }
  
  ${additionalCSS || ""}
}`;
}

// ============================================================================
// Header & Footer Generators
// ============================================================================

/**
 * Generate document header HTML
 * 
 * Creates a professional header with optional logo and bilingual title
 * 
 * @param options - Header configuration
 * @returns HTML string for header
 * 
 * @example
 * ```typescript
 * generateDocumentHeader({
 *   title: "Technical Proposal",
 *   titleAr: "العرض الفني",
 *   locale: "ar",
 *   logo: "https://example.com/logo.png"
 * })
 * ```
 */
export function generateDocumentHeader(options: DocumentHeaderOptions): string {
  const { title, titleAr, logo, locale, brand } = options;
  const dir = getTextDirection(locale);
  const primaryColor = brand?.primaryColor || designTokens.colors.primary[600];
  const fontStack = getFontStack(locale, brand?.fontFamily);
  
  const displayTitle = locale === "ar" && titleAr ? titleAr : title;
  
  return `
<header class="document-header" style="
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-6);
  border-bottom: 3px solid ${primaryColor};
  margin-bottom: var(--space-8);
  font-family: ${fontStack};
  direction: ${dir};
">
  ${logo ? `
    <div class="header-logo">
      <img src="${escapeHtml(logo)}" alt="Logo" style="
        height: 40px;
        max-width: 180px;
        object-fit: contain;
      " />
    </div>
  ` : ""}
  
  <div class="header-title" style="
    flex: 1;
    text-align: ${locale === "ar" ? "right" : "left"};
    ${logo ? `margin-${locale === "ar" ? "right" : "left"}: var(--space-4);` : ""}
  ">
    <h1 style="
      font-size: var(--text-2xl);
      font-weight: var(--font-bold);
      color: ${primaryColor};
      margin: 0;
    " lang="${locale}">${escapeHtml(displayTitle)}</h1>
  </div>
</header>`;
}

/**
 * Generate document footer HTML
 * 
 * Creates a professional footer with page numbers and optional confidentiality notice
 * 
 * @param options - Footer configuration
 * @returns HTML string for footer
 * 
 * @example
 * ```typescript
 * generateDocumentFooter({
 *   pageNumber: 1,
 *   totalPages: 10,
 *   confidential: true,
 *   locale: "ar",
 *   companyName: "شركة أرابكلو"
 * })
 * ```
 */
export function generateDocumentFooter(options: DocumentFooterOptions): string {
  const { pageNumber, totalPages, confidential, locale, companyName, brand } = options;
  const dir = getTextDirection(locale);
  const secondaryColor = brand?.secondaryColor || designTokens.colors.secondary[600];
  const fontStack = getFontStack(locale, brand?.fontFamily);
  
  const confidentialLabel = locale === "ar" ? "سري" : "Confidential";
  const pageLabel = locale === "ar" ? "صفحة" : "Page";
  const ofLabel = locale === "ar" ? "من" : "of";
  
  return `
<footer class="document-footer" style="
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--color-secondary-200);
  margin-top: var(--space-8);
  font-family: ${fontStack};
  font-size: var(--text-sm);
  color: ${secondaryColor};
  direction: ${dir};
">
  <div class="footer-left">
    ${companyName ? `<span lang="${locale}">${escapeHtml(companyName)}</span>` : ""}
    ${confidential ? `<span class="confidential-badge" style="
      display: inline-block;
      margin-${locale === "ar" ? "right" : "left"}: var(--space-3);
      padding: var(--space-1) var(--space-2);
      background: var(--color-error);
      color: white;
      border-radius: var(--radius-sm);
      font-size: var(--text-xs);
      font-weight: var(--font-semibold);
    " lang="${locale}">${confidentialLabel}</span>` : ""}
  </div>
  
  ${pageNumber && totalPages ? `
    <div class="footer-pagination" lang="${locale}">
      <span>${pageLabel} ${pageNumber} ${ofLabel} ${totalPages}</span>
    </div>
  ` : ""}
</footer>`;
}

/**
 * Generate minimal header for PDF export (Playwright)
 * 
 * Used in Playwright's headerTemplate option
 * 
 * @param companyName - Company name to display
 * @param color - Header text color
 * @returns HTML string for PDF header
 */
export function generatePDFHeaderTemplate(
  companyName: string,
  color?: string
): string {
  const headerColor = color || designTokens.colors.primary[600];
  
  return `
<div style="
  font-size: 8px;
  width: 100%;
  padding: 0 12mm;
  color: ${headerColor};
  font-family: Arial, sans-serif;
  display: flex;
  justify-content: space-between;
">
  <span>${escapeHtml(companyName)}</span>
  <span style="color: #94a3b8;">Arabclue</span>
</div>`;
}

/**
 * Generate minimal footer for PDF export (Playwright)
 * 
 * Used in Playwright's footerTemplate option
 * 
 * @param companyName - Company name to display
 * @param color - Footer text color
 * @returns HTML string for PDF footer
 */
export function generatePDFFooterTemplate(
  companyName: string,
  color?: string
): string {
  const footerColor = color || designTokens.colors.secondary[600];
  
  return `
<div style="
  font-size: 8px;
  width: 100%;
  padding: 0 12mm;
  color: ${footerColor};
  font-family: Arial, sans-serif;
  display: flex;
  justify-content: space-between;
">
  <span>${escapeHtml(companyName)}</span>
  <span>
    <span class="pageNumber"></span> / <span class="totalPages"></span>
  </span>
</div>`;
}

// ============================================================================
// Layout Helpers
// ============================================================================

/**
 * Calculate content width based on page size and margins
 * 
 * @param size - Page size
 * @param orientation - Page orientation
 * @param margins - Page margins
 * @returns Content width in mm
 * 
 * @example
 * ```typescript
 * calculateContentWidth("A4", "portrait", DEFAULT_MARGINS)
 * // => 182 (210mm - 14mm left - 14mm right)
 * ```
 */
export function calculateContentWidth(
  size: PageSize,
  orientation: PageOrientation,
  margins: PageMargins
): number {
  const dimensions = getPageDimensions(size, orientation);
  const pageWidth = parseSizeToMM(dimensions.width);
  const leftMargin = parseSizeToMM(margins.left);
  const rightMargin = parseSizeToMM(margins.right);
  
  return pageWidth - leftMargin - rightMargin;
}

/**
 * Calculate content height based on page size and margins
 * 
 * @param size - Page size
 * @param orientation - Page orientation
 * @param margins - Page margins
 * @returns Content height in mm
 */
export function calculateContentHeight(
  size: PageSize,
  orientation: PageOrientation,
  margins: PageMargins
): number {
  const dimensions = getPageDimensions(size, orientation);
  const pageHeight = parseSizeToMM(dimensions.height);
  const topMargin = parseSizeToMM(margins.top);
  const bottomMargin = parseSizeToMM(margins.bottom);
  
  return pageHeight - topMargin - bottomMargin;
}

/**
 * Parse size string to millimeters
 * 
 * Converts various CSS units to mm
 * 
 * @param size - Size string (e.g., "210mm", "8.5in")
 * @returns Size in millimeters
 */
function parseSizeToMM(size: string): number {
  const match = size.match(/^([\d.]+)(mm|in|cm|px)$/);
  if (!match) return 0;
  
  const value = parseFloat(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case "mm":
      return value;
    case "cm":
      return value * 10;
    case "in":
      return value * 25.4;
    case "px":
      return value * 0.264583; // 96 DPI
    default:
      return value;
  }
}

/**
 * Generate section divider HTML
 * 
 * @param locale - Target locale
 * @returns HTML string for section divider
 */
export function generateSectionDivider(locale: Locale = "ar"): string {
  return `
<hr class="section-divider" style="
  border: none;
  border-top: 2px solid var(--color-secondary-200);
  margin: var(--space-8) 0;
" />`;
}

/**
 * Wrap content in a page container
 * 
 * @param content - HTML content to wrap
 * @param locale - Target locale
 * @returns HTML string with container wrapper
 */
export function wrapInPageContainer(content: string, locale: Locale): string {
  const dir = getTextDirection(locale);
  
  return `
<div class="page-container" style="
  max-width: 210mm;
  margin: 0 auto;
  padding: var(--space-8);
  background: white;
  direction: ${dir};
" lang="${locale}">
  ${content}
</div>`;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Escape HTML special characters
 * 
 * @param text - Text to escape
 * @returns Escaped HTML
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generate CSS for bilingual side-by-side layout
 * 
 * @param leftLang - Left column language
 * @param rightLang - Right column language
 * @param ratio - Column width ratio [left, right]
 * @returns CSS string for side-by-side layout
 */
export function generateBilingualLayoutCSS(
  leftLang: Locale,
  rightLang: Locale,
  ratio: [number, number] = [50, 50]
): string {
  const [leftPercent, rightPercent] = ratio;
  
  return `
.bilingual-layout {
  display: grid;
  grid-template-columns: ${leftPercent}% ${rightPercent}%;
  gap: var(--space-6);
  margin-bottom: var(--space-8);
}

.bilingual-column-left {
  direction: ${getTextDirection(leftLang)};
  text-align: ${leftLang === "ar" ? "right" : "left"};
}

.bilingual-column-right {
  direction: ${getTextDirection(rightLang)};
  text-align: ${rightLang === "ar" ? "right" : "left"};
}

@media print {
  .bilingual-layout {
    page-break-inside: avoid;
  }
}

@media (max-width: 768px) {
  .bilingual-layout {
    grid-template-columns: 1fr;
    gap: var(--space-4);
  }
}`;
}
