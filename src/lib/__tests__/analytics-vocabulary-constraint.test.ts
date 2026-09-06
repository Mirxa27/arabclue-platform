/**
 * The database enforces the closed analytics vocabulary with a CHECK
 * constraint, and the TypeScript tuple is what the collector validates
 * against. The two drifted once: five activation events were added to the
 * tuple and never to the constraint, so every top-of-funnel append failed with
 * 23514, the collector swallowed it by design, and the activation funnel read
 * zero while accounts were being created.
 *
 * This test reads the migration that most recently (re)defined the constraint
 * and pins its value list to ANALYTICS_EVENT_TYPES, so the next vocabulary
 * addition fails here until a migration widens the CHECK.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ANALYTICS_EVENT_TYPES } from "../analytics-collector";

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");
const CONSTRAINT = "AnalyticsEvent_event_type_check";

function latestConstraintDefinition(): { migration: string; values: string[] } {
  const dirs = readdirSync(MIGRATIONS_DIR)
    .filter((entry) => statSync(join(MIGRATIONS_DIR, entry)).isDirectory())
    .sort();
  let found: { migration: string; values: string[] } | null = null;
  for (const dir of dirs) {
    const sql = readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8");
    const add = new RegExp(
      String.raw`ADD CONSTRAINT "${CONSTRAINT}"\s+CHECK \("eventType" IN \(([\s\S]*?)\)\)`,
      "u",
    ).exec(sql);
    if (!add) continue;
    const values = [...add[1].matchAll(/'([a-z_]+)'/gu)].map((m) => m[1]);
    found = { migration: dir, values };
  }
  if (!found) throw new Error(`no migration defines ${CONSTRAINT}`);
  return found;
}

describe("AnalyticsEvent_event_type_check mirrors ANALYTICS_EVENT_TYPES", () => {
  const latest = latestConstraintDefinition();

  test("the most recent definition lists every vocabulary value and nothing else", () => {
    expect([...latest.values].sort()).toEqual([...ANALYTICS_EVENT_TYPES].sort());
  });

  test("the definition carries no duplicate value", () => {
    expect(new Set(latest.values).size).toBe(latest.values.length);
  });

  test("the widening migration is the current definition", () => {
    expect(latest.migration).toBe("20260905220000_analytics_activation_vocabulary");
  });
});
