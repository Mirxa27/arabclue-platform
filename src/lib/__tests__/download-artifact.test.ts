import { describe, expect, test } from "bun:test";
import {
  buildProposalDownloadUrl,
  downloadFormatSchema,
  resolveArtifactDownloadFormat,
} from "../download-artifact";

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
      "docx",
    ] as const) {
      expect(downloadFormatSchema.parse(fmt)).toBe(fmt);
    }
  });

  test("rejects unknown formats", () => {
    // `docm` and `doc` are the near-misses a hand-edited URL produces; neither
    // is a format this route can render.
    expect(() => downloadFormatSchema.parse("docm")).toThrow();
    expect(() => downloadFormatSchema.parse("doc")).toThrow();
    expect(() => downloadFormatSchema.parse("")).toThrow();
  });
});

describe("resolveArtifactDownloadFormat", () => {
  test("prefers downloadPath format=pptx over PPTX type heuristic", () => {
    expect(
      resolveArtifactDownloadFormat({
        type: "PPTX",
        filename: "Slides.pptx",
        downloadPath: "/api/proposals/x/download?format=pptx",
      })
    ).toBe("pptx");
  });

  test("maps PPTX type to pptx when path missing", () => {
    expect(
      resolveArtifactDownloadFormat({
        type: "PPTX",
        filename: "Presentation.pptx",
      })
    ).toBe("pptx");
  });

  test("maps DOCX type to docx", () => {
    expect(
      resolveArtifactDownloadFormat({
        type: "DOCX",
        filename: "Technical_Proposal.docx",
      })
    ).toBe("docx");
  });

  test("maps HTML slides without mistaking PPTX", () => {
    expect(
      resolveArtifactDownloadFormat({
        type: "HTML",
        filename: "Slides.html",
        downloadPath: "/api/proposals/x/download?format=slides",
      })
    ).toBe("slides");
  });
});

describe("buildProposalDownloadUrl", () => {
  test("includes locale query when provided", () => {
    expect(
      buildProposalDownloadUrl({
        proposalId: "abc",
        format: "pdf",
        locale: "ar",
      })
    ).toBe("/api/proposals/abc/download?format=pdf&locale=ar");
  });

  test("omits locale when unset", () => {
    expect(
      buildProposalDownloadUrl({ proposalId: "abc", format: "zip" })
    ).toBe("/api/proposals/abc/download?format=zip");
  });
});
