"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  useUI,
  type RouteNoticeCode,
} from "@/lib/store";
import {
  getPathForView,
  isAdminView,
  isProjectScopedView,
  resolveAppPath,
  type DashboardView,
} from "@/lib/dashboard-routes";

/**
 * Decide whether a store-driven view change needs a URL push, and to where.
 *
 * Pure so the guard conditions can be tested directly: they are the whole
 * correctness argument for the effect that uses this, and getting one wrong
 * either leaves the URL stale again or starts a push/reconcile loop.
 *
 * Returns the path to push, or null to do nothing.
 */
export function resolveStoreDrivenPush(input: {
  /** False until the first server-resolution effect has run. */
  readonly hydrated: boolean;
  readonly sessionLoading: boolean;
  /** Last path this hook itself navigated to. */
  readonly ownedPath: string | null;
  readonly pathname: string;
  readonly view: DashboardView;
  readonly activeProjectId: string | null;
}): string | null {
  // Before hydration the server resolution owns the URL.
  if (!input.hydrated) return null;
  // A loading session cannot yet decide admin visibility.
  if (input.sessionLoading) return null;
  // The pathname is not one we pushed, so a URL-driven reconciliation is in
  // flight and owns this transition. Pushing here would race it.
  if (input.ownedPath !== input.pathname) return null;

  const expected = getPathForView(input.view, input.activeProjectId);
  // Already in sync: nothing to do, and pushing would loop.
  if (expected === input.pathname) return null;

  return expected;
}

export interface ViewRouterInit {
  /** View resolved on the server from the requested URL. */
  readonly initialView: DashboardView;
  /** Project resolved on the server, already checked against the workspace. */
  readonly initialProjectId: string | null;
  /** Canonical path for the resolved view and project. */
  readonly canonicalPath: string;
  /** Notice raised by the server resolution, or null. */
  readonly initialNotice: RouteNoticeCode | null;
  /** True when the URL named a project-scoped view without a project. */
  readonly projectContextMissing: boolean;
}

/**
 * Keeps the browser URL and the dashboard view in agreement — Requirement 14.
 *
 * The URL is authoritative. A user selection pushes exactly one history entry;
 * every correction the router makes itself replaces the current entry instead,
 * so back and forward always land on a view the user chose.
 */
export function useViewRouter(init: ViewRouterInit) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { view, activeProjectId, setRouteNotice, applyRoute } = useUI();

  const isAdmin =
    session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN";

  /** Path this hook last wrote, so a URL echo is not mistaken for navigation. */
  const ownedPath = useRef<string | null>(null);
  const hydrated = useRef(false);

  /** Replaces the current history entry without adding one. */
  const replacePath = useCallback(
    (path: string) => {
      if (path === pathname) return;
      ownedPath.current = path;
      router.replace(path, { scroll: false });
    },
    [pathname, router]
  );

  /**
   * Applies the server resolution once, then reconciles the URL. Requirement
   * 14.2: the view comes from the URL in preference to the persisted value.
   */
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;

    const persistedProjectId = useUI.getState().activeProjectId;

    // Requirement 14.9 — a project-scoped view with no project in the URL uses
    // the persisted active project, or falls back to the projects view.
    if (init.projectContextMissing) {
      if (persistedProjectId) {
        applyRoute({
          view: init.initialView,
          projectId: persistedProjectId,
          notice: init.initialNotice,
          replaceProject: false,
        });
        replacePath(getPathForView(init.initialView, persistedProjectId));
        return;
      }
      applyRoute({
        view: "projects",
        projectId: null,
        notice: init.initialNotice ?? "ROUTE_PROJECT_REQUIRED",
        replaceProject: true,
      });
      replacePath(getPathForView("projects"));
      return;
    }

    applyRoute({
      view: init.initialView,
      projectId: init.initialProjectId,
      notice: init.initialNotice,
      // A resolution that cleared the project must clear the persisted value too.
      replaceProject:
        init.initialProjectId !== null ||
        init.initialNotice === "ROUTE_PROJECT_UNAVAILABLE" ||
        isProjectScopedView(init.initialView),
    });

    ownedPath.current = init.canonicalPath;
    replacePath(init.canonicalPath);
  }, [init, applyRoute, replacePath]);

  /**
   * Navigates to a view in response to a user selection. Adds exactly one
   * history entry and performs no full document reload (Requirement 14.1).
   */
  const navigateToView = useCallback(
    (target: DashboardView) => {
      const permitted = isAdminView(target) && !isAdmin ? "overview" : target;
      const notice: RouteNoticeCode | null =
        permitted === target ? null : "ROUTE_VIEW_FORBIDDEN";

      if (isProjectScopedView(permitted) && !activeProjectId) {
        applyRoute({
          view: "projects",
          projectId: null,
          notice: "ROUTE_PROJECT_REQUIRED",
          replaceProject: false,
        });
        const projectsPath = getPathForView("projects");
        ownedPath.current = projectsPath;
        if (projectsPath !== pathname) router.push(projectsPath, { scroll: false });
        return;
      }

      const nextPath = getPathForView(permitted, activeProjectId);
      applyRoute({
        view: permitted,
        projectId: activeProjectId,
        notice,
        replaceProject: false,
      });

      ownedPath.current = nextPath;
      if (nextPath !== pathname) router.push(nextPath, { scroll: false });
    },
    [activeProjectId, applyRoute, isAdmin, pathname, router]
  );

  /**
   * Reconciles a URL change this hook did not initiate: browser back, forward,
   * or a pasted link inside an already-loaded shell (Requirement 14.3).
   *
   * The popstate listener restores the view/project synchronously within the
   * same event loop tick, well under the 300 ms requirement (Requirement 14.3).
   * The pathname effect is the fallback for programmatic navigation.
   */
  useEffect(() => {
    if (!hydrated.current) return;
    if (status === "loading") return;
    if (ownedPath.current === pathname) return;

    const resolution = resolveAppPath(pathname);

    if (!resolution.matched) {
      applyRoute({
        view: "overview",
        projectId: null,
        notice: "ROUTE_VIEW_NOT_FOUND",
        replaceProject: false,
      });
      replacePath(getPathForView("overview"));
      return;
    }

    if (isAdminView(resolution.view) && !isAdmin) {
      applyRoute({
        view: "overview",
        projectId: null,
        notice: "ROUTE_VIEW_FORBIDDEN",
        replaceProject: false,
      });
      replacePath(getPathForView("overview"));
      return;
    }

    if (isProjectScopedView(resolution.view) && !resolution.projectId) {
      const persisted = useUI.getState().activeProjectId;
      if (!persisted) {
        applyRoute({
          view: "projects",
          projectId: null,
          notice: "ROUTE_PROJECT_REQUIRED",
          replaceProject: false,
        });
        replacePath(getPathForView("projects"));
        return;
      }
    }

    ownedPath.current = pathname;
    applyRoute({
      view: resolution.view,
      projectId: resolution.projectId,
      notice: null,
      replaceProject: resolution.projectId !== null,
    });
  }, [pathname, status, isAdmin, applyRoute, replacePath]);

  /**
   * Explicit popstate listener for back/forward restoration (Requirement 14.3).
   *
   * `usePathname()` already fires on popstate, but this listener guarantees
   * the view/project is restored within the same event loop tick — well under
   * the 300 ms requirement — without waiting for React's render cycle. The
   * pathname effect above is the authoritative reconciliation; this listener
   * is an optimization that applies the route state synchronously.
   */
  useEffect(() => {
    if (!hydrated.current) return;
    const onPopState = () => {
      const currentPath = window.location.pathname;
      if (ownedPath.current === currentPath) return;

      const resolution = resolveAppPath(currentPath);
      if (!resolution.matched) {
        applyRoute({
          view: "overview",
          projectId: null,
          notice: "ROUTE_VIEW_NOT_FOUND",
          replaceProject: false,
        });
        return;
      }

      if (isAdminView(resolution.view) && !isAdmin) {
        applyRoute({
          view: "overview",
          projectId: null,
          notice: "ROUTE_VIEW_FORBIDDEN",
          replaceProject: false,
        });
        return;
      }

      if (isProjectScopedView(resolution.view) && !resolution.projectId) {
        const persisted = useUI.getState().activeProjectId;
        if (!persisted) {
          applyRoute({
            view: "projects",
            projectId: null,
            notice: "ROUTE_PROJECT_REQUIRED",
            replaceProject: false,
          });
          return;
        }
      }

      ownedPath.current = currentPath;
      applyRoute({
        view: resolution.view,
        projectId: resolution.projectId,
        notice: null,
        replaceProject: resolution.projectId !== null,
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isAdmin, applyRoute]);

  /**
   * Keeps the URL in step when the active project changes while a
   * project-scoped view is open (Requirement 14.6).
   */
  useEffect(() => {
    if (!hydrated.current) return;
    if (!isProjectScopedView(view)) return;
    const expected = getPathForView(view, activeProjectId);
    if (expected !== pathname) replacePath(expected);
  }, [view, activeProjectId, pathname, replacePath]);

  /**
   * Keeps the URL in step when the view is changed through the store rather
   * than through `navigateToView`.
   *
   * `navigateToView` exists precisely to push the URL alongside the view, but
   * it had zero consumers: roughly fifty in-content buttons call `setView`
   * straight off the Zustand store, which never touches the URL. The result was
   * that reload, browser back/forward and link sharing all returned the user to
   * whatever view the stale URL named, not the one they were looking at.
   *
   * Fixing this at the fifty call sites would leave the fifty-first broken, so
   * the reconciliation lives here instead — one place, and impossible for a new
   * component to bypass.
   *
   * The `ownedPath` guard is what keeps this from fighting the URL-to-store
   * effect above. When the pathname is one this hook pushed, the two are in
   * sync and any divergence must have come from the store, so a push is
   * correct. When it is not, a URL-driven reconciliation is already in flight
   * and this must stay out of its way.
   */
  useEffect(() => {
    const target = resolveStoreDrivenPush({
      hydrated: hydrated.current,
      sessionLoading: status === "loading",
      ownedPath: ownedPath.current,
      pathname,
      view,
      activeProjectId,
    });
    if (!target) return;

    ownedPath.current = target;
    router.push(target, { scroll: false });
  }, [view, activeProjectId, pathname, status, router]);

  return {
    navigateToView,
    currentPath: pathname,
    dismissNotice: useCallback(() => setRouteNotice(null), [setRouteNotice]),
  };
}
