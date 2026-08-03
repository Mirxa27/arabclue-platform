import { LOCALE_STORAGE_KEY } from "../../../src/lib/store";

export const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000";

/** Viewport widths required by task 13.3 (mobile / tablet / desktop). */
export const COMPLETION_VIEWPORTS = [
  { name: "mobile", width: 360, height: 740 },
  { name: "tablet", width: 768, height: 900 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

export const LOCALES = ["ar", "en"] as const;
export type CompletionLocale = (typeof LOCALES)[number];

export { LOCALE_STORAGE_KEY };

/**
 * Tenant-scoped data APIs that must not fire on unknown, forbidden, or
 * unauthenticated dashboard paths (Requirements 14.4–14.8).
 */
export const PROTECTED_DATA_API_PATTERNS: readonly RegExp[] = [
  /\/api\/analytics\//,
  /\/api\/clauses(?:\/|$)/,
  /\/api\/contracts\//,
  /\/api\/proposals(?:\/|$)/,
  /\/api\/documents(?:\/|$)/,
  /\/api\/admin\//,
  /\/api\/knowledge\//,
  /\/api\/notifications(?:\/|$)/,
  /\/api\/templates\/marketplace/,
  /\/api\/billing\/(?!webhook)/,
  /\/api\/collaboration\//,
];

/** Always permitted during public/guard smoke tests. */
export const ALLOWED_PUBLIC_API_PATTERNS: readonly RegExp[] = [
  /\/api\/health$/,
  /\/api\/ready$/,
  /\/api\/auth\//,
];

export function isProtectedDataApi(url: string): boolean {
  const path = new URL(url, BASE_URL).pathname;
  if (ALLOWED_PUBLIC_API_PATTERNS.some((pattern) => pattern.test(path))) {
    return false;
  }
  return PROTECTED_DATA_API_PATTERNS.some((pattern) => pattern.test(path));
}
