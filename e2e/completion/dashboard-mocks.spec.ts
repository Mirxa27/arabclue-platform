import { expect, test } from "@playwright/test";
import { trackForbiddenDataRequests } from "./support/forbidden-requests";
import {
  mockDashboardDataApis,
  mockPublicAuthEndpoints,
  mockVerifiedSession,
} from "./support/mocks";
import { setLocale } from "./support/locale";
import { pageFetchJson } from "./support/page-fetch";

/**
 * Dashboard capability smokes use route.fulfill for every tenant API.
 * Requests are issued via in-page fetch so browser-context routes apply.
 */
test.describe("mocked completion API contracts", () => {
  test.beforeEach(async ({ page }) => {
    await mockVerifiedSession(page);
    await mockDashboardDataApis(page);
    await mockPublicAuthEndpoints(page);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
  });

  test("analytics empty vs populated payloads", async ({ page }) => {
    const empty = await pageFetchJson(page, "/api/analytics/proposals");
    expect(empty.ok).toBeTruthy();
    expect((empty.json as { empty?: boolean }).empty).toBe(true);

    const real = await pageFetchJson(
      page,
      "/api/analytics/proposals?start=2026-01-01&end=2026-02-01",
    );
    const realBody = real.json as {
      empty?: boolean;
      counts?: { PROPOSAL_CREATED?: number };
    };
    expect(realBody.empty).toBe(false);
    expect(realBody.counts?.PROPOSAL_CREATED).toBe(2);
  });

  test("clause and template catalog mocks", async ({ page }) => {
    const clauses = await pageFetchJson(page, "/api/clauses");
    expect(
      (clauses.json as { items?: Array<{ catalogKey?: string }> }).items?.[0]
        ?.catalogKey,
    ).toBe("governing-law");

    const templates = await pageFetchJson(
      page,
      "/api/contracts/workspace-templates",
    );
    expect(
      (templates.json as { items?: Array<{ key?: string }> }).items?.[0]?.key,
    ).toBe("msa");
  });

  test("contract draft and revision history mocks", async ({ page }) => {
    const drafts = await pageFetchJson(page, "/api/contracts/drafts");
    expect(
      (drafts.json as { items?: Array<{ id?: string }> }).items?.[0]?.id,
    ).toBe("draft-1");

    const proposalVersions = await pageFetchJson(
      page,
      "/api/proposals/prop-1/versions",
    );
    expect(
      (proposalVersions.json as { items?: Array<{ version?: number }> })
        .items?.[0]?.version,
    ).toBe(1);

    const documentVersions = await pageFetchJson(
      page,
      "/api/documents/doc-1/versions",
    );
    expect(
      (documentVersions.json as { items?: Array<{ version?: number }> })
        .items?.[0]?.version,
    ).toBe(1);
  });

  test("XLSX export blocking and PDF metadata headers", async ({ page }) => {
    const blocked = await pageFetchJson(
      page,
      "/api/proposals/prop-1/download?format=xlsx",
    );
    expect(blocked.status).toBe(422);
    expect((blocked.json as { code?: string }).code).toBe(
      "XLSX_VALIDATION_BLOCKED",
    );

    const pdf = await pageFetchJson(page, "/api/proposals/prop-1/download");
    expect(pdf.ok).toBeTruthy();
    expect(pdf.headers["x-arabclue-authoritative-engine"]).toBe(
      "layout-export",
    );
    expect(pdf.headers["x-arabclue-revision"]).toBe("1");
  });

  test("billing reconciliation and recurring mocks", async ({ page }) => {
    const reconcile = await pageFetchJson(
      page,
      "/api/admin/billing/reconcile",
      { method: "POST", body: { dryRun: true } },
    );
    expect((reconcile.json as { ok?: boolean }).ok).toBe(true);

    const recurring = await pageFetchJson(
      page,
      "/api/billing/recurring/rec-1/cancel",
      { method: "POST", body: {} },
    );
    expect((recurring.json as { status?: string }).status).toBe("active");
  });

  test("knowledge, comments, presence, marketplace, notifications", async ({
    page,
  }) => {
    const knowledge = await pageFetchJson(
      page,
      "/api/knowledge/pending-approval",
    );
    expect((knowledge.json as { items?: unknown[] }).items).toEqual([]);

    const presence = await pageFetchJson(page, "/api/collaboration/presence");
    expect((presence.json as { total?: number }).total).toBe(1);

    const comments = await pageFetchJson(page, "/api/collaboration/comments");
    expect((comments.json as { items?: unknown[] }).items).toEqual([]);

    const marketplace = await pageFetchJson(
      page,
      "/api/templates/marketplace",
    );
    expect(
      (marketplace.json as { items?: Array<{ id?: string }> }).items?.[0]?.id,
    ).toBe("mkt-1");

    const notifications = await pageFetchJson(page, "/api/notifications");
    expect((notifications.json as { items?: unknown[] }).items).toEqual([]);
  });
});

test.describe("mocked auth pages do not leak protected dashboard APIs", () => {
  test("register submit keeps tenant APIs idle", async ({ page }) => {
    const tracker = trackForbiddenDataRequests(page);
    await setLocale(page, "en");
    await mockPublicAuthEndpoints(page);
    try {
      await page.goto("/register");
      await page.getByPlaceholder(/mohammed|محمد/i).fill("E2E");
      await page.getByPlaceholder(/solutions|حلول|advanced/i).fill("WS");
      await page.locator('input[type="email"]').fill("e2e@example.invalid");
      await page
        .locator('input[type="password"]')
        .fill("E2e-Test-Password-9!");
      await page
        .getByRole("button", {
          name: /create account|إنشاء الحساب|register|إنشاء|تسجيل/i,
        })
        .click();
      await page.waitForTimeout(500);
      tracker.assertNone("register mocked submit");
    } finally {
      tracker.dispose();
    }
  });
});
