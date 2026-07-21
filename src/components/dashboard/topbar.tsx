"use client";

import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Languages,
  Moon,
  Sun,
  Bell,
  ShieldCheck,
  ChevronDown,
  Command,
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function DashboardTopbar() {
  const { locale, toggle } = useLocale();
  const { theme, setTheme } = useTheme();

  const { data } = useQuery({
    queryKey: ["workspace"],
    queryFn: async () => {
      const res = await fetch("/api/workspaces");
      return res.json();
    },
  });

  const members = data?.members ?? [];
  const currentUser = members[0]?.user;
  const initials = currentUser?.name
    ?.split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("");

  return (
    <header className="h-16 shrink-0 border-b border-border bg-card/80 glass backdrop-blur-xl flex items-center gap-3 px-4 lg:px-6 z-30">
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder={tr("search_placeholder", locale)}
          className="ps-9 pe-16 h-10 bg-background/60"
        />
        <kbd className="absolute end-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
          <Command className="size-2.5" />K
        </kbd>
      </div>

      <div className="flex-1" />

      {/* Compliance status pill */}
      <div className="hidden md:flex items-center gap-2 px-3 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
        <ShieldCheck className="size-4 text-emerald-600" />
        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          {locale === "ar" ? "PDPL متوافق" : "PDPL Compliant"}
        </span>
        <span className="text-[10px] text-emerald-600/70 font-mono">KSA</span>
      </div>

      {/* Locale toggle */}
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

      {/* Theme toggle */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="h-10 w-10"
        title={tr("theme_toggle", locale)}
      >
        {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>

      {/* Notifications */}
      <Button variant="outline" size="icon" className="h-10 w-10 relative">
        <Bell className="size-4" />
        <span className="absolute top-1.5 end-1.5 size-2 rounded-full bg-destructive ring-2 ring-card" />
      </Button>

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2.5 ps-1 pe-3 h-10 rounded-lg hover:bg-accent transition-colors">
            <Avatar className="size-8 border-2 border-primary/20">
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
              <span className="text-xs text-muted-foreground font-normal">{currentUser?.email}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="flex items-center justify-between">
            <span className="text-xs">{locale === "ar" ? "المصادقة الثنائية" : "MFA Enabled"}</span>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 text-[10px]">
              {currentUser?.mfaEnabled ? "ON" : "OFF"}
            </Badge>
          </DropdownMenuItem>
          <DropdownMenuItem>{locale === "ar" ? "الملف الشخصي" : "Profile"}</DropdownMenuItem>
          <DropdownMenuItem>{locale === "ar" ? "إعدادات RBAC" : "RBAC Settings"}</DropdownMenuItem>
          <DropdownMenuItem>{locale === "ar" ? "سجل الجلسات" : "Session Log"}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive">
            {locale === "ar" ? "تسجيل الخروج" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
