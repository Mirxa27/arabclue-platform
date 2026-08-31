/**
 * Word export.
 *
 * The platform reads .docx (ingestion.ts routes it through mammoth) but until
 * now could not write one: exports were pdf/html/zip/xlsx/slides/pptx. Saudi
 * procurement work is done in Word — a bidder who cannot get an editable file
 * out of the studio retypes the whole bid.
 *
 * Assertions unzip the artifact and read word/document.xml rather than trusting
 * the builder API. A .docx that Word refuses to open is the failure that matters,
 * and only the bytes can show it.
 */

import { describe, expect, test } from "bun:test";
import JSZip from "jszip";
import { markdownToDocx } from "../markdown-docx";

async function documentXml(md: string, locale: "ar" | "en" = "en") {
  const buf = await markdownToDocx(md, { title: "Bid", locale });
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file("word/document.xml");
  expect(file, "word/document.xml missing from the package").not.toBeNull();
  return (await file!.async("string")) as string;
}

describe("package structure", () => {
  test("the artifact is a zip carrying the parts Word requires", async () => {
    const buf = await markdownToDocx("# Bid", { title: "Bid", locale: "en" });
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files);
    for (const required of [
      "[Content_Types].xml",
      "_rels/.rels",
      "word/document.xml",
      "word/styles.xml",
    ]) {
      expect(names, `missing part: ${required}`).toContain(required);
    }
  });

  test("the buffer starts with the zip magic number", async () => {
    const buf = await markdownToDocx("x", { title: "t", locale: "en" });
    expect(buf.length).toBeGreaterThan(0);
    expect([buf[0], buf[1]]).toEqual([0x50, 0x4b]);
  });
});

describe("content survives the conversion", () => {
  test("heading text and level reach the document", async () => {
    const xml = await documentXml("## Scope of work");
    expect(xml).toContain("Scope of work");
    expect(xml).toContain("Heading2");
  });

  test("bold, italic and code become formatted runs, not literal markers", async () => {
    const xml = await documentXml("Plain **strong** and *slanted* and `code`.");
    expect(xml).toContain("strong");
    expect(xml).toContain("slanted");
    expect(xml).toContain("<w:b/>");
    expect(xml).toContain("<w:i/>");
    // The markers themselves must not survive as text.
    expect(xml).not.toContain("**strong**");
    expect(xml).not.toContain("`code`");
  });

  test("a table becomes a real Word table with its cells", async () => {
    const xml = await documentXml(
      "| Requirement | Status |\n|---|---|\n| ISO 9001 | Met |"
    );
    expect(xml).toContain("<w:tbl>");
    expect(xml).toContain("Requirement");
    expect(xml).toContain("ISO 9001");
    expect(xml).toContain("Met");
  });

  test("bullets and numbers become list paragraphs, not bullet characters", async () => {
    const xml = await documentXml("- first\n- second\n\n1. one\n2. two");
    expect(xml).toContain("first");
    expect(xml).toContain("one");
    // Real numbering, so Word renumbers when the reviewer edits.
    expect(xml).toContain("<w:numPr>");
    expect(xml).not.toContain("• first");
  });

  test("code blocks keep their lines", async () => {
    const xml = await documentXml("```\nline one\nline two\n```");
    expect(xml).toContain("line one");
    expect(xml).toContain("line two");
  });

  test("every block kind the tokenizer produces renders something", async () => {
    // Anti-vacuous: a renderer that silently drops a block kind would pass the
    // targeted tests above for the kinds it does handle.
    const xml = await documentXml(
      "# H\ntext\n> quoted\n---\n- item\n\n| A |\n| 1 |\n\n```\ncode\n```"
    );
    for (const fragment of ["H", "text", "quoted", "item", "A", "1", "code"]) {
      expect(xml, `dropped: ${fragment}`).toContain(fragment);
    }
  });
});

describe("lifecycle marking", () => {
  // A .docx is the one deliverable the recipient can edit and forward. An
  // unmarked draft that reads like an approved export is the expensive mistake,
  // so the marker is opt-out (FINAL), never opt-in.
  test("a draft says so, in the reader's language", async () => {
    const en = await documentXml("body");
    expect(en).toContain("Draft");
    const ar = await markdownToDocx("body", {
      title: "Bid",
      locale: "ar",
      lifecycle: "DRAFT",
    });
    const arXml = await (
      await JSZip.loadAsync(ar)
    )
      .file("word/document.xml")!
      .async("string");
    expect(arXml).toContain("مسودة");
  });

  test("a final export carries no draft marker", async () => {
    const buf = await markdownToDocx("body", {
      title: "Bid",
      locale: "en",
      lifecycle: "FINAL",
    });
    const xml = await (await JSZip.loadAsync(buf))
      .file("word/document.xml")!
      .async("string");
    expect(xml).not.toContain("Draft");
    // Anti-vacuous: the body itself still rendered.
    expect(xml).toContain("body");
  });
});

describe("bilingual output", () => {
  test("Arabic documents are laid out right-to-left", async () => {
    const xml = await documentXml("# نطاق العمل\nالمحتوى", "ar");
    expect(xml).toContain("<w:bidi/>");
    expect(xml).toContain("<w:rtl/>");
  });

  test("English documents are not", async () => {
    const xml = await documentXml("# Scope\nBody", "en");
    expect(xml).not.toContain("<w:bidi/>");
  });

  test("Arabic text is carried as Arabic, not escaped away", async () => {
    const xml = await documentXml("نطاق العمل", "ar");
    expect(xml).toContain("نطاق العمل");
  });
});

describe("untrusted content cannot break the package", () => {
  test("XML metacharacters in the document are escaped", async () => {
    const xml = await documentXml(
      'A <w:p> tag & an "attribute" and </w:document> in the prose.'
    );
    // The literal text is present in escaped form...
    expect(xml).toContain("&lt;w:p&gt;");
    expect(xml).toContain("&amp;");
    // ...and the document is still exactly one document element.
    expect(xml.split("</w:document>").length - 1).toBe(1);
  });

  test("a title containing markup does not corrupt the metadata part", async () => {
    const buf = await markdownToDocx("body", {
      title: '</dc:title><evil>',
      locale: "en",
    });
    const zip = await JSZip.loadAsync(buf);
    expect(Object.keys(zip.files)).toContain("word/document.xml");
    const core = zip.file("docProps/core.xml");
    if (core) {
      const s = await core.async("string");
      expect(s).not.toContain("<evil>");
    }
  });

  test("empty markdown still produces a valid, openable document", async () => {
    const xml = await documentXml("");
    expect(xml).toContain("<w:body>");
  });
});
