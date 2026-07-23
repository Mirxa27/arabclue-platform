import { describe, expect, test } from "bun:test";
import { downloadFormatSchema } from "../download-artifact";

describe("artifact download formats", () => {
  test("accepts production formats", () => {
    for (const fmt of [
      "pdf",
      "html",
      "zip",
      "manifest",
      "xlsx-matrix",
      "xlsx-boq",
      "slides",
      "pptx",
    ] as const) {
      expect(downloadFormatSchema.parse(fmt)).toBe(fmt);
    }
  });

  test("rejects unknown formats", () => {
    expect(() => downloadFormatSchema.parse("docx")).toThrow();
    expect(() => downloadFormatSchema.parse("")).toThrow();
  });
});
