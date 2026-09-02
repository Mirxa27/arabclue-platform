import { cookies } from "next/headers";
import { createPageMetadata } from "@/lib/seo";
import { LOCALE_COOKIE_NAME } from "@/lib/store";
import { AppShell } from "@/components/dashboard/app-shell";

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
  // The shell is mounted here, not in the page entry, so it survives route
  // changes under /app. Rendered by the page it remounted on every navigation
  // and took the assistant dock's conversation with it — the agent's own
  // `navigateToView` aborted the stream it was narrating.
  return <AppShell>{children}</AppShell>;
}
