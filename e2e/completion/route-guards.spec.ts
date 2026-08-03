import { expect, test } from "@playwright/test";
import { trackForbiddenDataRequests } from "./support/forbidden-requests";

const GUARD_PATHS = [
  "/app",
  "/app/not-a-real-view",
  "/app/admin/billing",
  "/app/projects/not-a-valid-cuid/proposals",
  "/app/foo/bar/baz",
] as const;

for (const path of GUARD_PATHS) {
  test(`unauthenticated ${path} redirects to login without protected data fetches`, async ({
    page,
  }) => {
    const tracker = trackForbiddenDataRequests(page);
    try {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
      await page.waitForTimeout(500);
      tracker.assertNone(`unauthenticated guard for ${path}`);
    } finally {
      tracker.dispose();
    }
  });
}

test("unknown dashboard path retains callbackUrl on login redirect", async ({
  page,
}) => {
  const tracker = trackForbiddenDataRequests(page);
  try {
    const target = "/app/unknown-segment-e2e";
    await page.goto(target);
    await expect(page).toHaveURL(/\/login/);
    expect(page.url()).toContain(
      `callbackUrl=${encodeURIComponent(target)}`,
    );
    tracker.assertNone("unknown path callback retention");
  } finally {
    tracker.dispose();
  }
});

test("back-forward on login preserves locale without protected fetches", async ({
  page,
}) => {
  const tracker = trackForbiddenDataRequests(page);
  try {
    await page.goto("/login");
    await page.goto("/register");
    await page.goBack();
    await expect(page).toHaveURL(/\/login/);
    await page.goForward();
    await expect(page).toHaveURL(/\/register/);
    tracker.assertNone("auth back-forward");
  } finally {
    tracker.dispose();
  }
});

test("marketing home does not request tenant data APIs", async ({ page }) => {
  const tracker = trackForbiddenDataRequests(page);
  try {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    await page.waitForTimeout(300);
    tracker.assertNone("marketing home");
  } finally {
    tracker.dispose();
  }
});

test("billing callback page does not request tenant data APIs", async ({ page }) => {
  const tracker = trackForbiddenDataRequests(page);
  try {
    await page.goto("/billing/callback?status=success");
    await expect(page.locator("body")).toBeVisible();
    await page.waitForTimeout(300);
    tracker.assertNone("billing callback");
  } finally {
    tracker.dispose();
  }
});
