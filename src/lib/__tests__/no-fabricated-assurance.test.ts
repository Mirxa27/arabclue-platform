/**
 * Guard tests against fabricated assurance.
 *
 * For a product sold to government-tender bidders, an unearned compliance
 * claim or an invented engagement metric is a commercial and legal risk, not a
 * cosmetic one. The codebase already holds this line in
 * `procurement-rules.ts`, which refuses to invent facts and attaches citations;
 * these tests extend that discipline to the surfaces that had drifted.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SYSTEM_TEMPLATE_CATALOG } from "@/lib/template-marketplace-catalog";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

describe("system marketplace templates ship no invented engagement metrics", () => {
  test("the catalog is non-empty", () => {
    expect(SYSTEM_TEMPLATE_CATALOG.length).toBeGreaterThan(0);
  });

  test.each(["rating", "ratingCount", "downloadCount", "usageCount"] as const)(
    "every system entry reports %s as zero",
    (field) => {
      for (const item of SYSTEM_TEMPLATE_CATALOG) {
        expect(item[field]).toBe(0);
      }
    }
  );
});

describe("pipeline progress reflects real telemetry", () => {
  const source = read("src/components/dashboard/mission-pipeline-bar.tsx");

  test("no timer simulates step completion", () => {
    // The regression: setInterval advancing a fake step index whenever the
    // real tool stream was empty.
    expect(source).not.toContain("setSimStep");
    expect(source).not.toContain("simDone");
    expect(source).not.toContain("setInterval");
  });

  test("progress is gated on having telemetry", () => {
    expect(source).toContain("hasTelemetry");
  });
});

describe("the admin overview reports measured readiness", () => {
  const source = read("src/components/admin/overview.tsx");

  test("no unconditional compliance assertion", () => {
    expect(source).not.toContain("PDPL Compliant");
    expect(source).not.toContain("Security Hardening Active");
  });

  test("readiness comes from the /api/ready probe", () => {
    expect(source).toContain("/api/ready");
    expect(source).toContain("PlatformReadinessCard");
  });
});

describe("page headers do not assert compliance by default", () => {
  const source = read("src/components/patterns/page-header.tsx");

  test("the default badge is none", () => {
    expect(source).toMatch(/badge\s*=\s*"none"/);
    expect(source).not.toMatch(/badge\s*=\s*"compliance"/);
  });
});

describe("generated documents qualify category defaults", () => {
  const source = read("src/lib/generators.ts");

  test("evaluation split is labelled as a category default", () => {
    expect(source).toContain("(category default)");
    expect(source).toContain("(افتراضي الفئة)");
  });

  test("both locales carry the qualifier for evaluation and SLA", () => {
    const qualified = source.match(/\(category default\)/g) ?? [];
    const qualifiedAr = source.match(/\(افتراضي الفئة\)/g) ?? [];
    expect(qualified.length).toBeGreaterThanOrEqual(2);
    expect(qualifiedAr.length).toBeGreaterThanOrEqual(2);
  });
});

describe("dashboard chrome does not invent compliance", () => {
  test("sidebar does not pulse a PDPL or Vision 2030 claim", () => {
    const source = read("src/components/dashboard/sidebar.tsx");
    expect(source).not.toContain("PDPL");
    expect(source).not.toContain("Vision 2030");
    expect(source).not.toContain("animate-pulse");
  });

  test("topbar does not show PDPL Compliant", () => {
    const source = read("src/components/dashboard/topbar.tsx");
    expect(source).not.toContain("PDPL Compliant");
    expect(source).not.toContain("PDPL متوافق");
  });

  test("footer does not claim PDPL compliance or a fake version", () => {
    const source = read("src/components/dashboard/footer.tsx");
    expect(source).not.toContain("footer_pdpl_note");
    expect(source).not.toContain("v1.0.0");
    expect(source).not.toContain("PDPL");
  });
});

describe("seeded marketplace rows are reconciled, and downloads left the card", () => {
  test("the seed's update path reconciles engagement counts from the tables", () => {
    const seed = read("src/lib/marketplace-catalog-seed.ts");
    expect(seed).toContain("reconcileMarketplaceEntryCounts(");
  });

  test("the card shows real uses, not a download counter nothing increments", () => {
    const card = read("src/components/dashboard/template-marketplace-card.tsx");
    expect(card).not.toContain("template.downloadCount");
    expect(card).toContain("template.usageCount");
  });

  test("the popular sort orders by real uses", () => {
    const route = read("src/app/api/templates/marketplace/route.ts");
    expect(route).not.toContain('{ downloadCount: "desc" as const }');
    expect(route).toContain('{ usageCount: "desc" as const }');
  });
});
