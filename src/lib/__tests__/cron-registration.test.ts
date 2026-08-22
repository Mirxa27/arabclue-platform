/**
 * Guard tests for cron wiring.
 *
 * `/api/cron/analytics-retention` existed, was authenticated, and was covered
 * by tests, but was absent from `vercel.json`, so it never ran. That absence
 * was the only thing preventing the retention job from permanently destroying
 * analytics history, because the job deleted raw events without persisting the
 * summaries it computed.
 *
 * Both halves are asserted here: every cron route must be scheduled, and the
 * retention job must have somewhere durable to write before it is allowed to
 * delete.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

const vercelConfig = JSON.parse(
  readFileSync(join(REPO_ROOT, "vercel.json"), "utf8")
) as { crons?: Array<{ path: string; schedule: string }> };

const cronRouteDirs = readdirSync(
  join(REPO_ROOT, "src", "app", "api", "cron"),
  { withFileTypes: true }
)
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const scheduledPaths = new Set((vercelConfig.crons ?? []).map((c) => c.path));

describe("every cron route is scheduled", () => {
  test("there is at least one cron route to check", () => {
    expect(cronRouteDirs.length).toBeGreaterThan(0);
  });

  test.each(cronRouteDirs)("/api/cron/%s is present in vercel.json", (name) => {
    expect(scheduledPaths).toContain(`/api/cron/${name}`);
  });

  test("every scheduled cron path has a route on disk", () => {
    for (const path of scheduledPaths) {
      const name = path.replace("/api/cron/", "");
      expect(cronRouteDirs).toContain(name);
    }
  });

  test("every cron entry declares a schedule", () => {
    for (const entry of vercelConfig.crons ?? []) {
      expect(entry.schedule).toMatch(/^[\d*/,\-\s]+$/);
    }
  });
});

describe("analytics retention archives before it deletes", () => {
  const source = readFileSync(
    join(REPO_ROOT, "src", "lib", "analytics-retention.ts"),
    "utf8"
  );

  test("the retention client exposes a durable write", () => {
    expect(source).toContain("persistDailySummaries");
  });

  test("the delete is scoped to the summarised buckets", () => {
    expect(source).toContain("deleteArchivedEvents");
    // The unbounded form that ignored its limit and deleted everything past
    // the cutoff, including groups that were never counted.
    expect(source).not.toContain("deleteExpiredEvents");
  });

  test("a summary table exists in the schema for the write to land in", () => {
    const schema = readFileSync(
      join(REPO_ROOT, "prisma", "schema.prisma"),
      "utf8"
    );
    expect(schema).toContain("model AnalyticsDailySummary");
    expect(schema).toMatch(/@@unique\(\[workspaceId, eventType, day\]\)/);
  });
});
