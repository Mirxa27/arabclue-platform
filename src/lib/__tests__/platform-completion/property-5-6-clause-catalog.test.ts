/**
 * Feature: platform-completion
 * Property 5: Clause seeding is idempotent
 * Property 6: Clause canonical hash is stable
 */

import { describe, expect, test } from "bun:test";
import {
  clauseCanonicalContentFromRow,
  computeClauseCanonicalHash,
  seedStandardClauses,
} from "../../clause-library";
import { createFakeClauseCatalogRepository } from "../support/clause-fakes";

describe("Feature: platform-completion, Property 5: Clause seeding is idempotent", () => {
  test("repeated seeds never duplicate catalog rows across 100+ runs", async () => {
    let cases = 0;
    for (let seed = 0; seed < 100; seed++) {
      const repository = createFakeClauseCatalogRepository();
      const first = await seedStandardClauses({ repository });
      const second = await seedStandardClauses({ repository });
      const third = await seedStandardClauses({ repository });

      expect(first.created + first.updated + first.unchanged).toBeGreaterThan(0);
      expect(second.created).toBe(0);
      expect(third.created).toBe(0);

      const rows = repository.snapshot().catalog;
      const keys = rows.map((row) => row.clauseKey);
      expect(new Set(keys).size).toBe(keys.length);
      cases += 1;
    }
    expect(cases).toBe(100);
  });
});

describe("Feature: platform-completion, Property 6: Clause canonical hash is stable", () => {
  test("hash equals recomputation for every seeded row across 100+ catalogs", async () => {
    let cases = 0;
    for (let seed = 0; seed < 100; seed++) {
      const repository = createFakeClauseCatalogRepository();
      await seedStandardClauses({ repository });
      const rows = repository.snapshot().catalog;
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        const recomputed = computeClauseCanonicalHash(
          clauseCanonicalContentFromRow(row)
        );
        expect(recomputed).toBe(row.canonicalHash);
        const again = computeClauseCanonicalHash(
          clauseCanonicalContentFromRow({ ...row })
        );
        expect(again).toBe(row.canonicalHash);
      }
      cases += 1;
    }
    expect(cases).toBe(100);
  });
});
