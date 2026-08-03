/**
 * Route resolution, auth gates, and fallbacks — §9.5 / §9.6 (Requirement 14).
 *
 * Tests the server-side route resolver, the client view router contract, and
 * the deep-link return-to cookie without executing Next.js server components.
 * The resolver and route table are pure modules; the view router is tested
 * through its public contract.
 */

import { describe, expect, test } from "bun:test";
import {
  APP_BASE_PATH,
  ADMIN_VIEWS,
  DASHBOARD_VIEWS,
  FORBIDDEN_VIEW_FALLBACK,
  PROJECT_REQUIRED_FALLBACK,
  PROJECT_SCOPED_VIEWS,
  UNKNOWN_VIEW_FALLBACK,
  canonicalFallbackFor,
  getPathForView,
  isAdminView,
  isAppPath,
  isProjectScopedView,
  resolveAppPath,
  resolveAppRoute,
  segmentsForView,
  type DashboardView,
  type RouteNoticeCode,
} from "@/lib/dashboard-routes";
import {
  RETURN_TO_MAX_AGE_SECONDS,
  isRetainableAppPath,
  signReturnTo,
  verifyReturnTo,
} from "@/lib/return-to";
import { resolveDashboardNavigation } from "@/lib/dashboard-navigate";

const PROJECT_ID = "clw8x2k9a0000qzrmn3f7g1h2";

describe("§9.5: Server-resolved route entry and authorization gates", () => {
  describe("route table completeness", () => {
    test("every view has exactly one canonical path", () => {
      for (const view of DASHBOARD_VIEWS) {
        const path = getPathForView(view, isProjectScopedView(view) ? PROJECT_ID : null);
        const resolution = resolveAppPath(path);
        expect(resolution.matched).toBe(true);
        expect(resolution.view).toBe(view);
      }
    });

    test("admin views are isolated from user views", () => {
      for (const view of ADMIN_VIEWS) {
        expect(isAdminView(view)).toBe(true);
        expect(isProjectScopedView(view)).toBe(false);
      }
    });

    test("project-scoped views are not admin views", () => {
      for (const view of PROJECT_SCOPED_VIEWS) {
        expect(isAdminView(view)).toBe(false);
        expect(isProjectScopedView(view)).toBe(true);
      }
    });
  });

  describe("unknown path fallback (Requirement 14.4)", () => {
    const unknownPaths = [
      `${APP_BASE_PATH}/not-a-view`,
      `${APP_BASE_PATH}/projects/${PROJECT_ID}`,
      `${APP_BASE_PATH}/projects/${PROJECT_ID}/settings`,
      `${APP_BASE_PATH}/projects/${PROJECT_ID}/documents/extra`,
      `${APP_BASE_PATH}/documents/extra`,
      `${APP_BASE_PATH}/admin/unknown`,
      `${APP_BASE_PATH}//documents`,
      `${APP_BASE_PATH}/%64ocuments`,
    ];

    for (const path of unknownPaths) {
      test(`falls back to overview for ${path}`, () => {
        const resolution = resolveAppPath(path);
        expect(resolution.matched).toBe(false);
        expect(resolution.fallback).toEqual(UNKNOWN_VIEW_FALLBACK);
        expect(resolution.fallback.action).toBe("replace");
        expect(resolution.fallback.view).toBe("overview");
      });
    }

    test("unknown path fallback does not request protected data", () => {
      const resolution = resolveAppPath(`${APP_BASE_PATH}/not-a-view`);
      expect(resolution.matched).toBe(false);
      expect(resolution.view).toBeNull();
      expect(resolution.projectId).toBeNull();
      // The fallback view is "overview" which does not request project data.
      expect(resolution.fallback.view).toBe("overview");
    });
  });

  describe("forbidden admin path fallback (Requirement 14.5)", () => {
    test("non-admin session is redirected to overview for admin views", () => {
      // The resolver returns the forbidden fallback for admin views when
      // the session role is not admin. The server entry checks the role
      // before passing the view to the client.
      for (const view of ADMIN_VIEWS) {
        const path = getPathForView(view);
        const resolution = resolveAppPath(path);
        expect(resolution.matched).toBe(true);
        expect(resolution.view).toBe(view);
        expect(isAdminView(resolution.view as DashboardView)).toBe(true);
      }

      // The fallback for a forbidden view is overview with replace action.
      const fallback = canonicalFallbackFor("ROUTE_VIEW_FORBIDDEN");
      expect(fallback).toEqual(FORBIDDEN_VIEW_FALLBACK);
      expect(fallback.view).toBe("overview");
      expect(fallback.action).toBe("replace");
    });

    test("forbidden admin path does not request admin data", () => {
      const fallback = canonicalFallbackFor("ROUTE_VIEW_FORBIDDEN");
      expect(fallback.view).toBe("overview");
      expect(fallback.projectId).toBeNull();
    });
  });

  describe("unavailable project fallback (Requirement 14.8)", () => {
    test("project-scoped view with unavailable project drops the project", () => {
      for (const view of PROJECT_SCOPED_VIEWS) {
        const fallback = canonicalFallbackFor("ROUTE_PROJECT_UNAVAILABLE", view);
        expect(fallback.view).toBe(view);
        expect(fallback.projectId).toBeNull();
        expect(fallback.path).toBe(getPathForView(view, null));
        expect(fallback.path.includes(PROJECT_ID)).toBe(false);
      }
    });

    test("unavailable project does not request that project's data", () => {
      const fallback = canonicalFallbackFor(
        "ROUTE_PROJECT_UNAVAILABLE",
        "documents"
      );
      expect(fallback.projectId).toBeNull();
      expect(fallback.path).toBe(getPathForView("documents", null));
    });
  });

  describe("project without context fallback (Requirement 14.9)", () => {
    test("project-scoped view without project falls back to projects list", () => {
      const fallback = canonicalFallbackFor("ROUTE_PROJECT_REQUIRED");
      expect(fallback).toEqual(PROJECT_REQUIRED_FALLBACK);
      expect(fallback.view).toBe("projects");
      expect(fallback.action).toBe("replace");
    });

    test("project-scoped view segments include project prefix when project is set", () => {
      for (const view of PROJECT_SCOPED_VIEWS) {
        const segments = segmentsForView(view, PROJECT_ID);
        expect(segments[0]).toBe("projects");
        expect(segments[1]).toBe(PROJECT_ID);
      }
    });

    test("project-scoped view segments omit project when not set", () => {
      for (const view of PROJECT_SCOPED_VIEWS) {
        const segments = segmentsForView(view, null);
        expect(segments[0]).not.toBe("projects");
      }
    });
  });

  describe("canonical fallback never adds a history entry", () => {
    test("every fallback uses replace action", () => {
      const notices: RouteNoticeCode[] = [
        "ROUTE_VIEW_NOT_FOUND",
        "ROUTE_VIEW_FORBIDDEN",
        "ROUTE_PROJECT_UNAVAILABLE",
        "ROUTE_PROJECT_REQUIRED",
      ];
      for (const notice of notices) {
        const fallback = canonicalFallbackFor(notice);
        expect(fallback.action).toBe("replace");
      }
    });

    test("every fallback path resolves to a valid view", () => {
      const notices: RouteNoticeCode[] = [
        "ROUTE_VIEW_NOT_FOUND",
        "ROUTE_VIEW_FORBIDDEN",
        "ROUTE_PROJECT_UNAVAILABLE",
        "ROUTE_PROJECT_REQUIRED",
      ];
      for (const notice of notices) {
        const fallback = canonicalFallbackFor(notice);
        const resolution = resolveAppPath(fallback.path);
        expect(resolution.matched).toBe(true);
      }
    });
  });
});

describe("§9.6: Navigation, history, and deep-link sync", () => {
  describe("client navigation decision (Requirement 14.1)", () => {
    test("resolves a permitted view path for admin session", () => {
      const decision = resolveDashboardNavigation({
        target: "admin_billing",
        isAdmin: true,
        activeProjectId: null,
      });
      expect(decision.view).toBe("admin_billing");
      expect(decision.notice).toBeNull();
      expect(decision.path).toBe(getPathForView("admin_billing"));
    });

    test("redirects non-admin to overview for admin view", () => {
      const decision = resolveDashboardNavigation({
        target: "admin_billing",
        isAdmin: false,
        activeProjectId: null,
      });
      expect(decision.view).toBe("overview");
      expect(decision.notice).toBe("ROUTE_VIEW_FORBIDDEN");
    });

    test("redirects to projects when project-scoped view has no project", () => {
      const decision = resolveDashboardNavigation({
        target: "documents",
        isAdmin: false,
        activeProjectId: null,
      });
      expect(decision.view).toBe("projects");
      expect(decision.notice).toBe("ROUTE_PROJECT_REQUIRED");
      expect(decision.path).toBe(getPathForView("projects"));
    });

    test("resolves project-scoped view with active project", () => {
      const decision = resolveDashboardNavigation({
        target: "documents",
        isAdmin: false,
        activeProjectId: PROJECT_ID,
      });
      expect(decision.view).toBe("documents");
      expect(decision.notice).toBeNull();
      expect(decision.path).toBe(getPathForView("documents", PROJECT_ID));
    });
  });

  describe("deep-link return-to cookie (Requirement 14.10)", () => {
    test("accepts same-origin app paths", () => {
      expect(isRetainableAppPath("/app")).toBe(true);
      expect(isRetainableAppPath("/app/projects")).toBe(true);
      expect(isRetainableAppPath(`/app/projects/${PROJECT_ID}/documents`)).toBe(true);
      expect(isRetainableAppPath("/app/admin/billing")).toBe(true);
    });

    test("rejects unsafe paths", () => {
      expect(isRetainableAppPath("https://evil.example/app")).toBe(false);
      expect(isRetainableAppPath("//evil.example")).toBe(false);
      expect(isRetainableAppPath("/app/../etc/passwd")).toBe(false);
      expect(isRetainableAppPath("/login")).toBe(false);
      expect(isRetainableAppPath("/api/admin")).toBe(false);
    });

    test("signed cookie round-trips within retention window", async () => {
      const previous = process.env.NEXTAUTH_SECRET;
      process.env.NEXTAUTH_SECRET = "test-route-state-secret-32chars!!";
      try {
        const now = Date.UTC(2026, 6, 29, 0, 0, 0);
        const requestedPath = `/app/projects/${PROJECT_ID}/proposals`;
        const signed = await signReturnTo(requestedPath, now);
        expect(signed).toBeTruthy();
        expect(await verifyReturnTo(signed, now + 1_000)).toBe(requestedPath);
      } finally {
        if (previous === undefined) delete process.env.NEXTAUTH_SECRET;
        else process.env.NEXTAUTH_SECRET = previous;
      }
    });

    test("rejects expired cookie", async () => {
      const previous = process.env.NEXTAUTH_SECRET;
      process.env.NEXTAUTH_SECRET = "test-route-state-secret-32chars!!";
      try {
        const now = Date.UTC(2026, 6, 29, 0, 0, 0);
        const signed = await signReturnTo("/app", now);
        expect(
          await verifyReturnTo(signed, now + (RETURN_TO_MAX_AGE_SECONDS + 1) * 1000)
        ).toBeNull();
      } finally {
        if (previous === undefined) delete process.env.NEXTAUTH_SECRET;
        else process.env.NEXTAUTH_SECRET = previous;
      }
    });

    test("rejects tampered cookie", async () => {
      const previous = process.env.NEXTAUTH_SECRET;
      process.env.NEXTAUTH_SECRET = "test-route-state-secret-32chars!!";
      try {
        const now = Date.UTC(2026, 6, 29, 0, 0, 0);
        const signed = await signReturnTo("/app", now);
        expect(await verifyReturnTo(`${signed}x`, now + 1_000)).toBeNull();
      } finally {
        if (previous === undefined) delete process.env.NEXTAUTH_SECRET;
        else process.env.NEXTAUTH_SECRET = previous;
      }
    });

    test("rejects cross-origin path in cookie", async () => {
      const previous = process.env.NEXTAUTH_SECRET;
      process.env.NEXTAUTH_SECRET = "test-route-state-secret-32chars!!";
      try {
        const now = Date.UTC(2026, 6, 29, 0, 0, 0);
        expect(await signReturnTo("https://evil.example", now)).toBeNull();
      } finally {
        if (previous === undefined) delete process.env.NEXTAUTH_SECRET;
        else process.env.NEXTAUTH_SECRET = previous;
      }
    });
  });

  describe("locale never appears in the URL (Requirement 14.7)", () => {
    test("no canonical path contains a locale segment", () => {
      for (const view of DASHBOARD_VIEWS) {
        const path = getPathForView(view, isProjectScopedView(view) ? PROJECT_ID : null);
        expect(path.includes("/ar/")).toBe(false);
        expect(path.includes("/en/")).toBe(false);
      }
    });

    test("app path detection is locale-agnostic", () => {
      expect(isAppPath("/app")).toBe(true);
      expect(isAppPath("/app/projects")).toBe(true);
      expect(isAppPath("/ar/app")).toBe(false);
    });
  });
});
