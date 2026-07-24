/**
 * Typography Utilities Tests
 * 
 * Tests for typography.ts functionality
 */

import { describe, test, expect } from "bun:test";
import {
  getGoogleFontsUrl,
  getFontStack,
  formatNumber,
  formatCurrency,
  formatDate,
  formatPercentage,
  getTextDirection,
  getAlignmentForLocale,
  getTextAlign,
  toEasternArabicNumerals,
  toWesternArabicNumerals,
  truncateText,
  formatFileSize,
} from "../typography";

describe("Typography Utilities", () => {
  describe("Font Management", () => {
    test("should generate Google Fonts URL", () => {
      const url = getGoogleFontsUrl(["IBM Plex Sans Arabic", "Space Grotesk"]);
      
      expect(url).toContain("fonts.googleapis.com");
      expect(url).toContain("IBM+Plex+Sans+Arabic");
      expect(url).toContain("Space+Grotesk");
      expect(url).toContain("display=swap");
    });

    test("should include default Arabic font", () => {
      const url = getGoogleFontsUrl([]);
      
      expect(url).toContain("IBM+Plex+Sans+Arabic");
    });

    test("should get font stack for Arabic", () => {
      const stack = getFontStack("ar");
      
      expect(stack).toContain("IBM Plex Sans Arabic");
      expect(stack).toContain("Cairo");
      expect(stack).toContain("sans-serif");
    });

    test("should get font stack for English", () => {
      const stack = getFontStack("en");
      
      expect(stack).toContain("Space Grotesk");
      expect(stack).toContain("Inter");
      expect(stack).toContain("sans-serif");
    });

    test("should prepend custom font to stack", () => {
      const stack = getFontStack("ar", "Cairo");

      expect(stack).toContain("Cairo");
      expect(stack).toContain("IBM Plex Sans Arabic");
    });
  });

  describe("Number Formatting", () => {
    test("should format number in Arabic with Eastern numerals", () => {
      const formatted = formatNumber(1234.56, "ar");
      
      // Should contain Eastern Arabic numerals
      expect(formatted).toMatch(/[٠-٩]/);
    });

    test("should format number in English with Western numerals", () => {
      const formatted = formatNumber(1234.56, "en");
      
      expect(formatted).toContain("1,234");
      expect(formatted).toContain(".");
    });

    test("should respect custom format options", () => {
      const formatted = formatNumber(1234.5678, "en", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      
      expect(formatted).toBe("1,234.57");
    });
  });

  describe("Currency Formatting", () => {
    test("should format SAR currency in Arabic", () => {
      const formatted = formatCurrency(1000000, "SAR", "ar");
      
      expect(formatted).toMatch(/[٠-٩]/); // Eastern numerals
      expect(formatted).toContain("ر.س"); // SAR symbol in Arabic
    });

    test("should format SAR currency in English", () => {
      const formatted = formatCurrency(1000000, "SAR", "en");
      
      expect(formatted).toContain("SAR");
      expect(formatted).toContain("1,000,000");
    });

    test("should format USD currency", () => {
      const formatted = formatCurrency(5000.50, "USD", "en");
      
      expect(formatted).toContain("5,000.50");
    });

    test("should handle negative amounts", () => {
      const formatted = formatCurrency(-500, "SAR", "en");
      
      expect(formatted).toContain("-");
      expect(formatted).toContain("500");
    });
  });

  describe("Date Formatting", () => {
    test("should format date in Arabic", () => {
      const date = new Date("2026-07-24");
      const formatted = formatDate(date, "ar", "long");
      
      // Should contain Eastern Arabic numerals
      expect(formatted).toMatch(/[٠-٩]/);
    });

    test("should format date in English", () => {
      const date = new Date("2026-07-24");
      const formatted = formatDate(date, "en", "long");
      
      expect(formatted).toContain("2026");
      expect(formatted).toContain("24");
    });

    test("should respect different format styles", () => {
      const date = new Date("2026-07-24");
      
      const short = formatDate(date, "en", "short");
      const medium = formatDate(date, "en", "medium");
      const long = formatDate(date, "en", "long");
      
      expect(short.length).toBeLessThan(medium.length);
      expect(medium.length).toBeLessThan(long.length);
    });
  });

  describe("Percentage Formatting", () => {
    test("should format percentage in Arabic", () => {
      const formatted = formatPercentage(0.8537, "ar", 2);
      
      expect(formatted).toMatch(/[٠-٩]/);
      expect(formatted).toContain("٪"); // Arabic percent sign
    });

    test("should format percentage in English", () => {
      const formatted = formatPercentage(0.8537, "en", 2);
      
      expect(formatted).toContain("85.37%");
    });

    test("should respect decimal places", () => {
      const formatted1 = formatPercentage(0.8537, "en", 0);
      const formatted2 = formatPercentage(0.8537, "en", 3);
      
      expect(formatted1).toContain("85%");
      expect(formatted2).toContain("85.370%");
    });
  });

  describe("Text Direction & Alignment", () => {
    test("should get RTL direction for Arabic", () => {
      expect(getTextDirection("ar")).toBe("rtl");
    });

    test("should get LTR direction for English", () => {
      expect(getTextDirection("en")).toBe("ltr");
    });

    test("should get right alignment for Arabic", () => {
      expect(getAlignmentForLocale("ar")).toBe("right");
    });

    test("should get left alignment for English", () => {
      expect(getAlignmentForLocale("en")).toBe("left");
    });

    test("should get correct text-align for start position", () => {
      expect(getTextAlign("ar", "start")).toBe("right");
      expect(getTextAlign("en", "start")).toBe("left");
    });

    test("should get correct text-align for end position", () => {
      expect(getTextAlign("ar", "end")).toBe("left");
      expect(getTextAlign("en", "end")).toBe("right");
    });

    test("should return center for center position", () => {
      expect(getTextAlign("ar", "center")).toBe("center");
      expect(getTextAlign("en", "center")).toBe("center");
    });
  });

  describe("Numeral Conversion", () => {
    test("should convert Western to Eastern Arabic numerals", () => {
      const converted = toEasternArabicNumerals("2026-07-24");
      
      expect(converted).toBe("٢٠٢٦-٠٧-٢٤");
    });

    test("should convert Eastern to Western Arabic numerals", () => {
      const converted = toWesternArabicNumerals("٢٠٢٦-٠٧-٢٤");
      
      expect(converted).toBe("2026-07-24");
    });

    test("should handle mixed text and numbers", () => {
      const converted = toEasternArabicNumerals("Project 2026 - Phase 1");
      
      expect(converted).toContain("٢٠٢٦");
      expect(converted).toContain("١");
      expect(converted).toContain("Project");
    });

    test("should preserve non-numeric characters", () => {
      const original = "Test-123/456";
      const eastern = toEasternArabicNumerals(original);
      const western = toWesternArabicNumerals(eastern);
      
      expect(western).toBe(original);
    });
  });

  describe("Text Utilities", () => {
    test("should truncate long text", () => {
      const text = "This is a very long text that needs to be truncated";
      const truncated = truncateText(text, 20);
      
      expect(truncated.length).toBe(20);
      expect(truncated).toContain("...");
    });

    test("should not truncate short text", () => {
      const text = "Short text";
      const truncated = truncateText(text, 20);
      
      expect(truncated).toBe(text);
    });

    test("should use custom ellipsis", () => {
      const text = "Long text here";
      const truncated = truncateText(text, 10, "…");
      
      expect(truncated).toContain("…");
      expect(truncated).not.toContain("...");
    });
  });

  describe("File Size Formatting", () => {
    test("should format bytes in English", () => {
      expect(formatFileSize(500, "en")).toContain("500");
      expect(formatFileSize(500, "en")).toContain("B");
    });

    test("should format kilobytes in English", () => {
      const formatted = formatFileSize(1024 * 50, "en");
      
      expect(formatted).toContain("50");
      expect(formatted).toContain("KB");
    });

    test("should format megabytes in English", () => {
      const formatted = formatFileSize(1024 * 1024 * 5, "en");
      
      expect(formatted).toContain("5");
      expect(formatted).toContain("MB");
    });

    test("should format gigabytes in English", () => {
      const formatted = formatFileSize(1024 * 1024 * 1024 * 2, "en");
      
      expect(formatted).toContain("2");
      expect(formatted).toContain("GB");
    });

    test("should format with Eastern numerals in Arabic", () => {
      const formatted = formatFileSize(1024 * 1024, "ar");
      
      expect(formatted).toMatch(/[٠-٩]/);
      expect(formatted).toContain("م.ب"); // MB in Arabic
    });

    test("should include decimal places for larger units", () => {
      const formatted = formatFileSize(1024 * 1024 * 1.5, "en");
      
      expect(formatted).toContain("1.50");
      expect(formatted).toContain("MB");
    });
  });
});
