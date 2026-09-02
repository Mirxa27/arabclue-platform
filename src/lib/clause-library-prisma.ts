/**
 * Production persistence adapter for the Clause_Library catalog (design section
 * 4.3, requirements 5.1, 5.2, 5.12).
 *
 * This module owns the one external boundary the catalog seeding domain declares:
 * PostgreSQL through Prisma. Keeping it here follows `invitation-service-prisma.ts`
 * so the seeding rules in `clause-library.ts` stay driven by an injected
 * repository and unit/property tests exercise them with in-memory fakes, without
 * a network call or a shared-database mutation.
 *
 * Every read and write is scoped to `workspaceId: null`. That makes requirement
 * 5.2's "leave every workspace-scoped custom clause unchanged" structural: this
 * adapter cannot address a custom row at all.
 *
 * Concurrency is handled by database constraints rather than a lock:
 * - `createCatalogClause` reports a conflict when the SQL-only partial unique
 *   index `StandardClause_catalog_clauseKey_key` rejects a second row for a
 *   catalog key, so a parallel seed run cannot duplicate a clause identifier;
 * - `repairCatalogClause` is a compare-and-set on the previously read hash and
 *   version, so two runs cannot double-increment one row's version.
 */

import { Prisma } from "@prisma/client";
import { db } from "./db";
import { asSchemaMigrationPendingError } from "./api-failure";
import {
  CLAUSE_COUNSEL_REVIEW_REQUIRED,
  CLAUSE_LEGAL_REVIEW_STATUS,
  CLAUSE_LIFECYCLE,
  CLAUSE_SOURCE_STATUS,
  CLAUSE_TRANSLATION_STATUS,
  seedStandardClauses,
  type CatalogClauseProjection,
  type ClauseCatalogRepository,
  type ClauseCatalogSeedSummary,
  type StoredCatalogClause,
} from "./clause-library";

type PrismaClientLike = typeof db;

const UNIQUE_CONSTRAINT_ERROR = "P2002";

/**
 * Fields written for both a create and a drift repair. Inactive: the database
 * reserves `isActive` for a PUBLISHED, APPROVED, translation-APPROVED row
 * (`StandardClause_review_state_check`), and a seeded catalog row is none of
 * those. Writing `true` here failed every insert in production, silently.
 */
export function catalogClauseWriteData(projection: CatalogClauseProjection) {
  return {
    category: projection.category,
    nameEn: projection.nameEn,
    nameAr: projection.nameAr,
    contentEn: projection.contentEn,
    contentAr: projection.contentAr,
    mandatory: projection.mandatory,
    order: projection.order,
    canonicalHash: projection.canonicalHash,
    provenanceJson: projection.provenanceJson,
    lifecycle: CLAUSE_LIFECYCLE,
    legalReviewStatus: CLAUSE_LEGAL_REVIEW_STATUS,
    counselReviewRequired: CLAUSE_COUNSEL_REVIEW_REQUIRED,
    sourceStatus: CLAUSE_SOURCE_STATUS,
    translationStatus: CLAUSE_TRANSLATION_STATUS,
    isActive: false,
    isSystem: true,
    isCustom: false,
  };
}

/** Prisma-backed catalog persistence. Never reads or writes a custom clause row. */
export function createPrismaClauseCatalogRepository(
  client: PrismaClientLike = db
): ClauseCatalogRepository {
  const select = {
    id: true,
    clauseKey: true,
    canonicalHash: true,
    version: true,
  } as const;

  const toStored = (row: {
    id: string;
    clauseKey: string | null;
    canonicalHash: string | null;
    version: number;
  }): StoredCatalogClause | null =>
    row.clauseKey === null
      ? null
      : {
          id: row.id,
          clauseKey: row.clauseKey,
          canonicalHash: row.canonicalHash,
          version: row.version,
        };

  return Object.freeze({
    async findCatalogClauses(clauseKeys) {
      if (clauseKeys.length === 0) return [];
      return withMappedFailures(async () => {
        const rows = await client.standardClause.findMany({
          where: { workspaceId: null, clauseKey: { in: [...clauseKeys] } },
          select,
          orderBy: [{ clauseKey: "asc" }, { id: "asc" }],
        });
        return rows
          .map(toStored)
          .filter((row): row is StoredCatalogClause => row !== null);
      });
    },

    async findCatalogClause(clauseKey) {
      return withMappedFailures(async () => {
        const row = await client.standardClause.findFirst({
          where: { workspaceId: null, clauseKey },
          select,
          orderBy: [{ id: "asc" }],
        });
        return row ? toStored(row) : null;
      });
    },

    async createCatalogClause(input) {
      return withMappedFailures(async () => {
        try {
          await client.standardClause.create({
            data: {
              clauseKey: input.clauseKey,
              workspaceId: null,
              customizable: true,
              version: 1,
              ...catalogClauseWriteData(input),
            },
          });
          return { kind: "WRITTEN" as const };
        } catch (error) {
          // The partial unique index on (clauseKey) WHERE workspaceId IS NULL makes
          // a concurrent seed run a conflict rather than a duplicate row.
          if (isUniqueConstraintViolation(error)) {
            return { kind: "CONFLICT" as const, row: null };
          }
          throw error;
        }
      });
    },

    async repairCatalogClause(input) {
      return withMappedFailures(async () => {
        const result = await client.standardClause.updateMany({
          // `workspaceId: null` keeps a repair structurally unable to touch a
          // workspace custom row; the hash/version predicates make the write a
          // compare-and-set so a concurrent repair cannot double-increment.
          where: {
            id: input.id,
            workspaceId: null,
            clauseKey: input.clauseKey,
            canonicalHash: input.expectedCanonicalHash,
            version: input.expectedVersion,
          },
          data: { version: input.version, ...catalogClauseWriteData(input) },
        });
        return result.count === 1
          ? { kind: "WRITTEN" as const }
          : { kind: "CONFLICT" as const, row: null };
      });
    },
  });
}

/**
 * Seed and repair the public clause catalog against PostgreSQL.
 *
 * This is the production entry point every caller uses: the seeding rules stay in
 * the domain module and only this wiring knows about Prisma.
 */
export async function seedStandardClausesWithPrisma(
  client: PrismaClientLike = db
): Promise<ClauseCatalogSeedSummary> {
  return seedStandardClauses({
    repository: createPrismaClauseCatalogRepository(client),
  });
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_ERROR
  );
}

/** A missing relation becomes the typed schema-pending failure (requirement 16.2). */
async function withMappedFailures<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const pending = asSchemaMigrationPendingError(error);
    if (pending) throw pending;
    throw error;
  }
}
