import { expect, test } from "@playwright/test";
import { LOCALES } from "./support/config";
import { mockPublicAuthEndpoints } from "./support/mocks";
import { setLocale } from "./support/locale";

const AUTH_PAGES = [
  { path: "/register", heading: /register|إنشاء|تسجيل/i },
  { path: "/verify-email", heading: /verify|تحقق/i },
  { path: "/forgot-password", heading: /forgot|نسيت/i },
  { path: "/reset-password?token=e2e-test-token", heading: /reset|إعادة/i },
  { path: "/invite?token=e2e-invite-token", heading: /invite|دعوة/i },
] as const;

for (const locale of LOCALES) {
  test.describe(`public auth smoke (${locale})`, () => {
    test.beforeEach(async ({ page }) => {
      await setLocale(page, locale);
      await mockPublicAuthEndpoints(page);
    });

    for (const authPage of AUTH_PAGES) {
      test(`renders ${authPage.path}`, async ({ page }) => {
        await page.goto(authPage.path);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.getByRole("button", { name: /EN|عربي/ })).toBeVisible();
      });
    }
  });
}

test.describe("registration flow (mocked provider)", () => {
  test("submit mocked register shows success without shared DB", async ({
    page,
  }) => {
    await setLocale(page, "en");
    await mockPublicAuthEndpoints(page);
    await page.goto("/register");
    // Labels are visual-only (no htmlFor); use placeholders / input types.
    await page.getByPlaceholder(/mohammed|محمد/i).fill("E2E User");
    await page
      .getByPlaceholder(/solutions|حلول|advanced/i)
      .fill("E2E Workspace");
    await page.locator('input[type="email"]').fill("e2e-register@example.invalid");
    await page
      .locator('input[type="password"]')
      .fill("E2e-Test-Password-9!");
    await page
      .getByRole("button", {
        name: /create account|إنشاء الحساب|register|إنشاء|تسجيل/i,
      })
      .click();
    await expect(page.getByText(/check your email|تحقق من بريدك/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("recovery and invitation (mocked provider)", () => {
  test.beforeEach(async ({ page }) => {
    await setLocale(page, "en");
    await mockPublicAuthEndpoints(page);
  });

  test("forgot-password anti-enumeration success copy", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel(/email|البريد/i).fill("unknown@example.invalid");
    await page.getByRole("button", { name: /send|إرسال/i }).click();
    await expect(
      page.getByText(/if the email is registered|إذا كان البريد مسجلاً/i),
    ).toBeVisible();
  });

  test("invite acceptance form accepts mocked token", async ({ page }) => {
    await page.goto("/invite?token=e2e-invite-token");
    await page.getByLabel(/name|الاسم/i).fill("Invited User");
    await page.getByLabel(/password|كلمة المرور/i).fill("E2e-Invite-Password-9!");
    await page.getByRole("button", { name: /accept|قبول/i }).click();
    await expect(page.getByText(/invitation accepted|تم قبول الدعوة/i)).toBeVisible();
  });
});
