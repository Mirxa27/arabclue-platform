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
};

/**
 * The screens the agent may name. Re-exported from the canonical route table so
 * a new view is navigable the moment it is routable — a second hand-kept list
 * silently drifted and left four screens unreachable by `navigateToView`.
 */
export { DASHBOARD_VIEWS };
export type PlatformDashboardView = DashboardView;
