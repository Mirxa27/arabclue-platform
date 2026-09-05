/**
 * The plan a visitor picked on the marketing site before they had an account.
 *
 * The pricing / register flow writes it to `localStorage` under
 * `INTENDED_PLAN_STORAGE_KEY` as JSON; the billing panel reads it once on
 * mount, preselects that plan and cycle, scrolls the card into view, and
 * clears the key. A record older than `INTENDED_PLAN_MAX_AGE_MS` is ignored:
 * a choice made two weeks ago is not a choice any more.
 */

export const INTENDED_PLAN_STORAGE_KEY = "arabclue-intended-plan";
export const INTENDED_PLAN_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export type IntendedPlanCode = "STARTER" | "PRO" | "ENTERPRISE";
export type IntendedPlanCycle = "monthly" | "yearly";

export type IntendedPlan = Readonly<{
  plan: IntendedPlanCode;
  cycle: IntendedPlanCycle;
  /** ISO timestamp of the choice. */
  at: string;
}>;

const PLAN_CODES: readonly string[] = ["STARTER", "PRO", "ENTERPRISE"];
const CYCLES: readonly string[] = ["monthly", "yearly"];

/** Parses a stored value; null for anything malformed, unknown, or stale. */
export function parseIntendedPlan(
  raw: string | null | undefined,
  now: Date = new Date()
): IntendedPlan | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as { plan?: unknown; cycle?: unknown; at?: unknown };
  if (typeof record.plan !== "string" || !PLAN_CODES.includes(record.plan)) {
    return null;
  }
  if (typeof record.cycle !== "string" || !CYCLES.includes(record.cycle)) {
    return null;
  }
  if (typeof record.at !== "string") return null;
  const at = Date.parse(record.at);
  if (!Number.isFinite(at)) return null;
  const age = now.getTime() - at;
  if (age < 0 || age > INTENDED_PLAN_MAX_AGE_MS) return null;

  return {
    plan: record.plan as IntendedPlanCode,
    cycle: record.cycle as IntendedPlanCycle,
    at: record.at,
  };
}

/** The visitor's stored choice, or null when absent, malformed, or stale. */
export function readIntendedPlan(now: Date = new Date()): IntendedPlan | null {
  if (typeof window === "undefined") return null;
  try {
    return parseIntendedPlan(
      window.localStorage.getItem(INTENDED_PLAN_STORAGE_KEY),
      now
    );
  } catch {
    return null;
  }
}

export function clearIntendedPlan(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(INTENDED_PLAN_STORAGE_KEY);
  } catch {
    // Storage disabled: nothing to clear.
  }
}
