import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

/** Public marketing + health/auth surfaces (no session required). */
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/for-owners",
  "/pricing",
  "/compliance",
  "/api/health",
  "/api/ready",
  "/api/billing/webhook",
]);

function isPublicPath(path: string): boolean {
  if (PUBLIC_PATHS.has(path)) return true;
  if (path.startsWith("/api/auth")) return true;
  if (path.startsWith("/_next")) return true;
  if (path.startsWith("/favicon")) return true;
  return false;
}

function isPasswordChangeAllowed(path: string): boolean {
  if (path === "/login") return true;
  if (path.startsWith("/api/auth")) return true;
  return false;
}

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

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
        if (isPublicPath(req.nextUrl.pathname)) return true;
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
