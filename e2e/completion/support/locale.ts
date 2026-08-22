import type { Page } from "@playwright/test";
import {
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
} from "../../../src/lib/store";
import { BASE_URL, type CompletionLocale } from "./config";

function zustandLocalePayload(locale: CompletionLocale): string {
  return JSON.stringify({
    state: { locale, dir: locale === "ar" ? "rtl" : "ltr" },
    version: 0,
  });
}

/**
 * Persist locale for SSR (cookie) and client (Zustand persist JSON) before navigation.
 *
 * Init-script seeding is nonce-gated so a later UI toggle is not clobbered on reload
 * (addInitScript runs again on every document load).
 */
export async function setLocale(
  page: Page,
  locale: CompletionLocale,
): Promise<void> {
  const seedNonce = `${locale}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

  await page.context().addCookies([
    {
      name: LOCALE_COOKIE_NAME,
      value: locale,
      url: BASE_URL,
      sameSite: "Lax",
    },
  ]);

  await page.addInitScript(
    ([storageKey, cookieName, value, persisted, nonce]) => {
      const marker = "__e2e_locale_seed_nonce__";
      if (sessionStorage.getItem(marker) === nonce) return;
      sessionStorage.setItem(marker, nonce);
      window.localStorage.setItem(storageKey, persisted);
      window.localStorage.setItem("arabclue-marketing-locale", value);
      document.cookie = `${cookieName}=${value}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = value;
      document.documentElement.dir = value === "ar" ? "rtl" : "ltr";
    },
    [
      LOCALE_STORAGE_KEY,
      LOCALE_COOKIE_NAME,
      locale,
      zustandLocalePayload(locale),
      seedNonce,
    ] as const,
  );
}

export async function readLocaleFromStorage(page: Page): Promise<string | null> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (raw === "ar" || raw === "en") return raw;
    if (!raw) return null;
    try {
      const locale = (JSON.parse(raw) as { state?: { locale?: string } })?.state
        ?.locale;
      return locale === "ar" || locale === "en" ? locale : null;
    } catch {
      return null;
    }
  }, LOCALE_STORAGE_KEY);
}

export async function toggleLocaleFromPublicPage(page: Page): Promise<void> {
  const toggle = page.getByRole("button").filter({ hasText: /^(EN|عربي)$/ });
  await toggle.first().click();
  // scheduleLocalePersistence is rAF + setTimeout(0)
  await page.waitForTimeout(50);
}

/**
 * Sign in with the seeded SUPER_ADMIN so the proxy sees a real JWT.
 *
 * Credentials come from the environment, matching `global-setup.ts`. They are
 * never hardcoded: this file is committed, and a working SUPER_ADMIN password
 * in version control is a real credential against whatever database the suite
 * is pointed at.
 */
export async function loginAsDevTest(page: Page): Promise<void> {
  const email = process.env.E2E_ADMIN_EMAIL?.trim();
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set to run authenticated E2E specs (see e2e/completion/global-setup.ts)."
    );
  }

  await setLocale(page, "en");
  await page.goto("/login");
  await page
    .locator('input[type="email"], input[name="email"]')
    .first()
    .fill(email);
  await page
    .locator('input[type="password"], input[name="password"]')
    .first()
    .fill(password);
  await page
    .getByRole("button", { name: /sign in|log in|دخول|تسجيل الدخول/i })
    .first()
    .click();
  await page.waitForURL(/\/app/, { timeout: 45_000 });
}
