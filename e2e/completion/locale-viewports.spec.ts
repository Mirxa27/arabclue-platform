import { expect, test } from "@playwright/test";
import {
  COMPLETION_VIEWPORTS,
  LOCALES,
  LOCALE_STORAGE_KEY,
} from "./support/config";
import { readLocaleFromStorage, setLocale, toggleLocaleFromPublicPage } from "./support/locale";

for (const locale of LOCALES) {
  for (const viewport of COMPLETION_VIEWPORTS) {
    test(`${locale} login smoke at ${viewport.name} (${viewport.width}px)`, async ({
      page,
    }) => {
      await setLocale(page, locale);
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto("/login");
      await expect(page).toHaveURL(/\/login/);
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "ar" ? "rtl" : "ltr",
      );
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("button", { name: /EN|عربي/ })).toBeVisible();
    });
  }
}

test.describe("locale persistence", () => {
  test("toggle on login persists arabclue-locale across reload", async ({
    page,
  }) => {
    await setLocale(page, "ar");
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    await toggleLocaleFromPublicPage(page);
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect(await readLocaleFromStorage(page)).toBe("en");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect(await readLocaleFromStorage(page)).toBe("en");
    expect(
      await page.evaluate((key) => {
        const raw = window.localStorage.getItem(key);
        if (raw === "en") return "en";
        try {
          return (JSON.parse(raw ?? "") as { state?: { locale?: string } })?.state
            ?.locale;
        } catch {
          return null;
        }
      }, LOCALE_STORAGE_KEY),
    ).toBe("en");
  });

  test("locale survives navigation between public auth pages", async ({
    page,
  }) => {
    await setLocale(page, "en");
    await page.goto("/register");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.goto("/forgot-password");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.goto("/invite");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});
