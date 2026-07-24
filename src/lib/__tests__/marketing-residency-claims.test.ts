import { describe, expect, test } from "bun:test";

const MARKETING_SOURCES = [
  new URL("../../components/marketing/landing-page.tsx", import.meta.url),
  new URL("../../components/marketing/public-shell.tsx", import.meta.url),
];

describe("public hosting and compliance claims", () => {
  test("does not claim unverified Saudi data residency or blanket compliance", async () => {
    const corpus = (
      await Promise.all(MARKETING_SOURCES.map((url) => Bun.file(url).text()))
    ).join("\n");

    expect(corpus).not.toMatch(/\bhosted in (?:ksa|saudi arabia)\b/i);
    expect(corpus).not.toMatch(/(?:مستضاف|مستضافة)\s+في\s+(?:المملكة|السعودية)/);
    expect(corpus).not.toMatch(/\bPDPL\s*(?:&|\/|•)\s*NCA\s+Ready\b/i);
    expect(corpus).toContain("Hosting region is deployment-specific");
    expect(corpus).toContain("لا ندّعي إقامة البيانات داخل المملكة");
  });

  test("labels workflow examples and avoids unsupported customer metrics", async () => {
    const landing = await Bun.file(MARKETING_SOURCES[0]).text();

    expect(landing).toContain(
      "Workflow examples—not customer testimonials or measured outcomes."
    );
    expect(landing).not.toMatch(/\b(?:Sarah|Ahmed|Noura|Khalid)\s+—/);
    expect(landing).not.toMatch(
      /\b(?:3x faster|38h|Reviewer NPS|Exported 4 days early|Matrix in 2 min)\b/i
    );
    expect(landing).not.toContain("4.9/5");
    expect(landing).not.toContain("Co-designed with real teams");
    expect(landing).not.toContain("co-designed with bid teams");
    expect(landing).not.toContain("Bid teams in Riyadh & Jeddah");
    expect(landing).not.toContain("drafts compliant technical proposals");
    expect(landing).not.toContain("Compliant & built for KSA");
    expect(landing).toContain("Illustrative readiness example");
    expect(landing).toContain("compliance-aware technical proposals");
  });
});
