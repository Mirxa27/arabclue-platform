/**
 * Guard tests for URL/view reconciliation.
 *
 * `navigateToView` exists to push the URL alongside the view, but it had zero
 * consumers: roughly fifty in-content buttons call `setView` straight off the
 * Zustand store, which never touches the URL. Reload, browser back/forward and
 * link sharing therefore returned the user to whatever view the stale URL
 * named. Fixing the fifty call sites would leave the fifty-first broken, so the
 * reconciliation lives in one effect in `use-view-router`.
 *
 * These test the effect's guard conditions directly, because getting one wrong
 * either leaves the URL stale again or starts a push/reconcile loop.
 */
import { describe, expect, test } from "bun:test";
import { resolveStoreDrivenPush } from "@/hooks/use-view-router";
import { getPathForView } from "@/lib/dashboard-routes";

const base = {
  hydrated: true,
  sessionLoading: false,
  ownedPath: "/app",
  pathname: "/app",
  view: "overview" as const,
  activeProjectId: null,
};

describe("resolveStoreDrivenPush", () => {
  test("pushes when the store view diverges from an owned pathname", () => {
    expect(
      resolveStoreDrivenPush({ ...base, view: "billing" })
    ).toBe(getPathForView("billing"));
  });

  test("does nothing when the URL already matches the view", () => {
    expect(
      resolveStoreDrivenPush({
        ...base,
        view: "billing",
        pathname: getPathForView("billing"),
        ownedPath: getPathForView("billing"),
      })
    ).toBeNull();
  });

  // Without this the effect would fight the URL-to-store reconciliation that
  // runs on browser back/forward, and the two would push each other in a loop.
  test("stays out of the way when the pathname is not one we pushed", () => {
    expect(
      resolveStoreDrivenPush({
        ...base,
        view: "billing",
        pathname: "/app/documents",
        ownedPath: "/app",
      })
    ).toBeNull();
  });

  test("does nothing before hydration", () => {
    expect(
      resolveStoreDrivenPush({ ...base, view: "billing", hydrated: false })
    ).toBeNull();
  });

  test("does nothing while the session is still loading", () => {
    expect(
      resolveStoreDrivenPush({ ...base, view: "billing", sessionLoading: true })
    ).toBeNull();
  });

  test("carries the active project for a project-scoped view", () => {
    const target = resolveStoreDrivenPush({
      ...base,
      view: "documents",
      activeProjectId: "proj-1",
    });
    expect(target).toBe(getPathForView("documents", "proj-1"));
    expect(target).toContain("proj-1");
  });

  test("a project change while on a project-scoped view retargets the URL", () => {
    const current = getPathForView("documents", "proj-1");
    expect(
      resolveStoreDrivenPush({
        ...base,
        view: "documents",
        activeProjectId: "proj-2",
        pathname: current,
        ownedPath: current,
      })
    ).toBe(getPathForView("documents", "proj-2"));
  });

  test("an admin view resolves to its own path", () => {
    expect(
      resolveStoreDrivenPush({ ...base, view: "admin_audit" })
    ).toBe(getPathForView("admin_audit"));
  });

  test("the returned path is always canonical for the state", () => {
    for (const view of ["projects", "contracts", "settings", "marketplace"] as const) {
      const target = resolveStoreDrivenPush({ ...base, view });
      expect(target).toBe(getPathForView(view, null));
    }
  });

  test("repeated evaluation at the target is idempotent", () => {
    // Simulates the effect re-running after its own push landed.
    const first = resolveStoreDrivenPush({ ...base, view: "billing" })!;
    const second = resolveStoreDrivenPush({
      ...base,
      view: "billing",
      pathname: first,
      ownedPath: first,
    });
    expect(second).toBeNull();
  });
});
