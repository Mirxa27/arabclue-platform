"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ApiDocument, ApiProject, ApiNotification } from "@/lib/api-types";

export function DashboardTopbar() {
  const { locale, toggle } = useLocale();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { setView } = useUI();
  const { data: session } = useSession();
  const searchRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

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

  const { data: notifData } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications");
      if (!res.ok) return { items: [] };
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
  const isAdmin =
    currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ADMIN";
  const initials = currentUser?.name
    ?.split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("");

  const hits = useMemo(() => {
    if (!q.trim()) return [] as { type: string; label: string; view: DashboardView }[];
    const ql = q.toLowerCase();
    const projects = ((projectsData?.projects ?? []) as ApiProject[])
      .filter((p) => p.title?.toLowerCase().includes(ql))
      .slice(0, 5)
      .map((p) => ({
        type: "project",
        label: p.title,
        view: "projects" as const,
      }));
    const docs = ((docsData?.documents ?? []) as ApiDocument[])
      .filter((d) => d.originalName?.toLowerCase().includes(ql))
      .slice(0, 5)
      .map((d) => ({
        type: "document",
        label: d.originalName,
        view: "documents" as const,
      }));
    return [...projects, ...docs];
  }, [q, projectsData, docsData]);

  const notifications = (notifData?.items ?? []) as ApiNotification[];

  return (
    <header className="h-16 shrink-0 border-b border-border bg-card/80 glass backdrop-blur-xl flex items-center gap-3 px-4 lg:px-6 z-30">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
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
          className="ps-9 pe-16 h-10 bg-background/60"
        />
        <kbd className="absolute end-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
          <Command className="size-2.5" />K
        </kbd>
        {searchOpen && hits.length > 0 && (
          <div className="absolute top-full mt-1 inset-x-0 rounded-lg border border-border bg-card shadow-lg z-50 max-h-64 overflow-y-auto">
            {hits.map((h, i) => (
              <button
                key={`${h.type}-${h.label}-${i}`}
                type="button"
                className="w-full text-start px-3 py-2 text-xs hover:bg-muted/60 flex items-center justify-between"
                onMouseDown={() => {
                  setView(h.view);
                  setQ("");
                  setSearchOpen(false);
                }}
              >
                <span className="truncate">{h.label}</span>
                <Badge variant="outline" className="text-[9px]">
                  {h.type}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1" />

      <div className="hidden md:flex items-center gap-2 px-3 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
        <ShieldCheck className="size-4 text-emerald-600" />
        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          {locale === "ar" ? "PDPL متوافق" : "PDPL Compliant"}
        </span>
        <span className="text-[10px] text-emerald-600/70 font-mono">KSA</span>
      </div>

      <Button
        variant="outline"
        size="icon"
        onClick={toggle}
        className="h-10 w-10 relative"
        title="Switch language"
      >
        <Languages className="size-4" />
        <span className="absolute -bottom-1 -end-1 text-[9px] font-bold bg-primary text-primary-foreground rounded px-1 leading-tight">
          {locale === "ar" ? "ع" : "EN"}
        </span>
      </Button>

      <Button
        variant="outline"
        size="icon"
        onClick={() => {
          const cur = resolvedTheme ?? theme;
          setTheme(cur === "dark" ? "light" : "dark");
        }}
        className="h-10 w-10 bg-card"
        title={tr("theme_toggle", locale)}
      >
        {(resolvedTheme ?? theme) === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="h-10 w-10 relative">
            <Bell className="size-4" />
            {notifications.length > 0 && (
              <span className="absolute top-1.5 end-1.5 size-2 rounded-full bg-destructive ring-2 ring-card" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="px-3 py-2 border-b text-xs font-semibold">
            {locale === "ar" ? "الإشعارات" : "Notifications"}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-[11px] text-muted-foreground p-4 text-center">
                {tr("no_data", locale)}
              </p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="w-full text-start px-3 py-2 border-b border-border/40 text-[11px] hover:bg-muted/50"
                  onClick={() => {
                    if (n.href?.includes("view=")) {
                      const v = n.href.split("view=")[1] as DashboardView;
                      if (v) setView(v);
                    }
                  }}
                >
                  <div className="font-medium">
                    {locale === "ar" ? n.titleAr : n.title}
                  </div>
                  <div className="text-muted-foreground truncate">
                    {locale === "ar" ? n.bodyAr : n.body}
                  </div>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2.5 ps-1 pe-3 h-10 rounded-lg hover:bg-accent transition-colors">
            <Avatar className="size-8 border-2 border-primary/20">
              {session?.user?.avatarUrl ? (
                <AvatarImage src={session.user.avatarUrl} alt={currentUser?.name ?? "User"} />
              ) : null}
              <AvatarFallback className="bg-gradient-to-br from-chart-1 to-chart-2 text-white text-xs font-bold">
                {initials ?? "U"}
              </AvatarFallback>
            </Avatar>
            <div className="hidden lg:block text-start leading-tight">
              <div className="text-xs font-semibold">{currentUser?.name ?? "User"}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {currentUser?.role ?? "Bidder"}
              </div>
            </div>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">{currentUser?.name}</span>
              <span className="text-xs text-muted-foreground font-normal">
                {currentUser?.email}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="flex items-center justify-between">
            <span className="text-xs">
              {locale === "ar" ? "المصادقة الثنائية" : "MFA Enabled"}
            </span>
            <Badge
              variant="outline"
              className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 text-[10px]"
            >
              {currentUser?.mfaEnabled ? "ON" : "OFF"}
            </Badge>
          </DropdownMenuItem>
          {isAdmin && (
            <>
              <DropdownMenuItem onClick={() => setView("admin_security")}>
                {locale === "ar" ? "إعدادات RBAC" : "RBAC Settings"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setView("admin_audit")}>
                {locale === "ar" ? "سجل الجلسات" : "Session / Audit Log"}
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive gap-2"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="size-3.5" />
            {locale === "ar" ? "تسجيل الخروج" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
