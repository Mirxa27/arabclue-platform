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

  test("Arabic locale uses titleAr and nameAr when present", () => {
    const arInput = {
      ...input,
      locale: "ar" as const,
      projectTitleAr: "مناقصة تشغيل السحابة",
    };
    const cover = renderCoverLetterheadHtml(arInput);
    const letter = renderSubmissionLetterHtml(arInput);
    expect(cover).toContain("مناقصة تشغيل السحابة");
    expect(cover).toContain("أنظمة الرياض");
    expect(cover).not.toContain("Cloud operations tender");
    expect(cover).not.toContain("PDPL");
    expect(letter).toContain("مناقصة تشغيل السحابة");
    expect(letter).toContain("أنظمة الرياض");
    expect(letter).not.toContain("PDPL");
  });

  test("English locale keeps English title even when titleAr is set", () => {
    const enInput = {
      ...input,
      locale: "en" as const,
      projectTitleAr: "مناقصة تشغيل السحابة",
    };
    const cover = renderCoverLetterheadHtml(enInput);
    expect(cover).toContain("Cloud operations tender");
    expect(cover).not.toContain("مناقصة تشغيل السحابة");
    expect(cover).toContain("Riyadh Systems");
    expect(cover).not.toContain("PDPL");
  });

  test("Arabic locale falls back to title when titleAr is blank", () => {
    const cover = renderCoverLetterheadHtml({
      ...input,
      locale: "ar",
      projectTitleAr: "   ",
    });
    expect(cover).toContain("Cloud operations tender");
    expect(cover).toContain("أنظمة الرياض");
  });

  test("hostile titles and refs are escaped in both documents", () => {
    const hostile = {
      ...input,
      projectTitle: `<script>alert("x")</script> & <img src=x onerror=alert(1)>`,
      etimadRef: `ETM-1"><svg onload=alert(2)>`,
    };
    for (const html of [
      renderCoverLetterheadHtml(hostile),
      renderSubmissionLetterHtml(hostile),
    ]) {
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("<svg");
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("&amp;");
    }
  });

  test("both documents are complete HTML shells with a letterhead", () => {
    for (const html of [
      renderCoverLetterheadHtml(input),
      renderSubmissionLetterHtml(input),
    ]) {
      expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
      expect(html).toContain('lang="en"');
      expect(html).toContain('dir="ltr"');
      expect(html).toContain("letterhead-bar");
      expect(html).toContain("</html>");
    }
  });
});
