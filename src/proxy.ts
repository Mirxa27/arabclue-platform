import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { PUBLIC_PAGE_PATHS } from "@/lib/marketing/site-pages";
import { isAppPath } from "@/lib/dashboard-routes";
import { getCompletionErrorContract } from "@/lib/i18n";
import {
  RETURN_TO_COOKIE,
  RETURN_TO_MAX_AGE_SECONDS,
  signReturnTo,
} from "@/lib/return-to";

/** Path of the account-verification surface unverified sessions are held to. */
const VERIFICATION_SURFACE_PATH = "/verify-email";

/**
 * Bilingual `ApiFailure` body for a stable completion code (requirement 18.4).
 * `i18n` is a dependency-free data module, so building the contract here keeps
 * the edge middleware free of a user-facing literal without importing the
 * Node-only response mapper.
 */
export function bilingualFailureBody(
  code: Parameters<typeof getCompletionErrorContract>[0]
) {
  const contract = getCompletionErrorContract(code);
  return { ...contract, error: contract.message };
}

/** Public marketing + health/auth surfaces (no session required). */
export const PUBLIC_PATHS = new Set<string>([
  ...PUBLIC_PAGE_PATHS,
  "/api/health",
  "/api/ready",
  "/api/billing/webhook",
  // The invitee accepting an invitation usually has no account yet: the /invite
  // page is public, the handler is a withPublicRoute that explicitly tolerates
  // a null session, and the service reports `accountCreated`. Without this
  // entry the proxy rejected the unauthenticated invitee before the handler
  // ran, so the primary invitation flow could not complete. Authorization is
  // the single-use invitation token itself, verified inside the service.
  "/api/invitations/accept",
  "/sitemap.xml",
  "/robots.txt",
]);

function isPublicPath(path: string): boolean {
  if (PUBLIC_PATHS.has(path)) return true;
  if (path.startsWith("/api/auth")) return true;
  // Cron routes authenticate via CRON_SECRET inside the handler.
  if (path.startsWith("/api/cron")) return true;
  if (path.startsWith("/_next")) return true;
  if (path.startsWith("/favicon")) return true;
  // Demo EN|AR sample tender/contract PDFs (public/samples)
  if (path === "/samples" || path.startsWith("/samples/")) return true;
  // Chrome extension auth probe + remote config (returns authenticated:false when unsigned)
  if (path === "/api/platform-agent/extension/config") return true;
  // Pre-packed extension ZIP for Load unpacked (authenticated download API remains available)
  if (
    path === "/downloads/arabclue-agent.zip" ||
    path === "/downloads/arabclue-voice-agent.zip"
  ) {
    return true;
  }
  return false;
}

/**
 * An API route that needs a session, and so must answer an unauthenticated
 * caller in JSON rather than by redirecting to the sign-in page.
 *
 * `withAuth` redirects whenever `authorized` returns false. For a navigation
 * that is right; for a `fetch` it is not — the redirect is followed, the login
 * page returns 200 text/html, and the caller sees `res.ok` with markup for a
 * body. A lapsed session therefore read as "could not reach the server" on
 * every client that did not sniff the content type.
 */
export function isProtectedApiPath(path: string): boolean {
  return path.startsWith("/api/") && !isPublicPath(path);
}

function isPasswordChangeAllowed(path: string): boolean {
  if (path === "/login") return true;
  if (path.startsWith("/api/auth")) return true;
  return false;
}

/**
 * The only paths an authenticated-but-unverified session may reach
 * (requirement 1.5): the account-verification surface, the verification action,
 * the reissue action that recovers a failed send or a lapsed token, the
 * sign-out action (with the CSRF token NextAuth requires to sign out), and
 * the minimum session-refresh path the verification page calls after success.
 * Everything else is denied. Keep in sync with VERIFICATION_ALLOWLIST in
 * src/lib/auth.ts.
 */
const VERIFICATION_ALLOWED: string[] = [
  VERIFICATION_SURFACE_PATH,
  "/api/auth/verify-email",
  "/api/auth/resend-verification",
  "/api/auth/session",
  "/api/auth/signout",
  "/api/auth/csrf",
];

function isVerificationAllowedPath(path: string): boolean {
  const lower = path.toLowerCase();
  return VERIFICATION_ALLOWED.some((allowed) =>
    lower.includes(allowed.toLowerCase())
  );
}

export default withAuth(
  async function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Requirement 14.10 — a visitor with no session who opens a Dashboard_View
    // URL sees the sign-in surface, and the requested view path plus any project
    // identifier are retained for at most 30 minutes in a signed cookie.
    if (!token && isAppPath(path)) {
      const requested = `${path}${req.nextUrl.search}`;
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("callbackUrl", requested);
      const response = NextResponse.redirect(url);
      const signed = await signReturnTo(requested);
      if (signed) {
        response.cookies.set({
          name: RETURN_TO_COOKIE,
          value: signed,
          httpOnly: true,
          sameSite: "lax",
          secure: req.nextUrl.protocol === "https:",
          path: "/",
          maxAge: RETURN_TO_MAX_AGE_SECONDS,
        });
      }
      return response;
    }

    // A fetch with no session gets an answer it can parse. 401 rather than 403:
    // the caller is not signed in, and "Sign in to continue" is what the
    // bilingual body says.
    if (!token && isProtectedApiPath(path)) {
      return NextResponse.json(bilingualFailureBody("UNAUTHORIZED"), {
        status: 401,
      });
    }

    // Force password change before any app/API use
    if (token?.mustChangePassword && !isPasswordChangeAllowed(path)) {
      if (path.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Password change required", code: "MUST_CHANGE_PASSWORD" },
          { status: 403 }
        );
      }
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("changePassword", "1");
      return NextResponse.redirect(url);
    }

    // Gate unverified sessions (requirement 1.5): deny every other authenticated
    // API with a bilingual 403 EMAIL_VERIFICATION_REQUIRED, and redirect every
    // other authenticated page to the verification surface before it renders.
    if (token?.emailVerified === false && !isVerificationAllowedPath(path)) {
      if (path.startsWith("/api/")) {
        return NextResponse.json(
          bilingualFailureBody("EMAIL_VERIFICATION_REQUIRED"),
          { status: 403 }
        );
      }
      const url = req.nextUrl.clone();
      url.pathname = VERIFICATION_SURFACE_PATH;
      url.search = "";
      return NextResponse.redirect(url);
    }

    // Admin API: require SUPER_ADMIN or ADMIN
    if (path.startsWith("/api/admin")) {
      const role = token?.role as string | undefined;
      if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;
        if (isPublicPath(path)) return true;
        // Application-shell paths are handled inside the middleware so the
        // requested path can be retained in a signed cookie before redirecting.
        if (isAppPath(path)) return true;
        // Likewise for APIs, so the answer can be a JSON status instead of the
        // sign-in page `withAuth` would redirect to.
        if (isProtectedApiPath(path)) return true;
        return !!token;
      },
    },
    pages: { signIn: "/login" },
  }
);

export const config = {
  // NOTE: Do NOT exclude uploads — file access must go through /api/files with tenant scoping
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
