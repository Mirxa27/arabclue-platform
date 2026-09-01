"use client";

import { apiErrorText } from "@/lib/api-failure-message";

import Link from "next/link";
import { Fragment, startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useUI, type DashboardView } from "@/lib/store";
import { resolveDashboardNavigation } from "@/lib/dashboard-navigate";
import { tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  FileCheck2,
  Bot,
  Building2,
  ChevronLeft,
  Cpu,
  CircleDot,
  KeyRound,
  CreditCard,
  Users,
  ScrollText,
  Lock,
  Loader2,
  Scale,
  Sparkles,
  LayoutList,
  Store,
  BarChart3,
  ClipboardCheck,
  FileStack,
  MoreHorizontal,
  ChevronDown,
  Briefcase,
  Library,
  Receipt,
  Wallet,
  Stamp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArabclueLogo } from "@/components/brand/arabclue-logo";
import { usePendingApprovalCount } from "./knowledge-approval-queue";

/** The three questions a disclosed panel answers: what am I doing, what am I
 * drawing from, who am I. All three labels were already registered bilingually
 * in `i18n.ts` and referenced nowhere. */
type NavGroupKey =
  | "nav_group_workflow"
  | "nav_group_library"
  | "nav_group_account";

/**
 * The five destinations a bid actually passes through. Everything else the
 * platform can do is reached by asking the agent on the home screen, so the
 * remaining panels sit behind one disclosure instead of twenty always-open
 * doors (the agent console is the home view — see `views.tsx`).
 */
const NAV_PRIMARY: { view: DashboardView; key: string; icon: typeof LayoutDashboard; badge?: "pending-approval" }[] = [
  { view: "overview", key: "nav_home_agent", icon: Sparkles },
  { view: "projects", key: "nav_projects", icon: FolderKanban },
  { view: "documents", key: "nav_documents", icon: FileText },
  { view: "proposals", key: "nav_proposals", icon: FileCheck2 },
  { view: "reviews", key: "nav_reviews", icon: Stamp },
];

/**
 * Reachable in one click from `More`, and by name from the agent.
 *
 * One flat array, `group` on every row: the heading is rendered wherever the
 * group changes, so `activeIsSecondary` and the badge roll-up below keep
 * reading a single list. Rows of a group must therefore stay adjacent —
 * `dashboard-sidebar-ia.test.ts` holds that, since a split group renders its
 * heading twice and nothing on screen would say why.
 *
 * `knowledge-approval` leads because it is the only row here that can carry a
 * pending count, and that count is usually why `More` was opened at all.
 */
const NAV_SECONDARY: (NavItem & { group: NavGroupKey })[] = [
  { view: "knowledge-approval", key: "nav_knowledge_approval", icon: ClipboardCheck, badge: "pending-approval", group: "nav_group_workflow" },
  { view: "contracts", key: "nav_contracts", icon: Scale, group: "nav_group_workflow" },
  { view: "agents", key: "nav_agents", icon: Bot, group: "nav_group_workflow" },
  { view: "proposal-builder", key: "nav_proposal_builder", icon: LayoutList, group: "nav_group_workflow" },
  { view: "analytics", key: "nav_analytics", icon: BarChart3, group: "nav_group_workflow" },
  { view: "clause-library", key: "nav_clause_library", icon: Library, group: "nav_group_library" },
  { view: "template-editor", key: "nav_template_editor", icon: FileStack, group: "nav_group_library" },
  { view: "marketplace", key: "nav_marketplace", icon: Store, group: "nav_group_library" },
  { view: "account", key: "nav_account", icon: Building2, group: "nav_group_account" },
  { view: "business-profile", key: "nav_business_profile", icon: Briefcase, group: "nav_group_account" },
  { view: "billing", key: "nav_billing", icon: CreditCard, group: "nav_group_account" },
  { view: "settings", key: "nav_settings", icon: Lock, group: "nav_group_account" },
];

const ADMIN_NAV: { view: DashboardView; key: string; icon: typeof LayoutDashboard }[] = [
  { view: "admin_overview", key: "nav_dashboard", icon: LayoutDashboard },
  { view: "admin_ai", key: "nav_admin_ai", icon: Cpu },
  { view: "admin_env", key: "nav_admin_env", icon: KeyRound },
  { view: "admin_billing", key: "nav_admin_billing", icon: Receipt },
  { view: "admin_myfatoorah", key: "nav_admin_myfatoorah", icon: Wallet },
  { view: "admin_security", key: "nav_admin_security", icon: Users },
  { view: "admin_audit", key: "nav_admin_audit", icon: ScrollText },
];

type NavItem = (typeof NAV_PRIMARY)[number];

function NavButton({
  item,
  active,
  collapsed,
  locale,
  badgeCount,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  locale: "ar" | "en";
  badgeCount: number;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onNavigate}
      title={tr(item.key, locale)}
      className={cn(
        "group relative w-full flex items-center gap-2.5 px-2.5 h-[34px] rounded-[8px] text-[13px] font-[450] tracking-[-0.01em] transition-all duration-[140ms] outline-none",
        "focus-visible:ring-2 focus-visible:ring-[oklch(0.72_0.12_195)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface-0)]",
        "active:scale-[0.98]",
        active
          ? "bg-foreground/[0.08] text-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.06)_inset] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_1px_0_0_rgba(255,255,255,0.06)]"
          : "text-foreground/55 hover:text-foreground/85 hover:bg-foreground/[0.06] active:bg-foreground/[0.08]",
        collapsed && "justify-center px-2"
      )}
    >
      <Icon className={cn("size-[18px] shrink-0 transition-colors", active ? "text-foreground" : "text-foreground/45 group-hover:text-foreground/75")} />
      {!collapsed && <span className="truncate">{tr(item.key, locale)}</span>}
      {badgeCount > 0 && !collapsed && (
        <span className="ms-auto shrink-0 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-amber-500 text-[10px] font-semibold text-white">
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      )}
      {badgeCount > 0 && collapsed && (
        <span className="absolute top-0.5 end-0.5 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center rounded-full bg-amber-500 text-[9px] font-semibold text-white">
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      )}
      {active && !collapsed && badgeCount === 0 && (
        <span className="ms-auto flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#5e6ad2] shadow-[0_0_6px_#5e6ad2]" />
        </span>
      )}
      {active && collapsed && (
        <span className="absolute end-0 top-1/2 -translate-y-1/2 h-4 w-[2px] bg-[#5e6ad2] rounded-full shadow-[0_0_8px_#5e6ad2]" />
      )}
    </button>
  );
}

/** Opens the panels that are not part of the five-step bid path. */
function MoreToggle({
  open,
  collapsed,
  locale,
  badgeCount,
  onToggle,
}: {
  open: boolean;
  collapsed: boolean;
  locale: "ar" | "en";
  badgeCount: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      title={tr("nav_more", locale)}
      className={cn(
        "group relative mt-3 w-full flex items-center gap-2.5 px-2.5 h-[34px] rounded-[8px] text-[13px] font-[450] tracking-[-0.01em] outline-none transition-all duration-[140ms]",
        "border-t border-[var(--hairline)] rounded-t-none pt-3 h-auto pb-2",
        "text-foreground/45 hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-[oklch(0.72_0.12_195)]",
        collapsed && "justify-center px-2"
      )}
    >
      <MoreHorizontal className="size-[18px] shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{tr("nav_more", locale)}</span>}
      {!collapsed && (
        <ChevronDown
          className={cn("ms-auto size-3.5 shrink-0 transition-transform duration-200", open && "rotate-180")}
          aria-hidden="true"
        />
      )}
      {badgeCount > 0 && (
        <span
          className={cn(
            "min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-amber-500 text-[10px] font-semibold text-white",
            collapsed ? "absolute top-1 end-0.5 min-w-[14px] h-[14px] px-0.5 text-[9px]" : "ms-1"
          )}
        >
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      )}
    </button>
  );
}

/**
 * Names the run of rows beneath it. Collapsed to 72px there is no room for a
 * word, so the grouping survives as the rule that separates the icons — the
 * same trade the admin heading below already makes.
 */
function NavGroupLabel({
  groupKey,
  collapsed,
  locale,
}: {
  groupKey: NavGroupKey;
  collapsed: boolean;
  locale: "ar" | "en";
}) {
  if (collapsed) return <div className="my-2 mx-2 h-px bg-[var(--hairline)]" aria-hidden="true" />;
  return (
    <div className="pt-3 pb-1 px-2.5 flex items-center gap-2 text-[11px] font-[650] uppercase tracking-[0.08em] text-foreground/25">
      {tr(groupKey, locale)}
      <div className="h-px flex-1 bg-[var(--hairline)]" />
    </div>
  );
}

export function DashboardSidebar({ variant = "desktop" }: { variant?: "desktop" | "drawer" }) {
  const { locale } = useLocale();
  const router = useRouter();
  const { view, activeProjectId, applyRoute, sidebarCollapsed, toggleSidebar } =
    useUI();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN";
  const collapsed = variant === "drawer" ? false : sidebarCollapsed;
  const isDrawer = variant === "drawer";
  const { data: pendingApprovalCount } = usePendingApprovalCount();
  const [moreOpen, setMoreOpen] = useState(false);

  function goToView(target: DashboardView) {
    const decision = resolveDashboardNavigation({
      target,
      isAdmin,
      activeProjectId,
    });
    startTransition(() => {
      applyRoute({
        view: decision.view,
        projectId: activeProjectId,
        notice: decision.notice,
        replaceProject: false,
      });
      if (decision.path !== window.location.pathname) {
        router.push(decision.path, { scroll: false });
      }
    });
  }

  const { data, isError, refetch } = useQuery({
    queryKey: ["workspace"],
    queryFn: async () => {
      const res = await fetch("/api/workspaces");
      if (!res.ok) throw new Error(`workspaces ${res.status}`);
      return res.json();
    },
  });

  const workspace = data?.workspace;
  const workspaceName = locale === "ar" ? workspace?.nameAr ?? workspace?.name : workspace?.name;
  const plan = workspace?.plan;

  // The disclosure opens itself when the reader is standing inside it, so the
  // current location is never hidden by its own collapsed group.
  const activeIsSecondary = NAV_SECONDARY.some((item) => item.view === view);
  const showSecondary = moreOpen || activeIsSecondary;

  function badgeFor(item: NavItem): number {
    return item.badge === "pending-approval" ? pendingApprovalCount ?? 0 : 0;
  }
  const hiddenBadgeCount = showSecondary
    ? 0
    : NAV_SECONDARY.reduce((total, item) => total + badgeFor(item), 0);

  return (
    <aside
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={cn(
        "relative shrink-0 flex flex-col border-e transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "bg-[var(--surface-0)] text-foreground selection:bg-foreground/10",
        "border-[var(--hairline)]",
        isDrawer ? "h-full w-full border-e-0" : collapsed ? "w-[72px]" : "w-[272px]"
      )}
    >
      {/* Brand — premium: tight tracking, optical */}
      <div className="h-[64px] flex items-center gap-3 px-4 border-b border-[var(--hairline)] shrink-0">
        <div className="relative shrink-0">
          <ArabclueLogo className="size-[36px] rounded-[10px] shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_8px_16px_rgba(0,0,0,0.24)]" />
          <span className="pointer-events-none absolute -top-1 -end-1 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-[14px] font-[650] tracking-[-0.02em] text-foreground truncate leading-[1.1]">{tr("appName", locale)}</div>
            <div className="text-[11px] font-[500] tracking-[-0.01em] text-foreground/45 truncate">
              {locale === "ar" ? "منصة سعودية" : "Saudi Platform"}
            </div>
          </div>
        )}
      </div>

      {isError && !collapsed && (
        <div className="px-3 py-2 border-b border-[var(--hairline)] flex items-center gap-2 text-[11px] text-foreground/55">
          <span className="min-w-0 truncate">
            {tr("workspace_load_error", locale)}
          </span>
          <button
            type="button"
            onClick={() => refetch()}
            className="shrink-0 text-[11px] font-[600] text-foreground/70 hover:text-foreground underline-offset-2 hover:underline"
          >
            {tr("workspace_retry", locale)}
          </button>
        </div>
      )}

      {/* Workspace */}
      {!collapsed && !isError && (
        <WorkspaceSwitcher locale={locale} memberships={data?.memberships} workspaceName={workspaceName} plan={plan} />
      )}

      {/* Nav — Linear: 6 microstates crafted */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2.5 py-3 space-y-0.5">
        {NAV_PRIMARY.map((item) => (
          <NavButton
            key={item.view}
            item={item}
            active={view === item.view}
            collapsed={collapsed}
            locale={locale}
            badgeCount={badgeFor(item)}
            onNavigate={() => goToView(item.view)}
          />
        ))}

        <MoreToggle
          open={showSecondary}
          collapsed={collapsed}
          locale={locale}
          badgeCount={hiddenBadgeCount}
          onToggle={() => setMoreOpen((open) => !open)}
        />
        {showSecondary &&
          NAV_SECONDARY.map((item, index) => (
            <Fragment key={item.view}>
              {item.group !== NAV_SECONDARY[index - 1]?.group && (
                <NavGroupLabel groupKey={item.group} collapsed={collapsed} locale={locale} />
              )}
              <NavButton
                item={item}
                active={view === item.view}
                collapsed={collapsed}
                locale={locale}
                badgeCount={badgeFor(item)}
                onNavigate={() => goToView(item.view)}
              />
            </Fragment>
          ))}

        {isAdmin && (
          <>
            {!collapsed ? (
              <div className="pt-5 pb-2 px-2.5 flex items-center gap-2 text-[11px] font-[650] uppercase tracking-[0.08em] text-foreground/25">
                <Lock className="size-3" />
                {tr("nav_admin", locale)}
                <div className="h-px flex-1 bg-[var(--hairline)]" />
              </div>
            ) : (
              <div className="my-3 mx-2 h-px bg-[var(--hairline)]" />
            )}
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              const active = view === item.view;
              return (
                <button
                  key={item.view}
                  onClick={() => goToView(item.view)}
                  title={tr(item.key, locale)}
                  className={cn(
                    "group w-full flex items-center gap-2.5 px-2.5 h-[32px] rounded-[8px] text-[13px] font-[450] tracking-[-0.01em] transition-all duration-150 outline-none",
                    "focus-visible:ring-2 focus-visible:ring-amber-300",
                    active
                      ? "bg-amber-500/10 text-amber-100 border border-amber-500/15 shadow-[0_0_0_1px_rgba(245,158,11,0.12)_inset]"
                      : "text-foreground/50 hover:text-foreground/80 hover:bg-foreground/[0.06]",
                    collapsed && "justify-center"
                  )}
                >
                  <Icon className="size-[16px] shrink-0" />
                  {!collapsed && <span className="truncate text-[12.5px]">{tr(item.key, locale)}</span>}
                </button>
              );
            })}
          </>
        )}
      </nav>

      {/* Collapse toggle */}
      {!isDrawer && (
        <button
          onClick={toggleSidebar}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 z-20 size-6 rounded-full bg-[var(--surface-2)] border border-[var(--hairline)] flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-[var(--surface-3)] hover:border-[var(--hairline-light)] transition-all active:scale-[0.92]",
            "shadow-[0_2px_8px_rgba(0,0,0,0.24)]",
            locale === "ar" ? "-start-3" : "-end-3"
          )}
          title={tr(collapsed ? "nav_expand" : "nav_collapse", locale)}
        >
          <ChevronLeft className={cn("size-3.5 transition-transform duration-200", collapsed && "rotate-180", locale === "ar" && "rotate-180", collapsed && locale === "ar" && "rotate-0")} />
        </button>
      )}
    </aside>
  );
}

function WorkspaceSwitcher({
  locale,
  memberships,
  workspaceName,
  plan,
}: {
  locale: "ar" | "en";
  memberships?: Array<{
    role: string;
    active: boolean;
    workspace: { id: string; name: string; nameAr?: string | null; plan: string };
  }>;
  workspaceName?: string;
  plan?: string;
}) {
  const qc = useQueryClient();
  const { update: updateSession } = useSession();
  const switchMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      const res = await fetch("/api/workspaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(apiErrorText(data, locale));
      return data as { workspaceId?: string };
    },
    onSuccess: async (data, workspaceId) => {
      await updateSession({ workspaceId: data.workspaceId || workspaceId });
      qc.invalidateQueries();
    },
  });

  const list = memberships ?? [];

  return (
    <div className="px-3 py-3 border-b border-[var(--hairline)] space-y-2.5">
      <div className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-[10px] bg-foreground/[0.05] border border-foreground/[0.06] hover:bg-foreground/[0.07] transition-colors group">
        <div className="size-8 rounded-[8px] bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0 shadow-[0_0_0_1px_rgba(255,255,255,0.15)_inset]">
          {switchMutation.isPending ? <Loader2 className="size-4 text-white animate-spin" /> : <Building2 className="size-4 text-white" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-[600] tracking-[-0.01em] text-foreground truncate leading-[1.2]">{workspaceName ?? "…"}</div>
          <div className="text-[11px] text-foreground/45 flex items-center gap-1 mt-0.5">
            <CircleDot className="size-3 text-emerald-400" />
            <span className="uppercase tracking-[0.06em] font-[500]">{plan ?? "—"}</span>
          </div>
        </div>
      </div>
      {list.length > 1 && (
        <select
          className="w-full text-[12px] rounded-[8px] bg-[var(--surface-1)] border border-[var(--hairline)] text-foreground/80 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#5e6ad2] transition-all"
          value={list.find((m) => m.active)?.workspace.id ?? ""}
          disabled={switchMutation.isPending}
          onChange={(e) => {
            if (e.target.value) switchMutation.mutate(e.target.value);
          }}
        >
          {list.map((m) => (
            <option key={m.workspace.id} value={m.workspace.id} className="bg-[var(--surface-1)]">
              {locale === "ar" ? m.workspace.nameAr ?? m.workspace.name : m.workspace.name} ({m.role})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
