/**
 * Persisted UI preferences — Requirement 14.2 and 14.7.
 *
 * The URL is the only authority for the rendered view, so no stored value may
 * restore `view`, `routeNotice`, or `adminMode`. Every other preference, and the
 * separate `arabclue-locale` store, keeps working.
 */

import { describe, expect, test } from "bun:test";
import {
  ADMIN_VIEWS,
  DASHBOARD_VIEWS,
  DEFAULT_UI_PREFERENCES,
  LOCALE_STORAGE_KEY,
  UI_PERSIST_OPTIONS,
  UI_PREFERENCES_VERSION,
  UI_STORAGE_KEY,
  sanitizePersistedUI,
  useLocale,
  useUI,
  type PersistedUIPreferences,
} from "@/lib/store";

/** A blob written by a build that still treated `view` as authoritative. */
const LEGACY_BLOB = {
  view: "admin_billing",
  adminMode: true,
  routeNotice: "ROUTE_VIEW_FORBIDDEN",
  mobileNavOpen: true,
  activeProjectId: "clw8x2k9a0000qzrmn3f7g1h2",
  tenderType: "CONSTRUCTION",
  sidebarCollapsed: true,
};

describe("persisted UI preferences", () => {
  test("drops every route field written by an older build", () => {
    const sanitized = sanitizePersistedUI(LEGACY_BLOB);

    expect(sanitized).toEqual({
      activeProjectId: "clw8x2k9a0000qzrmn3f7g1h2",
      tenderType: "CONSTRUCTION",
      sidebarCollapsed: true,
    });
    expect("view" in sanitized).toBe(false);
    expect("adminMode" in sanitized).toBe(false);
    expect("routeNotice" in sanitized).toBe(false);
    expect("mobileNavOpen" in sanitized).toBe(false);
  });

  test("ignores a malformed or hostile stored payload", () => {
    expect(sanitizePersistedUI(null)).toEqual({});
    expect(sanitizePersistedUI("nonsense")).toEqual({});
    expect(sanitizePersistedUI(42)).toEqual({});
    expect(sanitizePersistedUI({})).toEqual({});
    expect(sanitizePersistedUI({ activeProjectId: "../../etc/passwd" })).toEqual(
      {}
    );
    expect(sanitizePersistedUI({ activeProjectId: 7 })).toEqual({});
    expect(sanitizePersistedUI({ tenderType: "" })).toEqual({});
    expect(sanitizePersistedUI({ sidebarCollapsed: "yes" })).toEqual({});
    expect(sanitizePersistedUI({ activeProjectId: null })).toEqual({
      activeProjectId: null,
    });
  });

  test("writes only the non-route preferences to storage", () => {
    const persisted = UI_PERSIST_OPTIONS.partialize?.({
      ...useUI.getState(),
      view: "admin_billing",
      adminMode: true,
      routeNotice: "ROUTE_VIEW_FORBIDDEN",
      mobileNavOpen: true,
    });

    expect(UI_PERSIST_OPTIONS.name).toBe(UI_STORAGE_KEY);
    expect(UI_PERSIST_OPTIONS.version).toBe(UI_PREFERENCES_VERSION);
    expect(Object.keys(persisted ?? {}).sort()).toEqual([
      "activeProjectId",
      "autopilot",
      "sidebarCollapsed",
      "tenderType",
    ]);
    expect(JSON.stringify(persisted)).not.toContain("admin_billing");
  });

  test("never restores a stored view when rehydrating", () => {
    const current = { ...useUI.getState(), view: "overview" as const };
    const merged = UI_PERSIST_OPTIONS.merge?.(LEGACY_BLOB, current);

    expect(merged?.view).toBe("overview");
    expect(merged?.adminMode).toBe(false);
    expect(merged?.routeNotice).toBeNull();
    expect(merged?.mobileNavOpen).toBe(false);
  });

  test("restores every non-route preference when rehydrating", () => {
    const merged = UI_PERSIST_OPTIONS.merge?.(LEGACY_BLOB, useUI.getState());

    expect(merged?.activeProjectId).toBe("clw8x2k9a0000qzrmn3f7g1h2");
    expect(merged?.tenderType).toBe("CONSTRUCTION");
    expect(merged?.sidebarCollapsed).toBe(true);
  });

  test("migrates a legacy blob to the preference shape only", () => {
    const migrated = UI_PERSIST_OPTIONS.migrate?.(
      LEGACY_BLOB,
      0
    ) as PersistedUIPreferences;

    expect(Object.keys(migrated).sort()).toEqual([
      "activeProjectId",
      "autopilot",
      "sidebarCollapsed",
      "tenderType",
    ]);
    expect(migrated.tenderType).toBe("CONSTRUCTION");
  });

  test("falls back to the declared defaults for an unusable blob", () => {
    const migrated = UI_PERSIST_OPTIONS.migrate?.(
      { view: "billing" },
      0
    ) as PersistedUIPreferences;

    expect(migrated).toEqual(DEFAULT_UI_PREFERENCES);
    expect(useUI.getState().view).toBe("overview");
    expect(useUI.getState().tenderType).toBe(DEFAULT_UI_PREFERENCES.tenderType);
  });

  test("derives administrator mode from the route table for every view", () => {
    for (const view of DASHBOARD_VIEWS) {
      useUI.getState().setView(view);
      expect(useUI.getState().view).toBe(view);
      expect(useUI.getState().adminMode).toBe(ADMIN_VIEWS.has(view));

      useUI.getState().applyRoute({
        view,
        projectId: null,
        notice: null,
        replaceProject: false,
      });
      expect(useUI.getState().adminMode).toBe(ADMIN_VIEWS.has(view));
    }

    useUI.getState().setView("overview");
    expect(useUI.getState().adminMode).toBe(false);
  });

  test("keeps a project-scoped route's project without touching preferences", () => {
    useUI.getState().setActiveProjectId("clw8x2k9a0000qzrmn3f7g1h2");
    useUI.getState().applyRoute({
      view: "documents",
      projectId: null,
      notice: "ROUTE_PROJECT_REQUIRED",
      replaceProject: false,
    });

    expect(useUI.getState().activeProjectId).toBe("clw8x2k9a0000qzrmn3f7g1h2");
    expect(useUI.getState().routeNotice).toBe("ROUTE_PROJECT_REQUIRED");

    useUI.getState().applyRoute({
      view: "documents",
      projectId: null,
      notice: null,
      replaceProject: true,
    });
    expect(useUI.getState().activeProjectId).toBeNull();
    expect(useUI.getState().routeNotice).toBeNull();
  });

  test("keeps the locale store separate, Arabic first, and out of the URL", () => {
    expect(LOCALE_STORAGE_KEY).toBe("arabclue-locale");
    expect(useLocale.getState().locale).toBe("ar");
    expect(useLocale.getState().dir).toBe("rtl");

    useLocale.getState().setLocale("en");
    expect(useLocale.getState().dir).toBe("ltr");
    useLocale.getState().toggle();
    expect(useLocale.getState().locale).toBe("ar");
    expect(useLocale.getState().dir).toBe("rtl");
  });
});
