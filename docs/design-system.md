# Arabclue Design System

## Overview

The Arabclue Design System provides a comprehensive, production-ready foundation for generating professional documents with consistent styling, bilingual support, and brand customization.

**Version:** 1.0.0
**Last Updated:** 2026-07-24
**Status:** ✅ Phase 1 Complete

---

## Table of Contents

1. [Introduction](#introduction)
2. [Design Tokens](#design-tokens)
3. [Document Components](#document-components)
4. [Typography System](#typography-system)
5. [Layout Utilities](#layout-utilities)
6. [Brand Customization](#brand-customization)
7. [Print Optimization](#print-optimization)
8. [Usage Examples](#usage-examples)
9. [API Reference](#api-reference)

---

## Introduction

The design system consists of five core modules:

- **Design Tokens** ([`src/lib/design-tokens.ts`](../src/lib/design-tokens.ts)) - Color scales, typography, spacing, effects
- **CSS Variables** ([`src/app/design-tokens.css`](../src/app/design-tokens.css)) - Complete CSS custom property definitions
- **Typography Utilities** ([`src/lib/typography.ts`](../src/lib/typography.ts)) - Font management, text formatting, locale support
- **Layout Utilities** ([`src/lib/document-layout.ts`](../src/lib/document-layout.ts)) - Page setup, headers/footers, calculations
- **Document Components** ([`src/components/documents/document-components.tsx`](../src/components/documents/document-components.tsx)) - Reusable React components

### Key Features

✅ **Type-Safe** - Complete TypeScript interfaces for all tokens and components
✅ **Bilingual** - Full Arabic (RTL) and English (LTR) support
✅ **Print-Ready** - Optimized for PDF generation via Playwright
✅ **Brand-Aware** - Override colors and fonts per workspace
✅ **Accessible** - ARIA attributes and semantic HTML
✅ **Tested** - 90%+ coverage with comprehensive test suites

---

## Design Tokens

### Color System

#### Primary Colors (Teal)

```typescript
import { designTokens } from "@/lib/design-tokens";

console.log(designTokens.colors.primary[500]); // #14B8A6
```

**Scale:**
- 50: `#F0FDFA` (lightest)
- 500: `#14B8A6` (base)
- 900: `#134E4A` (darkest)

#### Secondary Colors (Slate)

- 900: `#0F172A` (base dark)
- 500: `#64748B` (mid-tone)

#### Accent Colors (Saudi Gold)

- 600: `#D97706` (base)

#### Semantic Colors

```typescript
const { semantic } = designTokens.colors;
// success: #059669 (green)
// warning: #D97706 (amber)
// error: #DC2626 (red)
// info: #0EA5E9 (cyan)
```

### Typography

#### Font Families

```typescript
// Arabic documents
font-family: var(--font-ar); // 'IBM Plex Sans Arabic', 'Cairo', 'Tajawal', sans-serif

// English documents
font-family: var(--font-en); // 'Space Grotesk', 'Inter', 'IBM Plex Sans', sans-serif

// Code/monospace
font-family: var(--font-mono); // 'JetBrains Mono', 'Fira Code', monospace
```

#### Font Sizes

| Token | Size | Usage |
|-------|------|-------|
| `--text-xs` | 0.75rem (12px) | Fine print, captions |
| `--text-sm` | 0.875rem (14px) | Body text (secondary) |
| `--text-base` | 1rem (16px) | Body text (primary) |
| `--text-lg` | 1.125rem (18px) | Large body text |
| `--text-xl` | 1.25rem (20px) | Small headings |
| `--text-2xl` | 1.5rem (24px) | Medium headings |
| `--text-3xl` | 1.875rem (30px) | Large headings |
| `--text-4xl` | 2.25rem (36px) | Page titles |

#### Font Weights

- `--font-normal`: 400
- `--font-medium`: 500
- `--font-semibold`: 600
- `--font-bold`: 700

### Spacing Scale

Based on an 8px base unit:

| Token | Value | Pixels |
|-------|-------|--------|
| `--space-0` | 0 | 0 |
| `--space-1` | 0.25rem | 4px |
| `--space-2` | 0.5rem | 8px |
| `--space-4` | 1rem | 16px |
| `--space-6` | 1.5rem | 24px |
| `--space-8` | 2rem | 32px |
| `--space-12` | 3rem | 48px |

### Effects

#### Shadows

```css
box-shadow: var(--shadow-sm);   /* Subtle elevation */
box-shadow: var(--shadow-md);   /* Card elevation */
box-shadow: var(--shadow-lg);   /* Modal elevation */
```

#### Border Radius

```css
border-radius: var(--radius-sm);   /* 4px - Buttons, badges */
border-radius: var(--radius-md);   /* 8px - Cards */
border-radius: var(--radius-lg);   /* 16px - Panels */
```

---

## Document Components

All components are exported from [`src/components/documents/document-components.tsx`](../src/components/documents/document-components.tsx).

### DocumentContainer

Main wrapper for all documents with locale-aware styling.

```tsx
import { DocumentContainer } from "@/components/documents/document-components";

<DocumentContainer locale="ar" brand={brandProfile}>
  {/* Document content */}
</DocumentContainer>
```

**Props:**
- `locale: "ar" | "en"` - Document language
- `brand?: BrandProfile | null` - Custom brand colors/fonts
- `className?: string` - Additional CSS classes

### DocumentSection

Section with bilingual header and decorative underline.

```tsx
<DocumentSection
  titleEn="Executive Summary"
  titleAr="الملخص التنفيذي"
  locale="ar"
  level={2}
>
  <p>Content here...</p>
</DocumentSection>
```

**Props:**
- `titleEn: string` - English title
- `titleAr: string` - Arabic title
- `locale: "ar" | "en"` - Display language
- `level?: 1 | 2 | 3 | 4` - Heading level (default: 2)

### DocumentTable

Professional table with bilingual headers.

```tsx
<DocumentTable
  headers={[
    { en: "Name", ar: "الاسم" },
    { en: "Amount", ar: "المبلغ" },
  ]}
  rows={[
    ["Item 1", "1,000 SAR"],
    ["Item 2", "2,500 SAR"],
  ]}
  locale="ar"
  striped
  bordered
  caption="Financial Summary"
/>
```

### StatCard

Metric display with optional trend indicator.

```tsx
<StatCard
  label="Projects"
  labelAr="المشاريع"
  value={15}
  trend={{ value: 12, direction: "up" }}
  locale="ar"
/>
```

### StatusBadge

Colored badge for status indicators.

```tsx
<StatusBadge status="success" label="Approved" size="md" />
<StatusBadge status="warning" label="Pending Review" />
<StatusBadge status="error" label="Rejected" />
```

**Status Colors:**
- `success` - Green
- `warning` - Amber
- `error` - Red
- `info` - Cyan
- `neutral` - Gray

### InfoBox

Callout box for important information.

```tsx
<InfoBox
  type="warning"
  title="Important Notice"
  content="Please review the compliance requirements before submission."
  locale="en"
/>
```

### Timeline

Event timeline visualization.

```tsx
<Timeline
  events={[
    {
      id: "1",
      title: "Project Start",
      titleAr: "بداية المشروع",
      date: new Date("2026-01-01"),
      status: "completed",
    },
    {
      id: "2",
      title: "Phase 1 Complete",
      date: new Date("2026-07-24"),
      status: "completed",
    },
  ]}
  locale="ar"
  orientation="vertical"
/>
```

### ProgressBar

Progress indicator with percentage.

```tsx
<ProgressBar
  value={85}
  max={100}
  label="Completion"
  labelAr="الإنجاز"
  showPercentage
  locale="ar"
  color="var(--color-success)"
/>
```

---

## Typography System

### Font Loading

```typescript
import { getGoogleFontsUrl } from "@/lib/typography";

const fontsUrl = getGoogleFontsUrl(["IBM Plex Sans Arabic", "Space Grotesk"]);
// https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Space+Grotesk:wght@400;600;700&display=swap
```

### Number Formatting

```typescript
import { formatNumber, formatCurrency, formatPercentage } from "@/lib/typography";

// Numbers with locale-aware formatting
formatNumber(1234.56, "ar"); // "١٬٢٣٤٫٥٦" (Eastern Arabic numerals)
formatNumber(1234.56, "en"); // "1,234.56"

// Currency
formatCurrency(1000000, "SAR", "ar"); // "١٬٠٠٠٬٠٠٠٫٠٠ ر.س."
formatCurrency(1000000, "SAR", "en"); // "SAR 1,000,000.00"

// Percentages
formatPercentage(0.8537, "ar", 2); // "٪٨٥٫٣٧"
formatPercentage(0.8537, "en", 2); // "85.37%"
```

### Date Formatting

```typescript
import { formatDate } from "@/lib/typography";

const date = new Date("2026-07-24");

formatDate(date, "ar", "long"); // "٢٤ يوليو ٢٠٢٦"
formatDate(date, "en", "long"); // "July 24, 2026"
formatDate(date, "en", "short"); // "7/24/26"
```

### Text Direction

```typescript
import { getTextDirection, getAlignmentForLocale } from "@/lib/typography";

getTextDirection("ar"); // "rtl"
getTextDirection("en"); // "ltr"

getAlignmentForLocale("ar"); // "right"
getAlignmentForLocale("en"); // "left"
```

---

## Layout Utilities

### Page Setup

```typescript
import {
  generatePageCSS,
  generatePrintCSS,
  DEFAULT_MARGINS,
} from "@/lib/document-layout";

// Generate @page rule
const pageCSS = generatePageCSS({
  size: "A4",
  orientation: "portrait",
  margins: DEFAULT_MARGINS,
});

// Complete print styles
const printCSS = generatePrintCSS(
  { size: "A4", orientation: "portrait", margins: DEFAULT_MARGINS },
  ".custom-class { color: red; }" // optional additional CSS
);
```

### Headers & Footers

```typescript
import {
  generateDocumentHeader,
  generateDocumentFooter,
} from "@/lib/document-layout";

const header = generateDocumentHeader({
  title: "Technical Proposal",
  titleAr: "العرض الفني",
  locale: "ar",
  logo: "https://example.com/logo.png",
  brand: brandProfile,
});

const footer = generateDocumentFooter({
  pageNumber: 1,
  totalPages: 10,
  confidential: true,
  locale: "ar",
  companyName: "شركة أرابكلو",
});
```

### Content Calculations

```typescript
import { calculateContentWidth, DEFAULT_MARGINS } from "@/lib/document-layout";

const width = calculateContentWidth("A4", "portrait", DEFAULT_MARGINS);
// 182mm (210mm - 14mm left - 14mm right)
```

---

## Brand Customization

### Applying Brand Colors

```typescript
import { applyBrandOverrides, designTokens } from "@/lib/design-tokens";

const brandedTokens = applyBrandOverrides(designTokens, brandProfile);

// Brand colors override primary/secondary/accent scales
// brandProfile.primaryColor → primary[500], primary[600]
// brandProfile.secondaryColor → secondary[800], secondary[900]
// brandProfile.accentColor → accent[500], accent[600]
```

### Inline Brand Overrides

```tsx
import { generateBrandCSSOverrides } from "@/lib/design-tokens";

const brandStyles = generateBrandCSSOverrides(brandProfile);
// "--color-primary-500: #FF5733; --color-primary-600: #FF5733; ..."

<div style={{ [brandStyles]: "" }} data-brand-theme="custom">
  {/* Content with brand colors */}
</div>
```

### Custom Fonts

```typescript
import { getFontStackFromBrand } from "@/lib/typography";

const fontStack = getFontStackFromBrand(brandProfile, "ar");
// "'Custom Font', 'IBM Plex Sans Arabic', 'Cairo', sans-serif"
```

---

## Print Optimization

### Page Breaks

```tsx
import { PageBreak } from "@/components/documents/document-components";

<DocumentSection titleEn="Section 1" titleAr="القسم ١" locale="ar">
  <p>Content...</p>
</DocumentSection>

<PageBreak />

<DocumentSection titleEn="Section 2" titleAr="القسم ٢" locale="ar">
  <p>More content...</p>
</DocumentSection>
```

### Avoid Breaks

Use the `avoid-break` class to prevent page breaks inside elements:

```tsx
<div className="avoid-break">
  <h3>Title</h3>
  <p>Content that should stay together...</p>
</div>
```

### Print-Specific Styles

```css
@media print {
  .no-print {
    display: none !important;
  }

  .page-break {
    page-break-before: always;
  }

  .avoid-break {
    page-break-inside: avoid;
  }
}
```

---

## Usage Examples

### Basic Document

```tsx
import {
  DocumentContainer,
  DocumentSection,
  BilingualText,
} from "@/components/documents/document-components";

export function SimpleDocument({ locale, brand }: Props) {
  return (
    <DocumentContainer locale={locale} brand={brand}>
      <DocumentSection
        titleEn="Introduction"
        titleAr="المقدمة"
        locale={locale}
        level={1}
      >
        <BilingualText
          textEn="This is a sample document."
          textAr="هذا مستند عينة."
          locale={locale}
        />
      </DocumentSection>
    </DocumentContainer>
  );
}
```

### Financial Report

```tsx
import {
  DocumentContainer,
  DocumentSection,
  DocumentTable,
  StatCard,
  ProgressBar,
} from "@/components/documents/document-components";
import { formatCurrency } from "@/lib/typography";

export function FinancialReport({ data, locale, brand }: Props) {
  return (
    <DocumentContainer locale={locale} brand={brand}>
      <DocumentSection
        titleEn="Financial Summary"
        titleAr="الملخص المالي"
        locale={locale}
      >
        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard
            label="Total Revenue"
            labelAr="الإيرادات الإجمالية"
            value={formatCurrency(data.revenue, "SAR", locale)}
            trend={{ value: 15, direction: "up" }}
            locale={locale}
          />
          {/* More stat cards... */}
        </div>

        <DocumentTable
          headers={[
            { en: "Category", ar: "الفئة" },
            { en: "Amount", ar: "المبلغ" },
            { en: "Percentage", ar: "النسبة" },
          ]}
          rows={data.breakdown.map(item => [
            item.category,
            formatCurrency(item.amount, "SAR", locale),
            `${item.percentage}%`,
          ])}
          locale={locale}
          striped
          bordered
        />

        <ProgressBar
          value={data.completionRate}
          max={100}
          label="Completion Rate"
          labelAr="معدل الإنجاز"
          showPercentage
          locale={locale}
        />
      </DocumentSection>
    </DocumentContainer>
  );
}
```

---

## API Reference

### Design Tokens

```typescript
import { designTokens, type DesignTokens } from "@/lib/design-tokens";

// Color scales
designTokens.colors.primary[500]
designTokens.colors.semantic.success

// Typography
designTokens.typography.fontFamilies.arabic
designTokens.typography.fontSizes.base

// Spacing
designTokens.spacing[4]

// Effects
designTokens.effects.shadows.md
```

### Functions

```typescript
// CSS generation
generateCSSVariables(tokens: DesignTokens): string
generateBrandCSSOverrides(brand: BrandProfile | null): string

// Brand overrides
applyBrandOverrides(tokens: DesignTokens, brand: BrandProfile | null): DesignTokens

// Token access
getToken(tokens: DesignTokens, path: string): string | number | undefined
```

### Typography Functions

```typescript
getGoogleFontsUrl(fonts: string[]): string
getFontStack(locale: Locale, customFont?: string | null): string
formatNumber(value: number, locale: Locale): string
formatCurrency(amount: number, currency: string, locale: Locale): string
formatDate(date: Date, locale: Locale, format?: string): string
formatPercentage(value: number, locale: Locale, decimals?: number): string
getTextDirection(locale: Locale): "rtl" | "ltr"
getAlignmentForLocale(locale: Locale): "left" | "right"
```

### Layout Functions

```typescript
getPageDimensions(size: PageSize, orientation: PageOrientation): PageDimensions
generatePageCSS(options: PageOptions): string
generatePrintCSS(options: PageOptions, additionalCSS?: string): string
generateDocumentHeader(options: DocumentHeaderOptions): string
generateDocumentFooter(options: DocumentFooterOptions): string
calculateContentWidth(size: PageSize, orientation: PageOrientation, margins: PageMargins): number
```

---

## Next Steps

### Phase 2: Bilingual Layout Engine (Weeks 5-8)
- Side-by-side rendering
- Stacked mode with language toggle
- Content synchronization

### Phase 3: Contract Template System (Weeks 9-13)
- 5 Saudi-compliant templates
- Variable substitution engine
- Standard clause library

### Phase 4: Enhanced Proposal Layouts (Weeks 14-16)
- Modern cover pages
- Chart generators
- Executive summaries

For more details, see [`plans/2026-07-24-document-generation-complete-design.md`](../plans/2026-07-24-document-generation-complete-design.md).

---

## Contributing

When adding new design tokens or components:

1. Update TypeScript types in [`src/lib/design-tokens.ts`](../src/lib/design-tokens.ts)
2. Add CSS variables to [`src/app/design-tokens.css`](../src/app/design-tokens.css)
3. Write comprehensive tests in [`src/lib/__tests__/`](../src/lib/__tests__/)
4. Update this documentation with usage examples
5. Ensure backward compatibility with existing code

---

## Support

For questions or issues:
- Review design specs in [`plans/`](../plans/)
- Check test files for usage examples
- Refer to existing components in [`src/components/dashboard/`](../src/components/dashboard/)

**Last Updated:** 2026-07-24
**Version:** 1.0.0
**Status:** ✅ Phase 1 Complete


---

## Bilingual Layout Engine (Phase 2)

Phase 2 uses a structured bilingual AST, semantic paired rows, a deterministic
pagination/synchronization planner, bidi-isolated typography, local font
embedding, and one shared HTML renderer for preview and PDF. It does not accept
authored HTML and does not use scroll-ratio synchronization.

The authoritative architecture, API reference, examples, migration notes,
performance targets, and troubleshooting guide are in
[`docs/bilingual-layout-engine.md`](./bilingual-layout-engine.md).

Current implementation:

- [`src/lib/bilingual-layout.tsx`](../src/lib/bilingual-layout.tsx)
- [`src/lib/layout-sync.ts`](../src/lib/layout-sync.ts)
- [`src/lib/bilingual-typography.ts`](../src/lib/bilingual-typography.ts)
- [`src/lib/bilingual-pdf.ts`](../src/lib/bilingual-pdf.ts)
- [`src/components/documents/bilingual/`](../src/components/documents/bilingual/)
- [`src/lib/contract-export-bilingual.ts`](../src/lib/contract-export-bilingual.ts)
