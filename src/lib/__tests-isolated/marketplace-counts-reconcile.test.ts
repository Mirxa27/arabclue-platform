/**
 * Marketplace engagement figures are what the tables say, never what a seed said.
 *
 * Production, 2026-09-02: the six system templates showed "4.8 ★ (126) · 920"
 * and friends. The in-code catalog had long since been zeroed (see
 * no-fabricated-assurance.test.ts), but the rows were seeded before that fix
 * and the seed's update path deliberately left engagement columns alone so
 * real ratings could accumulate — which also preserved the invented ones. The
 * seed now reconciles every system entry from the rating and application
 * tables, so the next marketplace visit repairs the data; `downloadCount`,
 * which nothing ever incremented, goes to zero and leaves the card.
 */

import { beforeAll, describe, expect, test, mock } from "bun:test";

type Row = Record<string, unknown>;
const entries: Row[] = [
  { id: "e1", workspaceId: null, templateKey: "general", rating: 4.8, ratingCount: 126, downloadCount: 920, usageCount: 540 },
];
const ratings: Row[] = [
  { entryId: "e1", rating: 5 },
  { entryId: "e1", rating: 4 },
];
const applications: Row[] = [{ entryId: "e1", proposalId: "p1" }, { entryId: "e1", proposalId: "p2" }, { entryId: "e1", proposalId: "p3" }];
const updates: Row[] = [];

type Usage = typeof import("../marketplace-usage");
let usage: Usage;

beforeAll(async () => {
  mock.module("../db", () => ({
    db: {
      templateMarketplaceRating: {
        aggregate: mock(({ where }: { where: { entryId: string } }) => {
          const rows = ratings.filter((r) => r.entryId === where.entryId);
          const sum = rows.reduce((s, r) => s + Number(r.rating), 0);
          return Promise.resolve({ _avg: { rating: rows.length ? sum / rows.length : null }, _count: { _all: rows.length } });
        }),
      },
      templateMarketplaceApplication: {
        count: mock(({ where }: { where: { entryId: string } }) =>
          Promise.resolve(applications.filter((a) => a.entryId === where.entryId).length),
        ),
      },
      templateMarketplaceEntry: {
        update: mock(({ where, data }: { where: { id: string }; data: Row }) => {
          updates.push({ id: where.id, ...data });
          const row = entries.find((e) => e.id === where.id)!;
          Object.assign(row, data);
          return Promise.resolve(row);
        }),
      },
    },
  }));
  usage = await import("../marketplace-usage");
});

describe("reconcileMarketplaceEntryCounts", () => {
  test("writes the average and count of real ratings, the count of real applications, and zero downloads", async () => {
    const result = await usage.reconcileMarketplaceEntryCounts("e1");
    expect(result).toEqual({ rating: 4.5, ratingCount: 2, usageCount: 3, downloadCount: 0 });
    expect(updates.at(-1)).toEqual({ id: "e1", rating: 4.5, ratingCount: 2, usageCount: 3, downloadCount: 0 });
  });

  test("an entry nobody rated or used is honestly at zero", async () => {
    entries.push({ id: "e2", workspaceId: null, templateKey: "it", rating: 4.2, ratingCount: 22, downloadCount: 290, usageCount: 141 });
    const result = await usage.reconcileMarketplaceEntryCounts("e2");
    expect(result).toEqual({ rating: 0, ratingCount: 0, usageCount: 0, downloadCount: 0 });
  });
});
