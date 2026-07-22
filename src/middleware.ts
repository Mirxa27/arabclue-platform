import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

/** Public marketing + health/auth surfaces (no session required). */
const PUBLIC_PATHS = new Set([
  "/login",
  "/for-owners",
  "/pricing",
  "/compliance",
  "/api/health",
  "/api/billing/webhook",
]);

function isPublicPath(path: string): boolean {
  if (PUBLIC_PATHS.has(path)) return true;
  if (path.startsWith("/api/auth")) return true;
  if (path.startsWith("/_next")) return true;
  if (path.startsWith("/favicon")) return true;
  return false;
}

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|uploads/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
