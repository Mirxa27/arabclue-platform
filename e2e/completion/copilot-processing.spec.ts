import { expect, test } from "@playwright/test";
import {
  mockDashboardDataApis,
  mockPublicAuthEndpoints,
} from "./support/mocks";
import { loginAsDevTest, setLocale } from "./support/locale";

/**
 * Copilot processing lifecycle gate — exercises submit → processing phases →
 * completion with mocked chat stream (no live LLM).
 */
test.describe("copilot processing lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await mockPublicAuthEndpoints(page);
    await mockDashboardDataApis(page);

    await page.context().route("**/api/platform-agent/missions", async (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mission: { id: "mission-e2e-1", activeProjectId: null },
            messages: [],
          }),
        });
      }
      return route.continue();
    });

    await page.context().route("**/api/platform-agent/missions/*", async (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mission: { id: "mission-e2e-1", activeProjectId: null },
            messages: [],
            attachments: [],
          }),
        });
      }
      return route.continue();
    });

    await page.context().route("**/api/platform-agent/realtime/setup", async (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: false, reason: "e2e" }),
      }),
    );

    await page.context().route("**/api/platform-agent/chat", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      // Slow SSE so the cancel control stays mounted long enough for a11y checks.
      await new Promise((r) => setTimeout(r, 1_200));
      const chunks = [
        `data: ${JSON.stringify({ type: "start", messageId: "msg-e2e-1" })}\n\n`,
        `data: ${JSON.stringify({ type: "text-start", id: "t1" })}\n\n`,
        `data: ${JSON.stringify({ type: "text-delta", id: "t1", delta: "Analyzing " })}\n\n`,
        `data: ${JSON.stringify({ type: "text-delta", id: "t1", delta: "your tender package." })}\n\n`,
        `data: ${JSON.stringify({ type: "text-end", id: "t1" })}\n\n`,
        `data: ${JSON.stringify({ type: "finish" })}\n\n`,
        "data: [DONE]\n\n",
      ];
      return route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
        },
        body: chunks.join(""),
      });
    });

    await loginAsDevTest(page);
  });

  test("full processing lifecycle from submit to completion", async ({
    page,
  }) => {
    await page.goto("/app/copilot");
    await page
      .getByRole("button", { name: /voice copilot|الوكيل الصوتي|copilot/i })
      .first()
      .click();

    const panel = page.getByTestId("copilot-processing-view");
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel).toHaveAttribute("data-phase", "idle");

    const box = await panel.boundingBox();
    expect(box).toBeTruthy();
    expect((box?.height ?? 0)).toBeGreaterThanOrEqual(100);

    const composer = page.locator("textarea").first();
    await expect(composer).toBeVisible({ timeout: 15_000 });
    await composer.fill("List my projects");
    await page
      .getByRole("button", { name: /send|إرسال/i })
      .or(page.locator("button").filter({ hasText: /send|إرسال/i }))
      .first()
      .click();

    await expect(panel).not.toHaveAttribute("data-phase", "idle", {
      timeout: 20_000,
    });

    await expect(page.getByTestId("copilot-processing-live")).toBeAttached();
    await expect(page.getByTestId("copilot-processing-elapsed")).toBeVisible();
    await expect(page.getByTestId("copilot-processing-tokens")).toBeVisible();

    const cancel = page.getByTestId("copilot-processing-cancel");
    await expect(cancel).toBeVisible({ timeout: 10_000 });
    await cancel.focus();
    await expect(cancel).toBeFocused();

    await expect
      .poll(async () => panel.getAttribute("data-phase"), { timeout: 25_000 })
      .toMatch(/completed|idle|finalizing/);
  });

  test("RTL locale mirrors processing panel direction", async ({ page }) => {
    await setLocale(page, "ar");
    await page.goto("/app/copilot");
    await page
      .getByRole("button", { name: /voice copilot|الوكيل الصوتي|copilot/i })
      .first()
      .click();
    const panel = page.getByTestId("copilot-processing-view");
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel).toHaveAttribute("dir", "rtl");
  });
});
