"use client";

import { startTransition } from "react";
import { create } from "zustand";
import { persist, type PersistOptions } from "zustand/middleware";
import type { Locale } from "@/lib/types";
import {
  isAdminView,
  isValidProjectIdShape,
  type DashboardView,
  type RouteNoticeCode,
} from "@/lib/dashboard-routes";

interface LocaleState {
  locale: Locale;
  dir: "rtl" | "ltr";
  setLocale: (l: Locale) => void;
  toggle: () => void;
}

/** Storage key of the persisted locale. Locale never travels in the URL. */
export const LOCALE_STORAGE_KEY = "arabclue-locale";

/** Cookie name for server-readable locale persistence. */
export const LOCALE_COOKIE_NAME = "arabclue-locale";
const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

/**
 * Writes the locale cookie so the server can read the user's language
 * preference on subsequent requests (server-first behavior).
 */
export function persistLocaleCookie(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}

/** Syncs document element attributes for immediate RTL/LTR feedback. */
export function syncDocumentAttributes(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
}

/**
 * Persist locale to cookie + primary storage key (and a one-generation
 * marketing-key mirror so older public pages keep reading the same preference).
 */
export function persistLocalePreference(locale: Locale): void {
  if (typeof window !== "undefined") {
    // Zustand `persist` owns LOCALE_STORAGE_KEY as JSON `{ state, version }`.
    // Never overwrite that blob with a bare "ar"/"en" string — it breaks rehydrate
    // and onRehydrateStorage then resets the cookie back to Arabic.
    const dir = locale === "ar" ? "rtl" : "ltr";
    let payload = JSON.stringify({ state: { locale, dir }, version: 0 });
    const existing = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (existing) {
      try {
        const parsed = JSON.parse(existing) as {
          state?: Record<string, unknown>;
          version?: number;
        };
        if (parsed && typeof parsed === "object" && parsed.state) {
          payload = JSON.stringify({
            ...parsed,
            state: { ...parsed.state, locale, dir },
          });
        }
      } catch {
        // Corrupt / legacy bare value — replace with a fresh persist payload.
      }
    }
    window.localStorage.setItem(LOCALE_STORAGE_KEY, payload);
    // Compat mirror — remove once marketing pages exclusively use the store key.
    window.localStorage.setItem("arabclue-marketing-locale", locale);
  }
  persistLocaleCookie(locale);
  syncDocumentAttributes(locale);
}

/**
 * Yield past the current interaction frame before writing storage / flipping
 * `document.dir`. Synchronous RTL/LTR reflow inside a click handler is a
 * common INP regression on large bilingual trees.
 */
export function scheduleLocalePersistence(locale: Locale): void {
  if (typeof window === "undefined") {
    persistLocalePreference(locale);
    return;
  }
  window.requestAnimationFrame(() => {
    window.setTimeout(() => persistLocalePreference(locale), 0);
  });
}

/** Read the persisted locale preference with Arabic default. */
export function readPersistedLocale(): Locale {
  if (typeof window === "undefined") return "ar";
  const primary = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (primary === "ar" || primary === "en") return primary;
  if (primary) {
    try {
      const fromPersist = (JSON.parse(primary) as { state?: { locale?: string } })
        ?.state?.locale;
      if (fromPersist === "ar" || fromPersist === "en") return fromPersist;
    } catch {
      // ignore corrupt payload
    }
  }
  const legacy = window.localStorage.getItem("arabclue-marketing-locale");
  if (legacy === "ar" || legacy === "en") return legacy;
  return "ar";
}

export const useLocale = create<LocaleState>()(
  persist(
    (set, get) => ({
      locale: "ar",
      dir: "rtl",
      setLocale: (locale) => {
        startTransition(() => {
          set({ locale, dir: locale === "ar" ? "rtl" : "ltr" });
        });
        scheduleLocalePersistence(locale);
      },
      toggle: () => {
        const next = get().locale === "ar" ? "en" : "ar";
        startTransition(() => {
          set({ locale: next, dir: next === "ar" ? "rtl" : "ltr" });
        });
        scheduleLocalePersistence(next);
      },
    }),
    {
      name: LOCALE_STORAGE_KEY,
      onRehydrateStorage: () => (state) => {
        // Ensure cookie exists after rehydration from localStorage
        if (state) {
          persistLocalePreference(state.locale);
        }
      },
    }
  )
);

// --------------------------------------------------------------------------
// Addressable Views: the canonical route table lives in a pure, server-safe
// module so a server component can resolve a URL before fetching any protected
// data. Re-exported here for existing client callers.
// --------------------------------------------------------------------------

export {
  APP_BASE_PATH,
  ADMIN_VIEWS,
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
} from "@/lib/dashboard-routes";
export type {
  AppRouteResolution,
  CanonicalFallback,
  DashboardView,
  RouteNoticeCode,
} from "@/lib/dashboard-routes";

/**
 * The only UI state that survives a reload. `view`, `activeProjectId` in the URL,
 * `routeNotice`, and `adminMode` are route state: the URL is their single source
 * of authority (Requirement 14.2), so they are never restored from storage.
 *
 * `activeProjectId` is a session preference rather than route authority — a
 * project-scoped path carries its own identifier, and the persisted value is only
 * consulted when a path carries none (Requirement 14.9).
 */
export interface PersistedUIPreferences {
  activeProjectId: string | null;
  tenderType: string;
  sidebarCollapsed: boolean;
  /** Run the agents when a tender document is uploaded, and open the result. */
  autopilot: boolean;
}

/** Bumped when the persisted preference shape changes. */
export const UI_PREFERENCES_VERSION = 2;

export const DEFAULT_UI_PREFERENCES: PersistedUIPreferences = Object.freeze({
  activeProjectId: null,
  tenderType: "IT",
  sidebarCollapsed: false,
  autopilot: true,
});

/**
 * Keeps only the persisted preferences, discarding any route field an older
 * build wrote. Pure and total: unknown, malformed, and legacy payloads all yield
 * a partial preference object with no route authority.
 */
export function sanitizePersistedUI(
  persisted: unknown
): Partial<PersistedUIPreferences> {
  if (typeof persisted !== "object" || persisted === null) return {};
  const stored = persisted as Record<string, unknown>;
  const preferences: Partial<PersistedUIPreferences> = {};

  const projectId = stored.activeProjectId;
  if (typeof projectId === "string" && isValidProjectIdShape(projectId)) {
    preferences.activeProjectId = projectId;
  } else if (projectId === null) {
    preferences.activeProjectId = null;
  }

  if (typeof stored.tenderType === "string" && stored.tenderType.length > 0) {
    preferences.tenderType = stored.tenderType;
  }

  if (typeof stored.sidebarCollapsed === "boolean") {
    preferences.sidebarCollapsed = stored.sidebarCollapsed;
  }

  if (typeof stored.autopilot === "boolean") {
    preferences.autopilot = stored.autopilot;
  }

  return preferences;
}

export interface UIState {
  view: DashboardView;
  activeProjectId: string | null;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  adminMode: boolean;
  tenderType: string;
  autopilot: boolean;
  /**
   * Whether the active project has a run RUNNING or QUEUED right now, as the
   * dock's pulse last saw it. Session state, never persisted: the panels that
   * poll for run-written data key their intervals off it.
   */
  activeRunLive: boolean;
  /** Notice raised by the last URL resolution, or null when the URL was honoured. */
  routeNotice: RouteNoticeCode | null;
  setView: (v: DashboardView) => void;
  setAutopilot: (on: boolean) => void;
  setActiveRunLive: (live: boolean) => void;
  setActiveProjectId: (id: string | null) => void;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
  setAdminMode: (v: boolean) => void;
  setTenderType: (t: string) => void;
  setRouteNotice: (code: RouteNoticeCode | null) => void;
  /**
   * Applies a resolution derived from the URL. The URL is authoritative, so this
   * sets view and project together without emitting a navigation.
   */
  applyRoute: (next: {
    view: DashboardView;
    projectId: string | null;
    notice: RouteNoticeCode | null;
    /** When false, the persisted active project is retained. */
    replaceProject: boolean;
  }) => void;
}

/** Storage key of the persisted UI preferences. */
export const UI_STORAGE_KEY = "arabclue-ui";

/**
 * Persistence contract for the UI store. Declared as a named value so the
 * read and write paths can be asserted directly, without a browser storage
 * implementation.
 *
 * `partialize` keeps route fields out of storage; `merge` and `migrate` keep any
 * route field a previous build stored out of the rehydrated state. Together they
 * leave the URL as the only authority for the rendered view (Requirement 14.2).
 */
export const UI_PERSIST_OPTIONS: PersistOptions<UIState, PersistedUIPreferences> =
  {
    name: UI_STORAGE_KEY,
    version: UI_PREFERENCES_VERSION,
    partialize: (state) => ({
      activeProjectId: state.activeProjectId,
      tenderType: state.tenderType,
      sidebarCollapsed: state.sidebarCollapsed,
      autopilot: state.autopilot,
    }),
    migrate: (persisted) => ({
      ...DEFAULT_UI_PREFERENCES,
      ...sanitizePersistedUI(persisted),
    }),
    merge: (persisted, current) => ({
      ...current,
      ...sanitizePersistedUI(persisted),
    }),
  };

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      view: "overview",
      ...DEFAULT_UI_PREFERENCES,
      mobileNavOpen: false,
      adminMode: false,
      activeRunLive: false,
      routeNotice: null,
      setView: (view) =>
        set({
          view,
          // The route table owns which views are administrator views, so the
          // sidebar's administrator mode is derived from it rather than from a
          // second copy of the naming rule (Requirement 14.5).
          adminMode: isAdminView(view),
          mobileNavOpen: false,
          routeNotice: null,
        }),
      setActiveProjectId: (activeProjectId) => set({ activeProjectId }),
      setAutopilot: (autopilot) => set({ autopilot }),
      setActiveRunLive: (activeRunLive) =>
        set((s) => (s.activeRunLive === activeRunLive ? s : { activeRunLive })),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      setAdminMode: (adminMode) => set({ adminMode }),
      setTenderType: (tenderType) => set({ tenderType }),
      setRouteNotice: (routeNotice) => set({ routeNotice }),
      applyRoute: ({ view, projectId, notice, replaceProject }) =>
        set((s) => ({
          view,
          adminMode: isAdminView(view),
          mobileNavOpen: false,
          routeNotice: notice,
          activeProjectId: replaceProject ? projectId : s.activeProjectId,
        })),
    }),
    UI_PERSIST_OPTIONS
  )
);