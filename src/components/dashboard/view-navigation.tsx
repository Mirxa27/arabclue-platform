"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { DashboardView } from "@/lib/dashboard-routes";

type NavigateToView = (view: DashboardView) => void;

const ViewNavigationContext = createContext<NavigateToView | null>(null);

export function ViewNavigationProvider({
  navigateToView,
  children,
}: {
  navigateToView: NavigateToView;
  children: ReactNode;
}) {
  return (
    <ViewNavigationContext.Provider value={navigateToView}>
      {children}
    </ViewNavigationContext.Provider>
  );
}

/**
 * Navigates to a dashboard view with exactly one history push (Requirement 14.1).
 * Falls back to a no-op when used outside the dashboard shell.
 */
export function useNavigateToView(): NavigateToView {
  const navigate = useContext(ViewNavigationContext);
  return navigate ?? (() => undefined);
}
