import type { Session } from "next-auth";
import type { BrandProfile, Workspace } from "@prisma/client";
import {
  DASHBOARD_VIEWS,
  type DashboardView,
} from "@/lib/dashboard-routes";

export type PlatformAgentContext = {
  session: Session;
  workspace: Workspace & { brandProfiles: BrandProfile[] };
  brandProfile: BrandProfile | null;
  userId: string;
  membershipRole: string;
  locale: "ar" | "en";
  isAdmin: boolean;
  canWrite: boolean;
  missionId?: string | null;
  activeProjectId?: string | null;
  /** The view the user is looking at, so "this page" has a referent. */
  currentView?: DashboardView | null;
};

/**
 * `currentView` arrives from the client and ends up interpolated into a system
 * prompt, which makes a free-text field into trusted instructions. Membership in
 * the route table is the whole check: anything else — an injection payload, a
 * casing variant, `__proto__` — becomes null, and the agent simply does not know
 * what page the user is on.
 *
 * Deliberately an array scan rather than a keyed lookup: `DASHBOARD_VIEWS` is
 * short, and an object index would answer yes to inherited keys.
 */
export function resolveCurrentView(value: unknown): DashboardView | null {
  return typeof value === "string" &&
    (DASHBOARD_VIEWS as readonly string[]).includes(value)
    ? (value as DashboardView)
    : null;
}

/**
 * The language the user is looking at, as claimed by the client. Two values
 * exist; anything else is the fallback (the profile language). It reaches the
 * system prompt, so it is resolved, not trusted.
 */
export function resolveRequestLocale(
  value: unknown,
  fallback: "ar" | "en"
): "ar" | "en" {
  return value === "ar" || value === "en" ? value : fallback;
}

/**
 * The screens the agent may name. Re-exported from the canonical route table so
 * a new view is navigable the moment it is routable — a second hand-kept list
 * silently drifted and left four screens unreachable by `navigateToView`.
 */
export { DASHBOARD_VIEWS };
export type PlatformDashboardView = DashboardView;
