/**
 * In-memory clause persistence fake for platform-completion clause tests
 * (design section 12.2).
 *
 * The store holds catalog rows and workspace custom rows in one array, exactly as
 * `StandardClause` does, while the repository it exposes reproduces the Prisma
 * adapter's catalog scope (`workspaceId = null`) and its compare-and-set repair
 * predicate. A test can therefore assert that seeding leaves every custom row
 * byte-identical instead of assuming it. No test using this fake performs network
 * I/O or touches a database.
 *
 * This module reads the production legal-safety constants, so it is imported by
 * path rather than re-exported from `support/index.ts`: that keeps the shared
 * barrel — and therefore every unrelated completion test — free of the Prisma
 * client that `clause-library.ts` constructs at import time.
 */

import {
  CLAUSE_COUNSEL_REVIEW_REQUIRED,
  CLAUSE_LEGAL_REVIEW_STATUS,
  CLAUSE_LIFECYCLE,
  CLAUSE_SOURCE_STATUS,
  CLAUSE_TRANSLATION_STATUS,
  type CatalogClauseProjection,
  type CatalogClauseRepairInput,
  type CatalogClauseWriteResult,
  type ClauseCatalogRepository,
  type StoredCatalogClause,
} from "../../clause-library";

export type FakeClauseRow = {
  id: string;
  clauseKey: string | null;
  workspaceId: string | null;
  isCustom: boolean;
  isSystem: boolean;
  isActive: boolean;
  category: string;
  nameEn: string;
  nameAr: string;
  contentEn: string;
  contentAr: string;
  mandatory: boolean;
  customizable: boolean;
  order: number;
  version: number;
  canonicalHash: string | null;
  lifecycle: string;
  legalReviewStatus: string;
  counselReviewRequired: boolean;
  sourceStatus: string;
  translationStatus: string;
  provenanceJson: string | null;
};

export type ClauseStoreSnapshot = Readonly<{
  catalog: readonly FakeClauseRow[];
  custom: readonly FakeClauseRow[];
}>;

export type ClauseWriteRecord = Readonly<{
  operation: "create" | "repair";
  clauseKey: string;
}>;

export type FakeClauseCatalogRepository = ClauseCatalogRepository &
  Readonly<{
    snapshot(): ClauseStoreSnapshot;
    /** Seed a catalog row directly, bypassing the seeding rules. */
    seedCatalogRow(row: Partial<FakeClauseRow> & { clauseKey: string }): FakeClauseRow;
    /** Seed a workspace custom row that seeding must never touch. */
    seedCustomRow(
      row: Partial<FakeClauseRow> & { workspaceId: string; clauseKey: string }
    ): FakeClauseRow;
    /**
     * Hide a stored catalog key from the batch read only, reproducing a row that a
     * concurrent seed run inserted after the caller's initial read.
     */
    hideFromBatchRead(clauseKey: string): void;
    /** Every write the repository performed, in order. */
    readonly writes: readonly ClauseWriteRecord[];
  }>;

const DEFAULT_ROW: Omit<FakeClauseRow, "id" | "clauseKey"> = Object.freeze({
  workspaceId: null,
  isCustom: false,
  isSystem: true,
  isActive: true,
  category: "FOUNDATION",
  nameEn: "Seeded clause",
  nameAr: "بند مُهيّأ",
  contentEn: "Seeded English text.",
  contentAr: "نص عربي مُهيّأ.",
  mandatory: false,
  customizable: true,
  order: 0,
  version: 1,
  canonicalHash: null,
  lifecycle: CLAUSE_LIFECYCLE,
  legalReviewStatus: CLAUSE_LEGAL_REVIEW_STATUS,
  counselReviewRequired: CLAUSE_COUNSEL_REVIEW_REQUIRED,
  sourceStatus: CLAUSE_SOURCE_STATUS,
  translationStatus: CLAUSE_TRANSLATION_STATUS,
  provenanceJson: null,
});

export function createFakeClauseCatalogRepository(): FakeClauseCatalogRepository {
  const rows: FakeClauseRow[] = [];
  const writes: ClauseWriteRecord[] = [];
  const hiddenFromBatchRead = new Set<string>();
  let sequence = 0;

  const nextId = (): string => {
    sequence += 1;
    return `clause-${String(sequence).padStart(4, "0")}`;
  };

  const catalogRow = (clauseKey: string): FakeClauseRow | undefined =>
    rows.find(
      (row) => row.workspaceId === null && row.clauseKey === clauseKey
    );

  const toStored = (row: FakeClauseRow): StoredCatalogClause => ({
    id: row.id,
    clauseKey: row.clauseKey ?? "",
    canonicalHash: row.canonicalHash,
    version: row.version,
  });

  return Object.freeze({
    writes,

    snapshot: () =>
      Object.freeze({
        catalog: rows
          .filter((row) => row.workspaceId === null)
          .map((row) => ({ ...row })),
        custom: rows
          .filter((row) => row.workspaceId !== null)
          .map((row) => ({ ...row })),
      }),

    seedCatalogRow: (row) => {
      const record: FakeClauseRow = {
        ...DEFAULT_ROW,
        ...row,
        workspaceId: null,
        id: row.id ?? nextId(),
      };
      rows.push(record);
      return { ...record };
    },

    seedCustomRow: (row) => {
      const record: FakeClauseRow = {
        ...DEFAULT_ROW,
        isCustom: true,
        isSystem: false,
        ...row,
        id: row.id ?? nextId(),
      };
      rows.push(record);
      return { ...record };
    },

    hideFromBatchRead: (clauseKey) => {
      hiddenFromBatchRead.add(clauseKey);
    },

    findCatalogClauses: async (clauseKeys: readonly string[]) => {
      const requested = new Set(clauseKeys);
      return rows
        .filter(
          (row) =>
            row.workspaceId === null &&
            row.clauseKey !== null &&
            requested.has(row.clauseKey) &&
            !hiddenFromBatchRead.has(row.clauseKey)
        )
        .sort(
          (left, right) =>
            (left.clauseKey ?? "").localeCompare(right.clauseKey ?? "") ||
            left.id.localeCompare(right.id)
        )
        .map(toStored);
    },

    findCatalogClause: async (clauseKey: string) => {
      const row = catalogRow(clauseKey);
      return row ? toStored(row) : null;
    },

    createCatalogClause: async (
      input: CatalogClauseProjection
    ): Promise<CatalogClauseWriteResult> => {
      const existing = catalogRow(input.clauseKey);
      if (existing) return { kind: "CONFLICT", row: toStored(existing) };

      writes.push({ operation: "create", clauseKey: input.clauseKey });
      rows.push({
        ...DEFAULT_ROW,
        id: nextId(),
        clauseKey: input.clauseKey,
        workspaceId: null,
        isCustom: false,
        isSystem: true,
        isActive: true,
        customizable: true,
        version: 1,
        category: input.category,
        nameEn: input.nameEn,
        nameAr: input.nameAr,
        contentEn: input.contentEn,
        contentAr: input.contentAr,
        mandatory: input.mandatory,
        order: input.order,
        canonicalHash: input.canonicalHash,
        provenanceJson: input.provenanceJson,
      });
      return { kind: "WRITTEN" };
    },

    repairCatalogClause: async (
      input: CatalogClauseRepairInput
    ): Promise<CatalogClauseWriteResult> => {
      const row = rows.find(
        (candidate) =>
          candidate.id === input.id &&
          candidate.workspaceId === null &&
          candidate.clauseKey === input.clauseKey &&
          candidate.canonicalHash === input.expectedCanonicalHash &&
          candidate.version === input.expectedVersion
      );
      if (!row) return { kind: "CONFLICT", row: null };

      writes.push({ operation: "repair", clauseKey: input.clauseKey });
      row.category = input.category;
      row.nameEn = input.nameEn;
      row.nameAr = input.nameAr;
      row.contentEn = input.contentEn;
      row.contentAr = input.contentAr;
      row.mandatory = input.mandatory;
      row.order = input.order;
      row.canonicalHash = input.canonicalHash;
      row.provenanceJson = input.provenanceJson;
      row.version = input.version;
      row.lifecycle = CLAUSE_LIFECYCLE;
      row.legalReviewStatus = CLAUSE_LEGAL_REVIEW_STATUS;
      row.counselReviewRequired = CLAUSE_COUNSEL_REVIEW_REQUIRED;
      row.sourceStatus = CLAUSE_SOURCE_STATUS;
      row.translationStatus = CLAUSE_TRANSLATION_STATUS;
      row.isActive = true;
      row.isSystem = true;
      row.isCustom = false;
      return { kind: "WRITTEN" };
    },
  });
}
