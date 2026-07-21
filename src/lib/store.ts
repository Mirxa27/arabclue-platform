"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/lib/types";

interface LocaleState {
  locale: Locale;
  dir: "rtl" | "ltr";
  setLocale: (l: Locale) => void;
  toggle: () => void;
}

export const useLocale = create<LocaleState>()(
  persist(
    (set, get) => ({
      locale: "ar",
      dir: "rtl",
      setLocale: (locale) => set({ locale, dir: locale === "ar" ? "rtl" : "ltr" }),
      toggle: () => {
        const next = get().locale === "ar" ? "en" : "ar";
        set({ locale: next, dir: next === "ar" ? "rtl" : "ltr" });
      },
    }),
    { name: "etimad-locale" }
  )
);

export type DashboardView =
  | "overview"
  | "projects"
  | "documents"
  | "proposals"
  | "compliance"
  | "brand"
  | "agents"
  | "history";

interface UIState {
  view: DashboardView;
  activeProjectId: string | null;
  sidebarCollapsed: boolean;
  setView: (v: DashboardView) => void;
  setActiveProjectId: (id: string | null) => void;
  toggleSidebar: () => void;
}

export const useUI = create<UIState>((set) => ({
  view: "overview",
  activeProjectId: null,
  sidebarCollapsed: false,
  setView: (view) => set({ view }),
  setActiveProjectId: (activeProjectId) => set({ activeProjectId }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
