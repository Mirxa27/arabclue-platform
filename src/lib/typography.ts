/**
 * Typography Utilities for Document Generation
 * 
 * Provides utilities for:
 * - Font loading and management
 * - Text formatting (numbers, currency, dates)
 * - Locale-aware text direction and alignment
 * - Font stack generation
 * 
 * @see plans/2026-07-24-document-generation-architecture-design-part2.md
 */

import type { BrandProfile } from "@prisma/client";

export type Locale = "ar" | "en";

// ============================================================================
// Font Management
// ============================================================================

/**
 * Generate Google Fonts URL for specified fonts
 * 
 * @param fonts - Array of font family names
 * @returns Google Fonts API URL with display=swap
 * 
 * @example
 * ```typescript
 * getGoogleFontsUrl(["IBM Plex Sans Arabic", "Space Grotesk"])
 * // => "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Space+Grotesk:wght@400;600;700&display=swap"
 * ```
 */
export function getGoogleFontsUrl(fonts: string[]): string {
  const fontFamilies = new Set<string>();

  // Always include IBM Plex Sans Arabic (default Arabic font)
  fontFamilies.add("IBM+Plex+Sans+Arabic:wght@400;500;600;700");

  // Map font names to Google Fonts format
  for (const font of fonts) {
    const normalized = font.trim();
    if (normalized === "Space Grotesk") {
      fontFamilies.add("Space+Grotesk:wght@400;600;700");
    } else if (normalized === "Cairo") {
      fontFamilies.add("Cairo:wght@400;600;700");
    } else if (normalized === "Tajawal") {
      fontFamilies.add("Tajawal:wght@400;500;700");
    } else if (normalized === "Inter") {
      fontFamilies.add("Inter:wght@400;500;600;700");
    } else if (normalized === "IBM Plex Sans") {
      fontFamilies.add("IBM+Plex+Sans:wght@400;500;600;700");
    }
  }

  const families = Array.from(fontFamilies).map((f) => `family=${f}`).join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

/**
 * Get complete font stack for a locale
 * 
 * Returns a CSS font-family value with proper fallbacks
 * 
 * @param locale - Target locale ('ar' or 'en')
 * @param customFont - Optional custom font from brand profile
 * @returns CSS font-family string with fallbacks
 * 
 * @example
 * ```typescript
 * getFontStack("ar") // => "'IBM Plex Sans Arabic', 'Cairo', 'Tajawal', sans-serif"
 * getFontStack("en", "Space Grotesk") // => "'Space Grotesk', 'Inter', sans-serif"
 * ```
 */
export function getFontStack(locale: Locale, customFont?: string | null): string {
  const baseFonts = {
    ar: "'IBM Plex Sans Arabic', 'Cairo', 'Tajawal', sans-serif",
    en: "'Space Grotesk', 'Inter', 'IBM Plex Sans', sans-serif",
  };

  if (customFont && customFont.trim()) {
    const sanitized = customFont.replace(/'/g, "");
    return `'${sanitized}', ${baseFonts[locale]}`;
  }

  return baseFonts[locale];
}

/**
 * Generate font stack from brand profile
 * 
 * @param brand - Brand profile with optional custom font
 * @param locale - Target locale
 * @returns CSS font-family string
 */
export function getFontStackFromBrand(
  brand: BrandProfile | null,
  locale: Locale
): string {
  return getFontStack(locale, brand?.fontFamily);
}

// ============================================================================
// Text Formatting
// ============================================================================

/**
 * Format number according to locale
 * 
 * Handles Eastern Arabic numerals for Arabic locale
 * 
 * @param value - Number to format
 * @param locale - Target locale
 * @param options - Optional Intl.NumberFormat options
 * @returns Formatted number string
 * 
 * @example
 * ```typescript
 * formatNumber(1234.56, "ar") // => "١٬٢٣٤٫٥٦" (Eastern Arabic numerals)
 * formatNumber(1234.56, "en") // => "1,234.56"
 * ```
 */
export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions
): string {
  const localeCode = locale === "ar" ? "ar-SA" : "en-US";
  
  // Use Eastern Arabic numerals for Arabic locale
  const numberingSystem = locale === "ar" ? "arab" : "latn";
  
  return new Intl.NumberFormat(localeCode, {
    ...options,
    numberingSystem,
  }).format(value);
}

/**
 * Format currency according to locale
 * 
 * @param amount - Amount to format
 * @param currency - ISO 4217 currency code (e.g., "SAR", "USD")
 * @param locale - Target locale
 * @returns Formatted currency string
 * 
 * @example
 * ```typescript
 * formatCurrency(1000000, "SAR", "ar") // => "١٬٠٠٠٬٠٠٠٫٠٠ ر.س."
 * formatCurrency(1000000, "SAR", "en") // => "SAR 1,000,000.00"
 * ```
 */
export function formatCurrency(
  amount: number,
  currency: string,
  locale: Locale
): string {
  const localeCode = locale === "ar" ? "ar-SA" : "en-US";
  const numberingSystem = locale === "ar" ? "arab" : "latn";

  return new Intl.NumberFormat(localeCode, {
    style: "currency",
    currency: currency,
    numberingSystem,
  }).format(amount);
}

/**
 * Format date according to locale
 * 
 * @param date - Date to format
 * @param locale - Target locale
 * @param format - Optional format style ('short', 'medium', 'long', 'full')
 * @returns Formatted date string
 * 
 * @example
 * ```typescript
 * formatDate(new Date("2026-07-24"), "ar", "long")
 * // => "٢٤ يوليو ٢٠٢٦"
 * 
 * formatDate(new Date("2026-07-24"), "en", "long")
 * // => "July 24, 2026"
 * ```
 */
export function formatDate(
  date: Date,
  locale: Locale,
  format: "short" | "medium" | "long" | "full" = "medium"
): string {
  const localeCode = locale === "ar" ? "ar-SA" : "en-US";
  const calendar = locale === "ar" ? "gregory" : "gregory"; // Use Gregorian for both
  const numberingSystem = locale === "ar" ? "arab" : "latn";

  const options: Intl.DateTimeFormatOptions = {
    calendar,
    numberingSystem,
  };

  switch (format) {
    case "short":
      options.dateStyle = "short";
      break;
    case "medium":
      options.dateStyle = "medium";
      break;
    case "long":
      options.dateStyle = "long";
      break;
    case "full":
      options.dateStyle = "full";
      break;
  }

  return new Intl.DateTimeFormat(localeCode, options).format(date);
}

/**
 * Format percentage according to locale
 * 
 * @param value - Decimal value (e.g., 0.85 for 85%)
 * @param locale - Target locale
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string
 * 
 * @example
 * ```typescript
 * formatPercentage(0.8537, "ar", 2) // => "٪٨٥٫٣٧"
 * formatPercentage(0.8537, "en", 2) // => "85.37%"
 * ```
 */
export function formatPercentage(
  value: number,
  locale: Locale,
  decimals: number = 1
): string {
  const localeCode = locale === "ar" ? "ar-SA" : "en-US";
  const numberingSystem = locale === "ar" ? "arab" : "latn";

  return new Intl.NumberFormat(localeCode, {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    numberingSystem,
  }).format(value);
}

// ============================================================================
// Text Direction & Alignment
// ============================================================================

/**
 * Get text direction for locale
 * 
 * @param locale - Target locale
 * @returns 'rtl' for Arabic, 'ltr' for English
 * 
 * @example
 * ```typescript
 * getTextDirection("ar") // => "rtl"
 * getTextDirection("en") // => "ltr"
 * ```
 */
export function getTextDirection(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/**
 * Get appropriate text alignment for locale
 * 
 * Returns 'right' for Arabic (RTL), 'left' for English (LTR)
 * 
 * @param locale - Target locale
 * @returns 'right' or 'left'
 * 
 * @example
 * ```typescript
 * getAlignmentForLocale("ar") // => "right"
 * getAlignmentForLocale("en") // => "left"
 * ```
 */
export function getAlignmentForLocale(locale: Locale): "left" | "right" {
  return locale === "ar" ? "right" : "left";
}

/**
 * Get CSS text-align value for locale
 * 
 * Returns appropriate alignment considering text direction
 * 
 * @param locale - Target locale
 * @param position - Logical position ('start', 'end', 'center')
 * @returns CSS text-align value
 * 
 * @example
 * ```typescript
 * getTextAlign("ar", "start") // => "right"
 * getTextAlign("en", "start") // => "left"
 * getTextAlign("ar", "end") // => "left"
 * ```
 */
export function getTextAlign(
  locale: Locale,
  position: "start" | "end" | "center" = "start"
): "left" | "right" | "center" {
  if (position === "center") return "center";
  
  const isRtl = locale === "ar";
  
  if (position === "start") {
    return isRtl ? "right" : "left";
  } else {
    return isRtl ? "left" : "right";
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert Western Arabic numerals to Eastern Arabic numerals
 * 
 * @param text - Text containing Western numerals
 * @returns Text with Eastern Arabic numerals
 * 
 * @example
 * ```typescript
 * toEasternArabicNumerals("2026-07-24") // => "٢٠٢٦-٠٧-٢٤"
 * ```
 */
export function toEasternArabicNumerals(text: string): string {
  const westernToEastern: Record<string, string> = {
    "0": "٠",
    "1": "١",
    "2": "٢",
    "3": "٣",
    "4": "٤",
    "5": "٥",
    "6": "٦",
    "7": "٧",
    "8": "٨",
    "9": "٩",
  };

  return text.replace(/[0-9]/g, (digit) => westernToEastern[digit] || digit);
}

/**
 * Convert Eastern Arabic numerals to Western Arabic numerals
 * 
 * @param text - Text containing Eastern numerals
 * @returns Text with Western numerals
 * 
 * @example
 * ```typescript
 * toWesternArabicNumerals("٢٠٢٦-٠٧-٢٤") // => "2026-07-24"
 * ```
 */
export function toWesternArabicNumerals(text: string): string {
  const easternToWestern: Record<string, string> = {
    "٠": "0",
    "١": "1",
    "٢": "2",
    "٣": "3",
    "٤": "4",
    "٥": "5",
    "٦": "6",
    "٧": "7",
    "٨": "8",
    "٩": "9",
  };

  return text.replace(/[٠-٩]/g, (digit) => easternToWestern[digit] || digit);
}

/**
 * Truncate text with ellipsis
 * 
 * @param text - Text to truncate
 * @param maxLength - Maximum character length
 * @param ellipsis - Ellipsis character (default: "...")
 * @returns Truncated text
 * 
 * @example
 * ```typescript
 * truncateText("Long text here", 10) // => "Long te..."
 * ```
 */
export function truncateText(
  text: string,
  maxLength: number,
  ellipsis: string = "..."
): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * Format file size in human-readable format
 * 
 * @param bytes - File size in bytes
 * @param locale - Target locale
 * @returns Formatted file size string
 * 
 * @example
 * ```typescript
 * formatFileSize(1024000, "en") // => "1.02 MB"
 * formatFileSize(1024000, "ar") // => "١٫٠٢ م.ب"
 * ```
 */
export function formatFileSize(bytes: number, locale: Locale): string {
  const units = locale === "ar" 
    ? ["بايت", "ك.ب", "م.ب", "ج.ب", "ت.ب"]
    : ["B", "KB", "MB", "GB", "TB"];

  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  const formatted = formatNumber(size, locale, {
    minimumFractionDigits: unitIndex === 0 ? 0 : 2,
    maximumFractionDigits: unitIndex === 0 ? 0 : 2,
  });

  return `${formatted} ${units[unitIndex]}`;
}
