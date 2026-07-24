import { describe, expect, test } from "bun:test";
import {
  googleFontsHref,
  letterheadBarHtml,
  letterheadCompanyName,
  pdfFooterTemplate,
  pdfHeaderTemplate,
  resolveBrandFontStack,
} from "../letterhead";

describe("letterhead helpers", () => {
  test("resolves known font stacks and falls back safely", () => {
    expect(resolveBrandFontStack("Cairo")).toContain("Cairo");
    expect(resolveBrandFontStack("Weird Font")).toContain("Weird Font");
    expect(resolveBrandFontStack(null)).toContain("IBM Plex Sans Arabic");
  });

  test("company name prefers legal identity then brand tagline", () => {
    expect(
      letterheadCompanyName(
        "en",
        { tagline: "Acme Bid" },
        { name: "Acme Contracting Co." }
      )
    ).toBe("Acme Contracting Co.");
    expect(
      letterheadCompanyName("ar", { taglineAr: "أكمي" }, null)
    ).toBe("أكمي");
  });

  test("header/footer templates embed company not hardcoded Arabclue-only chrome", () => {
    const header = pdfHeaderTemplate({
      companyName: "Acme Co",
      etimadRef: "ET-1",
      primaryColor: "#115e59",
    });
    expect(header).toContain("Acme Co");
    expect(header).toContain("ET-1");
    expect(header).not.toMatch(/>Arabclue</);

    const footer = pdfFooterTemplate({
      companyName: "Acme Co",
      primaryColor: "#115e59",
    });
    expect(footer).toContain("Acme Co");
    expect(footer).toContain("pageNumber");
  });

  test("letterhead bar includes logo and official label", () => {
    const html = letterheadBarHtml({
      locale: "en",
      companyName: "Acme Co",
      brand: {
        logoUrl: "/api/files?path=uploads/x/logo.png",
        primaryColor: "#1E3A8A",
        secondaryColor: "#0F172A",
        accentColor: "#0EA5E9",
        tagline: "Trusted bids",
      },
    });
    expect(html).toContain("Acme Co");
    expect(html).toContain("Official letterhead");
    expect(html).toContain("logo.png");
    expect(googleFontsHref("Tajawal")).toContain("Tajawal");
  });
});
