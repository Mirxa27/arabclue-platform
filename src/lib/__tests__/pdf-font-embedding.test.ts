/**
 * Guard tests for font delivery on the legacy PDF path, and for manifest
 * honesty in the structured bid package.
 *
 * `pdf/html-to-pdf.ts` aborts every network request, so a `<link>` to Google
 * Fonts in a document handed to it can never resolve — the Arabic face
 * silently disappeared from the product's primary deliverable. The structured
 * engine already solved this by base64-embedding the faces, and
 * `bilingual-pdf.ts` even has a REMOTE_FONT_REQUEST inspector, but neither ran
 * on the legacy path.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

describe("legacy PDF path embeds its fonts", () => {
  const source = read("src/lib/generators.ts");

  test("generateProposalPDF resolves embedded font CSS", () => {
    expect(source).toMatch(
      /generateProposalPDF[\s\S]*?getEmbeddedBilingualFontCss\(\)/
    );
  });

  test("generateProposalPDF passes the embedded CSS into the template", () => {
    expect(source).toMatch(
      /generateProposalPDF[\s\S]*?embeddedFontCss,[\s\S]*?buildProposalHTML|buildProposalHTML\([\s\S]*?embeddedFontCss/
    );
  });

  test("the PDF template emits either embedded faces or a link, never both", () => {
    expect(source).toContain("const fontHead = embeddedFontCss");
    expect(source).toContain("${fontHead}");
  });

  test("generateProposalPDF is the only function that reaches htmlToPdf", () => {
    // Any additional caller would need the same font embedding, so this is the
    // assertion that keeps the fix from being bypassed by a new export.
    // generateSlidesHTML renders in a real browser and legitimately keeps its
    // remote <link>; it never reaches the PDF renderer.
    const htmlToPdfCalls = source.match(/await htmlToPdf\(/g) ?? [];
    expect(htmlToPdfCalls).toHaveLength(1);
    expect(source).toMatch(/generateProposalPDF[\s\S]*?await htmlToPdf\(/);
  });
});

describe("the PDF renderer still blocks the network", () => {
  const source = read("src/lib/pdf/html-to-pdf.ts");

  test("every request is aborted", () => {
    expect(source).toMatch(/page\.route\(\s*["'`]\*\*\/\*["'`]/);
    expect(source).toContain('route.abort("blockedbyclient")');
  });

  test("document-authored JavaScript stays disabled", () => {
    expect(source).toContain("javaScriptEnabled: false");
  });
});

describe("structured bid package manifest reports real state", () => {
  const source = read("src/lib/structured-bid-package.ts");

  test("proposal status is not hardcoded to APPROVED", () => {
    expect(source).not.toMatch(/status:\s*["']APPROVED["']/);
    expect(source).toContain("status: opts.proposalStatus");
  });

  test("the content hash is derived from real content", () => {
    // `contentMd: ""` made the published hash a constant SHA-256 of the empty
    // string for every export.
    expect(source).not.toMatch(/contentMd:\s*["']{2}/);
    expect(source).toContain("contentMd: opts.proposalContentMd");
  });

  test("approvedAt comes from the proposal rather than a literal null", () => {
    expect(source).toContain("approvedAt: opts.proposalApprovedAt");
  });
});
