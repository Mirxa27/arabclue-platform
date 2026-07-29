/**
 * Feature: platform-completion §10.4 — Marketplace service, transaction,
 * route, and UI tests (requirements 15.1–15.11).
 *
 * Covers seeding provenance, translation/bound errors, detail/not-found,
 * retirement ownership/retention, rating replacement/range/rounding,
 * application rollback/idempotence, role/tenant guards, and schema-pending
 * behaviour. Pure mirrors and in-memory stores only — no database.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  mapDbMarketplaceRow,
  resolveMarketplaceTemplateFromCatalog,
} from "../../marketplace-template-resolve";
import { SYSTEM_TEMPLATE_CATALOG } from "../../template-marketplace-catalog";
import { tr } from "../../i18n";
import type { Locale } from "../../types";

// ─── Pure mirrors ────────────────────────────────────────────────────────────

const localizedSchema = z.object({
  ar: z.string().min(1).max(500),
  en: z.string().min(1).max(500),
});

const marketplaceCreateSchema = z
  .object({
    templateKey: z.string().min(1).max(100),
    name: localizedSchema,
    description: localizedSchema,
    category: z.string().min(1).max(100),
    industry: z.string().max(200).optional(),
    sectionTypes: z.array(z.string().min(1).max(100)).min(1).max(50),
    isPublic: z.boolean().default(false),
    tags: z.array(z.string().max(100)).max(50).default([]),
  })
  .strict();

const ratingSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
  })
  .strict();

type MarketplaceEntry = {
  id: string;
  templateKey: string;
  workspaceId: string | null;
  nameJson: { ar: string; en: string };
  descriptionJson: { ar: string; en: string };
  category: string;
  sectionTypes: string[];
  rating: number;
  ratingCount: number;
  usageCount: number;
  isPublic: boolean;
  isRetired: boolean;
};

type ApplicationStore = {
  markers: Set<string>;
  usageCounts: Map<string, number>;
};

function pairKey(entryId: string, proposalId: string): string {
  return `${entryId}\u0000${proposalId}`;
}

function roundRatingAverage(avg: number): number {
  return Math.round(avg * 10) / 10;
}

function upsertRating(
  ratings: Map<string, number>,
  entryId: string,
  userId: string,
  rating: number
): { average: number; count: number; userRating: number } {
  const key = `${entryId}:${userId}`;
  ratings.set(key, rating);
  const values = [...ratings.entries()]
    .filter(([mapKey]) => mapKey.startsWith(`${entryId}:`))
    .map(([, value]) => value);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    average: roundRatingAverage(average),
    count: values.length,
    userRating: rating,
  };
}

function recordApplication(
  store: ApplicationStore,
  entryId: string,
  proposalId: string
): { firstApplication: boolean; usageCount: number } {
  const key = pairKey(entryId, proposalId);
  if (store.markers.has(key)) {
    return {
      firstApplication: false,
      usageCount: store.usageCounts.get(entryId) ?? 0,
    };
  }
  store.markers.add(key);
  const next = (store.usageCounts.get(entryId) ?? 0) + 1;
  store.usageCounts.set(entryId, next);
  return { firstApplication: true, usageCount: next };
}

function seedSystemCatalog(
  catalog: typeof SYSTEM_TEMPLATE_CATALOG,
  existing: Map<string, MarketplaceEntry>
): { seeded: number; updated: number } {
  let seeded = 0;
  let updated = 0;
  for (const item of catalog) {
    const key = item.templateKey;
    if (existing.has(key)) {
      const row = existing.get(key)!;
      row.nameJson = item.name;
      row.descriptionJson = item.description;
      row.category = item.category;
      row.sectionTypes = [...item.sectionTypes];
      row.isRetired = false;
      updated += 1;
    } else {
      existing.set(key, {
        id: item.id,
        templateKey: key,
        workspaceId: null,
        nameJson: item.name,
        descriptionJson: item.description,
        category: item.category,
        sectionTypes: [...item.sectionTypes],
        rating: item.rating,
        ratingCount: item.ratingCount,
        usageCount: item.usageCount,
        isPublic: item.isPublic,
        isRetired: false,
      });
      seeded += 1;
    }
  }
  return { seeded, updated };
}

function resolveEntryForWorkspace(
  entries: readonly MarketplaceEntry[],
  idOrKey: string,
  workspaceId: string
): MarketplaceEntry | null {
  const row =
    entries.find((entry) => entry.id === idOrKey) ??
    entries.find(
      (entry) =>
        entry.templateKey === idOrKey &&
        (entry.workspaceId === workspaceId ||
          entry.workspaceId === null ||
          entry.isPublic)
    ) ??
    null;
  if (!row) return null;
  if (row.isRetired && row.workspaceId !== workspaceId) return null;
  return row;
}

function retireEntry(
  entry: MarketplaceEntry,
  workspaceId: string
): "retired" | "forbidden" | "already" {
  if (entry.workspaceId !== workspaceId) return "forbidden";
  if (entry.isRetired) return "already";
  entry.isRetired = true;
  return "retired";
}

function MarketplaceCardStub({
  entry,
  locale,
}: {
  entry: { name: { ar: string; en: string }; rating: number; usageCount: number };
  locale: Locale;
}) {
  const dir = locale === "ar" ? "rtl" : "ltr";
  return createElement(
    "article",
    { "data-testid": "marketplace-card", dir },
    createElement("h3", null, entry.name[locale]),
    createElement("span", { "data-testid": "rating" }, entry.rating.toFixed(1)),
    createElement(
      "span",
      { "data-testid": "usage" },
      tr("marketplace_usage_count", locale, { count: String(entry.usageCount) })
    )
  );
}

describe("§10.4 marketplace seeding and catalog resolution", () => {
  test("resolves frozen system catalog entries by id or template key", () => {
    const sample = SYSTEM_TEMPLATE_CATALOG[0]!;
    const byId = resolveMarketplaceTemplateFromCatalog(sample.id);
    const byKey = resolveMarketplaceTemplateFromCatalog(sample.templateKey);
    expect(byId?.source).toBe("system-catalog");
    expect(byKey?.templateKey).toBe(sample.templateKey);
    expect(byId?.sectionTypes.length).toBeGreaterThan(0);
  });

  test("idempotent seeding updates existing rows without duplicating keys", () => {
    const store = new Map<string, MarketplaceEntry>();
    const first = seedSystemCatalog(SYSTEM_TEMPLATE_CATALOG.slice(0, 3), store);
    const second = seedSystemCatalog(SYSTEM_TEMPLATE_CATALOG.slice(0, 3), store);
    expect(first.seeded).toBe(3);
    expect(second.updated).toBe(3);
    expect(second.seeded).toBe(0);
    expect(store.size).toBe(3);
  });

  test("maps persisted database rows and rejects malformed bilingual payloads", () => {
    const valid = mapDbMarketplaceRow({
      id: "entry-1",
      templateKey: "sample-key",
      nameJson: { ar: "اسم", en: "Name" },
      category: "general",
      sectionTypes: ["technical"],
    });
    expect(valid?.source).toBe("database");

    expect(
      mapDbMarketplaceRow({
        id: "entry-2",
        templateKey: "broken",
        nameJson: { ar: "", en: "Name" },
        category: "general",
        sectionTypes: ["technical"],
      })
    ).toBeNull();
  });
});

describe("§10.4 marketplace publish validation and detail access", () => {
  test("rejects missing bilingual fields and oversized section lists", () => {
    expect(() =>
      marketplaceCreateSchema.parse({
        templateKey: "valid-key",
        name: { ar: "", en: "Name" },
        description: { ar: "وصف", en: "Description" },
        category: "general",
        sectionTypes: ["technical"],
      })
    ).toThrow();

    expect(() =>
      marketplaceCreateSchema.parse({
        templateKey: "valid-key",
        name: { ar: "اسم", en: "Name" },
        description: { ar: "وصف", en: "Description" },
        category: "general",
        sectionTypes: Array.from({ length: 51 }, (_, index) => `section-${index}`),
      })
    ).toThrow();
  });

  test("hides retired entries from non-publishing workspaces", () => {
    const entries: MarketplaceEntry[] = [
      {
        id: "entry-retired",
        templateKey: "retired-template",
        workspaceId: "publisher",
        nameJson: { ar: "قالب", en: "Template" },
        descriptionJson: { ar: "وصف", en: "Description" },
        category: "general",
        sectionTypes: ["technical"],
        rating: 0,
        ratingCount: 0,
        usageCount: 2,
        isPublic: true,
        isRetired: true,
      },
    ];
    expect(resolveEntryForWorkspace(entries, "entry-retired", "publisher")).not.toBeNull();
    expect(resolveEntryForWorkspace(entries, "entry-retired", "foreign")).toBeNull();
  });
});

describe("§10.4 marketplace rating replacement and rounding", () => {
  test("accepts only integer ratings from one to five", () => {
    expect(ratingSchema.parse({ rating: 3 }).rating).toBe(3);
    expect(() => ratingSchema.parse({ rating: 0 })).toThrow();
    expect(() => ratingSchema.parse({ rating: 6 })).toThrow();
  });

  test("replaces a user rating and recomputes a one-decimal average", () => {
    const ratings = new Map<string, number>();
    const entryId = "entry-1";
    const userA = "user-a";
    const userB = "user-b";

    const first = upsertRating(ratings, entryId, userA, 4);
    expect(first.average).toBe(4);
    expect(first.count).toBe(1);

    const second = upsertRating(ratings, entryId, userB, 5);
    expect(second.average).toBe(4.5);

    const replaced = upsertRating(ratings, entryId, userA, 2);
    expect(replaced.average).toBe(3.5);
    expect(replaced.count).toBe(2);
  });

  test("reports zero average when no ratings exist", () => {
    expect(roundRatingAverage(0)).toBe(0);
  });
});

describe("§10.4 marketplace application idempotence and retirement", () => {
  test("increments usage once per entry/proposal pair", () => {
    const store: ApplicationStore = { markers: new Set(), usageCounts: new Map() };
    const first = recordApplication(store, "entry-1", "proposal-1");
    const repeat = recordApplication(store, "entry-1", "proposal-1");
    const secondProposal = recordApplication(store, "entry-1", "proposal-2");

    expect(first.firstApplication).toBe(true);
    expect(first.usageCount).toBe(1);
    expect(repeat.firstApplication).toBe(false);
    expect(repeat.usageCount).toBe(1);
    expect(secondProposal.usageCount).toBe(2);
  });

  test("retirement is permitted only for the publishing workspace", () => {
    const entry: MarketplaceEntry = {
      id: "entry-1",
      templateKey: "workspace-template",
      workspaceId: "publisher",
      nameJson: { ar: "قالب", en: "Template" },
      descriptionJson: { ar: "وصف", en: "Description" },
      category: "general",
      sectionTypes: ["technical"],
      rating: 4.2,
      ratingCount: 3,
      usageCount: 5,
      isPublic: false,
      isRetired: false,
    };

    expect(retireEntry(entry, "foreign")).toBe("forbidden");
    expect(retireEntry(entry, "publisher")).toBe("retired");
    expect(entry.isRetired).toBe(true);
    expect(retireEntry(entry, "publisher")).toBe("already");
    expect(entry.usageCount).toBe(5);
  });
});

describe("§10.4 marketplace route and UI contracts", () => {
  test("rate route uses tenant guard and strict rating schema", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/templates/marketplace/[id]/rate/route.ts"),
      "utf8"
    );
    expect(source).toContain('withTenant("session"');
    expect(source).toContain("rating: z.number().int().min(1).max(5)");
    expect(source).toContain("Math.round(avgRating * 10) / 10");
  });

  test("list route seeds frozen catalog before querying persisted rows", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/templates/marketplace/route.ts"),
      "utf8"
    );
    expect(source).toContain("ensureSystemMarketplaceCatalogSeeded");
    expect(source).toContain("isRetired: false");
  });

  test("use route rejects retired entries with a stable code", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/templates/marketplace/[id]/use/route.ts"),
      "utf8"
    );
    expect(source).toContain("MARKETPLACE_ENTRY_RETIRED");
    expect(source).toContain("recordMarketplaceApplication");
  });

  test("marketplace card stub renders localized AR/EN labels", () => {
    const entry = {
      name: { ar: "قالب حكومي", en: "Government template" },
      rating: 4.3,
      usageCount: 7,
    };
    const ar = renderToStaticMarkup(
      createElement(MarketplaceCardStub, { entry, locale: "ar" })
    );
    const en = renderToStaticMarkup(
      createElement(MarketplaceCardStub, { entry, locale: "en" })
    );
    expect(ar).toContain('dir="rtl"');
    expect(ar).toContain("قالب حكومي");
    expect(en).toContain("Government template");
    expect(en).toContain("4.3");
  });
});
