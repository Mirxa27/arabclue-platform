import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isEmailVerificationSkipped } from "@/lib/email-verification-policy";
import { getTenantContext } from "@/lib/workspace-context";
import {
  APP_BASE_PATH,
  getPathForView,
  isAdminView,
  isProjectScopedView,
  isValidProjectIdShape,
  resolveAppRoute,
  type DashboardView,
  type RouteNoticeCode,
} from "@/lib/dashboard-routes";

/**
 * Server-side resolution of an application-shell URL — Requirement 14.
 *
 * Runs before the client shell hydrates so that:
 * - an administrator path opened by a non-administrator session issues no
 *   request for administrator data (Requirement 14.5);
 * - a path naming a project outside the resolved workspace issues no request for
 *   that project's records (Requirement 14.8);
 * - the first rendered view is the view addressed by the URL, with no flash of a
 *   persisted view (Requirement 14.2).
 */
export interface ResolvedAppRoute {
  /** View to render first. */
  readonly view: DashboardView;
  /** Project to restore as active, or null. */
  readonly projectId: string | null;
  /**
   * Canonical path for the resolved view and project. When it differs from the
   * requested path the client replaces the current history entry with it,
   * adding no entry.
   */
  readonly canonicalPath: string;
  /** Bilingual notice code to display, or null when the URL was honoured. */
  readonly notice: RouteNoticeCode | null;
  /**
   * True when the requested path carried a project-scoped view but no project
   * identifier. The client then falls back to the projects view unless a project
   * is persisted for the session (Requirement 14.9).
   */
  readonly projectContextMissing: boolean;
}

const OVERVIEW_FALLBACK = {
  view: "overview" as DashboardView,
  projectId: null,
  canonicalPath: APP_BASE_PATH,
  projectContextMissing: false,
} as const;

/** Account-verification surface an unverified session is redirected to (1.5). */
const VERIFICATION_SURFACE_PATH = "/verify-email";

/** Sign-in surface an unauthenticated request is redirected to (14.2). */
const SIGN_IN_PATH = "/login";

/**
 * Resolves the segments below `/app` for the current session.
 *
 * The server entry authenticates via NextAuth before any view resolution or
 * protected data lookup, so an unauthenticated request never reaches the
 * client shell or issues a data request (Requirement 14.2, 14.5, 14.8).
 * Unauthenticated requests are redirected to the sign-in surface; the edge
 * middleware also retains the requested path in a signed cookie for post-login
 * restoration (Requirement 14.10).
 */
export async function resolveAppRouteForRequest(
  segments: readonly string[]
): Promise<ResolvedAppRoute> {
  const session = await getServerSession(authOptions);

  // Requirement 14.2 — an unauthenticated request is redirected to the sign-in
  // surface before any view resolution or protected data lookup. The edge
  // middleware has already retained the requested path in a signed cookie.
  if (!session?.user?.id) {
    redirect(SIGN_IN_PATH);
  }

  // Requirement 1.5 — an authenticated-but-unverified session reaches only the
  // verification surface. This server guard runs before any view resolution or
  // protected project lookup below, so no application-shell data is fetched or
  // rendered for an unverified session even if the edge gate is bypassed.
  if (
    session.user.emailVerified === false &&
    !isEmailVerificationSkipped()
  ) {
    redirect(VERIFICATION_SURFACE_PATH);
  }

  const role = session.user.role;
  const isAdmin = role === "SUPER_ADMIN" || role === "ADMIN";

  const resolution = resolveAppRoute(segments);

  // Requirement 14.4 — a path outside the canonical set falls back to overview.
  if (!resolution.matched) {
    return { ...OVERVIEW_FALLBACK, notice: "ROUTE_VIEW_NOT_FOUND" };
  }

  const { view } = resolution;

  // Requirement 14.5 — an administrator view requires an administrator role.
  if (isAdminView(view) && !isAdmin) {
    return { ...OVERVIEW_FALLBACK, notice: "ROUTE_VIEW_FORBIDDEN" };
  }

  let projectId = resolution.projectId;

  // Requirement 14.8 — a project outside the resolved workspace is cleared.
  if (projectId) {
    const exists = await projectExistsInTenant(session.user.id, projectId);
    if (!exists) {
      return {
        view,
        projectId: null,
        canonicalPath: getPathForView(view, null),
        notice: "ROUTE_PROJECT_UNAVAILABLE",
        projectContextMissing: isProjectScopedView(view),
      };
    }
  } else if (isProjectScopedView(view)) {
    // Requirement 14.9 — the client decides using the persisted active project.
    return {
      view,
      projectId: null,
      canonicalPath: getPathForView(view, null),
      notice: null,
      projectContextMissing: true,
    };
  }

  // A non project-scoped view never carries a project identifier.
  if (!isProjectScopedView(view)) projectId = null;

  return {
    view,
    projectId,
    canonicalPath: getPathForView(view, projectId),
    notice: null,
    projectContextMissing: false,
  };
}

async function projectExistsInTenant(
  userId: string,
  projectId: string
): Promise<boolean> {
  if (!isValidProjectIdShape(projectId)) return false;
  try {
    const tenant = await getTenantContext(userId);
    const project = await db.tenderProject.findFirst({
      where: { id: projectId, workspaceId: tenant.workspace.id },
      select: { id: true },
    });
    return Boolean(project);
  } catch {
    // A tenancy or database failure must not leak another workspace's project.
    return false;
  }
}
