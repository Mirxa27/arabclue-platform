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
  });
});
