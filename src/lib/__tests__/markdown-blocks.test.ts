/**
 * The block tokenizer behind both renderers.
 *
 * `markdownToHtml` used to scan and emit HTML in one pass. A second renderer
 * (DOCX) scanning independently would drift: the day someone teaches the PDF
 * about a new construct, Word output silently keeps treating it as a paragraph.
 * So the scan happens once and the renderers consume blocks.
 *
 * `markdown.test.ts` is the proof this extraction changed no HTML.
 */

import { describe, expect, test } from "bun:test";
import { markdownBlocks } from "../markdown";

describe("markdownBlocks", () => {
  test("headings carry their level and text", () => {
    expect(markdownBlocks("# One\n### Three")).toEqual([
      { kind: "heading", level: 1, text: "One" },
      { kind: "heading", level: 3, text: "Three" },
    ]);
  });

  test("consecutive bullets group into one list", () => {
    expect(markdownBlocks("- a\n- b\n+ c")).toEqual([
      { kind: "list", ordered: false, items: ["a", "b", "c"] },
    ]);
  });

  test("switching list type starts a new list", () => {
    expect(markdownBlocks("- a\n1. b")).toEqual([
      { kind: "list", ordered: false, items: ["a"] },
      { kind: "list", ordered: true, items: ["b"] },
    ]);
  });

  test("a blank line ends a list", () => {
    expect(markdownBlocks("- a\n\n- b")).toEqual([
      { kind: "list", ordered: false, items: ["a"] },
      { kind: "list", ordered: false, items: ["b"] },
    ]);
  });

  test("the first table row is the header and the separator is dropped", () => {
    expect(markdownBlocks("| A | B |\n|---|---|\n| 1 | 2 |")).toEqual([
      { kind: "table", header: ["A", "B"], rows: [["1", "2"]] },
    ]);
  });

  test("a header-only table is still a table", () => {
    expect(markdownBlocks("| A | B |\n|:-:|--:|")).toEqual([
      { kind: "table", header: ["A", "B"], rows: [] },
    ]);
  });

  test("fenced code keeps its lines verbatim, indentation included", () => {
    expect(markdownBlocks("```\n  # not a heading\n- not a list\n```")).toEqual([
      { kind: "code", text: "  # not a heading\n- not a list" },
    ]);
  });

  test("an unterminated fence still yields its content", () => {
    expect(markdownBlocks("```\nx")).toEqual([{ kind: "code", text: "x" }]);
  });

  test("rules, quotes and paragraphs", () => {
    expect(markdownBlocks("> cited\n---\nplain")).toEqual([
      { kind: "quote", text: "cited" },
      { kind: "rule" },
      { kind: "paragraph", text: "plain" },
    ]);
  });

  test("inline markers are left in the text for the renderer to interpret", () => {
    // HTML escapes them; DOCX turns them into runs. Deciding here would force
    // one renderer's representation on the other.
    expect(markdownBlocks("a **b** `c`")).toEqual([
      { kind: "paragraph", text: "a **b** `c`" },
    ]);
  });

  test("empty and nullish input produce no blocks", () => {
    expect(markdownBlocks("")).toEqual([]);
    expect(markdownBlocks("   \n\n  ")).toEqual([]);
    expect(markdownBlocks(null as unknown as string)).toEqual([]);
  });

  test("CRLF is normalized", () => {
    expect(markdownBlocks("# A\r\n- b\r\n")).toEqual([
      { kind: "heading", level: 1, text: "A" },
      { kind: "list", ordered: false, items: ["b"] },
    ]);
  });

  test("a table interrupted by a heading closes", () => {
    expect(markdownBlocks("| A |\n| 1 |\n# H")).toEqual([
      { kind: "table", header: ["A"], rows: [["1"]] },
      { kind: "heading", level: 1, text: "H" },
    ]);
  });
});
