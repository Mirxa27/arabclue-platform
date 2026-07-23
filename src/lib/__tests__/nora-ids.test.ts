import { describe, expect, test } from "bun:test";
import {
  allowedNoraIdsFromSources,
  catalogNoraIds,
  extractNoraIds,
} from "../nora-ids";

describe("nora ids", () => {
  test("extracts TP/SP tokens from titles and control ids", () => {
    expect(extractNoraIds("NORA-SP1 Secure by Design (SP1)")).toEqual(
      expect.arrayContaining(["SP1"])
    );
    expect(extractNoraIds("Cloud First (TP1) and Zero Trust (SP2)")).toEqual(
      expect.arrayContaining(["TP1", "SP2"])
    );
  });

  test("catalog includes NORA TP1/SP1/SP2", () => {
    const cat = catalogNoraIds();
    expect(cat.has("TP1")).toBe(true);
    expect(cat.has("SP1")).toBe(true);
    expect(cat.has("SP2")).toBe(true);
    expect(cat.has("TP99")).toBe(false);
  });

  test("allowed set merges tender + compliance + catalog", () => {
    const allowed = allowedNoraIdsFromSources({
      tenderIds: ["BP1"],
      complianceTexts: ["NORA-SP1"],
      includeCatalog: true,
    });
    expect(allowed.has("BP1")).toBe(true);
    expect(allowed.has("SP1")).toBe(true);
    expect(allowed.has("TP1")).toBe(true);
  });
});
