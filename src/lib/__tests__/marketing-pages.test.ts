import { describe, expect, test } from "bun:test";
import {
  PUBLIC_AUTH_PAGE_PATHS,
  PUBLIC_MARKETING_PAGES,
  PUBLIC_PAGE_PATHS,
} from "../marketing/site-pages";

describe("marketing public pages registry", () => {
  test("covers company, support, and legal surfaces", () => {
    const paths = new Set(PUBLIC_MARKETING_PAGES.map((p) => p.path));
    for (const required of [
      "/about",
      "/contact",
      "/faq",
      "/security",
      "/legal",
      "/privacy",
      "/terms",
      "/cookies",
      "/acceptable-use",
      "/billing-policy",
      "/dpa",
      "/pricing",
      "/compliance",
      "/for-owners",
    ]) {
      expect(paths.has(required)).toBe(true);
    }
  });

  test("every page has bilingual titles and descriptions", () => {
    for (const page of PUBLIC_MARKETING_PAGES) {
      expect(page.titleEn.length).toBeGreaterThan(2);
      expect(page.titleAr.length).toBeGreaterThan(2);
      expect(page.descriptionEn.length).toBeGreaterThan(10);
      expect(page.descriptionAr.length).toBeGreaterThan(10);
      expect(page.path.startsWith("/")).toBe(true);
    }
  });

  test("public allowlist includes login and marketing paths", () => {
    expect(PUBLIC_PAGE_PATHS).toContain("/login");
    expect(PUBLIC_PAGE_PATHS).toContain("/privacy");
    expect(PUBLIC_PAGE_PATHS).toContain("/faq");
  });

  test("public allowlist includes every account recovery and onboarding surface", () => {
    for (const path of PUBLIC_AUTH_PAGE_PATHS) {
      expect(PUBLIC_PAGE_PATHS).toContain(path);
    }
    expect(PUBLIC_AUTH_PAGE_PATHS).toContain("/forgot-password");
    expect(PUBLIC_AUTH_PAGE_PATHS).toContain("/reset-password");
    expect(PUBLIC_AUTH_PAGE_PATHS).toContain("/register");
    expect(PUBLIC_AUTH_PAGE_PATHS).toContain("/verify-email");
    expect(PUBLIC_AUTH_PAGE_PATHS).toContain("/invite");
  });
});
