import { describe, expect, test } from "bun:test";
import { DEFAULT_PLANS } from "../constants";
import {
  exportFormatAllowed,
  parsePlanFeatures,
  planThatUnlocks,
} from "../plan-features";

const featuresOf = (name: string) =>
  parsePlanFeatures(DEFAULT_PLANS.find((p) => p.name === name)!.featuresJson);

describe("exportFormatAllowed", () => {
  test("Starter is PDF only, exactly as the pricing page sells it", () => {
    const starter = featuresOf("STARTER");
    expect(exportFormatAllowed(starter, "pdf")).toBe(true);
    expect(exportFormatAllowed(starter, "html")).toBe(true);
    for (const f of ["xlsx", "xlsx-matrix", "xlsx-boq", "pptx", "slides", "zip", "docx"]) {
      expect(exportFormatAllowed(starter, f)).toBe(false);
    }
  });

  test("Pro adds the office formats and the bid-package ZIP, not DOCX", () => {
    const pro = featuresOf("PRO");
    for (const f of ["pdf", "xlsx", "xlsx-matrix", "xlsx-boq", "pptx", "slides", "zip"]) {
      expect(exportFormatAllowed(pro, f)).toBe(true);
    }
    expect(exportFormatAllowed(pro, "docx")).toBe(false);
  });

  test("Enterprise and pay-as-you-go unlock everything", () => {
    for (const name of ["ENTERPRISE", "PAY_AS_YOU_GO"]) {
      for (const f of ["pdf", "xlsx", "pptx", "zip", "docx", "manifest"]) {
        expect(exportFormatAllowed(featuresOf(name), f)).toBe(true);
      }
    }
  });

  test("an unknown format is refused until it is classified", () => {
    expect(exportFormatAllowed(featuresOf("PRO"), "odt")).toBe(false);
  });

  test("malformed or missing featuresJson grants nothing but previews", () => {
    expect(parsePlanFeatures(null)).toEqual([]);
    expect(parsePlanFeatures("not json")).toEqual([]);
    expect(parsePlanFeatures(JSON.stringify({ a: 1 }))).toEqual([]);
    expect(exportFormatAllowed([], "pdf")).toBe(false);
    expect(exportFormatAllowed([], "html")).toBe(true);
  });

  test("the upgrade prompt names the cheapest plan that unlocks the format", () => {
    expect(planThatUnlocks("pptx")).toBe("PRO");
    expect(planThatUnlocks("docx")).toBe("ENTERPRISE");
  });
});
