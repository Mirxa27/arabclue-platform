import { describe, expect, test } from "bun:test";
import { trialsToFollowUp } from "@/components/admin/billing";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-09-05T12:00:00Z");
const sub = (id: string, status: string, endsInDays: number | null) => ({
  id,
  status,
  trialEndsAt: endsInDays === null ? null : new Date(now.getTime() + endsInDays * DAY_MS).toISOString(),
  currentPeriodEnd: new Date(now.getTime() + 30 * DAY_MS).toISOString(),
});

describe("trialsToFollowUp", () => {
  test("lists trials ending within two weeks or lapsed within two weeks, soonest first", () => {
    const rows = trialsToFollowUp(
      [
        sub("far", "TRIALING", 20),
        sub("soon", "TRIALING", 3),
        sub("lapsed", "TRIALING", -2),
        sub("old-lapse", "TRIALING", -20),
        sub("paid", "ACTIVE", 1),
        sub("today", "TRIALING", 0),
      ],
      now
    );
    expect(rows.map((r) => r.id)).toEqual(["lapsed", "today", "soon"]);
    expect(rows.find((r) => r.id === "lapsed")?.daysLeft).toBe(-2);
  });

  test("falls back to the period end when trialEndsAt is missing", () => {
    const rows = trialsToFollowUp([{ ...sub("legacy", "TRIALING", null), currentPeriodEnd: new Date(now.getTime() + 5 * DAY_MS).toISOString() }], now);
    expect(rows).toHaveLength(1);
    expect(rows[0].daysLeft).toBe(5);
  });
});
