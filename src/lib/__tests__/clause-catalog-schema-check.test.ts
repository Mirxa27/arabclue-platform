/**
 * Why the clause library was empty in production.
 *
 * `GET /api/clauses` seeds the public catalog on first read and swallows the
 * failure. Run against the production database, the seed failed on every
 * row: Postgres check constraint `StandardClause_review_state_check`
 * (migration 20260724214500_contract_template_safety) — an *active* clause
 * must be PUBLISHED, legally APPROVED, translation APPROVED, hashed and
 * provenanced. The seed wrote `isActive: true` next to `UNREVIEWED`, as the
 * catalog spec (requirement 5.1) said to. Two meanings of one flag: the
 * domain read `isActive` as "in the catalog", the safety migration as
 * "approved for execution". The tests used in-memory fakes and never met
 * the constraint.
 *
 * The constraint is the later, stricter policy and it matches the product's
 * legal-review rule, so the code moves to it: seeded and custom clauses start
 * inactive and unreviewed, and the catalog is read by lifecycle, not by the
 * approval flag — the review badges the UI already renders carry the caveat,
 * as the contract templates do.
 */

import { describe, expect, test } from "bun:test";
import {
  CLAUSE_CATALOG_VISIBLE_WHERE,
  satisfiesClauseReviewStateCheck,
  customClauseCreateData,
} from "../clause-library";
import { catalogClauseWriteData } from "../clause-library-prisma";

const projection = {
  clauseKey: "clause.parties",
  category: "FOUNDATION",
  nameEn: "Parties and authority",
  nameAr: "الأطراف والصلاحيات",
  contentEn: "This draft identifies the client and the contractor.",
  contentAr: "تحدد هذه المسودة العميل والمقاول.",
  mandatory: true,
  order: 0,
  canonicalHash: "sha256:abc",
  provenanceJson: JSON.stringify({ applicability: "GENERAL" }),
} as const;

describe("what the database will accept", () => {
  test("the predicate mirrors StandardClause_review_state_check", () => {
    expect(
      satisfiesClauseReviewStateCheck({
        isActive: true,
        lifecycle: "DRAFT",
        legalReviewStatus: "UNREVIEWED",
        translationStatus: "DRAFT",
        canonicalHash: "sha256:x",
        provenanceJson: "{}",
      }),
    ).toBe(false);
    expect(
      satisfiesClauseReviewStateCheck({
        isActive: true,
        lifecycle: "PUBLISHED",
        legalReviewStatus: "APPROVED",
        translationStatus: "APPROVED",
        canonicalHash: "sha256:x",
        provenanceJson: "{}",
      }),
    ).toBe(true);
    expect(
      satisfiesClauseReviewStateCheck({
        isActive: false,
        lifecycle: "DRAFT",
        legalReviewStatus: "UNREVIEWED",
        translationStatus: "DRAFT",
        canonicalHash: null,
        provenanceJson: null,
      }),
    ).toBe(true);
  });

  test("a seeded catalog row is insertable", () => {
    const row = catalogClauseWriteData(projection);
    expect(row.isActive).toBe(false);
    expect(satisfiesClauseReviewStateCheck(row)).toBe(true);
  });

  test("a workspace custom clause is insertable", () => {
    const row = customClauseCreateData({
      clauseKey: "ws-1:custom",
      workspaceId: "ws-1",
      category: "GENERAL",
      nameEn: "Custom",
      nameAr: "مخصص",
      contentEn: "Custom English text.",
      contentAr: "نص عربي مخصص.",
      mandatory: false,
      order: 0,
      canonicalHash: "sha256:custom",
      provenanceJson: "{}",
    });
    expect(row.isActive).toBe(false);
    expect(satisfiesClauseReviewStateCheck(row)).toBe(true);
  });
});

describe("the catalog is read by lifecycle, not by the approval flag", () => {
  test("the visibility filter excludes retired rows and nothing else", () => {
    expect(CLAUSE_CATALOG_VISIBLE_WHERE).toEqual({ lifecycle: { not: "RETIRED" } });
  });
});
