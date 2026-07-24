/**
 * Design Token System Tests
 * 
 * Tests for design-tokens.ts functionality
 */

import { describe, test, expect } from "bun:test";
import {
  designTokens,
  generateCSSVariables,
  applyBrandOverrides,
  generateBrandCSSOverrides,
  getToken,
  generateScopedCSSVariables,
  type DesignTokens,
} from "../design-tokens";
import type { BrandProfile } from "@prisma/client";

describe("Design Tokens", () => {
  describe("Token Structure", () => {
    test("should have complete color scales", () => {
      expect(designTokens.colors.primary).toBeDefined();
      expect(designTokens.colors.primary[50]).toBe("#F0FDFA");
      expect(designTokens.colors.primary[500]).toBe("#14B8A6");
      expect(designTokens.colors.primary[900]).toBe("#134E4A");
    });

    test("should have semantic colors", () => {
      expect(designTokens.colors.semantic.success).toBe("#059669");
      expect(designTokens.colors.semantic.warning).toBe("#D97706");
      expect(designTokens.colors.semantic.error).toBe("#DC2626");
      expect(designTokens.colors.semantic.info).toBe("#0EA5E9");
    });

    test("should have typography tokens", () => {
      expect(designTokens.typography.fontFamilies.arabic).toContain("IBM Plex Sans Arabic");
      expect(designTokens.typography.fontFamilies.english).toContain("Space Grotesk");
      expect(designTokens.typography.fontSizes.base).toBe("1rem");
      expect(designTokens.typography.fontWeights.bold).toBe(700);
    });

    test("should have spacing scale", () => {
      expect(designTokens.spacing[0]).toBe("0");
      expect(designTokens.spacing[4]).toBe("1rem");
      expect(designTokens.spacing[8]).toBe("2rem");
    });

    test("should have effect tokens", () => {
      expect(designTokens.effects.shadows.md).toBeDefined();
      expect(designTokens.effects.borderRadius.lg).toBe("1rem");
      expect(designTokens.effects.transitions.base).toBe("200ms");
    });
  });

  describe("CSS Variable Generation", () => {
    test("should generate valid CSS custom properties", () => {
      const css = generateCSSVariables(designTokens);
      
      expect(css).toContain(":root {");
      expect(css).toContain("--color-primary-500: #14B8A6;");
      expect(css).toContain("--font-ar:");
      expect(css).toContain("--text-base: 1rem;");
      expect(css).toContain("--space-4: 1rem;");
      expect(css).toContain("}");
    });

    test("should include all token categories in CSS output", () => {
      const css = generateCSSVariables(designTokens);
      
      expect(css).toContain("--color-primary-");
      expect(css).toContain("--color-secondary-");
      expect(css).toContain("--color-accent-");
      expect(css).toContain("--font-ar:");
      expect(css).toContain("--text-");
      expect(css).toContain("--space-");
      expect(css).toContain("--shadow-");
      expect(css).toContain("--radius-");
    });
  });

  describe("Brand Overrides", () => {
    test("should apply brand primary color", () => {
      const mockBrand: Partial<BrandProfile> = {
        primaryColor: "#FF5733",
        secondaryColor: null,
        accentColor: null,
        fontFamily: null,
      };

      const overridden = applyBrandOverrides(designTokens, mockBrand as BrandProfile);
      
      expect(overridden.colors.primary[500]).toBe("#FF5733");
      expect(overridden.colors.primary[600]).toBe("#FF5733");
    });

    test("should apply brand accent color", () => {
      const mockBrand: Partial<BrandProfile> = {
        primaryColor: null,
        secondaryColor: null,
        accentColor: "#FFD700",
        fontFamily: null,
      };

      const overridden = applyBrandOverrides(designTokens, mockBrand as BrandProfile);
      
      expect(overridden.colors.accent[500]).toBe("#FFD700");
      expect(overridden.colors.accent[600]).toBe("#FFD700");
    });

    test("should apply custom font family", () => {
      const mockBrand: Partial<BrandProfile> = {
        primaryColor: null,
        secondaryColor: null,
        accentColor: null,
        fontFamily: "Cairo",
      };

      const overridden = applyBrandOverrides(designTokens, mockBrand as BrandProfile);
      
      expect(overridden.typography.fontFamilies.arabic).toContain("Cairo");
      expect(overridden.typography.fontFamilies.english).toContain("Cairo");
    });

    test("should return original tokens when brand is null", () => {
      const overridden = applyBrandOverrides(designTokens, null);
      
      expect(overridden).toEqual(designTokens);
    });

    test("should preserve other tokens when applying overrides", () => {
      const mockBrand: Partial<BrandProfile> = {
        primaryColor: "#FF5733",
        secondaryColor: null,
        accentColor: null,
        fontFamily: null,
      };

      const overridden = applyBrandOverrides(designTokens, mockBrand as BrandProfile);
      
      // Other tokens should remain unchanged
      expect(overridden.spacing).toEqual(designTokens.spacing);
      expect(overridden.effects).toEqual(designTokens.effects);
      expect(overridden.layout).toEqual(designTokens.layout);
    });
  });

  describe("Brand CSS Overrides", () => {
    test("should generate inline CSS for brand colors", () => {
      const mockBrand: Partial<BrandProfile> = {
        primaryColor: "#FF5733",
        secondaryColor: "#333333",
        accentColor: "#FFD700",
        fontFamily: null,
      };

      const css = generateBrandCSSOverrides(mockBrand as BrandProfile);
      
      expect(css).toContain("--color-primary-500: #FF5733");
      expect(css).toContain("--color-secondary-800: #333333");
      expect(css).toContain("--color-accent-500: #FFD700");
    });

    test("should return empty string when brand is null", () => {
      const css = generateBrandCSSOverrides(null);
      
      expect(css).toBe("");
    });

    test("should handle partial brand colors", () => {
      const mockBrand: Partial<BrandProfile> = {
        primaryColor: "#FF5733",
        secondaryColor: null,
        accentColor: null,
        fontFamily: null,
      };

      const css = generateBrandCSSOverrides(mockBrand as BrandProfile);
      
      expect(css).toContain("--color-primary-500: #FF5733");
      expect(css).not.toContain("--color-secondary");
      expect(css).not.toContain("--color-accent");
    });
  });

  describe("Token Getter", () => {
    test("should retrieve token by dot-notation path", () => {
      expect(getToken(designTokens, "colors.primary.500")).toBe("#14B8A6");
      expect(getToken(designTokens, "spacing.4")).toBe("1rem");
      expect(getToken(designTokens, "typography.fontWeights.bold")).toBe(700);
    });

    test("should return undefined for invalid paths", () => {
      expect(getToken(designTokens, "invalid.path")).toBeUndefined();
      expect(getToken(designTokens, "colors.primary.999")).toBeUndefined();
    });

    test("should handle nested paths correctly", () => {
      expect(getToken(designTokens, "effects.shadows.md")).toBeDefined();
      expect(getToken(designTokens, "layout.breakpoints.lg")).toBe("1024px");
    });
  });

  describe("Scoped CSS Variables", () => {
    test("should generate CSS with custom prefix", () => {
      const css = generateScopedCSSVariables(designTokens, "custom");
      
      expect(css).toContain("--custom-color-primary-500");
      expect(css).toContain("--custom-font-ar:");
      expect(css).toContain("--custom-space-4:");
    });

    test("should preserve token values with prefix", () => {
      const css = generateScopedCSSVariables(designTokens, "doc");
      
      expect(css).toContain("--doc-color-primary-500: #14B8A6");
      expect(css).toContain("--doc-text-base: 1rem");
    });
  });
});
