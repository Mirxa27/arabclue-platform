import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import {
  BILINGUAL_CAPABILITY_EXPORT_BLOCKED_CODE,
  BILINGUAL_CAPABILITY_EXPORT_BLOCKED_MESSAGE,
  handleBusinessProfileExport,
  resolveBusinessProfileExportFormat,
  resolveBusinessProfileExportLocale,
  resolveBusinessProfileExportQuality,
  type BusinessProfileDownloadAuditEvent,
  type BusinessProfileExportDependencies,
} from "../../app/api/business-profile/export/route";
import {
  compileBilingualBusinessProfile,
  renderBilingualBusinessProfileHTML,
  type BusinessProfileSnapshot,
} from "../business-profile";

function profileFixture(): BusinessProfileSnapshot {
  return {
    workspace: {
      id: "workspace-route-001",
      name: "Route Company",
      nameAr: "شركة المسار",
      slug: "route-company",
      plan: "PRO",
      crNumber: "CR-001",
      vatNumber: "VAT-002",
    },
    brand: {
      logoUrl: "/documents/logo.png",
      primaryColor: "#0D9488",
      secondaryColor: "#0F172A",
      accentColor: "#38BDF8",
      tagline: "Route-tested profile",
      taglineAr: "ملف مختبر للمسار",
      vision2030Alignment: "Supports digital procurement.",
    },
    readiness: {
      readyForProposals: true,
      missing: [],
      completedCount: 5,
      totalRequired: 5,
      score: 100,
    },
    stats: {
      pastProjects: 1,
      staff: 1,
      certificates: 1,
      partnerships: 1,
      sectors: 1,
      methodologies: 1,
    },
    highlights: {
      pastProjects: [
        {
          title: "Route project",
          titleAr: "مشروع المسار",
          clientName: "Client",
          sector: "Government",
          outcome: "Delivered",
          summary: "Verified summary.",
        },
      ],
      staff: [
        {
          name: "Route User",
          nameAr: "مستخدم المسار",
          title: "Director",
          titleAr: "مدير",
        },
      ],
      certificates: [
        { name: "Certificate", nameAr: "شهادة", issuer: "Issuer" },
      ],
      partnerships: [
        { name: "Partner", nameAr: "شريك", kind: "Technology" },
      ],
      sectors: [{ name: "Government", nameAr: "الحكومة" }],
      methodologies: [{ title: "Method", titleAr: "منهجية" }],
    },
    generatedAt: "2026-07-24T10:00:00.000Z",
  };
}

interface RouteHarnessState {
  session: { userId: string } | null;
  profileLoadCount: number;
  legacyHtmlLocales: Array<"ar" | "en">;
  legacyPdfLocales: Array<"ar" | "en">;
  bilingualQualities: Array<"strict" | "draft">;
  bilingualHtmlCount: number;
  bilingualPdfCount: number;
  audits: BusinessProfileDownloadAuditEvent[];
}

function routeHarness(): {
  readonly dependencies: BusinessProfileExportDependencies;
  readonly state: RouteHarnessState;
} {
  const profile = profileFixture();
  const state: RouteHarnessState = {
    session: { userId: "user-001" },
    profileLoadCount: 0,
    legacyHtmlLocales: [],
    legacyPdfLocales: [],
    bilingualQualities: [],
    bilingualHtmlCount: 0,
    bilingualPdfCount: 0,
    audits: [],
  };

  const dependencies: BusinessProfileExportDependencies = {
    getSession: async () => state.session,
    getWorkspace: async () => ({
      id: profile.workspace.id,
      slug: profile.workspace.slug,
    }),
    loadProfile: async () => {
      state.profileLoadCount += 1;
      return structuredClone(profile);
    },
    buildLegacyHtml: (_profile, locale) => {
      state.legacyHtmlLocales.push(locale);
      return `<html lang="${locale}">legacy-${locale}</html>`;
    },
    buildLegacyPdf: async (_profile, locale) => {
      state.legacyPdfLocales.push(locale);
      return Buffer.from("%PDF-legacy");
    },
    compileBilingual: (snapshot, quality) => {
      state.bilingualQualities.push(quality);
      return compileBilingualBusinessProfile(snapshot, quality);
    },
    renderBilingualHtml: (compilation) => {
      state.bilingualHtmlCount += 1;
      return renderBilingualBusinessProfileHTML(compilation);
    },
    buildBilingualPdf: async () => {
      state.bilingualPdfCount += 1;
      return Buffer.from("%PDF-bilingual");
    },
    acquirePdfPermit: async () => ({
      ok: true,
      permit: { release: () => {} },
    }),
    recordDownload: async (event) => {
      state.audits.push(event);
    },
  };

  return { dependencies, state };
}

function request(query = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/business-profile/export${query}`
  );
}

describe("business-profile export route", () => {
  test("preserves legacy query fallbacks", () => {
    expect(resolveBusinessProfileExportFormat("html")).toBe("html");
    expect(resolveBusinessProfileExportFormat("unknown")).toBe("pdf");
    expect(resolveBusinessProfileExportLocale("en")).toBe("en");
    expect(resolveBusinessProfileExportLocale("unknown")).toBe("ar");
    expect(resolveBusinessProfileExportLocale("bilingual")).toBe("bilingual");
    expect(resolveBusinessProfileExportQuality("draft")).toBe("draft");
    expect(resolveBusinessProfileExportQuality("unknown")).toBe("strict");
  });

  test("returns 401 before loading profile data", async () => {
    const { dependencies, state } = routeHarness();
    state.session = null;

    const response = await handleBusinessProfileExport(
      request("?format=html&locale=bilingual"),
      dependencies
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(state.profileLoadCount).toBe(0);
    expect(state.audits).toHaveLength(0);
  });

  test("preserves the existing English HTML branch and audit shape", async () => {
    const { dependencies, state } = routeHarness();
    const response = await handleBusinessProfileExport(
      request("?format=html&locale=en&quality=draft"),
      dependencies
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<html lang="en">legacy-en</html>');
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8"
    );
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="route-company-business-profile.html"'
    );
    expect(state.legacyHtmlLocales).toEqual(["en"]);
    expect(state.bilingualQualities).toHaveLength(0);
    expect(state.audits).toEqual([
      {
        userId: "user-001",
        workspaceId: "workspace-route-001",
        format: "html",
        locale: "en",
      },
    ]);
  });

  test("returns a stable 422 response for strict bilingual diagnostics", async () => {
    const { dependencies, state } = routeHarness();
    const response = await handleBusinessProfileExport(
      request("?format=html&locale=bilingual"),
      dependencies
    );
    const body = (await response.json()) as {
      error: string;
      code: string;
      status: string;
      diagnostics: Array<{ blocking: boolean; code: string }>;
    };

    expect(response.status).toBe(422);
    expect(body.error).toBe(BILINGUAL_CAPABILITY_EXPORT_BLOCKED_MESSAGE);
    expect(body.code).toBe(BILINGUAL_CAPABILITY_EXPORT_BLOCKED_CODE);
    expect(body.status).toBe("blocked");
    expect(body.diagnostics.length).toBeGreaterThan(0);
    expect(
      body.diagnostics.every((diagnostic) => diagnostic.blocking)
    ).toBe(true);
    expect(state.bilingualQualities).toEqual(["strict"]);
    expect(state.bilingualHtmlCount).toBe(0);
    expect(state.audits).toHaveLength(0);
  });

  test("renders an explicit bilingual draft through the safe HTML engine", async () => {
    const { dependencies, state } = routeHarness();
    const response = await handleBusinessProfileExport(
      request("?format=html&locale=bilingual&quality=draft"),
      dependencies
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('data-bilingual-layout-state="pending"');
    expect(html).toContain("Route Company");
    expect(html).toContain("شركة المسار");
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="route-company-capability-statement-bilingual.html"'
    );
    expect(state.bilingualQualities).toEqual(["draft"]);
    expect(state.bilingualHtmlCount).toBe(1);
    expect(state.audits).toEqual([
      {
        userId: "user-001",
        workspaceId: "workspace-route-001",
        format: "html",
        locale: "bilingual",
        quality: "draft",
      },
    ]);
  });

  test("routes bilingual PDF through the dedicated PDF dependency", async () => {
    const { dependencies, state } = routeHarness();
    const response = await handleBusinessProfileExport(
      request("?format=pdf&locale=bilingual&quality=draft"),
      dependencies
    );
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(bytes)).toBe("%PDF-bilingual");
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="route-company-capability-statement-bilingual.pdf"'
    );
    expect(state.bilingualPdfCount).toBe(1);
    expect(state.legacyPdfLocales).toHaveLength(0);
  });

  test("preserves the legacy Arabic PDF fallback", async () => {
    const { dependencies, state } = routeHarness();
    const response = await handleBusinessProfileExport(
      request("?format=unknown&locale=unknown"),
      dependencies
    );
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(bytes)).toBe("%PDF-legacy");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="route-company-business-profile-ar.pdf"'
    );
    expect(state.legacyPdfLocales).toEqual(["ar"]);
    expect(state.bilingualPdfCount).toBe(0);
    expect(state.audits).toEqual([
      {
        userId: "user-001",
        workspaceId: "workspace-route-001",
        format: "pdf",
        locale: "ar",
      },
    ]);
  });

  test("returns the existing stable 503 shape for bilingual PDF failures", async () => {
    const { dependencies } = routeHarness();
    const failingDependencies: BusinessProfileExportDependencies = {
      ...dependencies,
      buildBilingualPdf: async () => {
        throw new Error("Chromium unavailable");
      },
    };

    const response = await handleBusinessProfileExport(
      request("?format=pdf&locale=bilingual&quality=draft"),
      failingDependencies
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "PDF generation failed: Chromium unavailable",
      code: "PDF_UNAVAILABLE",
    });
  });

  test("returns 429 before starting a PDF renderer when admission is denied", async () => {
    const { dependencies, state } = routeHarness();
    const limitedDependencies: BusinessProfileExportDependencies = {
      ...dependencies,
      acquirePdfPermit: async () => ({
        ok: false,
        code: "EXPORT_RATE_LIMITED",
        status: 429,
        retryAfterSeconds: 17,
        message: "Document export rate limit exceeded. Try again later.",
      }),
    };

    const response = await handleBusinessProfileExport(
      request("?format=pdf&locale=bilingual&quality=draft"),
      limitedDependencies
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(await response.json()).toEqual({
      error: "Document export rate limit exceeded. Try again later.",
      code: "EXPORT_RATE_LIMITED",
    });
    expect(state.bilingualPdfCount).toBe(0);
    expect(state.audits).toHaveLength(0);
  });

  test("preserves the stable 503 shape for legacy PDF failures", async () => {
    const { dependencies } = routeHarness();
    const failingDependencies: BusinessProfileExportDependencies = {
      ...dependencies,
      buildLegacyPdf: async () => {
        throw new Error("Legacy renderer unavailable");
      },
    };

    const response = await handleBusinessProfileExport(
      request("?format=pdf&locale=en"),
      failingDependencies
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "PDF generation failed: Legacy renderer unavailable",
      code: "PDF_UNAVAILABLE",
    });
  });
});
