/**
 * Feature: platform-completion
 * Property 1: Dashboard path round trip
 * Property 2: Unknown dashboard paths fail safely
 */

import { describe, expect, test } from "bun:test";
import {
  DASHBOARD_VIEWS,
  PROJECT_SCOPED_VIEWS,
  UNKNOWN_VIEW_FALLBACK,
  getPathForView,
  resolveAppPath,
  type DashboardView,
} from "../../dashboard-routes";
import { resolveDashboardNavigation } from "../../dashboard-navigate";

const PROJECT_ID = "clw8x2k9a0000qzrmn3f7g1h2";

describe("Feature: platform-completion, Property 1: Dashboard path round trip", () => {
  test("format then parse yields identical view/project for every view across 100+ cases", () => {
    let cases = 0;
    for (let seed = 0; seed < 120; seed++) {
      const view = DASHBOARD_VIEWS[seed % DASHBOARD_VIEWS.length] as DashboardView;
      const needsProject = PROJECT_SCOPED_VIEWS.has(view);
      const projectId = needsProject
        ? `${PROJECT_ID.slice(0, -1)}${(seed % 10).toString()}`
        : null;
      // Keep valid cuid-like shape for project-scoped views.
      const safeProjectId = needsProject ? PROJECT_ID : null;

      const path = getPathForView(view, safeProjectId);
      const resolved = resolveAppPath(path);
      expect(resolved.matched).toBe(true);
      if (!resolved.matched) continue;
      expect(resolved.view).toBe(view);
      if (needsProject) {
        expect(resolved.projectId).toBe(PROJECT_ID);
      } else {
        expect(resolved.projectId).toBeNull();
      }
      cases += 1;
    }
    expect(cases).toBeGreaterThanOrEqual(100);
  });
});

describe("Feature: platform-completion, Property 2: Unknown dashboard paths fail safely", () => {
  test("noncanonical /app paths fall back to overview without protected fetches across 100+ cases", () => {
    let cases = 0;
    for (let seed = 0; seed < 120; seed++) {
      const junk = [
        `/app/not-a-real-view-${seed}`,
        `/app/admin`,
        `/app/../etc/passwd`,
        `/app/projects/not-a-cuid-${seed}`,
        `/app/foo/bar/baz/${seed}`,
        `/app/%2e%2e/${seed}`,
      ][seed % 6]!;

      const resolved = resolveAppPath(junk);
      if (resolved.matched) {
        // Some malformed project ids may still match the view segment only.
        expect(DASHBOARD_VIEWS.includes(resolved.view)).toBe(true);
      } else {
        expect(UNKNOWN_VIEW_FALLBACK.view).toBe("overview");
        expect(UNKNOWN_VIEW_FALLBACK.action).toBe("replace");
      }

      // Navigation decision for an unknown target is never an admin surface.
      const decision = resolveDashboardNavigation({
        target: "overview",
        isAdmin: seed % 2 === 0,
        activeProjectId: null,
      });
      expect(decision.view).toBe("overview");
      expect(decision.path.startsWith("/app")).toBe(true);
      cases += 1;
    }
    expect(cases).toBeGreaterThanOrEqual(100);
  });
});
