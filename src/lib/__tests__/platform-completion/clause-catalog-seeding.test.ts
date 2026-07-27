/**
 * Feature: platform-completion — deterministic clause catalog seeding and
 * canonical drift repair (requirements 5.1, 5.2, 5.11, 5.12, 19.3).
 *
 * Every test drives the real seeding command against in-memory persistence: no
 * network call and no database mutation.
 */

import { describe, expect, test } from "bun:test";
import {
  CLAUSE_COUNSEL_REVIEW_REQUIRED,
  CLAUSE_LEGAL_REVIEW_STATUS,
  CLAUSE_LIFECYCLE,
  CLAUSE_SOURCE_STATUS,
  CLAUSE_TRANSLATION_STATUS,
  MAX_CLAUSE_LENGTH,
  clauseCanonicalContentFromRow,
  computeClauseCanonicalHash,
  describeCatalogClause,
  describeCatalogClauses,
  extractPlainTextFromBlocks,
  isClauseUnsafe,
  mandatoryFromApplicability,
  seedStandardClauses,
} from "../../clause-library";
import {
  CONTRACT_CLAUSE_CATALOG,
  CONTRACT_CLAUSE_IDS,
} from "../../document-templates/contract-templates";
import { createFakeClauseCatalogRepository } from "../support/clause-fakes";

describe("catalog projection", () => {
  test("covers every catalog identifier in declared catalog order", () => {
    const projections = describeCatalogClauses();

    expect(projections.map((projection) => projection.clauseKey)).toEqual([
      ...CONTRACT_CLAUSE_IDS,
    ]);
    expect(projections.map((projection) => projection.order)).toEqual(
      CONTRACT_CLAUSE_IDS.map((_, index) => index)
    );
  });

  test("is deterministic across calls", () => {
    expect(describeCatalogClauses()).toEqual(describeCatalogClauses());
  });

  test("maps GENERAL applicability to mandatory and every other value to optional", () => {
    expect(mandatoryFromApplicability("GENERAL")).toBe(true);
    expect(mandatoryFromApplicability("TENDER_SPECIFIC")).toBe(false);
    expect(mandatoryFromApplicability("COUNSEL_DECISION")).toBe(false);

    for (const projection of describeCatalogClauses()) {
      const clause = CONTRACT_CLAUSE_CATALOG[projection.clauseKey];
      expect(projection.mandatory).toBe(clause.applicability === "GENERAL");
    }
  });

  test("carries a storable bilingual title and text for every clause", () => {
    for (const projection of describeCatalogClauses()) {
      for (const field of [
        "nameAr",
        "nameEn",
        "contentAr",
        "contentEn",
      ] as const) {
        const value = projection[field];
        expect(value.trim().length).toBeGreaterThan(0);
        expect(value.length).toBeLessThanOrEqual(MAX_CLAUSE_LENGTH);
        expect(isClauseUnsafe(value)).toBe(false);
      }
      expect(Number.isSafeInteger(projection.order)).toBe(true);
      expect(projection.order).toBeGreaterThanOrEqual(0);
    }
  });

  test("rejects a catalog order index that no catalog traversal produces", () => {
    const clauseKey = CONTRACT_CLAUSE_IDS[0]!;

    expect(() => describeCatalogClause(clauseKey, -1)).toThrow(
      /non-negative integer/u
    );
    expect(() => describeCatalogClause(clauseKey, 1.5)).toThrow(
      /non-negative integer/u
    );
  });

  test("renders paragraph text and variable bindings into the stored text", () => {
    const blocks = [
      {
        content: {
          en: [
            { type: "TEXT", value: "Party " },
            { type: "VARIABLE", variableKey: "input.clientLegalName" },
          ],
          ar: [{ type: "TEXT", value: "الطرف الأول" }],
        },
      },
      {
        content: {
          en: [{ type: "TEXT", value: "Second paragraph." }],
          ar: [{ type: "TEXT", value: "   " }],
        },
      },
    ] as const;

    expect(extractPlainTextFromBlocks(blocks, "en")).toBe(
      "Party [input.clientLegalName]\n\nSecond paragraph."
    );
    // A blank paragraph is dropped rather than stored as an empty separator.
    expect(extractPlainTextFromBlocks(blocks, "ar")).toBe("الطرف الأول");
    expect(extractPlainTextFromBlocks([], "en")).toBe("");
  });
});

describe("seedStandardClauses", () => {
  test("creates one active, unreviewed row per catalog clause", async () => {
    const repository = createFakeClauseCatalogRepository();

    const summary = await seedStandardClauses({ repository });

    expect(summary.created).toBe(CONTRACT_CLAUSE_IDS.length);
    expect(summary.updated).toBe(0);
    expect(summary.unchanged).toBe(0);
    expect(summary.total).toBe(CONTRACT_CLAUSE_IDS.length);

    const { catalog } = repository.snapshot();
    expect(catalog).toHaveLength(CONTRACT_CLAUSE_IDS.length);
    for (const row of catalog) {
      expect(row.isActive).toBe(true);
      expect(row.workspaceId).toBeNull();
      expect(row.isCustom).toBe(false);
      expect(row.isSystem).toBe(true);
      expect(row.lifecycle).toBe(CLAUSE_LIFECYCLE);
      expect(row.legalReviewStatus).toBe(CLAUSE_LEGAL_REVIEW_STATUS);
      expect(row.counselReviewRequired).toBe(CLAUSE_COUNSEL_REVIEW_REQUIRED);
      expect(row.sourceStatus).toBe(CLAUSE_SOURCE_STATUS);
      expect(row.translationStatus).toBe(CLAUSE_TRANSLATION_STATUS);
      expect(row.version).toBe(1);
      expect(row.canonicalHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    }

    const projections = describeCatalogClauses();
    expect(
      catalog
        .slice()
        .sort((left, right) => left.order - right.order)
        .map((row) => ({
          clauseKey: row.clauseKey,
          category: row.category,
          nameAr: row.nameAr,
          nameEn: row.nameEn,
          contentAr: row.contentAr,
          contentEn: row.contentEn,
          mandatory: row.mandatory,
          order: row.order,
          canonicalHash: row.canonicalHash,
        }))
    ).toEqual(
      projections.map((projection) => ({
        clauseKey: projection.clauseKey as string,
        category: projection.category,
        nameAr: projection.nameAr,
        nameEn: projection.nameEn,
        contentAr: projection.contentAr,
        contentEn: projection.contentEn,
        mandatory: projection.mandatory,
        order: projection.order,
        canonicalHash: projection.canonicalHash,
      }))
    );
  });

  test("stores a hash that recomputes from the persisted row", async () => {
    const repository = createFakeClauseCatalogRepository();

    await seedStandardClauses({ repository });

    for (const row of repository.snapshot().catalog) {
      expect(computeClauseCanonicalHash(clauseCanonicalContentFromRow(row))).toBe(
        row.canonicalHash
      );
    }
  });

  test("writes nothing on a second run and leaves custom rows untouched", async () => {
    const repository = createFakeClauseCatalogRepository();
    const custom = repository.seedCustomRow({
      workspaceId: "workspace-1",
      clauseKey: "custom_11111111-1111-4111-8111-111111111111",
      isCustom: true,
      isSystem: false,
      category: "PAYMENT",
      nameEn: "Workspace payment terms",
      nameAr: "شروط الدفع الخاصة",
      contentEn: "Workspace English text.",
      contentAr: "نص عربي خاص بمساحة العمل.",
      order: 1001,
      canonicalHash: "sha256:custom",
    });

    const first = await seedStandardClauses({ repository });
    const afterFirst = repository.snapshot();
    const writesAfterFirst = repository.writes.length;

    const second = await seedStandardClauses({ repository });
    const afterSecond = repository.snapshot();

    expect(second.created).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.unchanged).toBe(first.created);
    expect(repository.writes).toHaveLength(writesAfterFirst);
    expect(afterSecond.catalog).toEqual(afterFirst.catalog);
    expect(afterSecond.custom).toEqual([custom]);
  });

  test("repairs a drifted row and increments its version once", async () => {
    const repository = createFakeClauseCatalogRepository();
    const projection = describeCatalogClauses()[0]!;
    repository.seedCatalogRow({
      clauseKey: projection.clauseKey,
      category: "STALE",
      nameEn: "Stale title",
      nameAr: "عنوان قديم",
      contentEn: "Stale English text.",
      contentAr: "نص عربي قديم.",
      mandatory: !projection.mandatory,
      order: 999,
      version: 4,
      canonicalHash: "sha256:stale",
      legalReviewStatus: "APPROVED",
      counselReviewRequired: false,
      provenanceJson: "{}",
    });

    const summary = await seedStandardClauses({ repository });

    expect(summary.updated).toBe(1);
    expect(summary.updatedClauseKeys).toEqual([projection.clauseKey]);
    expect(summary.created).toBe(CONTRACT_CLAUSE_IDS.length - 1);

    const repaired = repository
      .snapshot()
      .catalog.find((row) => row.clauseKey === projection.clauseKey)!;
    expect(repaired.version).toBe(5);
    expect(repaired.category).toBe(projection.category);
    expect(repaired.nameEn).toBe(projection.nameEn);
    expect(repaired.nameAr).toBe(projection.nameAr);
    expect(repaired.contentEn).toBe(projection.contentEn);
    expect(repaired.contentAr).toBe(projection.contentAr);
    expect(repaired.mandatory).toBe(projection.mandatory);
    expect(repaired.order).toBe(projection.order);
    expect(repaired.canonicalHash).toBe(projection.canonicalHash);
    expect(repaired.legalReviewStatus).toBe(CLAUSE_LEGAL_REVIEW_STATUS);
    expect(repaired.counselReviewRequired).toBe(CLAUSE_COUNSEL_REVIEW_REQUIRED);

    const repeat = await seedStandardClauses({ repository });
    expect(repeat.updated).toBe(0);
    expect(repeat.unchanged).toBe(CONTRACT_CLAUSE_IDS.length);
  });

  test("creates no duplicate row when a concurrent run wins the create", async () => {
    const repository = createFakeClauseCatalogRepository();
    const projections = describeCatalogClauses();
    const contested = projections[0]!;

    // The concurrent writer's converged row is invisible to the batch read, so
    // seeding attempts a create and must absorb the resulting key conflict.
    repository.seedCatalogRow({
      clauseKey: contested.clauseKey,
      category: contested.category,
      nameEn: contested.nameEn,
      nameAr: contested.nameAr,
      contentEn: contested.contentEn,
      contentAr: contested.contentAr,
      mandatory: contested.mandatory,
      order: contested.order,
      canonicalHash: contested.canonicalHash,
      provenanceJson: contested.provenanceJson,
    });
    repository.hideFromBatchRead(contested.clauseKey);

    const summary = await seedStandardClauses({ repository });

    expect(summary.created).toBe(projections.length - 1);
    expect(summary.updated).toBe(0);
    expect(summary.unchanged).toBe(1);
    expect(repository.snapshot().catalog).toHaveLength(projections.length);
    expect(
      repository.writes.filter((write) => write.clauseKey === contested.clauseKey)
    ).toHaveLength(0);
  });
});
