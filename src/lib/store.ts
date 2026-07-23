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
    { name: "arabclue-locale" }
  )
);

export type DashboardView =
  | "overview"
  | "projects"
  | "documents"
  | "proposals"
  | "contracts"
  | "compliance"
  | "brand"
  | "account"
  | "business-profile"
  | "agents"
  | "history"
  | "billing"
  | "reviews"
  | "settings"
  | "copilot"
  // Admin views
  | "admin_overview"
  | "admin_ai"
  | "admin_env"
  | "admin_billing"
  | "admin_myfatoorah"
  | "admin_security"
  | "admin_audit";

interface UIState {
  view: DashboardView;
  activeProjectId: string | null;
  sidebarCollapsed: boolean;
  adminMode: boolean;
  tenderType: string;
  setView: (v: DashboardView) => void;
  setActiveProjectId: (id: string | null) => void;
  toggleSidebar: () => void;
  setAdminMode: (v: boolean) => void;
  setTenderType: (t: string) => void;
}

export const useUI = create<UIState>((set) => ({
  view: "overview",
  activeProjectId: null,
  sidebarCollapsed: false,
  adminMode: false,
  tenderType: "IT",
  setView: (view) => set({ view, adminMode: view.startsWith("admin_") }),
  setActiveProjectId: (activeProjectId) => set({ activeProjectId }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setAdminMode: (adminMode) => set({ adminMode }),
  setTenderType: (tenderType) => set({ tenderType }),
}));
