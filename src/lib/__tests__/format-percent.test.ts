import { describe, expect, test } from "bun:test";
import { formatPercent } from "@/lib/utils";

describe("formatPercent", () => {
  test("rounds float agent progress", () => {
    expect(formatPercent(16.666666666666667)).toBe("17");
  });

  test("clamps and handles nullish", () => {
    expect(formatPercent(null)).toBe("0");
    expect(formatPercent(undefined)).toBe("0");
    expect(formatPercent(150)).toBe("100");
    expect(formatPercent(-5)).toBe("0");
  });
});
