import { describe, expect, test } from "bun:test";
import { resolveTrend, trendPct } from "../stats-trends";

describe("trendPct", () => {
  test("returns null when there is no activity in either period", () => {
    expect(trendPct(0, 0)).toBeNull();
  });

  test("returns 100 when activity starts from zero", () => {
    expect(trendPct(3, 0)).toBe(100);
  });

  test("rounds positive and negative percentage changes", () => {
    expect(trendPct(15, 10)).toBe(50);
    expect(trendPct(8, 12)).toBe(-33);
  });
});

describe("resolveTrend", () => {
  test("returns null for missing or undefined trends", () => {
    expect(resolveTrend(null)).toBeNull();
    expect(resolveTrend(undefined)).toBeNull();
  });

  test("preserves numeric trend values including zero", () => {
    expect(resolveTrend(12)).toBe(12);
    expect(resolveTrend(-8)).toBe(-8);
    expect(resolveTrend(0)).toBe(0);
  });
});
