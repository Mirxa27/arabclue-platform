/**
 * Review buttons on a panel whose route cannot review.
 *
 * The onboarding Partnerships panel rendered `KnowledgeReviewControls`, which
 * PATCHes its endpoint; `/api/partnerships` exports GET, POST and DELETE, and
 * the `Partnership` model has no review columns at all. Production answered
 * 405 to every click. The generic panel now takes `reviewable`, off for
 * models without review state, and this test keeps the two in step: any
 * panel that shows review controls must point at a route that exports PATCH.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const ONBOARDING = "src/components/dashboard/account-onboarding.tsx";

function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("SimpleCrudPanel review controls", () => {
  const src = read(ONBOARDING);

  test("the panel gates the review controls on `reviewable`", () => {
    expect(/reviewable\s*=\s*true/.test(src) || /reviewable\?:\s*boolean/.test(src)).toBe(true);
    expect(/\{reviewable\s*(&&|\?)[\s\S]{0,80}<KnowledgeReviewControls/.test(src)).toBe(true);
  });

  test("every reviewable panel points at a route that exports PATCH", () => {
    const blocks = src.match(/<SimpleCrudPanel[\s\S]*?\/>/g) ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    for (const block of blocks) {
      const endpoint = /endpoint="(\/api\/[a-z-]+)"/.exec(block)?.[1];
      expect(endpoint, block.slice(0, 80)).toBeDefined();
      const routeFile = join(REPO_ROOT, "src/app", endpoint!, "route.ts");
      expect(existsSync(routeFile), `${endpoint} route file`).toBe(true);
      const exportsPatch = /export async function PATCH/.test(readFileSync(routeFile, "utf8"));
      const reviewable = !/reviewable=\{false\}/.test(block);
      if (reviewable) {
        expect(exportsPatch, `${endpoint} shows review controls but has no PATCH`).toBe(true);
      }
    }
  });

  test("partnerships is not reviewable — its model has no review state", () => {
    const block = (src.match(/<SimpleCrudPanel[\s\S]*?\/>/g) ?? []).find((b) =>
      b.includes('endpoint="/api/partnerships"'),
    );
    expect(block).toBeDefined();
    expect(/reviewable=\{false\}/.test(block!)).toBe(true);
  });
});
