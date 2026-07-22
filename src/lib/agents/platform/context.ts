import type { Session } from "next-auth";
import type { BrandProfile, Workspace } from "@prisma/client";

export type PlatformAgentContext = {
  session: Session;
  workspace: Workspace & { brandProfiles: BrandProfile[] };
  brandProfile: BrandProfile | null;
  userId: string;
  membershipRole: string;
  locale: "ar" | "en";
  isAdmin: boolean;
  canWrite: boolean;
};

export const DASHBOARD_VIEWS = [
  "overview",
  "projects",
  "documents",
  "proposals",
  "contracts",
  "compliance",
  "agents",
  "history",
  "account",
  "reviews",
  "billing",
  "settings",
  "admin_overview",
  "admin_ai",
  "admin_env",
  "admin_billing",
  "admin_myfatoorah",
  "admin_security",
  "admin_audit",
  "copilot",
] as const;

export type PlatformDashboardView = (typeof DASHBOARD_VIEWS)[number];
