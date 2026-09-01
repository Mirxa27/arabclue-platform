/**
 * Two rows of the sidebar must never be tellable apart only by position.
 *
 * For an admin with `More` expanded, all three registers render into one rail
 * at once (`sidebar.tsx:294`, `:314`, `:337`). A repeated glyph there is not a
 * cosmetic slip — it is the nav telling someone that two different destinations
 * are the same thing, and the glyph is what they aim at before they read.
 *
 * Source-scanned rather than rendered because this repo runs no DOM in tests.
 * The first test is the anti-vacuity guard: every assertion below is over the
 * parsed rows, so a regex that stopped matching would make them all pass
 * against an empty list.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tr } from "../i18n";

const SIDEBAR = readFileSync(
  join(process.cwd(), "src/components/dashboard/sidebar.tsx"),
  "utf8"
);

const ROWS = [
  ...SIDEBAR.matchAll(
    /\{\s*view:\s*"([^"]+)",\s*key:\s*"([^"]+)",\s*icon:\s*(\w+)/g
  ),
].map(([, view, key, icon]) => ({ view, key, icon }));

/** Every value that appears more than once, with the rows that share it. */
function collisions(
  of: (row: (typeof ROWS)[number]) => string
): Record<string, string[]> {
  const seen: Record<string, string[]> = {};
  for (const row of ROWS) {
    const value = of(row);
    seen[value] = [...(seen[value] ?? []), row.view];
  }
  return Object.fromEntries(
    Object.entries(seen).filter(([, views]) => views.length > 1)
  );
}

describe("the sidebar's rows are distinguishable", () => {
  test("the scan reaches all three registers", () => {
    expect(SIDEBAR).toContain("const NAV_PRIMARY");
    expect(SIDEBAR).toContain("const NAV_SECONDARY");
    expect(SIDEBAR).toContain("const ADMIN_NAV");
    // Anti-vacuous: the whole file's worth of rows, not a partial match.
    expect(ROWS.length).toBeGreaterThanOrEqual(24);
    expect(ROWS.map((r) => r.view)).toContain("overview");
    expect(ROWS.map((r) => r.view)).toContain("admin_audit");
  });

  test("no two destinations share an icon", () => {
    expect(collisions((r) => r.icon)).toEqual({});
  });

  test("no two destinations share an English name", () => {
    // `billing` and `admin_billing` both read "Billing" while the Arabic tells
    // them apart (الاشتراك والدفع vs الفوترة والباقات). An admin sees both rows.
    expect(collisions((r) => tr(r.key, "en"))).toEqual({});
  });

  test("no two destinations share an Arabic name", () => {
    expect(collisions((r) => tr(r.key, "ar"))).toEqual({});
  });
});
