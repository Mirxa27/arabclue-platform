import type { Page, Route } from "@playwright/test";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/** Minimal verified writer session for dashboard smoke with mocked data APIs. */
export async function mockVerifiedSession(page: Page): Promise<void> {
  await page.context().route("**/api/auth/session", async (route) =>
    fulfillJson(route, {
      user: {
        id: "e2e-user-1",
        email: "e2e-writer@example.invalid",
        name: "E2E Writer",
        role: "WRITER",
        emailVerified: true,
        mustChangePassword: false,
      },
      expires: new Date(Date.now() + 3_600_000).toISOString(),
    }),
  );
}

export async function mockPublicAuthEndpoints(page: Page): Promise<void> {
  await page.context().route("**/api/auth/register", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return fulfillJson(route, {
      ok: true,
      verificationRequired: true,
      account: { emailVerified: false },
      message: {
        ar: "تحقق من بريدك الإلكتروني",
        en: "Check your email to verify your account",
      },
    });
  });

  await page.context().route("**/api/auth/verify-email", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return fulfillJson(route, {
      ok: true,
      message: {
        ar: "تم التحقق بنجاح",
        en: "Email verified successfully",
      },
    });
  });

  await page.context().route("**/api/auth/forgot-password", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return fulfillJson(route, {
      ok: true,
      message: {
        ar: "إذا كان البريد مسجلاً فستصلك رسالة",
        en: "If the email is registered you will receive a message",
      },
    });
  });

  await page.context().route("**/api/auth/reset-password", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return fulfillJson(route, {
      ok: true,
      message: {
        ar: "تم تحديث كلمة المرور",
        en: "Password updated",
      },
    });
  });

  await page.context().route("**/api/invitations/accept", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return fulfillJson(route, {
      ok: true,
      message: {
        ar: "تم قبول الدعوة",
        en: "Invitation accepted",
      },
    });
  });
}

export async function mockDashboardDataApis(page: Page): Promise<void> {
  const emptyAnalytics = {
    range: { start: "2026-01-01", end: "2026-02-01" },
    counts: {},
    previousPeriodDifference: {},
    medians: {},
    empty: true,
  };

  const analyticsReal = {
    ...emptyAnalytics,
    empty: false,
    counts: {
      PROPOSAL_CREATED: 2,
      DOCUMENT_UPLOADED: 1,
    },
    previousPeriodDifference: {
      PROPOSAL_CREATED: 1,
    },
    medians: {
      AGENT_RUN_COMPLETED: 1200,
    },
  };

  await page.context().route("**/api/analytics/proposals**", async (route) => {
    const url = route.request().url();
    const body = url.includes("start=") ? analyticsReal : emptyAnalytics;
    return fulfillJson(route, body);
  });

  await page.context().route("**/api/clauses**", async (route) =>
    fulfillJson(route, {
      items: [
        {
          id: "clause-1",
          catalogKey: "governing-law",
          category: "general",
          mandatory: true,
          titleAr: "القانون الحاكم",
          titleEn: "Governing law",
        },
      ],
      nextCursor: null,
    }),
  );

  await page.context().route("**/api/contracts/workspace-templates**", async (route) =>
    fulfillJson(route, {
      items: [{ id: "tpl-1", key: "msa", titleAr: "اتفاقية", titleEn: "MSA" }],
      nextCursor: null,
    }),
  );

  await page.context().route("**/api/contracts/drafts**", async (route) =>
    fulfillJson(route, {
      items: [{ id: "draft-1", title: "Draft contract" }],
      nextCursor: null,
    }),
  );

  await page.context().route("**/api/proposals/*/versions**", async (route) =>
    fulfillJson(route, {
      items: [{ version: 1, createdAt: "2026-07-01T00:00:00.000Z" }],
      nextCursor: null,
    }),
  );

  await page.context().route("**/api/documents/*/versions**", async (route) =>
    fulfillJson(route, {
      items: [{ version: 1, createdAt: "2026-07-01T00:00:00.000Z" }],
      nextCursor: null,
    }),
  );

  await page.context().route("**/api/proposals/*/download**", async (route) => {
    const url = route.request().url();
    if (url.includes("format=xlsx")) {
      return route.fulfill({
        status: 422,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          code: "XLSX_VALIDATION_BLOCKED",
          message: {
            ar: "التصدير محظور حتى اكتمال التحقق",
            en: "Export blocked until validation passes",
          },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "x-arabclue-authoritative-engine": "layout-export",
        "x-arabclue-revision": "1",
      },
      body: Buffer.from("%PDF-1.4 e2e"),
    });
  });

  await page.context().route("**/api/admin/billing/reconcile**", async (route) =>
    fulfillJson(route, {
      ok: true,
      applied: 0,
      skipped: 0,
      items: [],
    }),
  );

  await page.context().route("**/api/billing/recurring/**", async (route) =>
    fulfillJson(route, { ok: true, status: "active" }),
  );

  await page.context().route("**/api/knowledge/pending-approval**", async (route) =>
    fulfillJson(route, { items: [], nextCursor: null }),
  );

  await page.context().route("**/api/collaboration/presence**", async (route) =>
    fulfillJson(route, {
      viewers: [{ userId: "e2e-user-1", displayName: "E2E Writer" }],
      total: 1,
    }),
  );

  await page.context().route("**/api/collaboration/comments**", async (route) =>
    fulfillJson(route, { items: [], nextCursor: null }),
  );

  await page.context().route("**/api/templates/marketplace**", async (route) =>
    fulfillJson(route, {
      items: [
        {
          id: "mkt-1",
          titleAr: "قالب",
          titleEn: "Template",
          ratingAverage: 4.5,
          usageCount: 3,
        },
      ],
      nextCursor: null,
    }),
  );

  await page.context().route("**/api/notifications**", async (route) =>
    fulfillJson(route, { items: [], nextCursor: null }),
  );

  await page.context().route("**/api/projects**", async (route) =>
    fulfillJson(route, {
      items: [{ id: "proj_e2e_000000000001", name: "E2E Project" }],
      nextCursor: null,
    }),
  );
}
