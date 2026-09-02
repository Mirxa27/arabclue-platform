"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLocale, useUI } from "@/lib/store";
import { DashboardSidebar } from "./sidebar";
import { DashboardTopbar } from "./topbar";
import { DashboardFooter } from "./footer";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useEnsureActiveProject } from "@/hooks/use-ensure-active-project";

// Mounted here rather than in the view map so the agent is reachable from the
// page you need help with, instead of being a screen you leave for. Its own
// chunk: `useChat` and the `ai` package should not be in the shell's bundle.
const AssistantDock = dynamic(
  () => import("./assistant-dock").then((m) => ({ default: m.AssistantDock })),
  { ssr: false }
);

/** Session-storage marker: the profile language has been applied for this user. */
const LOCALE_APPLIED_KEY = "arabclue-locale-applied";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { locale, dir, setLocale } = useLocale();
  const { mobileNavOpen, setMobileNavOpen } = useUI();
  const router = useRouter();
  const { data: session } = useSession();
  useEnsureActiveProject();

  useEffect(() => {
    const html = document.documentElement;
    html.lang = locale;
    html.dir = dir;
  }, [locale, dir]);

  // The profile's language, applied once per browser session. Without this the
  // shell came up in the store default (Arabic) for an English profile, while
  // the agent — which reads the profile — answered in English. Once, so a
  // toggle made later in the session is not undone on the next render; the
  // toggle itself writes back to the profile.
  useEffect(() => {
    const profileLocale = session?.user?.locale;
    const userId = session?.user?.id;
    if (!userId || (profileLocale !== "ar" && profileLocale !== "en")) return;
    if (window.sessionStorage.getItem(LOCALE_APPLIED_KEY) === userId) return;
    window.sessionStorage.setItem(LOCALE_APPLIED_KEY, userId);
    if (profileLocale !== useLocale.getState().locale) setLocale(profileLocale);
  }, [session?.user?.id, session?.user?.locale, setLocale]);

  useEffect(() => {
    if (session?.user && !(session.user as any).emailVerified) {
      router.replace("/verify-email");
    }
  }, [session, router]);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--surface-0)] text-foreground selection:bg-foreground/10 antialiased">
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
            className="p-0 w-[min(100%,18rem)] sm:max-w-[18rem] gap-0 bg-[var(--surface-0)] text-foreground border-[var(--hairline)] [&>button]:text-foreground/60"
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

      <AssistantDock />
    </div>
  );
}
