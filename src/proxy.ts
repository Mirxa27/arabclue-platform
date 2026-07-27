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
function bilingualFailureBody(
  code: Parameters<typeof getCompletionErrorContract>[0]
) {
  const contract = getCompletionErrorContract(code);
  return { ...contract, error: contract.message };
}

/** Public marketing + health/auth surfaces (no session required). */
const PUBLIC_PATHS = new Set<string>([
  ...PUBLIC_PAGE_PATHS,
  "/api/health",
  "/api/ready",
  "/api/billing/webhook",
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
  return false;
}

function isPasswordChangeAllowed(path: string): boolean {
  if (path === "/login") return true;
  if (path.startsWith("/api/auth")) return true;
  return false;
}

/**
 * The only paths an authenticated-but-unverified session may reach
 * (requirement 1.5): the account-verification surface, the verification action,
 * the sign-out action (with the CSRF token NextAuth requires to sign out), and
 * the minimum session-refresh path the verification page calls after success.
 * Everything else is denied. Keep in sync with VERIFICATION_ALLOWLIST in
 * src/lib/auth.ts.
 */
const VERIFICATION_ALLOWED: string[] = [
  VERIFICATION_SURFACE_PATH,
  "/api/auth/verify-email",
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
