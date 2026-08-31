/**
 * Four sidebar destinations opened a screen the user could already be looking at.
 *
 * `/app/copilot` rendered the same component as `/app`. `/app/brand` rendered the
 * same component as `/app/account` under a character-identical label, reachable
 * from no nav group at all. `/app/compliance` and `/app/history` each rendered a
 * strict subset of the panels `/app/documents` already stacks on one screen.
 *
 * Removing them from the route table is not enough on its own: a bookmark or a
 * pasted link to a deleted segment falls through to `ROUTE_VIEW_NOT_FOUND`, which
 * lands the reader on the home agent and tells them their route does not exist.
 * A retirement is an address change, so each retired segment resolves to the
 * screen that absorbed it — carrying the project context when both halves are
 * project-scoped — and says so in the reader's own language.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DASHBOARD_VIEWS,
  RETIRED_VIEWS,
  isDashboardView,
  resolveAppPath,
} from "@/lib/dashboard-routes";
import { getCompletionErrorContract } from "@/lib/i18n";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

describe("retired dashboard views", () => {
  test("the retired segments are no longer live views", () => {
    for (const segment of ["copilot", "brand", "compliance", "history"]) {
      expect(isDashboardView(segment)).toBe(false);
    }
  });

  test("every retirement points at a view that still exists", () => {
    const live = new Set<string>(DASHBOARD_VIEWS);
    for (const [retired, replacement] of Object.entries(RETIRED_VIEWS)) {
      expect(live.has(replacement)).toBe(true);
      expect(live.has(retired)).toBe(false);
    }
  });

  test("a retired address resolves to the screen that absorbed it", () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["/app/copilot", "/app"],
      ["/app/brand", "/app/account"],
      ["/app/compliance", "/app/documents"],
      ["/app/history", "/app/documents"],
    ];
    for (const [from, to] of cases) {
      const resolved = resolveAppPath(from);
      expect(resolved.matched).toBe(false);
      expect(resolved.fallback?.path).toBe(to);
      expect(resolved.fallback?.notice).toBe("ROUTE_VIEW_MOVED");
      expect(resolved.fallback?.action).toBe("replace");
    }
  });

  test("a project-scoped retirement keeps the project it was opened for", () => {
    // Dropping the id here would silently move the reader to another project's
    // documents, or to none at all.
    const resolved = resolveAppPath("/app/projects/cmr0abc123/compliance");
    expect(resolved.fallback?.path).toBe("/app/projects/cmr0abc123/documents");
    expect(resolved.fallback?.notice).toBe("ROUTE_VIEW_MOVED");
  });

  test("a genuinely unknown path still reads as not found", () => {
    // The retirement must not swallow every miss into a reassuring message.
    const resolved = resolveAppPath("/app/nothing-here");
    expect(resolved.fallback?.notice).toBe("ROUTE_VIEW_NOT_FOUND");
    expect(resolved.fallback?.path).toBe("/app");
  });

  test("the move is explained in both locales", () => {
    // `RouteNotice` renders `contract.message[locale]` (views.tsx), so the
    // notice is only legible if the contract itself resolves.
    const { message } = getCompletionErrorContract("ROUTE_VIEW_MOVED");
    expect(message.en.trim().length).toBeGreaterThan(0);
    expect(message.ar).toMatch(/[؀-ۿ]/);
    expect(message.ar).not.toBe(message.en);
  });
});

describe("no two destinations open the same screen", () => {
  const views = readFileSync(
    join(REPO_ROOT, "src/components/dashboard/views.tsx"),
    "utf8"
  );

  test("the registry scan reaches the registry", () => {
    // Anti-vacuous: a rename would otherwise turn the assertion below into a
    // check that an empty list has no duplicates.
    expect(views).toContain("const VIEW_REGISTRY");
  });

  test("each live view renders a component no other live view renders", () => {
    const block = views.slice(
      views.indexOf("const VIEW_REGISTRY"),
      views.indexOf("export function DashboardViews")
    );
    const entries = [...block.matchAll(/^\s+"?([\w-]+)"?:\s*(\w+),$/gm)];
    expect(entries.length).toBe(DASHBOARD_VIEWS.length);

    const byComponent = new Map<string, string[]>();
    for (const [, view, component] of entries) {
      byComponent.set(component!, [...(byComponent.get(component!) ?? []), view!]);
    }
    const duplicates = [...byComponent.entries()].filter(
      ([, list]) => list.length > 1
    );
    expect(
      duplicates,
      `these views are the same screen under two addresses:\n${duplicates
        .map(([component, list]) => `  ${component}: ${list.join(", ")}`)
        .join("\n")}`
    ).toEqual([]);
  });

  test("the sidebar offers no retired destination", () => {
    const sidebar = readFileSync(
      join(REPO_ROOT, "src/components/dashboard/sidebar.tsx"),
      "utf8"
    );
    for (const retired of Object.keys(RETIRED_VIEWS)) {
      expect(sidebar).not.toContain(`view: "${retired}"`);
    }
  });
});
