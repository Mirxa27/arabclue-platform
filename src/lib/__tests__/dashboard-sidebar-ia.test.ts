import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DASHBOARD_VIEWS, VIEW_LABEL_KEYS } from "@/lib/dashboard-routes";
import { tr, viewLabel } from "@/lib/i18n";

const source = readFileSync(
  join(import.meta.dir, "..", "..", "..", "src/components/dashboard/sidebar.tsx"),
  "utf8"
);

/**
 * The sidebar is the platform's complexity budget. The agent console is the home
 * view, so the rail carries only the five destinations a bid passes through and
 * holds every other panel behind one disclosure.
 */
describe("sidebar information architecture", () => {
  test("declares a primary rail and a disclosed remainder", () => {
    expect(source).toContain("NAV_PRIMARY");
    expect(source).toContain("NAV_SECONDARY");
    expect(source).toContain("nav_more");
  });

  test("the primary rail is the five-step bid path, starting at the agent", () => {
    const primary = source.slice(
      source.indexOf("const NAV_PRIMARY"),
      source.indexOf("const NAV_SECONDARY")
    );
    const views = [...primary.matchAll(/view: "([^"]+)"/g)].map((m) => m[1]);

    expect(views).toEqual([
      "overview",
      "projects",
      "documents",
      "proposals",
      "reviews",
    ]);
    expect(primary).toContain("nav_home_agent");
  });

  test("library and account panels are not in the primary rail", () => {
    const primary = source.slice(
      source.indexOf("const NAV_PRIMARY"),
      source.indexOf("const NAV_SECONDARY")
    );
    for (const view of [
      "marketplace",
      "clause-library",
      "template-editor",
      "billing",
      "settings",
      "analytics",
    ]) {
      expect(primary).not.toContain(`"${view}"`);
    }
  });

  test("the disclosure opens itself when the reader is standing inside it", () => {
    // Otherwise the active view can be hidden by its own collapsed group.
    expect(source).toContain("activeIsSecondary");
    expect(source).toContain("moreOpen || activeIsSecondary");
  });

  test("a badge hidden inside the disclosure is surfaced on the toggle", () => {
    expect(source).toContain("hiddenBadgeCount");
  });
});

/**
 * Opening `More` used to reveal twelve undifferentiated rows.
 *
 * Hiding them behind a disclosure moved the cost, it did not remove it: a
 * reader looking for "where do I change my VAT number" still reads all twelve
 * before choosing. Labelled runs turn that into one scan of three headings and
 * one scan of three-to-five rows.
 *
 * The heading is derived from adjacency — the render emits a label whenever a
 * row's `group` differs from the row above it — which buys a single source of
 * truth (`NAV_SECONDARY` stays one flat array, so `activeIsSecondary` and
 * `hiddenBadgeCount` keep working untouched) at the price of two failure modes
 * that are invisible on the screen you were not looking at:
 *
 *   - A row with no `group` inherits the heading above it and reads as part of
 *     a section it has nothing to do with.
 *   - The same group split across two runs renders its heading twice.
 *
 * Both ship green under every other test in this repo, so they are asserted
 * here against the declaration order itself.
 */
describe("the disclosed remainder is grouped", () => {
  const secondary = source.slice(
    source.indexOf("const NAV_SECONDARY"),
    source.indexOf("const ADMIN_NAV")
  );

  /**
   * `[^}]*` runs from the view string to the end of that row's object literal.
   * Rows hold no nested braces, and reading each row whole rather than matching
   * one long `view: … group: …` pattern keeps the parse indifferent to
   * Prettier's line wrapping and to the optional `badge` field in between.
   */
  const rows = [...secondary.matchAll(/view: "([^"]+)"([^}]*)/g)].map(
    ([, view, rest]) => ({
      view: view!,
      group: /group: "([^"]+)"/.exec(rest!)?.[1] ?? null,
    })
  );

  test("the parse reaches the disclosed rows", () => {
    // Anti-vacuous. A renamed constant would slice an empty string, and every
    // assertion below would pass against zero rows.
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(rows.map((r) => r.view)).toContain("billing");
    expect(rows.map((r) => r.view)).toContain("clause-library");
  });

  test("every disclosed row declares which group it belongs to", () => {
    const ungrouped = rows.filter((r) => r.group === null).map((r) => r.view);
    expect(
      ungrouped,
      `these rows would render under whichever heading precedes them:\n${ungrouped
        .map((v) => `  ${v}`)
        .join("\n")}`
    ).toEqual([]);
  });

  test("no group is split into two runs", () => {
    // Adjacency drives the heading, so a second run prints a second heading.
    const runs: string[] = [];
    for (const row of rows) {
      if (row.group && row.group !== runs[runs.length - 1]) runs.push(row.group);
    }
    expect(runs, `groups repeat: ${runs.join(" -> ")}`).toEqual([
      ...new Set(runs),
    ]);
    // Grouped means grouped — one run for everything is the flat list again.
    expect(new Set(runs).size).toBeGreaterThanOrEqual(3);
  });

  test("every group heading reads as a name in both locales", () => {
    for (const group of new Set(rows.map((r) => r.group))) {
      if (!group) continue;
      for (const locale of ["ar", "en"] as const) {
        const label = tr(group, locale);
        // `tr` echoes the key when nothing is registered, which on screen is a
        // heading that reads `nav_group_library`.
        expect(label).not.toBe(group);
        expect(label.trim().length).toBeGreaterThan(0);
      }
      expect(tr(group, "ar")).toMatch(/[؀-ۿ]/);
    }
  });
});

/**
 * The copilot announces where it just navigated. It knows the view as a route
 * key, so without one shared label table the user reads `clause-library` on
 * screen while the sidebar two inches away says "Clause Library".
 */
describe("dashboard view labels", () => {
  test("every view reads as a name, not a route key, in both locales", () => {
    for (const view of DASHBOARD_VIEWS) {
      for (const locale of ["ar", "en"] as const) {
        const label = viewLabel(view, locale);
        expect(label.trim().length).toBeGreaterThan(0);
        expect(label).not.toBe(view);
        // resolveTranslation returns the key itself when nothing is registered.
        expect(label).not.toBe(VIEW_LABEL_KEYS[view]);
      }
    }
  });
});
