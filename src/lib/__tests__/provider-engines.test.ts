import { describe, expect, test } from "bun:test";
import {
  normalizeEngines,
  parseProviderEngines,
  providerServesEngine,
  serializeEngines,
} from "../llm/model-catalog";

describe("multi-engine provider helpers", () => {
  test("normalizes arrays and falls back to DEFAULT", () => {
    expect(normalizeEngines(["ingestion", "DRAFTING", "ingestion"])).toEqual([
      "INGESTION",
      "DRAFTING",
    ]);
    expect(normalizeEngines(null)).toEqual(["DEFAULT"]);
    expect(normalizeEngines([], "LAW")).toEqual(["LAW"]);
  });

  test("parses enginesJson with legacy engine fallback", () => {
    expect(
      parseProviderEngines({
        engine: "DEFAULT",
        enginesJson: '["INGESTION","REWRITE"]',
      })
    ).toEqual(["INGESTION", "REWRITE"]);
    expect(
      parseProviderEngines({ engine: "VOICE", enginesJson: null })
    ).toEqual(["VOICE"]);
  });

  test("providerServesEngine matches multi-select list", () => {
    const row = {
      engine: "INGESTION",
      enginesJson: serializeEngines(["INGESTION", "COMPLIANCE", "DRAFTING"]),
    };
    expect(providerServesEngine(row, "DRAFTING")).toBe(true);
    expect(providerServesEngine(row, "VOICE")).toBe(false);
  });
});
