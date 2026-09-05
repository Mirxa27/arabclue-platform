import { parseViewFromPath } from "./dashboard-routes";

export function onboardingNotificationId(missing: readonly string[]): string {
  return `onboarding-${encodeURIComponent(missing.join(","))}`;
}

/**
 * The href the bell receives for a notification.
 *
 * The bell navigates with `setView` and reads the view from a `view=` marker,
 * so a canonical app path — what the email link carries, e.g. `/app/billing` —
 * is translated back to that form. Rows written before the paths became
 * canonical still carry `/app?view=…` and are honoured as they are.
 */
export function normalizeNotificationHref(
  href: string | null | undefined
): string | undefined {
  if (!href) return undefined;
  const legacyView = /[?&]view=([a-z_]+)/.exec(href)?.[1];
  if (legacyView) return `?view=${legacyView}`;
  if (href.startsWith("/app")) {
    const view = parseViewFromPath(href);
    return view ? `?view=${view}` : href;
  }
  if (href.startsWith("/")) return href;
  return `?view=${href.replace(/^view=/, "")}`;
}
