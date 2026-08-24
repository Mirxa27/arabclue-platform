import { describe, expect, test } from "bun:test";
import {
  renderCoverLetterheadHtml,
  renderSubmissionLetterHtml,
} from "@/lib/branded-front-matter";

const input = {
  locale: "en" as const,
  brand: {
    workspaceId: "ws-1",
    primaryColor: "#123456",
    tagline: "Riyadh delivery",
  },
  company: { name: "Riyadh Systems", nameAr: "أنظمة الرياض" },
  projectTitle: "Cloud operations tender",
  etimadRef: "ETM-100",
};

describe("branded front matter", () => {
  test("cover includes company, title, and letterhead", () => {
    const html = renderCoverLetterheadHtml(input);
    expect(html).toContain("Riyadh Systems");
    expect(html).toContain("Cloud operations tender");
    expect(html).toContain("ETM-100");
    expect(html).toContain("letterhead-bar");
    expect(html).not.toContain("PDPL");
  });

  test("submission letter is a preview, not a filing claim", () => {
    const html = renderSubmissionLetterHtml(input);
    expect(html).toContain("not a signed Etimad filing");
    expect(html).toContain("Riyadh Systems");
    expect(html).not.toContain("PDPL Compliant");
  });
});
