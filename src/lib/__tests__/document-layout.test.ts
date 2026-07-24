/**
 * Document Layout Utilities Tests
 * 
 * Tests for document-layout.ts functionality
 */

import { describe, test, expect } from "bun:test";
import {
  getPageDimensions,
  generatePageCSS,
  generatePrintCSS,
  generateDocumentHeader,
  generateDocumentFooter,
  generatePDFHeaderTemplate,
  generatePDFFooterTemplate,
  calculateContentWidth,
  calculateContentHeight,
  generateSectionDivider,
  wrapInPageContainer,
  generateBilingualLayoutCSS,
  DEFAULT_MARGINS,
  NARROW_MARGINS,
  WIDE_MARGINS,
  type PageSize,
  type PageOrientation,
} from "../document-layout";

describe("Document Layout Utilities", () => {
  describe("Page Dimensions", () => {
    test("should get A4 portrait dimensions", () => {
      const dims = getPageDimensions("A4", "portrait");
      
      expect(dims.width).toBe("210mm");
      expect(dims.height).toBe("297mm");
    });

    test("should get A4 landscape dimensions", () => {
      const dims = getPageDimensions("A4", "landscape");
      
      expect(dims.width).toBe("297mm");
      expect(dims.height).toBe("210mm");
    });

    test("should get Letter portrait dimensions", () => {
      const dims = getPageDimensions("Letter", "portrait");
      
      expect(dims.width).toBe("8.5in");
      expect(dims.height).toBe("11in");
    });

    test("should get Letter landscape dimensions", () => {
      const dims = getPageDimensions("Letter", "landscape");
      
      expect(dims.width).toBe("11in");
      expect(dims.height).toBe("8.5in");
    });
  });

  describe("Page CSS Generation", () => {
    test("should generate @page CSS rule", () => {
      const css = generatePageCSS({
        size: "A4",
        orientation: "portrait",
        margins: DEFAULT_MARGINS,
      });
      
      expect(css).toContain("@page");
      expect(css).toContain("size: A4 portrait");
      expect(css).toContain("margin:");
    });

    test("should include all margin values", () => {
      const css = generatePageCSS({
        size: "A4",
        orientation: "portrait",
        margins: DEFAULT_MARGINS,
      });
      
      expect(css).toContain("18mm"); // top
      expect(css).toContain("14mm"); // right/left
    });

    test("should handle custom margins", () => {
      const customMargins = {
        top: "20mm",
        right: "15mm",
        bottom: "25mm",
        left: "10mm",
      };
      
      const css = generatePageCSS({
        size: "Letter",
        orientation: "landscape",
        margins: customMargins,
      });
      
      expect(css).toContain("20mm");
      expect(css).toContain("15mm");
      expect(css).toContain("25mm");
      expect(css).toContain("10mm");
    });
  });

  describe("Print CSS Generation", () => {
    test("should generate complete print styles", () => {
      const css = generatePrintCSS({
        size: "A4",
        orientation: "portrait",
        margins: DEFAULT_MARGINS,
      });
      
      expect(css).toContain("@media print");
      expect(css).toContain("@page");
      expect(css).toContain(".page-break");
      expect(css).toContain(".avoid-break");
      expect(css).toContain(".no-print");
    });

    test("should include body reset styles", () => {
      const css = generatePrintCSS({
        size: "A4",
        orientation: "portrait",
        margins: DEFAULT_MARGINS,
      });
      
      expect(css).toContain("body");
      expect(css).toContain("margin: 0");
      expect(css).toContain("background: white");
    });

    test("should include additional CSS if provided", () => {
      const additionalCSS = ".custom-class { color: red; }";
      const css = generatePrintCSS(
        {
          size: "A4",
          orientation: "portrait",
          margins: DEFAULT_MARGINS,
        },
        additionalCSS
      );
      
      expect(css).toContain(additionalCSS);
    });
  });

  describe("Document Header Generation", () => {
    test("should generate header with title in Arabic", () => {
      const html = generateDocumentHeader({
        title: "Technical Proposal",
        titleAr: "العرض الفني",
        locale: "ar",
      });
      
      expect(html).toContain("document-header");
      expect(html).toContain("العرض الفني");
      expect(html).toContain('lang="ar"');
      expect(html).toContain("direction: rtl");
    });

    test("should generate header with title in English", () => {
      const html = generateDocumentHeader({
        title: "Technical Proposal",
        locale: "en",
      });
      
      expect(html).toContain("Technical Proposal");
      expect(html).toContain('lang="en"');
      expect(html).toContain("direction: ltr");
    });

    test("should include logo when provided", () => {
      const html = generateDocumentHeader({
        title: "Proposal",
        locale: "en",
        logo: "https://example.com/logo.png",
      });
      
      expect(html).toContain("<img");
      expect(html).toContain("https://example.com/logo.png");
      expect(html).toContain("header-logo");
    });

    test("should escape HTML in title", () => {
      const html = generateDocumentHeader({
        title: "<script>alert('xss')</script>",
        locale: "en",
      });
      
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });
  });

  describe("Document Footer Generation", () => {
    test("should generate footer with page numbers", () => {
      const html = generateDocumentFooter({
        pageNumber: 5,
        totalPages: 10,
        locale: "en",
      });
      
      expect(html).toContain("document-footer");
      expect(html).toContain("5");
      expect(html).toContain("10");
      expect(html).toContain("Page");
      expect(html).toContain("of");
    });

    test("should generate footer in Arabic", () => {
      const html = generateDocumentFooter({
        pageNumber: 3,
        totalPages: 7,
        locale: "ar",
      });
      
      expect(html).toContain("صفحة"); // Page in Arabic
      expect(html).toContain("من"); // Of in Arabic
      expect(html).toContain("direction: rtl");
    });

    test("should include confidential badge when specified", () => {
      const html = generateDocumentFooter({
        confidential: true,
        locale: "en",
      });
      
      expect(html).toContain("confidential-badge");
      expect(html).toContain("Confidential");
    });

    test("should include company name when provided", () => {
      const html = generateDocumentFooter({
        companyName: "Arabclue",
        locale: "en",
      });
      
      expect(html).toContain("Arabclue");
    });

    test("should escape HTML in company name", () => {
      const html = generateDocumentFooter({
        companyName: "<script>alert('xss')</script>",
        locale: "en",
      });
      
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });
  });

  describe("PDF Header/Footer Templates", () => {
    test("should generate minimal PDF header", () => {
      const html = generatePDFHeaderTemplate("Arabclue");
      
      expect(html).toContain("Arabclue");
      expect(html).toContain("font-size: 8px");
    });

    test("should generate minimal PDF footer", () => {
      const html = generatePDFFooterTemplate("Arabclue");
      
      expect(html).toContain("Arabclue");
      expect(html).toContain("pageNumber");
      expect(html).toContain("totalPages");
    });

    test("should apply custom color to PDF header", () => {
      const html = generatePDFHeaderTemplate("Company", "#FF5733");
      
      expect(html).toContain("#FF5733");
    });

    test("should escape HTML in company name", () => {
      const html = generatePDFHeaderTemplate("<b>Company</b>");
      
      expect(html).not.toContain("<b>");
      expect(html).toContain("&lt;b&gt;");
    });
  });

  describe("Content Calculations", () => {
    test("should calculate content width for A4 portrait", () => {
      const width = calculateContentWidth("A4", "portrait", DEFAULT_MARGINS);
      
      expect(width).toBe(182); // 210mm - 14mm - 14mm
    });

    test("should calculate content height for A4 portrait", () => {
      const height = calculateContentHeight("A4", "portrait", DEFAULT_MARGINS);
      
      expect(height).toBe(261); // 297mm - 18mm - 18mm
    });

    test("should handle narrow margins", () => {
      const width = calculateContentWidth("A4", "portrait", NARROW_MARGINS);
      
      expect(width).toBe(190); // 210mm - 10mm - 10mm
    });

    test("should handle wide margins", () => {
      const width = calculateContentWidth("A4", "portrait", WIDE_MARGINS);
      
      expect(width).toBe(170); // 210mm - 20mm - 20mm
    });
  });

  describe("Layout Helpers", () => {
    test("should generate section divider", () => {
      const html = generateSectionDivider("ar");
      
      expect(html).toContain("section-divider");
      expect(html).toContain("<hr");
    });

    test("should wrap content in page container", () => {
      const content = "<p>Test content</p>";
      const html = wrapInPageContainer(content, "ar");
      
      expect(html).toContain("page-container");
      expect(html).toContain("Test content");
      expect(html).toContain("direction: rtl");
      expect(html).toContain('lang="ar"');
    });

    test("should set LTR for English container", () => {
      const html = wrapInPageContainer("<p>Content</p>", "en");
      
      expect(html).toContain("direction: ltr");
      expect(html).toContain('lang="en"');
    });
  });

  describe("Bilingual Layout CSS", () => {
    test("should generate side-by-side layout CSS", () => {
      const css = generateBilingualLayoutCSS("en", "ar");
      
      expect(css).toContain("bilingual-layout");
      expect(css).toContain("grid-template-columns");
      expect(css).toContain("50% 50%");
    });

    test("should apply custom column ratio", () => {
      const css = generateBilingualLayoutCSS("en", "ar", [60, 40]);
      
      expect(css).toContain("60% 40%");
    });

    test("should set correct text direction for each column", () => {
      const css = generateBilingualLayoutCSS("en", "ar");
      
      expect(css).toContain("direction: ltr");
      expect(css).toContain("direction: rtl");
    });

    test("should include print optimization", () => {
      const css = generateBilingualLayoutCSS("en", "ar");
      
      expect(css).toContain("@media print");
      expect(css).toContain("page-break-inside: avoid");
    });

    test("should include responsive mobile layout", () => {
      const css = generateBilingualLayoutCSS("en", "ar");
      
      expect(css).toContain("@media (max-width: 768px)");
      expect(css).toContain("grid-template-columns: 1fr");
    });
  });

  describe("Margin Presets", () => {
    test("should have default margins", () => {
      expect(DEFAULT_MARGINS.top).toBe("18mm");
      expect(DEFAULT_MARGINS.right).toBe("14mm");
      expect(DEFAULT_MARGINS.bottom).toBe("18mm");
      expect(DEFAULT_MARGINS.left).toBe("14mm");
    });

    test("should have narrow margins", () => {
      expect(NARROW_MARGINS.top).toBe("12mm");
      expect(NARROW_MARGINS.right).toBe("10mm");
    });

    test("should have wide margins", () => {
      expect(WIDE_MARGINS.top).toBe("25mm");
      expect(WIDE_MARGINS.right).toBe("20mm");
    });
  });
});
