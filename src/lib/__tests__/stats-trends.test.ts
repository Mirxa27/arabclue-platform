import { describe, expect, test } from "bun:test";
import { trendPct } from "../stats-trends";

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
