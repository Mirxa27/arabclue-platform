"use client";

import Link from "next/link";
import { useLocale, useUI, type DashboardView } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  FileCheck2,
  ShieldCheck,
  Palette,
  Bot,
  History,
  Building2,
  ChevronLeft,
  Cpu,
  CircleDot,
  KeyRound,
  CreditCard,
  Users,
  ScrollText,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const NAV: { view: DashboardView; key: string; icon: typeof LayoutDashboard }[] = [
  { view: "overview", key: "nav_dashboard", icon: LayoutDashboard },
  { view: "projects", key: "nav_projects", icon: FolderKanban },
  { view: "documents", key: "nav_documents", icon: FileText },
  { view: "proposals", key: "nav_proposals", icon: FileCheck2 },
  { view: "compliance", key: "nav_compliance", icon: ShieldCheck },
  { view: "agents", key: "nav_agents", icon: Bot },
  { view: "history", key: "nav_history", icon: History },
  { view: "brand", key: "nav_brand", icon: Palette },
];

const ADMIN_NAV: { view: DashboardView; key: string; icon: typeof LayoutDashboard }[] = [
  { view: "admin_overview", key: "nav_dashboard", icon: LayoutDashboard },
  { view: "admin_ai", key: "nav_admin_ai", icon: Cpu },
  { view: "admin_env", key: "nav_admin_env", icon: KeyRound },
  { view: "admin_billing", key: "nav_admin_billing", icon: CreditCard },
  { view: "admin_security", key: "nav_admin_security", icon: Users },
  { view: "admin_audit", key: "nav_admin_audit", icon: ScrollText },
];

export function DashboardSidebar() {
  const { locale } = useLocale();
  const { view, setView, sidebarCollapsed, toggleSidebar } = useUI();

  const { data } = useQuery({
    queryKey: ["workspace"],
    queryFn: async () => {
      const res = await fetch("/api/workspaces");
      return res.json();
    },
  });

  const workspace = data?.workspace;
  const workspaceName = locale === "ar" ? workspace?.nameAr ?? workspace?.name : workspace?.name;
  const plan = workspace?.plan;

  return (
    <aside
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={cn(
        "relative shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-e border-sidebar-border transition-[width] duration-300",
        sidebarCollapsed ? "w-[68px]" : "w-64"
      )}
    >
      {/* Brand */}
      <div className="h-16 flex items-center gap-3 px-4 border-b border-sidebar-border shrink-0">
        <div className="size-9 rounded-lg bg-gradient-to-br from-chart-1 to-chart-2 flex items-center justify-center shrink-0 shadow-lg shadow-chart-1/20">
          <Cpu className="size-5 text-white" />
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <div className="text-sm font-bold text-white truncate">
              {tr("appName", locale)}
            </div>
            <div className="text-[10px] text-sidebar-foreground/60 truncate uppercase tracking-wider">
              {locale === "ar" ? "منصة سعودية" : "Saudi Platform"}
            </div>
          </div>
        )}
      </div>

      {/* Workspace selector */}
      {!sidebarCollapsed && (
        <div className="px-3 py-3 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-sidebar-accent/60">
            <div className="size-8 rounded-md bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
              <Building2 className="size-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">{workspaceName ?? "..."}</div>
              <div className="text-[10px] text-sidebar-foreground/50 flex items-center gap-1">
                <CircleDot className="size-2.5 text-emerald-400" />
                <span className="uppercase">{plan ?? "Enterprise"}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 py-3 space-y-0.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = view === item.view;
          return (
            <button
              key={item.view}
              onClick={() => setView(item.view)}
              title={tr(item.key, locale)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group relative",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-sidebar-primary/20"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white",
                sidebarCollapsed && "justify-center"
              )}
            >
              <Icon className="size-[18px] shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{tr(item.key, locale)}</span>}
              {active && !sidebarCollapsed && (
                <span className="absolute end-0 top-1/2 -translate-y-1/2 h-5 w-1 bg-white rounded-s-full" />
              )}
            </button>
          );
        })}

        {/* Admin section */}
        {!sidebarCollapsed && (
          <div className="pt-4 pb-1 px-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/40">
            <Lock className="size-2.5" />
            {tr("nav_admin", locale)}
          </div>
        )}
        {sidebarCollapsed && <div className="my-2 border-t border-sidebar-border" />}
        {ADMIN_NAV.map((item) => {
          const Icon = item.icon;
          const active = view === item.view;
          return (
            <button
              key={item.view}
              onClick={() => setView(item.view)}
              title={tr(item.key, locale)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group relative",
                active
                  ? "bg-amber-600 text-white shadow-md shadow-amber-600/20"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white",
                sidebarCollapsed && "justify-center"
              )}
            >
              <Icon className="size-[18px] shrink-0" />
              {!sidebarCollapsed && <span className="truncate text-[13px]">{tr(item.key, locale)}</span>}
              {active && !sidebarCollapsed && (
                <span className="absolute end-0 top-1/2 -translate-y-1/2 h-5 w-1 bg-white rounded-s-full" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Vision 2030 badge */}
      {!sidebarCollapsed && (
        <div className="p-3 border-t border-sidebar-border">
          <div className="rounded-lg bg-gradient-to-br from-emerald-600/20 to-chart-1/20 border border-emerald-500/20 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                Vision 2030
              </span>
            </div>
            <p className="text-[11px] text-sidebar-foreground/70 leading-relaxed">
              {locale === "ar"
                ? "متوافق مع رؤية المملكة 2030 — الالتزام بمستوى C1"
                : "Aligned with Vision 2030 — C1 Compliance enforced"}
            </p>
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className={cn(
          "absolute top-1/2 -translate-y-1/2 z-20 size-6 rounded-full bg-sidebar-accent border border-sidebar-border flex items-center justify-center text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-primary transition-colors",
          locale === "ar" ? "-start-3" : "-end-3"
        )}
        title={sidebarCollapsed ? "Expand" : "Collapse"}
      >
        <ChevronLeft className={cn("size-3.5 transition-transform", sidebarCollapsed && "rotate-180", locale === "ar" && "rotate-180", sidebarCollapsed && locale === "ar" && "rotate-0")} />
      </button>
    </aside>
  );
}
