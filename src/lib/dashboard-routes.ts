/**
 * Canonical dashboard route table — Requirement 14 and Properties 1 and 2.
 *
 * A pure, dependency-free bidirectional map between a `DashboardView` (plus an
 * optional project context) and exactly one canonical URL path. The module holds
 * no React, no Zustand, and no client directive so a server component can
 * resolve a request URL before any protected data is fetched.
 *
 * Path shape:
 * - overview:              `/app`
 * - global view:           `/app/<segment>`
 * - admin view:            `/app/admin/<segment>` (`/app/admin` for the overview)
 * - project-scoped view:   `/app/projects/<projectId>/<segment>`
 *
 * Resolution is strict: a path matches only when it is byte-identical to the
 * canonical path produced for the resolved view and project context. Every other
 * path under `/app` returns an unmatched result carrying a canonical fallback,
 * so a caller never has to invent one (Requirement 14.4).
 *
 * The locale never appears in a path, so a shared link opens in the recipient's
 * persisted locale (Requirement 14.7).
 */

export type DashboardView =
  | "overview"
  | "projects"
  | "documents"
  | "proposals"
  | "contracts"
  | "clause-library"
  | "template-editor"
  | "account"
  | "business-profile"
  | "agents"
  | "billing"
  | "reviews"
  | "knowledge-approval"
  | "settings"
  | "proposal-builder"
  | "marketplace"
  | "analytics"
  | "setup"
  // Admin views
  | "admin_overview"
  | "admin_ai"
  | "admin_env"
  | "admin_billing"
  | "admin_myfatoorah"
  | "admin_security"
  | "admin_audit";

/** Base path of the application shell. */
export const APP_BASE_PATH = "/app";

/** Segment under `/app` that introduces a project-scoped path. */
const PROJECT_PREFIX = "projects";

/** Segment under `/app` that introduces an administrator path. */
const ADMIN_PREFIX = "admin";

/**
 * Path segment for every view. `overview` maps to the empty segment so its
 * canonical path is `/app`. Administrator views carry the `admin/` prefix.
 *
 * The `Record<DashboardView, string>` annotation is the typed half of the
 * mapping: a new union member cannot compile without a canonical segment.
 */
export const VIEW_PATHS: Readonly<Record<DashboardView, string>> = Object.freeze({
  overview: "",
  projects: "projects",
  documents: "documents",
  proposals: "proposals",
  contracts: "contracts",
  "clause-library": "clause-library",
  "template-editor": "template-editor",
  agents: "agents",
  account: "account",
  "business-profile": "business-profile",
  reviews: "reviews",
  "knowledge-approval": "knowledge-approval",
  billing: "billing",
  settings: "settings",
  "proposal-builder": "proposal-builder",
  marketplace: "marketplace",
  analytics: "analytics",
  setup: "setup",
  admin_overview: "admin",
  admin_ai: "admin/ai",
  admin_env: "admin/env",
  admin_billing: "admin/billing",
  admin_myfatoorah: "admin/myfatoorah",
  admin_security: "admin/security",
  admin_audit: "admin/audit",
});

/** Every declared view, in declaration order. */
export const DASHBOARD_VIEWS: readonly DashboardView[] = Object.freeze(
  Object.keys(VIEW_PATHS) as DashboardView[]
);

/**
 * Localization key naming each view, so anything that reports a destination —
 * the copilot's "opened X" badge, a breadcrumb, a notice — can say the same word
 * the sidebar says. Only the key lives here: resolving it needs the dictionary,
 * which this module deliberately does not import (see `viewLabel` in i18n).
 */
export const VIEW_LABEL_KEYS: Readonly<Record<DashboardView, string>> =
  Object.freeze({
    overview: "nav_home_agent",
    projects: "nav_projects",
    documents: "nav_documents",
    proposals: "nav_proposals",
    contracts: "nav_contracts",
    "clause-library": "nav_clause_library",
    "template-editor": "nav_template_editor",
    agents: "nav_agents",
    account: "nav_account",
    "business-profile": "nav_business_profile",
    reviews: "nav_reviews",
    "knowledge-approval": "nav_knowledge_approval",
    billing: "nav_billing",
    settings: "nav_settings",
    "proposal-builder": "nav_proposal_builder",
    marketplace: "nav_marketplace",
    analytics: "nav_analytics",
    setup: "nav_setup",
    admin_overview: "nav_dashboard",
    admin_ai: "nav_admin_ai",
    admin_env: "nav_admin_env",
    admin_billing: "nav_admin_billing",
    admin_myfatoorah: "nav_admin_myfatoorah",
    admin_security: "nav_admin_security",
    admin_audit: "nav_admin_audit",
  });

/**
 * Segments that used to name a view, and the view that absorbed each one.
 *
 * `copilot` and `brand` rendered the very same component as `overview` and
 * `account`; `compliance` and `history` each rendered a strict subset of the
 * panels `documents` already stacks on one screen. Deleting the segments outright
 * would send every existing bookmark to the home agent under a "route not found"
 * notice, so the address survives its view: the reader lands on the screen that
 * absorbed it and is told the panel moved.
 */
export const RETIRED_VIEWS: Readonly<Record<string, DashboardView>> =
  Object.freeze({
    brand: "account",
    compliance: "documents",
    copilot: "overview",
    history: "documents",
  });

/** Reverse map from path segment to view, for O(1) resolution. */
export const PATH_TO_VIEW: Readonly<Record<string, DashboardView>> = Object.freeze(
  Object.entries(VIEW_PATHS).reduce<Record<string, DashboardView>>(
    (acc, [view, segment]) => {
      acc[segment] = view as DashboardView;
      return acc;
    },
    {}
  )
);

/** Views that require an administrator or super-administrator session role. */
export const ADMIN_VIEWS: ReadonlySet<DashboardView> = Object.freeze(
  new Set<DashboardView>([
    "admin_overview",
    "admin_ai",
    "admin_env",
    "admin_billing",
    "admin_myfatoorah",
    "admin_security",
    "admin_audit",
  ])
);

/**
 * Views declared as operating on the records of one project. Their canonical
 * path carries the project identifier while a project is selected.
 */
export const PROJECT_SCOPED_VIEWS: ReadonlySet<DashboardView> = Object.freeze(
  new Set<DashboardView>(["documents", "proposals", "contracts", "agents"])
);

/**
 * Views addressed without a project identifier. Complement of
 * `PROJECT_SCOPED_VIEWS`, exposed so callers and tests can enumerate both halves
 * of the union without restating membership.
 */
export const GLOBAL_VIEWS: readonly DashboardView[] = Object.freeze(
  DASHBOARD_VIEWS.filter((view) => !PROJECT_SCOPED_VIEWS.has(view))
);

/**
 * Stable machine-readable codes for the notices the router displays when a
 * requested URL cannot be honoured (Requirements 14.4, 14.5, 14.8, 14.9). Each
 * code has an Arabic and an English message in the Localization_Registry.
 */
export type RouteNoticeCode =
  | "ROUTE_VIEW_NOT_FOUND"
  | "ROUTE_VIEW_FORBIDDEN"
  | "ROUTE_VIEW_MOVED"
  | "ROUTE_PROJECT_UNAVAILABLE"
  | "ROUTE_PROJECT_REQUIRED";

export const ROUTE_NOTICE_CODES: readonly RouteNoticeCode[] = Object.freeze([
  "ROUTE_VIEW_NOT_FOUND",
  "ROUTE_VIEW_FORBIDDEN",
  "ROUTE_VIEW_MOVED",
  "ROUTE_PROJECT_UNAVAILABLE",
  "ROUTE_PROJECT_REQUIRED",
]);

export function isDashboardView(value: string): value is DashboardView {
  return Object.prototype.hasOwnProperty.call(VIEW_PATHS, value);
}

export function isAdminView(view: DashboardView): boolean {
  return ADMIN_VIEWS.has(view);
}

export function isProjectScopedView(view: DashboardView): boolean {
  return PROJECT_SCOPED_VIEWS.has(view);
}

/** True when the path addresses the application shell. */
export function isAppPath(pathname: string): boolean {
  return (
    pathname === APP_BASE_PATH || pathname.startsWith(`${APP_BASE_PATH}/`)
  );
}

// ---------------------------------------------------------------------------
// Project identifier encoding
// ---------------------------------------------------------------------------

/**
 * Project identifiers are cuid-like opaque tokens. Validating the shape keeps a
 * traversal segment, a path separator, or an encoded query out of a database
 * lookup.
 */
const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidProjectIdShape(value: string): boolean {
  return PROJECT_ID_PATTERN.test(value);
}

/**
 * Encodes a project identifier for a path segment. Every character the accepted
 * shape admits is already URL-safe, so this is the identity for every accepted
 * value and a canonical path therefore carries no percent escape. `resolveAppRoute`
 * relies on that when it compares a received path against the canonical form.
 * The call is applied explicitly so a rejected identifier can never widen the path.
 */
export function encodeProjectId(projectId: string): string | null {
  if (!isValidProjectIdShape(projectId)) return null;
  return encodeURIComponent(projectId);
}

/**
 * Decodes a path segment back to a project identifier, or null when the segment
 * is malformed, percent-broken, or outside the accepted shape.
 */
export function decodeProjectId(segment: string): string | null {
  const decoded = safeDecodeSegment(segment);
  if (decoded === null) return null;
  return isValidProjectIdShape(decoded) ? decoded : null;
}

/** `decodeURIComponent` without the throw on a malformed escape sequence. */
function safeDecodeSegment(segment: string): string | null {
  if (!segment.includes("%")) return segment;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// View -> path
// ---------------------------------------------------------------------------

/**
 * Canonical segments below `/app` for a view and project context.
 *
 * A project-scoped view receives `["projects", <projectId>, <segment>]` while a
 * project is selected, and `[<segment>]` otherwise. A view that is not
 * project-scoped never carries a project identifier (Requirement 14.6).
 */
export function segmentsForView(
  view: DashboardView,
  activeProjectId?: string | null
): readonly string[] {
  const segment = VIEW_PATHS[view] ?? "";
  if (segment === "") return [];

  const viewSegments = segment.split("/");
  if (!isProjectScopedView(view)) return viewSegments;

  const encoded =
    typeof activeProjectId === "string" && activeProjectId.length > 0
      ? encodeProjectId(activeProjectId)
      : null;
  if (encoded === null) return viewSegments;

  return [PROJECT_PREFIX, encoded, ...viewSegments];
}

/** The one canonical path for a view and project context. */
export function getPathForView(
  view: DashboardView,
  activeProjectId?: string | null
): string {
  const segments = segmentsForView(view, activeProjectId);
  return segments.length === 0
    ? APP_BASE_PATH
    : `${APP_BASE_PATH}/${segments.join("/")}`;
}

// ---------------------------------------------------------------------------
// Canonical fallbacks
// ---------------------------------------------------------------------------

/**
 * Where the router sends a request it cannot honour. `action` is always
 * `replace`: a fallback corrects the current history entry and never adds one
 * (Requirements 14.4, 14.5, 14.8, 14.9).
 */
export interface CanonicalFallback {
  readonly view: DashboardView;
  readonly projectId: string | null;
  readonly path: string;
  readonly notice: RouteNoticeCode;
  readonly action: "replace";
}

/** Path of the overview view — the fallback for a path outside the route table. */
export const OVERVIEW_PATH = APP_BASE_PATH;

/** Path of the projects view — the fallback for a missing project context. */
export const PROJECTS_PATH = getPathForView("projects");

/** Requirement 14.4 — the requested path names no view. */
export const UNKNOWN_VIEW_FALLBACK: CanonicalFallback = Object.freeze({
  view: "overview" as DashboardView,
  projectId: null,
  path: OVERVIEW_PATH,
  notice: "ROUTE_VIEW_NOT_FOUND" as RouteNoticeCode,
  action: "replace" as const,
});

/** Requirement 14.5 — the session role may not open the requested view. */
export const FORBIDDEN_VIEW_FALLBACK: CanonicalFallback = Object.freeze({
  view: "overview" as DashboardView,
  projectId: null,
  path: OVERVIEW_PATH,
  notice: "ROUTE_VIEW_FORBIDDEN" as RouteNoticeCode,
  action: "replace" as const,
});

/** Requirement 14.9 — a project-scoped view opened with no project context. */
export const PROJECT_REQUIRED_FALLBACK: CanonicalFallback = Object.freeze({
  view: "projects" as DashboardView,
  projectId: null,
  path: PROJECTS_PATH,
  notice: "ROUTE_PROJECT_REQUIRED" as RouteNoticeCode,
  action: "replace" as const,
});

/**
 * The canonical fallback for a notice. `ROUTE_PROJECT_UNAVAILABLE` keeps the
 * requested view and drops the project identifier (Requirement 14.8); every
 * other notice resolves to a fixed canonical path.
 */
export function canonicalFallbackFor(
  notice: RouteNoticeCode,
  view: DashboardView = "overview"
): CanonicalFallback {
  switch (notice) {
    case "ROUTE_VIEW_FORBIDDEN":
      return FORBIDDEN_VIEW_FALLBACK;
    case "ROUTE_PROJECT_REQUIRED":
      return PROJECT_REQUIRED_FALLBACK;
    case "ROUTE_VIEW_MOVED":
    case "ROUTE_PROJECT_UNAVAILABLE":
      return Object.freeze({
        view,
        projectId: null,
        path: getPathForView(view, null),
        notice,
        action: "replace" as const,
      });
    case "ROUTE_VIEW_NOT_FOUND":
    default:
      return UNKNOWN_VIEW_FALLBACK;
  }
}

// ---------------------------------------------------------------------------
// Path -> view
// ---------------------------------------------------------------------------

export type AppRouteResolution =
  | {
      readonly matched: true;
      readonly view: DashboardView;
      /** Project identifier carried by the path, or null when the path carries none. */
      readonly projectId: string | null;
      /** Canonical path for the resolved view and project. */
      readonly canonicalPath: string;
      readonly fallback: null;
    }
  | {
      readonly matched: false;
      readonly view: null;
      readonly projectId: null;
      readonly canonicalPath: null;
      /** Where to send the request instead, with a replace action and a notice. */
      readonly fallback: CanonicalFallback;
    };

const UNMATCHED: AppRouteResolution = Object.freeze({
  matched: false,
  view: null,
  projectId: null,
  canonicalPath: null,
  fallback: UNKNOWN_VIEW_FALLBACK,
});

/**
 * Raw, undecoded segments below `/app`, including empty segments so resolution
 * can reject a non-canonical `//` path. Returns an empty list for a path outside
 * the application shell.
 */
export function appPathSegments(pathname: string): string[] {
  if (!isAppPath(pathname)) return [];
  const tail = pathname.slice(APP_BASE_PATH.length);
  if (tail === "") return [];
  // The tail always starts with the separator, which yields a leading empty entry.
  return tail.split("/").slice(1);
}

/**
 * Drops the one trailing empty segment a single trailing slash produces, so
 * `/app/documents/` is the same address as `/app/documents`. Every other empty
 * segment is left in place for `decodeSegments` to reject.
 */
function trimTrailingSlash(segments: readonly string[]): string[] {
  const raw = segments.slice();
  if (raw.length > 0 && raw[raw.length - 1] === "") raw.pop();
  return raw;
}

/**
 * Decodes the segments and rejects every shape a canonical path never produces:
 * an empty segment, a malformed escape sequence, or an encoded separator.
 */
function decodeSegments(segments: readonly string[]): string[] | null {
  const decoded: string[] = [];
  for (const segment of segments) {
    if (segment.length === 0) return null;
    const value = safeDecodeSegment(segment);
    if (value === null || value.length === 0) return null;
    if (value.includes("/") || value.includes("\\")) return null;
    decoded.push(value);
  }
  return decoded;
}

function sameSegments(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((segment, index) => segment === b[index]);
}

function matchedResolution(
  view: DashboardView,
  projectId: string | null
): AppRouteResolution {
  return {
    matched: true,
    view,
    projectId,
    canonicalPath: getPathForView(view, projectId),
    fallback: null,
  };
}

/**
 * Resolves the segments below `/app` to exactly one view plus project context.
 *
 * A path matches only when it equals the canonical path of the resolved view and
 * project, which makes the mapping bidirectional (Property 1). Every other path
 * returns the unmatched result carrying the overview fallback, so the caller can
 * apply it without fetching protected data (Property 2).
 */
export function resolveAppRoute(
  segments: readonly string[]
): AppRouteResolution {
  const received = trimTrailingSlash(segments);
  const parts = decodeSegments(received);
  if (parts === null) return UNMATCHED;

  const moved = retirementResolution(parts);
  if (moved !== null) return moved;

  const candidate = matchCandidate(parts);
  if (candidate === null) return UNMATCHED;

  const canonical = segmentsForView(candidate.view, candidate.projectId);

  // Strict bidirectionality, checked on both forms of the request.
  //
  // The decoded form must equal the canonical form, which rules out a shape the
  // route table never produces. The received form must equal it as well: no view
  // segment and no accepted project identifier contains a character that needs
  // escaping, so a canonical path carries no percent escape at all. Comparing the
  // received form therefore keeps a percent-encoded alias such as
  // `/app/%64ocuments` from acting as a second address for one view, and leaves it
  // an unknown path with the overview fallback (Requirements 14.2, 14.4).
  if (!sameSegments(parts, canonical) || !sameSegments(received, canonical)) {
    return UNMATCHED;
  }

  return matchedResolution(candidate.view, candidate.projectId);
}

/**
 * The redirect for a path whose last segment names a retired view, or null when
 * it names none.
 *
 * A retired segment reached under `/app/projects/:id/` keeps the identifier as
 * long as the absorbing view is itself project-scoped — dropping it would move
 * the reader to another project's records, or to none at all.
 */
function retirementResolution(
  parts: readonly string[]
): AppRouteResolution | null {
  const isProjectScoped =
    parts.length === 3 && parts[0] === PROJECT_PREFIX;
  if (parts.length !== 1 && !isProjectScoped) return null;

  const replacement = RETIRED_VIEWS[parts[parts.length - 1]!];
  if (replacement === undefined) return null;

  const projectId = isProjectScoped ? decodeProjectId(parts[1]!) : null;
  if (isProjectScoped && projectId === null) return null;

  const carried = isProjectScopedView(replacement) ? projectId : null;
  return {
    matched: false,
    view: null,
    projectId: null,
    canonicalPath: null,
    fallback: Object.freeze({
      view: replacement,
      projectId: carried,
      path: getPathForView(replacement, carried),
      notice: "ROUTE_VIEW_MOVED" as RouteNoticeCode,
      action: "replace" as const,
    }),
  };
}

function matchCandidate(
  parts: readonly string[]
): { view: DashboardView; projectId: string | null } | null {
  if (parts.length === 0) return { view: "overview", projectId: null };

  // /app/projects/:projectId/:segment — project-scoped view.
  if (parts[0] === PROJECT_PREFIX && parts.length > 1) {
    if (parts.length !== 3) return null;
    const projectId = decodeProjectId(parts[1]);
    if (projectId === null) return null;
    const view = PATH_TO_VIEW[parts[2]];
    if (!view || !isProjectScopedView(view)) return null;
    return { view, projectId };
  }

  // /app/admin and /app/admin/:segment — administrator views.
  if (parts[0] === ADMIN_PREFIX) {
    if (parts.length > 2) return null;
    const view = PATH_TO_VIEW[parts.join("/")];
    if (!view || !isAdminView(view)) return null;
    return { view, projectId: null };
  }

  // /app/:segment — global view.
  if (parts.length !== 1) return null;
  const view = PATH_TO_VIEW[parts[0]];
  if (!view || isAdminView(view)) return null;
  return { view, projectId: null };
}

/** Resolves a full pathname. Convenience wrapper over `resolveAppRoute`. */
export function resolveAppPath(pathname: string): AppRouteResolution {
  if (!isAppPath(pathname)) return UNMATCHED;
  return resolveAppRoute(appPathSegments(pathname));
}

/**
 * The view addressed by a pathname, or null when the path matches no view.
 * Retained for callers that do not need the project context.
 */
export function parseViewFromPath(pathname: string): DashboardView | null {
  return resolveAppPath(pathname).view;
}

/** The project identifier addressed by a pathname, or null when it carries none. */
export function parseProjectIdFromPath(pathname: string): string | null {
  return resolveAppPath(pathname).projectId;
}
