"use client";

import { useEffect } from "react";
import { useLocale, useUI } from "@/lib/store";
import { DashboardSidebar } from "./sidebar";
import { DashboardTopbar } from "./topbar";
import { DashboardFooter } from "./footer";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { locale, dir } = useLocale();
  const { mobileNavOpen, setMobileNavOpen } = useUI();

  // Sync <html> lang + dir whenever locale changes
  useEffect(() => {
    const html = document.documentElement;
    html.lang = locale;
    html.dir = dir;
  }, [locale, dir]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex flex-1 min-h-0">
        <div className="hidden md:flex shrink-0">
          <DashboardSidebar />
        </div>
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent
            side={locale === "ar" ? "right" : "left"}
            className="p-0 w-[min(100%,18rem)] sm:max-w-[18rem] gap-0 bg-sidebar text-sidebar-foreground border-sidebar-border [&>button]:text-sidebar-foreground"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>
                {locale === "ar" ? "التنقل" : "Navigation"}
              </SheetTitle>
            </SheetHeader>
            <DashboardSidebar variant="drawer" />
          </SheetContent>
        </Sheet>
        <div className="flex-1 flex flex-col min-w-0">
          <DashboardTopbar />
          <main className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
            <div className="p-3 sm:p-4 lg:p-6">{children}</div>
          </main>
          <DashboardFooter />
        </div>
      </div>
    </div>
  );
}
