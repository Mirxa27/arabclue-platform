import { describe, expect, test } from "bun:test";
import { escapeHtml, markdownToHtml } from "../markdown";

// Build HTML entities from char codes to avoid tool entity decoding
const AMP = String.fromCharCode(38, 97, 109, 112, 59); // &
const LT = String.fromCharCode(38, 108, 116, 59); // <
const GT = String.fromCharCode(38, 103, 116, 59); // >
const QUOT = String.fromCharCode(38, 113, 117, 111, 116, 59); // "

describe("escapeHtml", () => {
  test("escapes ampersand", () => {
    expect(escapeHtml("a&b")).toBe("a" + AMP + "b");
  });

  test("escapes angle brackets", () => {
    expect(escapeHtml("<script>")).toBe(LT + "script" + GT);
  });

  test("escapes double quotes", () => {
    expect(escapeHtml('"hello"')).toBe(QUOT + "hello" + QUOT);
  });

  test("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });
});

describe("markdownToHtml", () => {
  test("renders headings h1-h4", () => {
    const html = markdownToHtml("# Title\n## Sub\n### Sub2\n#### Sub3");
    expect(html).toContain("<h1");
    expect(html).toContain("<h2");
    expect(html).toContain("<h3");
    expect(html).toContain("<h4");
  });

  test("renders unordered lists", () => {
    const html = markdownToHtml("- item one\n- item two");
    expect(html).toContain("<ul");
    expect(html).toContain("<li");
    expect(html).toContain("item one");
    expect(html).toContain("item two");
    expect(html).toContain("</ul>");
  });

  test("renders ordered lists", () => {
    const html = markdownToHtml("1. first\n2. second");
    expect(html).toContain("<ol");
    expect(html).toContain("<li");
    expect(html).toContain("first");
    expect(html).toContain("</ol>");
  });

  test("renders bold text", () => {
    const html = markdownToHtml("**bold text**");
    expect(html).toContain("<strong>bold text</strong>");
  });

  test("renders italic text", () => {
    const html = markdownToHtml("*italic text*");
    expect(html).toContain("<em>italic text</em>");
  });

  test("renders inline code", () => {
    const html = markdownToHtml("`code`");
    expect(html).toContain("<code");
    expect(html).toContain("code");
  });

  test("renders blockquotes", () => {
    const html = markdownToHtml("> quoted text");
    expect(html).toContain("<blockquote");
    expect(html).toContain("quoted text");
  });

  test("renders horizontal rules", () => {
    const html = markdownToHtml("---");
    expect(html).toContain("<hr");
  });

  test("renders code blocks", () => {
    const html = markdownToHtml("```\nconsole.log('hi');\n```");
    expect(html).toContain("<pre");
    expect(html).toContain("<code");
    expect(html).toContain("console.log");
  });

  test("renders tables", () => {
    const html = markdownToHtml(
      "| Col1 | Col2 |\n|---|---|\n| a | b |"
    );
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("<td");
    expect(html).toContain("Col1");
    expect(html).toContain("</table>");
  });

  test("renders paragraphs for plain text", () => {
    const html = markdownToHtml("Hello world");
    expect(html).toContain("<p");
    expect(html).toContain("Hello world");
  });

  test("handles empty input", () => {
    const html = markdownToHtml("");
    expect(html).toBe("");
  });

  test("handles null/undefined input gracefully", () => {
    const html = markdownToHtml(null as unknown as string);
    expect(html).toBe("");
  });

  test("escapes HTML in text to prevent XSS", () => {
    const html = markdownToHtml("<script>alert('xss')</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain(LT + "script" + GT);
  });

  test("escapes HTML inside code blocks", () => {
    const html = markdownToHtml("```\n<script>bad()</script>\n```");
    expect(html).toContain(LT + "script" + GT);
    expect(html).not.toContain("<script>");
  });

  test("applies custom heading and accent colors", () => {
    const html = markdownToHtml("## Title", {
      headingColor: "#FF0000",
      accentColor: "#00FF00",
    });
    expect(html).toContain("#FF0000");
    expect(html).toContain("#00FF00");
  });

  test("closes open lists at end of input", () => {
    const html = markdownToHtml("- one\n- two");
    expect(html).toContain("</ul>");
  });

  test("closes open code block at end of input", () => {
    const html = markdownToHtml("```\nunclosed code");
    expect(html).toContain("<pre");
    expect(html).toContain("unclosed code");
  });

  test("handles CRLF line endings", () => {
    const html = markdownToHtml("# Title\r\n\r\nParagraph");
    expect(html).toContain("<h1");
    expect(html).toContain("Paragraph");
  });

  test("supports asterisk and plus bullets", () => {
    const html1 = markdownToHtml("* item");
    const html2 = markdownToHtml("+ item");
    expect(html1).toContain("<ul");
    expect(html2).toContain("<ul");
  });
});
