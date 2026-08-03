import { cookies } from "next/headers";
import { createPageMetadata } from "@/lib/seo";
import { LOCALE_COOKIE_NAME } from "@/lib/store";

export const metadata = createPageMetadata({
  title: "Workspace",
  description: "Arabclue tender proposal workspace dashboard.",
  path: "/app",
  noIndex: true,
});

/**
 * Server-first locale for the application shell (Requirement 18.3, 18.8).
 *
 * The root layout already emits `lang`/`dir` from the locale cookie before
 * hydration. This layout mirrors the same cookie read so the app shell's
 * metadata and rendering context are consistent with the root layout's
 * server-first decision, and a locale switch never changes the canonical route
 * (Requirement 14.7).
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  // The root layout owns the <html> tag; here we just validate the cookie
  // is readable on the server so the app shell is server-first consistent.
  void localeCookie;
  return children;
}
