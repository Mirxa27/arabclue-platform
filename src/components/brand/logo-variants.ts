/**
 * Arabclue logo variant definitions — SVG path data, size maps, and wordmark
 * constants. All colors are sourced from [`designTokens`](src/lib/design-tokens.ts)
 * so the logo never hardcodes a palette value in application code.
 */

import { designTokens } from "@/lib/design-tokens";
import type { Locale } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogoVariant =
  | "header"
  | "footer"
  | "favicon"
  | "loading"
  | "print";

export type LogoDisplayMode = "cycle" | "unified" | "static-ar" | "static-en";

export type LogoSize = "xs" | "sm" | "md" | "lg" | "xl";

export type LogoIconStyle = "filled" | "outlined";

export interface LogoSizeConfig {
  /** Pixel height of the icon mark. */
  iconHeight: number;
  /** Pixel font-size of the wordmark text. */
  wordmarkFontSize: number;
  /** Pixel gap between icon and wordmark. */
  gap: number;
}

// ---------------------------------------------------------------------------
// SVG path data — geometric Arabclue mark (160×160 viewBox)
// ---------------------------------------------------------------------------

/**
 * Icon mark combines:
 *  - Magnifier lens — intelligence / discovery
 *  - Arch / dome — Saudi architectural heritage
 *  - Keyhole — procurement access / unlock
 */
export const LOGO_ICON_VIEWBOX = 160;

/**
 * Mark origin in viewBox space. Paths are authored in absolute coordinates
 * (no `<g transform>`) so CSS `transform` rules can never collapse the mark.
 */
export const LOGO_ICON_ORIGIN = Object.freeze({ x: 80, y: 72 });

/** Arch + lens outline — absolute viewBox coordinates. */
export const LOGO_ICON_PATH_FILLED =
  "M 80 30 C 98 30, 118 50, 118 78 A 38 38 0 1 1 42 78 C 42 50, 62 30, 80 30 Z";

/** Magnifier handle — absolute path form. */
export const LOGO_ICON_PATH_HANDLE = "M 107 105 L 123 121";

/** Keyhole circle inside the lens (absolute). */
export const LOGO_ICON_PATH_KEYHOLE_CIRCLE =
  "M 80 72 m -9.5 0 a 9.5 9.5 0 1 0 19 0 a 9.5 9.5 0 1 0 -19 0";

/** Keyhole slot — trapezoid below the circle (absolute). */
export const LOGO_ICON_PATH_KEYHOLE_SLOT =
  "M 74.5 72 L 85.5 72 L 87.5 90 L 72.5 90 Z";

/**
 * Approximate path lengths for stroke-dasharray draw-on-mount.
 * Over-estimated so the animation never truncates.
 */
export const LOGO_ICON_ARCH_PATH_LENGTH = 260;
export const LOGO_ICON_HANDLE_PATH_LENGTH = 32;

/** Handle line endpoints (shared by React SVG + static SVG exporters). */
export const LOGO_ICON_HANDLE_LINE = Object.freeze({
  x1: 107,
  y1: 105,
  x2: 123,
  y2: 121,
});

/** Keyhole circle center + radius. */
export const LOGO_ICON_KEYHOLE_CIRCLE = Object.freeze({
  cx: 80,
  cy: 72,
  r: 9.5,
});

// ---------------------------------------------------------------------------
// Size configuration
// ---------------------------------------------------------------------------

export const LOGO_SIZES: Readonly<Record<LogoSize, LogoSizeConfig>> =
  Object.freeze({
    xs: { iconHeight: 16, wordmarkFontSize: 13, gap: 4 },
    sm: { iconHeight: 24, wordmarkFontSize: 15, gap: 6 },
    md: { iconHeight: 36, wordmarkFontSize: 18, gap: 8 },
    lg: { iconHeight: 48, wordmarkFontSize: 24, gap: 10 },
    xl: { iconHeight: 80, wordmarkFontSize: 36, gap: 14 },
  });

export const LOGO_VARIANT_DEFAULT_SIZE: Readonly<
  Record<LogoVariant, LogoSize>
> = Object.freeze({
  header: "md",
  footer: "sm",
  favicon: "xs",
  loading: "xl",
  print: "md",
});

export const LOGO_VARIANT_DEFAULT_DISPLAY: Readonly<
  Record<LogoVariant, LogoDisplayMode>
> = Object.freeze({
  header: "cycle",
  footer: "static-en",
  favicon: "static-en",
  loading: "unified",
  print: "static-en",
});

// ---------------------------------------------------------------------------
// Colors — derived from design tokens (never hardcoded in components)
// ---------------------------------------------------------------------------

export const LOGO_COLORS = Object.freeze({
  primary: designTokens.colors.primary[600],
  primaryLight: designTokens.colors.primary[400],
  primaryDark: designTokens.colors.primary[800],
  accent: designTokens.colors.accent[600],
  accentLight: designTokens.colors.accent[400],
  accentDark: designTokens.colors.accent[800],
  neutralDark: designTokens.colors.neutral[900],
  neutralMid: designTokens.colors.neutral[800],
  neutralLight: designTokens.colors.neutral[100],
  neutral200: designTokens.colors.neutral[200],
  neutral400: designTokens.colors.neutral[400],
  neutral600: designTokens.colors.neutral[600],
  success: designTokens.colors.semantic.success,
  textPrimary: designTokens.colors.neutral[900],
  textInverse: designTokens.colors.neutral[50],
});

export const LOGO_SQUIRCLE_RADIUS = 36;

// ---------------------------------------------------------------------------
// Wordmark text
// ---------------------------------------------------------------------------

export const LOGO_WORDMARK: Readonly<Record<Locale, string>> = Object.freeze({
  ar: "عربكلو",
  en: "Arabclue",
});

/**
 * Unified lockup: Latin "Arab" + Arabic "دليل" (clue / guide) as one mark.
 */
export const LOGO_UNIFIED_LOCKUP = Object.freeze({
  englishPart: "Arab",
  arabicPart: "دليل",
});

export const LOGO_FONT_FAMILIES = Object.freeze({
  arabic: designTokens.typography.fontFamilies.arabic,
  english: designTokens.typography.fontFamilies.english,
});

export const LOGO_LETTER_SPACING = Object.freeze({
  normal: designTokens.typography.letterSpacing.normal,
  wide: designTokens.typography.letterSpacing.wide,
  wider: designTokens.typography.letterSpacing.wider,
});

export const LOGO_TRANSITIONS = Object.freeze({
  fast: designTokens.effects.transitions.fast,
  base: designTokens.effects.transitions.base,
  slow: designTokens.effects.transitions.slow,
  slower: designTokens.effects.transitions.slower,
});

export const LOGO_SPACING = Object.freeze({
  0: designTokens.spacing[0],
  1: designTokens.spacing[1],
  2: designTokens.spacing[2],
  3: designTokens.spacing[3],
  4: designTokens.spacing[4],
});

/** Cycle mode: how long each language is shown. */
export const LOGO_CYCLE_INTERVAL_MS = 3000;

export const LOGO_ENTRANCE_DURATION_MS = Object.freeze({
  min: 800,
  max: 1200,
});

/** Matches `FADE_UP` easing from [`animation.ts`](src/lib/animation.ts). */
export const LOGO_EASING = "cubic-bezier(0.22, 1, 0.36, 1)" as const;

export const LOGO_HOVER = Object.freeze({
  scale: 1.03,
  rotationDeg: 7,
  letterSpacing: designTokens.typography.letterSpacing.wide,
});

export const LOGO_LOADING_PULSE = Object.freeze({
  minScale: 0.96,
  maxScale: 1.04,
  durationMs: 1600,
});

/**
 * Build a static SVG document string for favicon / public asset export.
 * Colors are snapshotted from design tokens at build time.
 */
export function buildStaticLogoSvg(options?: {
  idPrefix?: string;
  monochrome?: boolean;
}): string {
  const prefix = options?.idPrefix ?? "ac-logo";
  const mono = Boolean(options?.monochrome);
  const bg0 = mono ? LOGO_COLORS.neutralLight : LOGO_COLORS.neutralMid;
  const bg1 = mono ? LOGO_COLORS.neutral200 : LOGO_COLORS.neutralDark;
  const primary0 = LOGO_COLORS.primaryLight;
  const primary1 = LOGO_COLORS.primary;
  const primary2 = LOGO_COLORS.primaryDark;
  const gold0 = LOGO_COLORS.accentLight;
  const gold1 = LOGO_COLORS.accent;
  const gold2 = LOGO_COLORS.accentDark;
  const stroke = mono ? LOGO_COLORS.neutralDark : `url(#${prefix}-primary)`;
  const fill = mono ? LOGO_COLORS.neutralDark : `url(#${prefix}-gold)`;
  const bg = mono ? LOGO_COLORS.neutralLight : `url(#${prefix}-bg)`;
  const { x1, y1, x2, y2 } = LOGO_ICON_HANDLE_LINE;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_ICON_VIEWBOX} ${LOGO_ICON_VIEWBOX}" fill="none" role="img" aria-label="Arabclue">
  <defs>
    <linearGradient id="${prefix}-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bg0}"/>
      <stop offset="100%" stop-color="${bg1}"/>
    </linearGradient>
    <linearGradient id="${prefix}-primary" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${primary0}"/>
      <stop offset="50%" stop-color="${primary1}"/>
      <stop offset="100%" stop-color="${primary2}"/>
    </linearGradient>
    <linearGradient id="${prefix}-gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${gold0}"/>
      <stop offset="50%" stop-color="${gold1}"/>
      <stop offset="100%" stop-color="${gold2}"/>
    </linearGradient>
  </defs>
  <rect width="${LOGO_ICON_VIEWBOX}" height="${LOGO_ICON_VIEWBOX}" rx="${LOGO_SQUIRCLE_RADIUS}" fill="${bg}" stroke="rgba(255,255,255,0.1)" stroke-width="1.5"/>
  <path d="${LOGO_ICON_PATH_FILLED}" fill="none" stroke="${stroke}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="7.5" stroke-linecap="round"/>
  <circle cx="${LOGO_ICON_KEYHOLE_CIRCLE.cx}" cy="${LOGO_ICON_KEYHOLE_CIRCLE.cy}" r="${LOGO_ICON_KEYHOLE_CIRCLE.r}" fill="${fill}"/>
  <path d="${LOGO_ICON_PATH_KEYHOLE_SLOT}" fill="${fill}"/>
</svg>
`;
}
