"use client";

import { useEffect, useMemo, useRef, useState, startTransition } from "react";
import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { signOut, useSession } from "next-auth/react";
import {
  Search,
  Languages,
  Moon,
  Sun,
  Bell,
  ShieldCheck,
  ChevronDown,
  Command,
  LogOut,
  Menu,
  X,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUI, type DashboardView } from "@/lib/store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ApiDocument, ApiProject, ApiNotification } from "@/lib/api-types";
import { useDismissedNotifications } from "@/hooks/use-dismissed-notifications";
import { selectApiFailureMessage } from "@/lib/api-failure-message";
import type { Locale } from "@/lib/types";
import { ErrorState } from "@/components/patterns";

export function DashboardTopbar() {
  const { locale, toggle } = useLocale();
  const { resolvedTheme, setTheme } = useTheme();
  const { setView, setMobileNavOpen, setActiveProjectId } = useUI();
  const { data: session } = useSession();
  const searchRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [themeMounted, setThemeMounted] = useState(false);
  useEffect(() => setThemeMounted(true), []);
  const isDarkTheme = themeMounted && resolvedTheme === "dark";
  const { dismiss, dismissAll, isDismissed } = useDismissedNotifications();

  const { data } = useQuery({
    queryKey: ["workspace"],
    queryFn: async () => {
      const res = await fetch("/api/workspaces");
      return res.json();
    },
  });

  const searchActive = searchOpen || q.trim().length > 0;

  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      return res.json();
    },
    enabled: searchActive,
  });

  const { data: docsData } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const res = await fetch("/api/documents");
      return res.json();
    },
    enabled: searchActive,
  });

  const { data: notifData, isError: notifIsError, error: notifError, refetch: refetchNotifs } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const apiMsg = selectApiFailureMessage(body, locale as Locale);
        throw new Error(apiMsg ?? tr("notification_inbox_unavailable", locale));
      }
      return res.json();
    },
    refetchInterval: searchOpen ? 30_000 : 60_000,
    staleTime: 20_000,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const members = data?.members ?? [];
  const bootstrapUser = members[0]?.user;
  const currentUser = session?.user ?? bootstrapUser;
  const isAdmin = currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ADMIN";
  const initials = currentUser?.name
    ?.split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("");

  const hits = useMemo(() => {
    if (!q.trim()) return [] as { type: string; label: string; view: DashboardView; projectId?: string }[];
    const ql = q.toLowerCase();
    const projects = ((projectsData?.projects ?? []) as ApiProject[])
      .filter((p) => p.title?.toLowerCase().includes(ql))
      .slice(0, 5)
      .map((p) => ({ type: "project", label: p.title, view: "projects" as const, projectId: p.id }));
    const docs = ((docsData?.documents ?? []) as ApiDocument[])
      .filter((d) => d.originalName?.toLowerCase().includes(ql))
      .slice(0, 5)
      .map((d) => ({ type: "document", label: d.originalName, view: "documents" as const, projectId: d.projectId ?? undefined }));
    return [...projects, ...docs];
  }, [q, projectsData, docsData]);

  const notifications = (notifData?.items ?? []) as ApiNotification[];
  const visibleNotifications = useMemo(() => notifications.filter((n) => !isDismissed(n.id)), [notifications, isDismissed]);

  return (
    <header className="h-[56px] sm:h-[60px] shrink-0 border-b border-[var(--hairline)] bg-[var(--surface-1)]/90 backdrop-blur-[16px] backdrop-saturate-[1.2] flex items-center gap-2 sm:gap-3 px-3 sm:px-4 lg:px-6 z-30">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="md:hidden h-[40px] w-[40px] min-h-[44px] min-w-[44px] rounded-[10px] border-[var(--hairline)] bg-[var(--surface-2)] text-foreground/60 hover:text-foreground hover:bg-[var(--surface-3)] active:scale-[0.97]"
        onClick={() => setMobileNavOpen(true)}
        aria-label={locale === "ar" ? "فتح القائمة" : "Open menu"}
      >
        <Menu className="size-4" />
      </Button>

      <div className="relative flex-1 max-w-[480px] min-w-0 group">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-foreground/30 pointer-events-none group-focus-within:text-foreground/60 transition-colors" />
        <Input
          ref={searchRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
          placeholder={tr("search_placeholder", locale)}
          className="ps-9 pe-16 h-[40px] rounded-[10px] bg-[var(--surface-2)] border-[var(--hairline)] text-foreground placeholder:text-foreground/35 focus-visible:ring-2 focus-visible:ring-[#5e6ad2] focus-visible:border-transparent text-[13.5px]"
        />
        <kbd className="absolute end-2 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 text-[11px] font-mono text-foreground/30 bg-foreground/[0.06] border border-foreground/10 px-1.5 py-1 rounded-[6px]">
          <Command className="size-3" />K
        </kbd>
        {searchOpen && hits.length > 0 && (
          <div className="absolute top-full mt-2 inset-x-0 rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-2)] shadow-[0_16px_40px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)_inset] z-50 max-h-[320px] overflow-y-auto backdrop-blur-xl">
            {hits.map((h, i) => (
              <button
                key={`${h.type}-${h.label}-${i}`}
                type="button"
                className="w-full text-start px-3.5 py-2.5 text-[12.5px] hover:bg-foreground/[0.06] text-foreground/70 hover:text-foreground flex items-center justify-between gap-2 transition-colors"
                onMouseDown={() => {
                  if (h.projectId) setActiveProjectId(h.projectId);
                  startTransition(() => setView(h.view));
                  setQ("");
                  setSearchOpen(false);
                }}
              >
                <span className="truncate">{h.label}</span>
                <Badge variant="outline" className="text-[10px] border-foreground/15 text-foreground/40 shrink-0">
                  {h.type}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 hidden sm:block" />

      <div className="hidden lg:flex items-center gap-2 px-3 h-[36px] rounded-full bg-emerald-500/10 border border-emerald-500/20 backdrop-blur">
        <div className="size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]" />
        <ShieldCheck className="size-3.5 text-emerald-700 dark:text-emerald-300" />
        <span className="text-[12px] font-[550] tracking-[-0.01em] text-emerald-800 dark:text-emerald-200">
          {locale === "ar" ? "PDPL متوافق" : "PDPL Compliant"}
        </span>
        <span className="text-[10px] text-emerald-700/70 dark:text-emerald-400/60 font-mono">KSA</span>
      </div>

      <Button
        variant="outline"
        size="icon"
        onClick={() => {
          // Requirement 18.8 — toggle synchronizes cookie, localStorage,
          // Zustand store, and document attributes within one second,
          // without changing the canonical route (Requirement 14.7).
          // Persistence + dir reflow are deferred inside useLocale.toggle
          // so this click stays within the INP budget.
          toggle();
        }}
        className="h-[40px] w-[40px] min-h-[44px] min-w-[44px] rounded-[10px] border-[var(--hairline)] bg-[var(--surface-2)] text-foreground/60 hover:text-foreground hover:bg-[var(--surface-3)] relative active:scale-[0.97]"
        aria-label={locale === "ar" ? "Switch to English" : "تبديل إلى العربية"}
      >
        <Languages className="size-4 pointer-events-none" aria-hidden />
        <span className="absolute -bottom-1 -end-1 text-[9px] font-bold bg-[#5e6ad2] text-white rounded-[4px] px-1 leading-tight min-w-[16px] h-[14px] flex items-center justify-center shadow pointer-events-none">
          {locale === "ar" ? "ع" : "EN"}
        </span>
      </Button>

      <Button
        variant="outline"
        size="icon"
        onClick={() => {
          const root = document.documentElement;
          const currentlyDark =
            root.classList.contains("dark") || resolvedTheme === "dark";
          const next = currentlyDark ? "light" : "dark";
          root.classList.remove("light", "dark");
          root.classList.add(next);
          root.style.colorScheme = next;
          try {
            localStorage.setItem("theme", next);
          } catch {
            /* private mode */
          }
          setTheme(next);
        }}
        className="h-[40px] w-[40px] min-h-[44px] min-w-[44px] rounded-[10px] border-[var(--hairline)] bg-[var(--surface-2)] text-foreground/60 hover:text-foreground hover:bg-[var(--surface-3)] active:scale-[0.97]"
        title={tr("theme_toggle", locale)}
        aria-label={
          isDarkTheme
            ? tr("theme_switch_to_light", locale)
            : tr("theme_switch_to_dark", locale)
        }
      >
        {isDarkTheme ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="h-[40px] w-[40px] min-h-[44px] min-w-[44px] rounded-[10px] border-[var(--hairline)] bg-[var(--surface-2)] text-foreground/60 hover:text-foreground hover:bg-[var(--surface-3)] relative active:scale-[0.97]">
            <Bell className="size-4" />
            {notifIsError ? (
              <span className="absolute top-1.5 end-1.5 size-2 rounded-full bg-amber-400 ring-2 ring-[var(--surface-1)] shadow-[0_0_8px_#fbbf24]" />
            ) : visibleNotifications.length > 0 ? (
              <span className="absolute top-1.5 end-1.5 size-2 rounded-full bg-[#ff6467] ring-2 ring-[var(--surface-1)] shadow-[0_0_8px_#ff6467]" />
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(92vw,360px)] p-0 rounded-[14px] border-[var(--hairline)] bg-[var(--surface-1)] shadow-[0_16px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          <div className="px-4 py-3 border-b border-[var(--hairline)] flex items-center justify-between gap-2">
            <div className="text-[13px] font-[600] tracking-[-0.01em] text-foreground flex items-center gap-2">
              <Bell className="size-4 text-foreground/40" />
              {tr("notification_inbox_title", locale)}
            </div>
            {visibleNotifications.length > 0 && (
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2.5 text-[11px] rounded-full bg-foreground/[0.06] hover:bg-foreground/[0.10] text-foreground/60" onClick={() => dismissAll(visibleNotifications.map((n) => n.id))}>
                {locale === "ar" ? "قراءة الكل" : "Mark all read"}
              </Button>
            )}
          </div>
          <div className="max-h-[320px] overflow-y-auto scrollbar-thin">
            {notifIsError ? (
              <div className="p-4">
                <ErrorState
                  message={
                    notifError instanceof Error
                      ? notifError.message
                      : tr("notification_inbox_unavailable", locale)
                  }
                  onRetry={() => void refetchNotifs()}
                  retryLabel={tr("action_retry", locale)}
                  className="py-6"
                />
              </div>
            ) : visibleNotifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="mx-auto size-10 rounded-full bg-foreground/[0.04] flex items-center justify-center mb-3">
                  <Sparkles className="size-5 text-foreground/20" />
                </div>
                <p className="text-[12px] text-foreground/40">{tr("notification_inbox_empty", locale)}</p>
              </div>
            ) : (
              visibleNotifications.map((n) => (
                <div key={n.id} className="flex items-start gap-1 border-b border-[var(--hairline)]/60 hover:bg-foreground/[0.04] transition-colors group">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-start px-4 py-3"
                    onClick={() => {
                      if (n.href?.includes("view=")) {
                        const v = n.href.split("view=")[1] as DashboardView;
                        if (v) startTransition(() => setView(v));
                      }
                    }}
                  >
                    <div className="text-[12.5px] font-[500] text-foreground/80 leading-[1.4]">{locale === "ar" ? n.titleAr : n.title}</div>
                    <div className="text-[11.5px] text-foreground/45 truncate mt-0.5">{locale === "ar" ? n.bodyAr : n.body}</div>
                  </button>
                  <Button type="button" variant="ghost" size="icon" className="me-1 mt-1 size-7 shrink-0 rounded-full text-foreground/30 hover:text-foreground hover:bg-foreground/[0.06]" onClick={() => dismiss(n.id)}>
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2.5 ps-1 pe-3 h-[40px] rounded-[10px] bg-[var(--surface-2)] border border-[var(--hairline)] hover:bg-[var(--surface-3)] hover:border-[var(--hairline-light)] transition-all active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-[#5e6ad2]">
            <Avatar className="size-8 rounded-[8px] border border-foreground/10">
              {session?.user?.avatarUrl ? <AvatarImage src={session.user.avatarUrl} alt={currentUser?.name ?? "User"} /> : null}
              <AvatarFallback className="rounded-[8px] bg-gradient-to-br from-[#5e6ad2] to-[#8b5cf6] text-white text-[12px] font-bold">{initials ?? "U"}</AvatarFallback>
            </Avatar>
            <div className="hidden lg:block text-start leading-tight min-w-0">
              <div className="text-[13px] font-[550] tracking-[-0.01em] text-foreground truncate max-w-[120px]">{currentUser?.name ?? "User"}</div>
              <div className="text-[11px] text-foreground/45 uppercase tracking-[0.06em] font-[500] truncate">{currentUser?.role ?? "Bidder"}</div>
            </div>
            <ChevronDown className="size-3.5 text-foreground/40 hidden lg:block" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 rounded-[12px] border-[var(--hairline)] bg-[var(--surface-2)] shadow-[0_16px_40px_rgba(0,0,0,0.5)] p-1.5">
          <DropdownMenuLabel className="px-2.5 py-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-[600] text-foreground">{currentUser?.name}</span>
              <span className="text-[11px] text-foreground/45 font-normal truncate">{currentUser?.email}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-[var(--hairline)]" />
          <DropdownMenuItem className="rounded-[8px] text-[12.5px] focus:bg-foreground/[0.06] focus:text-foreground">
            <span className="flex-1">{locale === "ar" ? "المصادقة الثنائية" : "MFA"}</span>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20 text-[10px] rounded-full">
              {currentUser?.mfaEnabled ? "ON" : "OFF"}
            </Badge>
          </DropdownMenuItem>
          {isAdmin && (
            <>
              <DropdownMenuItem onClick={() => startTransition(() => setView("admin_security"))} className="rounded-[8px] text-[12.5px] focus:bg-foreground/[0.06] focus:text-foreground">
                {locale === "ar" ? "إعدادات RBAC" : "RBAC Settings"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => startTransition(() => setView("admin_audit"))} className="rounded-[8px] text-[12.5px] focus:bg-foreground/[0.06] focus:text-foreground">
                {locale === "ar" ? "سجل الجلسات" : "Session / Audit Log"}
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator className="bg-[var(--hairline)]" />
          <DropdownMenuItem className="rounded-[8px] text-[12.5px] text-[#ff6467] focus:bg-[#ff6467]/10 focus:text-[#ff6467] gap-2" onClick={() => signOut({ callbackUrl: "/login" })}>
            <LogOut className="size-3.5" />
            {locale === "ar" ? "تسجيل الخروج" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
