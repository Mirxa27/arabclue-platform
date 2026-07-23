import { describe, expect, test } from "bun:test";
import {
  aggregateTenderInsights,
  formatBudgetCompact,
  isActiveTenderStatus,
} from "@/lib/tender-insights";

describe("tender insights aggregation", () => {
  test("only active tenders count", () => {
    expect(isActiveTenderStatus("DRAFT")).toBe(true);
    expect(isActiveTenderStatus("REVIEW")).toBe(true);
    expect(isActiveTenderStatus("SUBMITTED")).toBe(false);
    expect(isActiveTenderStatus("ARCHIVED")).toBe(false);
  });

  test("groups budget by category and computes shares", () => {
    const result = aggregateTenderInsights([
      { category: "IT", budget: 30_000_000, status: "DRAFT" },
      { category: "IT", budget: 10_000_000, status: "REVIEW" },
      { category: "CONSTRUCTION", budget: 60_000_000, status: "DRAFTING" },
      { category: "IT", budget: 5_000_000, status: "SUBMITTED" }, // excluded
      { category: "MEDICAL", budget: null, status: "PARSING" }, // 0 budget, still counted
    ]);
    expect(result.activeCount).toBe(4);
    // total = 40M (IT) + 60M (CONSTRUCTION) + 0 (MEDICAL) = 100M
    expect(result.totalBudget).toBe(100_000_000);
    // sorted by budget desc → CONSTRUCTION first
    expect(result.rows[0].category).toBe("CONSTRUCTION");
    expect(result.rows[0].totalBudget).toBe(60_000_000);
    expect(result.rows[0].share).toBe(60);
    const it = result.rows.find((r) => r.category === "IT");
    expect(it?.count).toBe(2);
    expect(it?.totalBudget).toBe(40_000_000);
    expect(it?.share).toBe(40);
  });

  test("unknown category buckets as UNCATEGORIZED", () => {
    const result = aggregateTenderInsights([
      { category: "SPACE", budget: 1_000_000, status: "DRAFT" },
      { category: null, budget: 2_000_000, status: "DRAFT" },
    ]);
    const bucket = result.rows.find((r) => r.category === "UNCATEGORIZED");
    expect(bucket).toBeTruthy();
    expect(bucket?.count).toBe(2);
    expect(bucket?.totalBudget).toBe(3_000_000);
  });

  test("empty input yields empty insights", () => {
    const result = aggregateTenderInsights([]);
    expect(result.rows).toHaveLength(0);
    expect(result.totalBudget).toBe(0);
    expect(result.activeCount).toBe(0);
  });

  test("compact budget formatting", () => {
    expect(formatBudgetCompact(25_000_000)).toBe("25M SAR");
    expect(formatBudgetCompact(1_500_000_000)).toBe("1.5B SAR");
    expect(formatBudgetCompact(50_000)).toBe("50K SAR");
    expect(formatBudgetCompact(25_000_000, "ar")).toContain("ر.س");
  });
});
