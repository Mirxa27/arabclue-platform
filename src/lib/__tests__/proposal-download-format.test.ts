import { describe, expect, test } from "bun:test";
import { resolveProposalDownloadFormat } from "../../app/api/proposals/[id]/download/route";

describe("proposal download format resolution", () => {
  test("defaults only an omitted format to the guarded ZIP path", () => {
    expect(resolveProposalDownloadFormat(null)).toBe("zip");
  });

  test("normalizes documented aliases", () => {
    expect(resolveProposalDownloadFormat("ea-matrix")).toBe("xlsx-matrix");
    expect(resolveProposalDownloadFormat("boq")).toBe("xlsx-boq");
  });

  test("rejects unknown values instead of falling through to ZIP generation", () => {
    expect(resolveProposalDownloadFormat("anything")).toBeNull();
    expect(resolveProposalDownloadFormat("ZIP")).toBeNull();
    expect(resolveProposalDownloadFormat("")).toBeNull();
  });
});
