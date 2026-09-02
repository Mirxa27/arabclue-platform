/**
 * Observed on production 2026-09-02 (Playwright, 1440 and 375 px):
 *
 * - Billing showed storage keys to the customer: plan cards titled
 *   "PAY_AS_YOU_GO" / "STARTER", the current plan line "YEARLY · ACTIVE",
 *   payment rows badged "PAID". Four plans sat in a 3-column grid, one orphan.
 * - The Panel header (Billing, and six other surfaces) truncated its title to
 *   "Subscript…" on a phone because the Monthly/Yearly toggle shared the row.
 * - Clause Library and Contract template editor each repeated the page's own
 *   h1 and subtitle inside their first card — on a phone the duplicate filled
 *   the whole first screen. The clause card also carried a static "UNREVIEWED"
 *   badge beside "Counsel review required" (same fact twice) and every clause
 *   row printed `legalReviewStatus` raw.
 * - Knowledge Approval polled every 5 s for everyone, forever; the other live
 *   panels are gated on an active run.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  billingCycleLabel,
  legalReviewStatusLabel,
  paymentStatusLabel,
  planDisplayName,
  subscriptionStatusLabel,
} from "@/lib/status-labels";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");

describe("status labels: storage keys never reach the customer", () => {
  test("plan names read as product names", () => {
    expect(planDisplayName({ name: "PAY_AS_YOU_GO", nameAr: "الدفع حسب الاستخدام" }, "en")).toBe("Pay as you go");
    expect(planDisplayName({ name: "STARTER", nameAr: "المبتدئ" }, "en")).toBe("Starter");
    expect(planDisplayName({ name: "PRO", nameAr: "الاحترافي" }, "en")).toBe("Pro");
    expect(planDisplayName({ name: "ENTERPRISE", nameAr: "المؤسسات" }, "en")).toBe("Enterprise");
    expect(planDisplayName({ name: "ENTERPRISE", nameAr: "المؤسسات" }, "ar")).toBe("المؤسسات");
    // An operator-added plan with no translation is still presentable.
    expect(planDisplayName({ name: "GOV_SECTOR_PLUS", nameAr: null }, "en")).toBe("Gov sector plus");
    expect(planDisplayName({ name: "GOV_SECTOR_PLUS", nameAr: null }, "ar")).toBe("Gov sector plus");
  });

  test("billing cycle and subscription status are words in both languages", () => {
    expect(billingCycleLabel("YEARLY", "en")).toBe("Yearly");
    expect(billingCycleLabel("MONTHLY", "ar")).toBe("شهري");
    expect(subscriptionStatusLabel("ACTIVE", "en")).toBe("Active");
    expect(subscriptionStatusLabel("PAST_DUE", "en")).toBe("Past due");
    expect(subscriptionStatusLabel("PAST_DUE", "ar")).toBe("متأخر السداد");
    expect(subscriptionStatusLabel("TRIALING", "en")).toBe("Trial");
    expect(subscriptionStatusLabel("EXPIRED", "ar")).toBe("منتهي");
  });

  test("payment record status", () => {
    expect(paymentStatusLabel("PAID", "en")).toBe("Paid");
    expect(paymentStatusLabel("FAILED", "ar")).toBe("فشل");
    expect(paymentStatusLabel("REFUNDED", "en")).toBe("Refunded");
    expect(paymentStatusLabel("PENDING", "en")).toBe("Pending");
  });

  test("legal review status reuses the contract-safety vocabulary", () => {
    expect(legalReviewStatusLabel("UNREVIEWED", "en")).toBe("Unreviewed");
    expect(legalReviewStatusLabel("UNREVIEWED", "ar")).toBe("غير مراجع قانونياً");
    expect(legalReviewStatusLabel("APPROVED", "en")).toBe("Legally approved");
    expect(legalReviewStatusLabel("NOT_LEGAL_ADVICE", "ar")).toBe("ليست استشارة قانونية");
  });

  test("an unknown value is shown readable, never blank and never UPPER_SNAKE", () => {
    expect(subscriptionStatusLabel("SOME_NEW_STATE", "en")).toBe("Some new state");
    expect(paymentStatusLabel("", "en")).toBe("");
  });
});

describe("billing panel", () => {
  const src = read("src/components/dashboard/billing-panel.tsx");

  test("renders plan, cycle and status through the label helpers", () => {
    expect(src).toMatch(/planDisplayName\(/);
    expect(src).toMatch(/billingCycleLabel\(/);
    expect(src).toMatch(/subscriptionStatusLabel\(/);
    expect(src).toMatch(/paymentStatusLabel\(/);
    expect(src).not.toMatch(/\{sub\.billingCycle\} · \{sub\.status\}/);
    expect(src).not.toMatch(/>\s*\{sub\.status\}\s*</);
    expect(src).not.toMatch(/>\s*\{r\.status\}\s*</);
    expect(src).not.toMatch(/plan\.nameAr \?\? plan\.name : plan\.name/);
  });

  test("four plans get four columns on a wide screen", () => {
    expect(src).toMatch(/grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4/);
  });
});

describe("Panel header survives a phone", () => {
  test("title and actions may wrap instead of truncating the title", () => {
    const src = read("src/components/patterns/panel.tsx");
    expect(src).toMatch(/flex flex-wrap items-center justify-between gap-3/);
    // The title block takes the row; actions drop below when it cannot.
    expect(src).toMatch(/flex items-center gap-2\.5 min-w-0 flex-1/);
  });
});

describe("header action rows wrap on a phone", () => {
  test("admin AI providers: the actions row measured 580 px wide at 375 px", () => {
    const src = read("src/components/admin/ai-providers.tsx");
    expect(src).toMatch(/flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b/);
    expect(src).toMatch(/<div className="flex flex-wrap items-center gap-2">\s*<Badge/);
  });

  test("proposal builder stacks its three panes below lg", () => {
    // At 375 px the sections pane was a fixed 320 px and the editor/preview
    // pane got the remaining 15 px: everything but "Sections" was off-screen.
    const src = read("src/components/dashboard/proposal-builder.tsx");
    expect(src).toMatch(/flex min-h-0 flex-1 flex-col gap-4 lg:flex-row/);
    expect(src).toMatch(/"w-full lg:w-80 lg:shrink-0"/);
    expect(src).not.toMatch(/: "w-80 shrink-0"/);
    expect(src).toMatch(/grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-2/);
    expect(src).toMatch(/lg:h-\[calc\(100dvh-10rem\)\]/);
  });

  test("proposal builder live preview header", () => {
    const src = read("src/components/dashboard/proposal-builder-preview.tsx");
    expect(src).toMatch(/flex flex-wrap items-center justify-between gap-2 border-b/);
  });
});

describe("library pages do not repeat their own page header", () => {
  test("clause browser: the page shell owns the title and subtitle", () => {
    const src = read("src/components/dashboard/clause-browser.tsx");
    expect(src).not.toMatch(/tr\("clause_library_title"/);
    expect(src).not.toMatch(/tr\("clause_library_subtitle"/);
    // Static disclaimer duplicated "Counsel review required"; the per-clause
    // status is the real signal and is labelled, not raw.
    expect(src).not.toMatch(/>\s*UNREVIEWED\s*</);
    expect(src).toMatch(/legalReviewStatusLabel\(cl\.legalReviewStatus/);
    expect(src).not.toMatch(/\{cl\.legalReviewStatus\}/);
  });

  test("no grid defines its columns only from a breakpoint up", () => {
    // Account Setup's Brand Configuration card measured 509 px wide at 375 px:
    // `grid lg:grid-cols-3` leaves the phone layout to an implicit auto track,
    // which the browser sized to the form controls' intrinsic widths. A base
    // `grid-cols-1` (minmax(0, 1fr)) pins the track to the container.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (entry.name.endsWith(".tsx")) {
          const src = read(rel);
          if (/className="grid (gap-[0-9.]+ )?(sm|md|lg|xl|2xl):grid-cols-/.test(src)) offenders.push(rel);
        }
      }
    };
    walk("src/components");
    walk("src/app");
    expect(offenders).toEqual([]);
  });

  test("the clause list track cannot outgrow a phone", () => {
    // Measured live at 375 px: the implicit `auto` grid track sized the cards
    // to 434 px, so each row's "Select" button sat past the viewport edge.
    // `grid-cols-1` is `minmax(0, 1fr)`, which pins the track to the container.
    for (const file of [
      "src/components/dashboard/clause-browser.tsx",
      "src/components/dashboard/contracts-panel.tsx",
    ]) {
      expect(read(file), file).not.toMatch(/className="grid gap-3"/);
    }
  });

  test("the standard-clause count is the catalogue's, not a number typed into copy", () => {
    // describeCatalogClauses() had 33 entries on 2026-09-02 while the badge and
    // the subtitle both said "32 standard clauses".
    const browser = read("src/components/dashboard/clause-browser.tsx");
    expect(browser).not.toMatch(/32 standard clauses|32 بند/);
    expect(browser).toMatch(/catalogCount/);
    const route = read("src/app/api/clauses/route.ts");
    expect(route).toMatch(/catalogCount/);
    const i18n = read("src/lib/i18n.ts");
    expect(i18n).not.toMatch(/en: "32 standard clauses/);
    expect(i18n).not.toMatch(/ar: "32 بندًا/);
  });

  test("template editor: the list column is headed as a list, not as the page", () => {
    const src = read("src/components/dashboard/workspace-template-editor.tsx");
    expect(src).not.toMatch(/tr\("template_editor_title"/);
    expect(src).toMatch(/tr\("template_list_heading"/);
    const views = read("src/components/dashboard/views.tsx");
    expect(views).toMatch(/tr\("template_editor_title"/);
    expect(views).toMatch(/tr\("clause_library_title"/);
  });
});

describe("knowledge approval polls only while a run is live", () => {
  test("uses the shared gate like the other live panels", () => {
    const src = read("src/components/dashboard/knowledge-approval-queue.tsx");
    expect(src).toMatch(/refetchInterval:\s*liveDataPollMs\(activeRunLive,\s*5_?000\)/);
    expect(src).not.toMatch(/refetchInterval:\s*5_000/);
  });
});
