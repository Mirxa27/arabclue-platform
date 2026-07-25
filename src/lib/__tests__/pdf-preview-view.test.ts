import { describe, expect, test } from "bun:test";
import { pdfPreviewSrc } from "../pdf-preview-view";

describe("pdfPreviewSrc", () => {
  test("defaults to FitH and strips prior hash fragments", () => {
    expect(pdfPreviewSrc("blob:https://arabclue.com/abc")).toBe(
      "blob:https://arabclue.com/abc#view=FitH"
    );
    expect(pdfPreviewSrc("blob:https://arabclue.com/abc#zoom=50", "fitH")).toBe(
      "blob:https://arabclue.com/abc#view=FitH"
    );
  });

  test("supports FitV and page-actual zoom modes", () => {
    expect(pdfPreviewSrc("blob:local/x", "fitV")).toBe(
      "blob:local/x#view=FitV"
    );
    expect(pdfPreviewSrc("blob:local/x", "page")).toBe(
      "blob:local/x#zoom=page-actual"
    );
  });
});
