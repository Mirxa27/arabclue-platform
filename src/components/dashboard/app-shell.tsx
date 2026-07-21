"use client";

import { useEffect } from "react";
import { useLocale } from "@/lib/store";
import { DashboardSidebar } from "./sidebar";
import { DashboardTopbar } from "./topbar";
import { DashboardFooter } from "./footer";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { locale, dir } = useLocale();

  // Sync <html> lang + dir whenever locale changes
  useEffect(() => {
    const html = document.documentElement;
    html.lang = locale;
    html.dir = dir;
  }, [locale, dir]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex flex-1 min-h-0">
        <DashboardSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <DashboardTopbar />
          <main className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
            <div className="p-4 lg:p-6">{children}</div>
          </main>
          <DashboardFooter />
        </div>
      </div>
    </div>
  );
}
