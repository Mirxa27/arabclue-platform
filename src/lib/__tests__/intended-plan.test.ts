import { describe, expect, test } from "bun:test";
import {
  INTENDED_PLAN_MAX_AGE_MS,
  parseIntendedPlan,
} from "@/lib/intended-plan";

const NOW = new Date("2026-09-05T12:00:00.000Z");

describe("parseIntendedPlan", () => {
  test("returns a fresh, well-formed choice", () => {
    const at = new Date(NOW.getTime() - 60_000).toISOString();
    expect(
      parseIntendedPlan(JSON.stringify({ plan: "PRO", cycle: "yearly", at }), NOW)
    ).toEqual({ plan: "PRO", cycle: "yearly", at });
  });

  test("ignores a choice older than fourteen days", () => {
    const stale = new Date(NOW.getTime() - INTENDED_PLAN_MAX_AGE_MS - 1).toISOString();
    expect(
      parseIntendedPlan(JSON.stringify({ plan: "PRO", cycle: "monthly", at: stale }), NOW)
    ).toBeNull();
    // Exactly at the boundary still counts.
    const edge = new Date(NOW.getTime() - INTENDED_PLAN_MAX_AGE_MS).toISOString();
    expect(
      parseIntendedPlan(JSON.stringify({ plan: "PRO", cycle: "monthly", at: edge }), NOW)
    ).not.toBeNull();
  });

  test("ignores malformed, unknown, or future-dated records", () => {
    const at = NOW.toISOString();
    for (const raw of [
      null,
      "",
      "not json",
      "[]",
      JSON.stringify({ plan: "GOLD", cycle: "monthly", at }),
      JSON.stringify({ plan: "PRO", cycle: "weekly", at }),
      JSON.stringify({ plan: "PRO", cycle: "monthly" }),
      JSON.stringify({ plan: "PRO", cycle: "monthly", at: "yesterday" }),
      JSON.stringify({
        plan: "PRO",
        cycle: "monthly",
        at: new Date(NOW.getTime() + 60_000).toISOString(),
      }),
    ]) {
      expect(parseIntendedPlan(raw, NOW), String(raw)).toBeNull();
    }
  });
});
