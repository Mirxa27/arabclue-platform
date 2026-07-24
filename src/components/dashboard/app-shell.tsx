"use client";

import { useEffect } from "react";
import { useLocale, useUI } from "@/lib/store";
import { DashboardSidebar } from "./sidebar";
import { DashboardTopbar } from "./topbar";
import { DashboardFooter } from "./footer";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useEnsureActiveProject } from "@/hooks/use-ensure-active-project";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { locale, dir } = useLocale();
  const { mobileNavOpen, setMobileNavOpen } = useUI();
  useEnsureActiveProject();

  useEffect(() => {
    const html = document.documentElement;
    html.lang = locale;
    html.dir = dir;
  }, [locale, dir]);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--surface-0)] text-white selection:bg-white/10 antialiased">
      {/* Subtle aurora backdrop for dashboard */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(94,106,210,0.12),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_90%_10%,rgba(14,165,233,0.08),transparent_60%)]" />
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="hidden md:flex shrink-0">
          <DashboardSidebar />
        </div>
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent
            side={locale === "ar" ? "right" : "left"}
            className="p-0 w-[min(100%,18rem)] sm:max-w-[18rem] gap-0 bg-[var(--surface-0)] text-white border-[var(--hairline)] [&>button]:text-white/60"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{locale === "ar" ? "التنقل" : "Navigation"}</SheetTitle>
            </SheetHeader>
            <DashboardSidebar variant="drawer" />
          </SheetContent>
        </Sheet>

        <div className="flex-1 flex flex-col min-w-0 bg-[var(--surface-0)]">
          <DashboardTopbar />
          <main className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
            <div className="mx-auto w-full max-w-[1600px] p-3 sm:p-4 lg:p-6 2xl:p-8">{children}</div>
          </main>
          <DashboardFooter />
        </div>
      </div>
    </div>
  );
}
