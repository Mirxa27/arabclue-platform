/**
 * Canonical dashboard route table — Requirement 14.1, 14.2, 14.3, 14.4, 14.6.
 *
 * Deterministic, exhaustive coverage of the pure route table: the view/path
 * mapping is enumerated over every `DashboardView` member rather than sampled.
 * The randomized property tests for the round trip and the unknown-path fallback
 * are separate tasks and carry their own tags.
 */

import { describe, expect, test } from "bun:test";
import {
  ADMIN_VIEWS,
  APP_BASE_PATH,
  DASHBOARD_VIEWS,
  FORBIDDEN_VIEW_FALLBACK,
  GLOBAL_VIEWS,
  OVERVIEW_PATH,
  PATH_TO_VIEW,
  PROJECTS_PATH,
  PROJECT_REQUIRED_FALLBACK,
  PROJECT_SCOPED_VIEWS,
  ROUTE_NOTICE_CODES,
  UNKNOWN_VIEW_FALLBACK,
  VIEW_PATHS,
  appPathSegments,
  canonicalFallbackFor,
  decodeProjectId,
  encodeProjectId,
  getPathForView,
  isAdminView,
  isAppPath,
  isDashboardView,
  isProjectScopedView,
  isValidProjectIdShape,
  parseProjectIdFromPath,
  parseViewFromPath,
  resolveAppPath,
  resolveAppRoute,
  segmentsForView,
  type DashboardView,
} from "@/lib/dashboard-routes";

const PROJECT_ID = "clw8x2k9a0000qzrmn3f7g1h2";

describe("dashboard route table completeness", () => {
  test("declares one canonical segment for every view", () => {
    expect(DASHBOARD_VIEWS.length).toBe(Object.keys(VIEW_PATHS).length);
    for (const view of DASHBOARD_VIEWS) {
      expect(typeof VIEW_PATHS[view]).toBe("string");
      expect(isDashboardView(view)).toBe(true);
    }
  });

  test("maps every segment back to exactly one view", () => {
    const segments = DASHBOARD_VIEWS.map((view) => VIEW_PATHS[view]);
    expect(new Set(segments).size).toBe(segments.length);
    expect(Object.keys(PATH_TO_VIEW).length).toBe(DASHBOARD_VIEWS.length);
    for (const view of DASHBOARD_VIEWS) {
      expect(PATH_TO_VIEW[VIEW_PATHS[view]]).toBe(view);
    }
  });

  test("splits the union into global and project-scoped halves", () => {
    const global = new Set(GLOBAL_VIEWS);
    for (const view of DASHBOARD_VIEWS) {
      expect(global.has(view)).toBe(!PROJECT_SCOPED_VIEWS.has(view));
    }
    expect(GLOBAL_VIEWS.length + PROJECT_SCOPED_VIEWS.size).toBe(
      DASHBOARD_VIEWS.length
    );
    for (const view of PROJECT_SCOPED_VIEWS) {
      expect(isAdminView(view)).toBe(false);
    }
  });

  test("rejects a value outside the union", () => {
    expect(isDashboardView("not-a-view")).toBe(false);
    expect(isDashboardView("admin")).toBe(false);
  });
});

describe("view to path and back", () => {
  test("round trips every view with its required project context", () => {
    for (const view of DASHBOARD_VIEWS) {
      const projectId = isProjectScopedView(view) ? PROJECT_ID : null;
      const path = getPathForView(view, projectId);
      const resolution = resolveAppPath(path);

      expect(resolution.matched).toBe(true);
      expect(resolution.view).toBe(view);
      expect(resolution.projectId).toBe(projectId);
      expect(resolution.canonicalPath).toBe(path);
    }
  });

  test("round trips every project-scoped view through catch-all segments", () => {
    for (const view of PROJECT_SCOPED_VIEWS) {
      const segments = segmentsForView(view, PROJECT_ID);
      expect(segments[0]).toBe("projects");
      expect(segments[1]).toBe(PROJECT_ID);

      const resolution = resolveAppRoute(segments);
      expect(resolution.matched).toBe(true);
      expect(resolution.view).toBe(view);
      expect(resolution.projectId).toBe(PROJECT_ID);
    }
  });

  test("omits the project identifier from every view that is not project-scoped", () => {
    for (const view of GLOBAL_VIEWS) {
      const path = getPathForView(view, PROJECT_ID);
      expect(path.includes(PROJECT_ID)).toBe(false);
      expect(parseProjectIdFromPath(path)).toBeNull();
      expect(parseViewFromPath(path)).toBe(view);
    }
  });

  test("keeps a project-scoped view addressable without a project", () => {
    for (const view of PROJECT_SCOPED_VIEWS) {
      const path = getPathForView(view, null);
      expect(path).toBe(`${APP_BASE_PATH}/${VIEW_PATHS[view]}`);
      const resolution = resolveAppPath(path);
      expect(resolution.matched).toBe(true);
      expect(resolution.view).toBe(view);
      expect(resolution.projectId).toBeNull();
    }
  });

  test("gives the overview view the bare shell path", () => {
    expect(getPathForView("overview")).toBe(APP_BASE_PATH);
    expect(getPathForView("overview", PROJECT_ID)).toBe(APP_BASE_PATH);
    expect(parseViewFromPath(APP_BASE_PATH)).toBe("overview");
    expect(parseViewFromPath(`${APP_BASE_PATH}/`)).toBe("overview");
  });

  test("treats one trailing slash as the same address for every view", () => {
    for (const view of DASHBOARD_VIEWS) {
      const projectId = isProjectScopedView(view) ? PROJECT_ID : null;
      const path = getPathForView(view, projectId);
      const resolution = resolveAppPath(`${path}/`);

      expect(resolution.matched).toBe(true);
      expect(resolution.view).toBe(view);
      expect(resolution.projectId).toBe(projectId);
      expect(resolution.canonicalPath).toBe(path);
    }
  });

  test("prefixes every administrator view and resolves it back", () => {
    for (const view of ADMIN_VIEWS) {
      const path = getPathForView(view);
      expect(path.startsWith(`${APP_BASE_PATH}/admin`)).toBe(true);
      const resolution = resolveAppPath(path);
      expect(resolution.matched).toBe(true);
      expect(resolution.view).toBe(view);
      expect(isAdminView(resolution.view as DashboardView)).toBe(true);
    }
    expect(getPathForView("admin_overview")).toBe(`${APP_BASE_PATH}/admin`);
    expect(getPathForView("admin_billing")).toBe(`${APP_BASE_PATH}/admin/billing`);
  });

  test("ignores an invalid project identifier when building a path", () => {
    expect(getPathForView("documents", "../secret")).toBe(
      `${APP_BASE_PATH}/documents`
    );
    expect(getPathForView("documents", "")).toBe(`${APP_BASE_PATH}/documents`);
    expect(getPathForView("documents", "a".repeat(65))).toBe(
      `${APP_BASE_PATH}/documents`
    );
  });
});

describe("project identifier encoding", () => {
  test("accepts an opaque url-safe identifier", () => {
    expect(isValidProjectIdShape(PROJECT_ID)).toBe(true);
    expect(encodeProjectId(PROJECT_ID)).toBe(PROJECT_ID);
    expect(decodeProjectId(PROJECT_ID)).toBe(PROJECT_ID);
    expect(decodeProjectId("a-b_C9")).toBe("a-b_C9");
  });

  test("rejects a separator, a traversal, an oversized value, and an empty value", () => {
    for (const candidate of ["a/b", "..", ".", "", "a".repeat(65), "a b", "a?b", "a#b"]) {
      expect(isValidProjectIdShape(candidate)).toBe(false);
      expect(encodeProjectId(candidate)).toBeNull();
      expect(decodeProjectId(candidate)).toBeNull();
    }
  });

  test("rejects an encoded separator and a malformed escape without throwing", () => {
    expect(decodeProjectId("a%2Fb")).toBeNull();
    expect(decodeProjectId("%E0%A4%A")).toBeNull();
    expect(decodeProjectId("%")).toBeNull();
  });

  test("decodes a percent-encoded identifier back to its plain form", () => {
    expect(decodeProjectId("abc%2D123")).toBe("abc-123");
  });

  test("never escapes an accepted identifier, so a canonical path has no escape", () => {
    for (const candidate of [
      PROJECT_ID,
      "a",
      "A-b_C9",
      "0123456789",
      "a".repeat(64),
    ]) {
      expect(encodeProjectId(candidate)).toBe(candidate);
      expect(getPathForView("documents", candidate)).not.toContain("%");
    }
  });
});

describe("unknown paths fail safely", () => {
  const unknownPaths = [
    `${APP_BASE_PATH}/not-a-view`,
    `${APP_BASE_PATH}/projects/${PROJECT_ID}`,
    `${APP_BASE_PATH}/projects/${PROJECT_ID}/settings`,
    `${APP_BASE_PATH}/projects/${PROJECT_ID}/documents/extra`,
    `${APP_BASE_PATH}/projects/not%20an%20id/documents`,
    `${APP_BASE_PATH}/projects/../documents`,
    `${APP_BASE_PATH}/documents/extra`,
    `${APP_BASE_PATH}/admin`.concat("/unknown"),
    `${APP_BASE_PATH}/admin/ai/extra`,
    `${APP_BASE_PATH}/admin_billing`,
    `${APP_BASE_PATH}//documents`,
    `${APP_BASE_PATH}/%E0%A4%A`,
    `${APP_BASE_PATH}/copilot/x`,
    `${APP_BASE_PATH}/${encodeURIComponent("documents/extra")}`,
    // A percent-encoded alias of a canonical segment is not a second address.
    `${APP_BASE_PATH}/%64ocuments`,
    `${APP_BASE_PATH}/document%73`,
    `${APP_BASE_PATH}/admin/%62illing`,
    `${APP_BASE_PATH}/projects/${PROJECT_ID}/%64ocuments`,
    `${APP_BASE_PATH}/%70rojects/${PROJECT_ID}/documents`,
    `${APP_BASE_PATH}/projects/abc%2D123/documents`,
    `${APP_BASE_PATH}//`,
    `${APP_BASE_PATH}/documents//`,
  ];

  for (const path of unknownPaths) {
    test(`falls back to overview with a replace action for ${path}`, () => {
      const resolution = resolveAppPath(path);
      expect(resolution.matched).toBe(false);
      expect(resolution.view).toBeNull();
      expect(resolution.projectId).toBeNull();
      expect(resolution.canonicalPath).toBeNull();
      expect(resolution.fallback).toEqual(UNKNOWN_VIEW_FALLBACK);
    });
  }

  test("treats a path outside the application shell as unmatched", () => {
    expect(isAppPath("/appearance")).toBe(false);
    expect(resolveAppPath("/appearance").matched).toBe(false);
    expect(resolveAppPath("/login").matched).toBe(false);
    expect(appPathSegments("/login")).toEqual([]);
  });

  test("never throws for a hostile path", () => {
    for (const path of [
      `${APP_BASE_PATH}/%`,
      `${APP_BASE_PATH}/%%%`,
      `${APP_BASE_PATH}/projects/%/documents`,
      `${APP_BASE_PATH}/${"a".repeat(500)}`,
      `${APP_BASE_PATH}/\u0000`,
    ]) {
      expect(() => resolveAppPath(path)).not.toThrow();
      expect(resolveAppPath(path).matched).toBe(false);
    }
  });

  test("returns raw segments below the shell path", () => {
    expect(appPathSegments(APP_BASE_PATH)).toEqual([]);
    expect(appPathSegments(`${APP_BASE_PATH}/documents`)).toEqual(["documents"]);
    expect(appPathSegments(`${APP_BASE_PATH}/admin/ai`)).toEqual(["admin", "ai"]);
    expect(appPathSegments(`${APP_BASE_PATH}//documents`)).toEqual([
      "",
      "documents",
    ]);
  });
});

describe("canonical fallbacks", () => {
  test("sends an unknown view to the overview path without a history entry", () => {
    expect(UNKNOWN_VIEW_FALLBACK).toEqual({
      view: "overview",
      projectId: null,
      path: OVERVIEW_PATH,
      notice: "ROUTE_VIEW_NOT_FOUND",
      action: "replace",
    });
    expect(OVERVIEW_PATH).toBe(APP_BASE_PATH);
  });

  test("sends a forbidden administrator view to the overview path", () => {
    expect(canonicalFallbackFor("ROUTE_VIEW_FORBIDDEN")).toEqual(
      FORBIDDEN_VIEW_FALLBACK
    );
    expect(FORBIDDEN_VIEW_FALLBACK.path).toBe(OVERVIEW_PATH);
    expect(FORBIDDEN_VIEW_FALLBACK.view).toBe("overview");
  });

  test("sends a missing project context to the projects path", () => {
    expect(canonicalFallbackFor("ROUTE_PROJECT_REQUIRED")).toEqual(
      PROJECT_REQUIRED_FALLBACK
    );
    expect(PROJECTS_PATH).toBe(`${APP_BASE_PATH}/projects`);
    expect(PROJECT_REQUIRED_FALLBACK.path).toBe(PROJECTS_PATH);
  });

  test("keeps the requested view and drops the project when it is unavailable", () => {
    for (const view of PROJECT_SCOPED_VIEWS) {
      const fallback = canonicalFallbackFor("ROUTE_PROJECT_UNAVAILABLE", view);
      expect(fallback.view).toBe(view);
      expect(fallback.projectId).toBeNull();
      expect(fallback.path).toBe(getPathForView(view, null));
      expect(fallback.path.includes(PROJECT_ID)).toBe(false);
    }
  });

  test("never adds a history entry for any notice", () => {
    for (const notice of ROUTE_NOTICE_CODES) {
      const fallback = canonicalFallbackFor(notice);
      expect(fallback.action).toBe("replace");
      expect(fallback.notice).toBe(notice);
      expect(resolveAppPath(fallback.path).matched).toBe(true);
    }
  });
});
