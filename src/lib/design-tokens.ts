/**
 * Universal Design Token System for Arabclue Document Generation
 * 
 * Provides a complete, type-safe design token system for consistent styling
 * across all generated documents (proposals, contracts, reports).
 * 
 * Features:
 * - Complete color scales with semantic colors
 * - Typography system (fonts, sizes, weights, line heights)
 * - Spacing scale (8px base unit)
 * - Layout system (breakpoints, containers)
 * - Effects (shadows, borders, transitions)
 * - Brand override support
 * - CSS variable export
 * 
 * @see plans/2026-07-24-document-generation-architecture-design-part2.md Section 5
 */

import type { BrandProfile } from "@prisma/client";
import {
  normalizeBrandForDocument,
  normalizeDocumentBrandFont,
} from "./brand-policy";

// ============================================================================
// Type Definitions
// ============================================================================

export interface ColorScale {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string; // Base color
  600: string;
  700: string;
  800: string;
  900: string;
}

export interface SemanticColors {
  success: string;
  warning: string;
  error: string;
  info: string;
}

export interface ColorTokens {
  primary: ColorScale;
  secondary: ColorScale;
  accent: ColorScale;
  neutral: ColorScale;
  semantic: SemanticColors;
}

export interface FontFamilies {
  arabic: string;
  english: string;
  mono: string;
}

export interface FontSizes {
  xs: string;
  sm: string;
  base: string;
  lg: string;
  xl: string;
  "2xl": string;
  "3xl": string;
  "4xl": string;
  "5xl": string;
}

export interface FontWeights {
  normal: number;
  medium: number;
  semibold: number;
  bold: number;
  extrabold: number;
}

export interface LineHeights {
  tight: number;
  snug: number;
  normal: number;
  relaxed: number;
  loose: number;
}

export interface LetterSpacing {
  tighter: string;
  tight: string;
  normal: string;
  wide: string;
  wider: string;
  widest: string;
}

export interface TypographyTokens {
  fontFamilies: FontFamilies;
  fontSizes: FontSizes;
  fontWeights: FontWeights;
  lineHeights: LineHeights;
  letterSpacing: LetterSpacing;
}

export interface SpacingTokens {
  0: string;
  1: string;
  2: string;
  3: string;
  4: string;
  5: string;
  6: string;
  8: string;
  10: string;
  12: string;
  16: string;
  20: string;
  24: string;
  32: string;
}

export interface Breakpoints {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  "2xl": string;
}

export interface ContainerSizes {
  sm: string;
  md: string;
  lg: string;
  xl: string;
}

export interface ColumnConfig {
  1: string;
  2: string;
  3: string;
  4: string;
  6: string;
  12: string;
}

export interface LayoutTokens {
  breakpoints: Breakpoints;
  containers: ContainerSizes;
  columns: ColumnConfig;
}

export interface Shadows {
  sm: string;
  base: string;
  md: string;
  lg: string;
  xl: string;
  "2xl": string;
}

export interface Borders {
  none: string;
  thin: string;
  base: string;
  thick: string;
}

export interface BorderRadius {
  none: string;
  sm: string;
  base: string;
  md: string;
  lg: string;
  full: string;
}

export interface Transitions {
  fast: string;
  base: string;
  slow: string;
  slower: string;
}

export interface EffectTokens {
  shadows: Shadows;
  borders: Borders;
  borderRadius: BorderRadius;
  transitions: Transitions;
}

export interface DesignTokens {
  colors: ColorTokens;
  typography: TypographyTokens;
  spacing: SpacingTokens;
  layout: LayoutTokens;
  effects: EffectTokens;
}

// ============================================================================
// Default Design Tokens
// ============================================================================

/**
 * Arabclue default design tokens
 * Based on Saudi design sensibilities with professional, modern aesthetics
 */
export const designTokens: DesignTokens = {
  colors: {
    primary: {
      50: "#F0FDFA",
      100: "#CCFBF1",
      200: "#99F6E4",
      300: "#5EEAD4",
      400: "#2DD4BF",
      500: "#14B8A6", // Base teal
      600: "#0D9488",
      700: "#0F766E",
      800: "#115E59",
      900: "#134E4A",
    },
    secondary: {
      50: "#F8FAFC",
      100: "#F1F5F9",
      200: "#E2E8F0",
      300: "#CBD5E1",
      400: "#94A3B8",
      500: "#64748B",
      600: "#475569",
      700: "#334155",
      800: "#1E293B",
      900: "#0F172A", // Base slate
    },
    accent: {
      50: "#FFFBEB",
      100: "#FEF3C7",
      200: "#FDE68A",
      300: "#FCD34D",
      400: "#FBBF24",
      500: "#F59E0B",
      600: "#D97706", // Base Saudi gold
      700: "#B45309",
      800: "#92400E",
      900: "#78350F",
    },
    neutral: {
      50: "#FAFAFA",
      100: "#F5F5F5",
      200: "#E5E5E5",
      300: "#D4D4D4",
      400: "#A3A3A3",
      500: "#737373",
      600: "#525252",
      700: "#404040",
      800: "#262626",
      900: "#171717",
    },
    semantic: {
      success: "#059669",
      warning: "#D97706",
      error: "#DC2626",
      info: "#0EA5E9",
    },
  },

  typography: {
    fontFamilies: {
      arabic: "'IBM Plex Sans Arabic', 'Cairo', 'Tajawal', sans-serif",
      english: "'Space Grotesk', 'Inter', 'IBM Plex Sans', sans-serif",
      mono: "'JetBrains Mono', 'Fira Code', monospace",
    },
    fontSizes: {
      xs: "0.75rem", // 12px
      sm: "0.875rem", // 14px
      base: "1rem", // 16px
      lg: "1.125rem", // 18px
      xl: "1.25rem", // 20px
      "2xl": "1.5rem", // 24px
      "3xl": "1.875rem", // 30px
      "4xl": "2.25rem", // 36px
      "5xl": "3rem", // 48px
    },
    fontWeights: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
    },
    lineHeights: {
      tight: 1.25,
      snug: 1.375,
      normal: 1.5,
      relaxed: 1.625,
      loose: 2,
    },
    letterSpacing: {
      tighter: "-0.05em",
      tight: "-0.025em",
      normal: "0",
      wide: "0.025em",
      wider: "0.05em",
      widest: "0.1em",
    },
  },

  spacing: {
    0: "0",
    1: "0.25rem", // 4px
    2: "0.5rem", // 8px
    3: "0.75rem", // 12px
    4: "1rem", // 16px
    5: "1.25rem", // 20px
    6: "1.5rem", // 24px
    8: "2rem", // 32px
    10: "2.5rem", // 40px
    12: "3rem", // 48px
    16: "4rem", // 64px
    20: "5rem", // 80px
    24: "6rem", // 96px
    32: "8rem", // 128px
  },

  layout: {
    breakpoints: {
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    containers: {
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
    },
    columns: {
      1: "100%",
      2: "50%",
      3: "33.333%",
      4: "25%",
      6: "16.667%",
      12: "8.333%",
    },
  },

  effects: {
    shadows: {
      sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
      base: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
      md: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
      lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
      xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
      "2xl": "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
    },
    borders: {
      none: "0",
      thin: "1px",
      base: "2px",
      thick: "4px",
    },
    borderRadius: {
      none: "0",
      sm: "0.25rem", // 4px
      base: "0.5rem", // 8px
      md: "0.75rem", // 12px
      lg: "1rem", // 16px
      full: "9999px",
    },
    transitions: {
      fast: "150ms",
      base: "200ms",
      slow: "300ms",
      slower: "500ms",
    },
  },
};

// ============================================================================
// CSS Variable Generation
// ============================================================================

/**
 * Generate CSS custom properties from design tokens
 * 
 * @param tokens - Design tokens to convert
 * @returns CSS string with :root selector and custom properties
 * 
 * @example
 * ```typescript
 * const css = generateCSSVariables(designTokens);
 * // Returns: ":root { --color-primary-500: #14B8A6; ... }"
 * ```
 */
export function generateCSSVariables(tokens: DesignTokens): string {
  const lines: string[] = [":root {"];

  // Colors
  Object.entries(tokens.colors.primary).forEach(([key, value]) => {
    lines.push(`  --color-primary-${key}: ${value};`);
  });
  Object.entries(tokens.colors.secondary).forEach(([key, value]) => {
    lines.push(`  --color-secondary-${key}: ${value};`);
  });
  Object.entries(tokens.colors.accent).forEach(([key, value]) => {
    lines.push(`  --color-accent-${key}: ${value};`);
  });
  Object.entries(tokens.colors.neutral).forEach(([key, value]) => {
    lines.push(`  --color-neutral-${key}: ${value};`);
  });
  Object.entries(tokens.colors.semantic).forEach(([key, value]) => {
    lines.push(`  --color-${key}: ${value};`);
  });

  // Typography
  lines.push(`  --font-ar: ${tokens.typography.fontFamilies.arabic};`);
  lines.push(`  --font-en: ${tokens.typography.fontFamilies.english};`);
  lines.push(`  --font-mono: ${tokens.typography.fontFamilies.mono};`);

  Object.entries(tokens.typography.fontSizes).forEach(([key, value]) => {
    lines.push(`  --text-${key}: ${value};`);
  });
  Object.entries(tokens.typography.fontWeights).forEach(([key, value]) => {
    lines.push(`  --font-${key}: ${value};`);
  });
  Object.entries(tokens.typography.lineHeights).forEach(([key, value]) => {
    lines.push(`  --leading-${key}: ${value};`);
  });
  Object.entries(tokens.typography.letterSpacing).forEach(([key, value]) => {
    lines.push(`  --tracking-${key}: ${value};`);
  });

  // Spacing
  Object.entries(tokens.spacing).forEach(([key, value]) => {
    lines.push(`  --space-${key}: ${value};`);
  });

  // Effects
  Object.entries(tokens.effects.shadows).forEach(([key, value]) => {
    lines.push(`  --shadow-${key}: ${value};`);
  });
  Object.entries(tokens.effects.borderRadius).forEach(([key, value]) => {
    lines.push(`  --radius-${key}: ${value};`);
  });
  Object.entries(tokens.effects.transitions).forEach(([key, value]) => {
    lines.push(`  --transition-${key}: ${value};`);
  });

  lines.push("}");
  return lines.join("\n");
}

// ============================================================================
// Brand Override System
// ============================================================================

/**
 * Apply brand-specific overrides to design tokens
 * 
 * Merges custom brand colors and fonts from BrandProfile into the base tokens
 * while preserving all other token values.
 * 
 * @param tokens - Base design tokens
 * @param brand - Brand profile with custom colors/fonts
 * @returns New token object with brand overrides applied
 * 
 * @example
 * ```typescript
 * const brandedTokens = applyBrandOverrides(designTokens, brandProfile);
 * // Primary color scales are adjusted based on brand.primaryColor
 * ```
 */
export function applyBrandOverrides(
  tokens: DesignTokens,
  brand: BrandProfile | null
): DesignTokens {
  if (!brand) return tokens;

  const overridden: DesignTokens = JSON.parse(JSON.stringify(tokens));
  const normalized = normalizeBrandForDocument(brand);
  if (!normalized) return tokens;

  // Override primary color if brand provides one
  if (brand.primaryColor && normalized.primaryColor) {
    overridden.colors.primary[600] = normalized.primaryColor;
    // Optionally generate lighter/darker variants (simplified approach)
    overridden.colors.primary[500] = normalized.primaryColor;
  }

  // Override secondary color
  if (brand.secondaryColor && normalized.secondaryColor) {
    overridden.colors.secondary[900] = normalized.secondaryColor;
    overridden.colors.secondary[800] = normalized.secondaryColor;
  }

  // Override accent color
  if (brand.accentColor && normalized.accentColor) {
    overridden.colors.accent[600] = normalized.accentColor;
    overridden.colors.accent[500] = normalized.accentColor;
  }

  // Override font family
  if (brand.fontFamily && normalized.fontFamily) {
    const customFont = `'${normalizeDocumentBrandFont(normalized.fontFamily)}', ${tokens.typography.fontFamilies.arabic}`;
    overridden.typography.fontFamilies.arabic = customFont;
    overridden.typography.fontFamilies.english = customFont;
  }

  return overridden;
}

/**
 * Generate inline CSS custom properties for brand-specific overrides
 * 
 * Useful for applying brand colors to individual documents without
 * affecting global styles.
 * 
 * @param brand - Brand profile with custom colors
 * @returns CSS string with custom property declarations
 * 
 * @example
 * ```typescript
 * const style = generateBrandCSSOverrides(brand);
 * // <div style="${style}">...</div>
 * ```
 */
export function generateBrandCSSOverrides(brand: BrandProfile | null): string {
  if (!brand) return "";

  const overrides: string[] = [];
  const normalized = normalizeBrandForDocument(brand);
  if (!normalized) return "";

  if (brand.primaryColor && normalized.primaryColor) {
    overrides.push(`--color-primary-500: ${normalized.primaryColor}`);
    overrides.push(`--color-primary-600: ${normalized.primaryColor}`);
  }

  if (brand.secondaryColor && normalized.secondaryColor) {
    overrides.push(`--color-secondary-800: ${normalized.secondaryColor}`);
    overrides.push(`--color-secondary-900: ${normalized.secondaryColor}`);
  }

  if (brand.accentColor && normalized.accentColor) {
    overrides.push(`--color-accent-500: ${normalized.accentColor}`);
    overrides.push(`--color-accent-600: ${normalized.accentColor}`);
  }

  return overrides.join("; ");
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get a specific token value by path
 * 
 * @param tokens - Design tokens object
 * @param path - Dot-notation path to token (e.g., "colors.primary.500")
 * @returns Token value or undefined if not found
 * 
 * @example
 * ```typescript
 * getToken(designTokens, "colors.primary.500") // => "#14B8A6"
 * getToken(designTokens, "spacing.4") // => "1rem"
 * ```
 */
export function getToken(tokens: DesignTokens, path: string): string | number | undefined {
  const parts = path.split(".");
  let current: any = tokens;

  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }

  return current;
}

/**
 * Create a scoped version of tokens with a prefix
 * 
 * Useful for creating isolated design systems or theme variants
 * 
 * @param tokens - Base design tokens
 * @param prefix - Prefix for all CSS variables
 * @returns CSS string with prefixed custom properties
 */
export function generateScopedCSSVariables(
  tokens: DesignTokens,
  prefix: string
): string {
  const css = generateCSSVariables(tokens);
  return css.replace(/--/g, `--${prefix}-`);
}
