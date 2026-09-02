/**
 * Clause_Library — catalog seeding, canonical hashing, listing, selection, and
 * workspace custom clauses (design section 4.3).
 *
 * The frozen catalog in `document-templates/contract-templates.ts` stays the one
 * source of public catalog clauses. Seeding walks `CONTRACT_CLAUSE_IDS` in its
 * declared order, so the catalog order index, the canonical hash, and the write
 * sequence are identical on every run and on every machine.
 *
 * Persistence is injected: `seedStandardClauses` requires a
 * `ClauseCatalogRepository`, so unit and property tests exercise the drift rules
 * with no database. `clause-library-prisma.ts` supplies the production adapter
 * and scopes every catalog read and write to `workspaceId: null`, which makes
 * requirement 5.2's "leave every workspace-scoped custom clause unchanged"
 * structural rather than incidental.
 *
 * Two further decisions keep re-seeding stable. Catalog provenance carries no
 * timestamp and no random value, so a second run recomputes an identical hash
 * and writes nothing (requirement 5.2). A catalog clause that cannot produce a
 * complete, bounded bilingual row stops the run instead of persisting a partial
 * clause (design ADR-006, requirements 5.1 and 5.13).
 */

import { db } from "./db";
import {
  CONTRACT_CLAUSE_CATALOG,
  CONTRACT_CLAUSE_IDS,
  CONTRACT_TEMPLATE_CATALOG,
  type ClauseApplicability,
  type ContractClauseDefinition,
  type ContractClauseId,
  type TemplateInlineNode,
} from "./document-templates/contract-templates";
import { ApiError } from "./api-failure";
import { canonicalJson, canonicalJsonHash } from "./canonical-json";
import { createRuntimeId, type RandomUuid } from "./runtime-id";
import { systemUtcClock, utcNow, type UtcClock } from "./time";

export const MAX_CLAUSE_LENGTH = 20_000;
export const MAX_CLAUSE_LIST_TAKE = 50;
export const MAX_CLAUSE_SELECT_IDS = 100;

/** Catalog-declared clause categories (requirement 5.6). */
export const CLAUSE_CATEGORIES = [
  "COMMERCIAL",
  "COMPLIANCE",
  "CONFIDENTIALITY",
  "DATA_AND_SECURITY",
  "EXIT",
  "FOUNDATION",
  "FRAMEWORK",
  "GENERAL",
  "GOODS",
  "GOVERNANCE",
  "PERFORMANCE",
  "PROFESSIONAL_SERVICES",
  "RISK",
  "SAAS",
  "SUBCONTRACT",
] as const;

export type ClauseCategory = (typeof CLAUSE_CATEGORIES)[number];

export function isClauseCategory(value: string): value is ClauseCategory {
  return (CLAUSE_CATEGORIES as readonly string[]).includes(value);
}

/** Catalog provenance name persisted with every seeded row. */
export const CLAUSE_CATALOG_NAME = "arabclue-clause-catalog";
/** Canonical-hash domain separator; bumped only by an intentional format change. */
export const CLAUSE_CANONICAL_SCHEMA = "arabclue.standard-clause";
export const CLAUSE_CANONICAL_SCHEMA_VERSION = 1;
/** Legal-safety values every clause row carries (requirements 5.1, 5.6, 5.12). */
export const CLAUSE_LIFECYCLE = "DRAFT";
export const CLAUSE_LEGAL_REVIEW_STATUS = "UNREVIEWED";
export const CLAUSE_TRANSLATION_STATUS = "DRAFT";
export const CLAUSE_SOURCE_STATUS = "PENDING_OFFICIAL_SOURCE_REVIEW";

/**
 * Which rows the catalog shows. Lifecycle, not the approval flag: the safety
 * migration (`StandardClause_review_state_check`) reserves `isActive` for a
 * clause that is PUBLISHED, legally APPROVED and translation APPROVED, and
 * nothing seeds such a row. Reading by `isActive` left the library empty.
 */
export const CLAUSE_CATALOG_VISIBLE_WHERE = {
  lifecycle: { not: "RETIRED" },
} as const;

/**
 * The database's own rule for a clause row, in code, so the two write paths
 * can be tested against it without Postgres. Mirrors migration
 * 20260724214500_contract_template_safety.
 */
export function satisfiesClauseReviewStateCheck(row: {
  isActive: boolean;
  lifecycle: string;
  legalReviewStatus: string;
  translationStatus: string;
  canonicalHash: string | null;
  provenanceJson: string | null;
}): boolean {
  const enums =
    ["DRAFT", "PUBLISHED", "RETIRED"].includes(row.lifecycle) &&
    ["UNREVIEWED", "IN_REVIEW", "APPROVED", "REJECTED"].includes(row.legalReviewStatus) &&
    ["DRAFT", "REVIEWED", "APPROVED", "REJECTED"].includes(row.translationStatus);
  if (!enums) return false;
  if (!row.isActive) return true;
  return (
    row.lifecycle === "PUBLISHED" &&
    row.legalReviewStatus === "APPROVED" &&
    row.translationStatus === "APPROVED" &&
    row.canonicalHash !== null &&
    row.provenanceJson !== null
  );
}

/** The row a workspace custom clause is created with. Inactive until reviewed. */
export function customClauseCreateData(input: {
  clauseKey: string;
  workspaceId: string;
  category: string;
  nameEn: string;
  nameAr: string;
  contentEn: string;
  contentAr: string;
  mandatory: boolean;
  order: number;
  canonicalHash: string;
  provenanceJson: string;
}) {
  return {
    clauseKey: input.clauseKey,
    workspaceId: input.workspaceId,
    isCustom: true,
    isSystem: false,
    // `isActive` means approved for execution (see the check constraint); a
    // freshly written clause is neither, and setting it here failed the insert.
    isActive: false,
    category: input.category,
    nameEn: input.nameEn,
    nameAr: input.nameAr,
    contentEn: input.contentEn,
    contentAr: input.contentAr,
    mandatory: input.mandatory,
    customizable: true,
    order: input.order,
    version: 1,
    canonicalHash: input.canonicalHash,
    lifecycle: CLAUSE_LIFECYCLE,
    legalReviewStatus: CLAUSE_LEGAL_REVIEW_STATUS,
    counselReviewRequired: CLAUSE_COUNSEL_REVIEW_REQUIRED,
    sourceStatus: CLAUSE_SOURCE_STATUS,
    translationStatus: CLAUSE_TRANSLATION_STATUS,
    provenanceJson: input.provenanceJson,
  };
}
export const CLAUSE_COUNSEL_REVIEW_REQUIRED = true;
/** Prefix of a workspace custom clause key; the suffix is a cryptographic UUID. */
export const CUSTOM_CLAUSE_KEY_PREFIX = "custom";
/** Bounded convergence attempts per clause when a concurrent seed run interleaves. */
const CATALOG_SEED_MAX_ATTEMPTS = 3;

const BIDI_RE = /[\u200E\u200F\u202A-\u202E\u061C\u2066-\u2069]/u;
const RAW_MARKUP_RE = /<[^>]*>/u;
const TOKEN_RE = /\{\{[^{}]+\}\}/u;
const UNSAFE_SIMPLE_RE = /[<>]/;

export function isClauseUnsafe(text: string): boolean {
  return (
    RAW_MARKUP_RE.test(text) ||
    TOKEN_RE.test(text) ||
    BIDI_RE.test(text) ||
    UNSAFE_SIMPLE_RE.test(text) ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text)
  );
}

function isUnsafeClauseText(text: string): boolean {
  return isClauseUnsafe(text);
}

/**
 * Minimum bilingual block shape the catalog projection reads.
 *
 * `TemplateParagraphBlock` satisfies it, so the derivation stays fully typed:
 * the derived text is a canonical-hash input, and an untyped read here would let
 * a catalog edit change a persisted hash silently.
 */
export type BilingualClauseBlock = Readonly<{
  content: Readonly<{
    en: readonly TemplateInlineNode[];
    ar: readonly TemplateInlineNode[];
  }>;
}>;

/**
 * One paragraph as stored text. A variable node becomes `[variableKey]`, which
 * carries the binding point without introducing template token syntax that
 * requirement 5.8 rejects for tenant-submitted clause text.
 */
function extractInlineText(nodes: readonly TemplateInlineNode[]): string {
  return nodes
    .map((node) =>
      node.type === "TEXT" ? node.value : `[${node.variableKey}]`
    )
    .join("");
}

/** Blocks joined into the single stored text column, blank paragraphs dropped. */
export function extractPlainTextFromBlocks(
  blocks: readonly BilingualClauseBlock[],
  lang: "en" | "ar"
): string {
  return blocks
    .map((block) => extractInlineText(block.content[lang]))
    .filter((paragraph) => paragraph.trim().length > 0)
    .join("\n\n")
    .trim();
}

function deriveContentEnAr(
  clause: ContractClauseDefinition
): Readonly<{ en: string; ar: string }> {
  return {
    en: extractPlainTextFromBlocks(clause.blocks, "en"),
    ar: extractPlainTextFromBlocks(clause.blocks, "ar"),
  };
}

/* -------------------------------------------------------------------------- */
/* Canonical clause identity                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Persisted fields the canonical hash covers.
 *
 * Every member is a real `StandardClause` column, so the hash of a stored row can
 * be recomputed from the row alone (design Property 6) and compared with the hash
 * recomputed from the frozen catalog (requirements 5.2, 5.12).
 */
export interface ClauseCanonicalContent {
  readonly clauseKey: string;
  readonly workspaceId: string | null;
  readonly category: string;
  readonly nameAr: string;
  readonly nameEn: string;
  readonly contentAr: string;
  readonly contentEn: string;
  readonly mandatory: boolean;
  readonly order: number;
  readonly provenanceJson: string;
}

/** SHA-256 over canonical JSON of the persisted clause fields (requirement 5.1). */
export function computeClauseCanonicalHash(
  content: ClauseCanonicalContent
): string {
  return canonicalJsonHash({
    schema: CLAUSE_CANONICAL_SCHEMA,
    schemaVersion: CLAUSE_CANONICAL_SCHEMA_VERSION,
    clauseKey: content.clauseKey,
    workspaceId: content.workspaceId,
    category: content.category,
    nameAr: content.nameAr,
    nameEn: content.nameEn,
    contentAr: content.contentAr,
    contentEn: content.contentEn,
    mandatory: content.mandatory,
    order: content.order,
    provenanceJson: content.provenanceJson,
  });
}

/** Row shape the canonical projection needs; satisfied by a `StandardClause` row. */
export interface ClauseCanonicalRowFields {
  readonly clauseKey: string | null;
  readonly workspaceId: string | null;
  readonly category: string;
  readonly nameAr: string;
  readonly nameEn: string;
  readonly contentAr: string;
  readonly contentEn: string;
  readonly mandatory: boolean;
  readonly order: number;
  readonly provenanceJson: string | null;
}

/** Canonical projection of a stored row, for hash recomputation over persisted data. */
export function clauseCanonicalContentFromRow(
  row: ClauseCanonicalRowFields
): ClauseCanonicalContent {
  return Object.freeze({
    clauseKey: row.clauseKey ?? "",
    workspaceId: row.workspaceId ?? null,
    category: row.category,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    contentAr: row.contentAr,
    contentEn: row.contentEn,
    mandatory: row.mandatory,
    order: row.order,
    provenanceJson: row.provenanceJson ?? "",
  });
}

/**
 * Requirement 5.11: a `GENERAL` catalog clause is mandatory; `TENDER_SPECIFIC`
 * and `COUNSEL_DECISION` clauses are not.
 */
export function mandatoryFromApplicability(
  applicability: ClauseApplicability
): boolean {
  return applicability === "GENERAL";
}

/** Deterministic catalog provenance. Contains no timestamp, so re-seeding is stable. */
function catalogClauseProvenanceJson(clause: ContractClauseDefinition): string {
  return canonicalJson({
    catalog: CLAUSE_CATALOG_NAME,
    clauseKey: clause.id,
    version: clause.version,
    versionId: clause.versionId,
    canonicalHash: clause.canonicalHash,
    applicability: clause.applicability,
    jurisdiction: clause.provenance.jurisdiction,
    sourceStatus: clause.provenance.sourceStatus,
  });
}

/* -------------------------------------------------------------------------- */
/* Deterministic catalog projection                                           */
/* -------------------------------------------------------------------------- */

/** One catalog clause reduced to the exact fields a `StandardClause` row stores. */
export interface CatalogClauseProjection {
  readonly clauseKey: ContractClauseId;
  readonly category: string;
  readonly nameAr: string;
  readonly nameEn: string;
  readonly contentAr: string;
  readonly contentEn: string;
  readonly mandatory: boolean;
  readonly order: number;
  readonly provenanceJson: string;
  readonly canonicalHash: string;
}

/** Bilingual fields requirement 5.1 requires every seeded row to carry. */
const CATALOG_CLAUSE_REQUIRED_FIELDS = [
  "nameAr",
  "nameEn",
  "contentAr",
  "contentEn",
] as const;

/**
 * Fails closed on a catalog clause that cannot produce a complete stored row.
 *
 * Requirement 5.1 requires the persisted row to carry both titles and both
 * language texts, and requirement 5.13 bounds a stored clause text at
 * `MAX_CLAUSE_LENGTH`. The frozen catalog satisfies both today, so this guard
 * only fires on a future catalog edit — and then it stops seeding instead of
 * persisting an incomplete or oversized bilingual clause (design ADR-006).
 */
function assertCatalogClauseIsStorable(
  clauseKey: ContractClauseId,
  canonical: ClauseCanonicalContent
): void {
  if (!Number.isSafeInteger(canonical.order) || canonical.order < 0) {
    throw new Error(
      `Catalog order index for clause ${clauseKey} must be a non-negative integer.`
    );
  }
  for (const field of CATALOG_CLAUSE_REQUIRED_FIELDS) {
    const value = canonical[field];
    if (value.trim().length === 0) {
      throw new Error(
        `Frozen catalog clause ${clauseKey} has no ${field}; seeding cannot persist an incomplete bilingual clause.`
      );
    }
    if (value.length > MAX_CLAUSE_LENGTH) {
      throw new Error(
        `Frozen catalog clause ${clauseKey} exceeds ${MAX_CLAUSE_LENGTH} characters in ${field}.`
      );
    }
  }
}

/** Projection of a single catalog clause at its declared catalog order index. */
export function describeCatalogClause(
  clauseKey: ContractClauseId,
  order: number
): CatalogClauseProjection {
  const clause: ContractClauseDefinition = CONTRACT_CLAUSE_CATALOG[clauseKey];
  const { en, ar } = deriveContentEnAr(clause);
  const canonical: ClauseCanonicalContent = {
    clauseKey,
    workspaceId: null,
    category: clause.category,
    nameAr: clause.title.ar,
    nameEn: clause.title.en,
    contentAr: ar,
    contentEn: en,
    mandatory: mandatoryFromApplicability(clause.applicability),
    order,
    provenanceJson: catalogClauseProvenanceJson(clause),
  };
  assertCatalogClauseIsStorable(clauseKey, canonical);

  return Object.freeze({
    clauseKey,
    category: canonical.category,
    nameAr: canonical.nameAr,
    nameEn: canonical.nameEn,
    contentAr: canonical.contentAr,
    contentEn: canonical.contentEn,
    mandatory: canonical.mandatory,
    order: canonical.order,
    provenanceJson: canonical.provenanceJson,
    canonicalHash: computeClauseCanonicalHash(canonical),
  });
}

/**
 * Every catalog clause in declared catalog order (requirement 5.1).
 *
 * `CONTRACT_CLAUSE_IDS` is the frozen ordered identifier list of the catalog, so
 * the traversal order — and therefore the persisted `order` index — never depends
 * on object-key enumeration or on the machine running the seed.
 */
export function describeCatalogClauses(): readonly CatalogClauseProjection[] {
  return Object.freeze(
    CONTRACT_CLAUSE_IDS.map((clauseKey, index) =>
      describeCatalogClause(clauseKey, index)
    )
  );
}

/* -------------------------------------------------------------------------- */
/* Injectable catalog persistence                                             */
/* -------------------------------------------------------------------------- */

/** Minimum stored state a drift decision needs. */
export interface StoredCatalogClause {
  readonly id: string;
  readonly clauseKey: string;
  readonly canonicalHash: string | null;
  readonly version: number;
}

/** Conditional update of one drifted catalog row (requirement 5.12). */
export interface CatalogClauseRepairInput extends CatalogClauseProjection {
  readonly id: string;
  /** Hash read before the decision; a mismatch means another writer repaired it. */
  readonly expectedCanonicalHash: string | null;
  readonly expectedVersion: number;
  /** `expectedVersion + 1`. */
  readonly version: number;
}

/**
 * `WRITTEN` — this call performed the write.
 * `CONFLICT` — a concurrent writer changed the row; `row` carries the re-read state
 * when the adapter already has it, otherwise the caller re-reads.
 */
export type CatalogClauseWriteResult =
  | Readonly<{ kind: "WRITTEN" }>
  | Readonly<{ kind: "CONFLICT"; row: StoredCatalogClause | null }>;

/**
 * Catalog-scoped persistence. Every implementation must restrict itself to rows
 * with `workspaceId = null`; workspace custom clauses are outside its reach.
 */
export interface ClauseCatalogRepository {
  findCatalogClauses(
    clauseKeys: readonly string[]
  ): Promise<readonly StoredCatalogClause[]>;
  findCatalogClause(clauseKey: string): Promise<StoredCatalogClause | null>;
  createCatalogClause(
    input: CatalogClauseProjection
  ): Promise<CatalogClauseWriteResult>;
  repairCatalogClause(
    input: CatalogClauseRepairInput
  ): Promise<CatalogClauseWriteResult>;
}

/* -------------------------------------------------------------------------- */
/* Catalog seeding                                                            */
/* -------------------------------------------------------------------------- */

export type CatalogClauseSeedDisposition = "created" | "repaired" | "unchanged";

export interface ClauseCatalogSeedSummary {
  readonly created: number;
  /** Rows whose stored hash differed from the recomputed catalog hash. */
  readonly updated: number;
  readonly unchanged: number;
  readonly total: number;
  readonly createdClauseKeys: readonly string[];
  readonly updatedClauseKeys: readonly string[];
}

export interface SeedStandardClausesOptions {
  /**
   * Catalog persistence. Production passes the Prisma adapter from
   * `clause-library-prisma.ts`; tests pass an in-memory fake. There is no
   * implicit default, so no caller reaches a database without saying so.
   */
  readonly repository: ClauseCatalogRepository;
}

/**
 * Seed and repair the public clause catalog.
 *
 * Requirement 5.1 — every catalog identifier gets one row carrying the identifier,
 * category, both titles, both texts, the mandatory flag derived from applicability,
 * the catalog order index, the recomputed canonical hash, `isActive = true`,
 * `UNREVIEWED` legal review, and a required counsel review.
 *
 * Requirement 5.2 — a row whose stored hash equals the recomputed catalog hash is
 * not written at all, so two runs equal one run; no second row is created for an
 * existing identifier.
 *
 * Requirement 5.12 — a drifted row has its catalog fields and hash replaced, its
 * version incremented, and its review flags reset.
 *
 * Requirements 5.2 and 5.12 — workspace custom clauses are never read or written
 * here: the repository is catalog-scoped.
 */
export async function seedStandardClauses(
  options: SeedStandardClausesOptions
): Promise<ClauseCatalogSeedSummary> {
  const { repository } = options;
  const projections = describeCatalogClauses();

  const stored = await repository.findCatalogClauses(
    projections.map((projection) => projection.clauseKey)
  );
  const storedByKey = new Map<string, StoredCatalogClause>();
  for (const row of stored) {
    if (!storedByKey.has(row.clauseKey)) storedByKey.set(row.clauseKey, row);
  }

  const createdClauseKeys: string[] = [];
  const updatedClauseKeys: string[] = [];
  let unchanged = 0;

  for (const projection of projections) {
    const disposition = await reconcileCatalogClause(
      repository,
      projection,
      storedByKey.get(projection.clauseKey) ?? null
    );
    if (disposition === "created") createdClauseKeys.push(projection.clauseKey);
    else if (disposition === "repaired") {
      updatedClauseKeys.push(projection.clauseKey);
    } else unchanged += 1;
  }

  return Object.freeze({
    created: createdClauseKeys.length,
    updated: updatedClauseKeys.length,
    unchanged,
    total: projections.length,
    createdClauseKeys: Object.freeze([...createdClauseKeys]),
    updatedClauseKeys: Object.freeze([...updatedClauseKeys]),
  });
}

/**
 * Bring one catalog row to the projected state.
 *
 * A conflict means a concurrent seed run wrote first; the row is re-read and the
 * same decision is retaken, so the converged state is identical either way.
 */
async function reconcileCatalogClause(
  repository: ClauseCatalogRepository,
  projection: CatalogClauseProjection,
  initial: StoredCatalogClause | null
): Promise<CatalogClauseSeedDisposition> {
  let existing = initial;

  for (let attempt = 0; attempt < CATALOG_SEED_MAX_ATTEMPTS; attempt += 1) {
    if (!existing) {
      const result = await repository.createCatalogClause(projection);
      if (result.kind === "WRITTEN") return "created";
      existing =
        result.row ?? (await repository.findCatalogClause(projection.clauseKey));
      continue;
    }

    if (existing.canonicalHash === projection.canonicalHash) return "unchanged";

    const result = await repository.repairCatalogClause({
      ...projection,
      id: existing.id,
      expectedCanonicalHash: existing.canonicalHash,
      expectedVersion: existing.version,
      version: existing.version + 1,
    });
    if (result.kind === "WRITTEN") return "repaired";
    existing =
      result.row ?? (await repository.findCatalogClause(projection.clauseKey));
  }

  throw new Error(
    `Clause catalog seeding did not converge for ${projection.clauseKey}.`
  );
}

export interface ListClausesInput {
  category?: string;
  mandatory?: boolean;
  workspaceId?: string | null;
  cursor?: string;
  take?: number;
  search?: string;
}

export async function listClauses(input: ListClausesInput) {
  const take = Math.min(Math.max(input.take ?? 25, 1), MAX_CLAUSE_LIST_TAKE);

  const whereBase: any = {
    ...CLAUSE_CATALOG_VISIBLE_WHERE,
  };

  if (input.category) whereBase.category = input.category;
  if (typeof input.mandatory === "boolean") whereBase.mandatory = input.mandatory;
  if (input.search && input.search.trim()) {
    const s = input.search.trim();
    whereBase.OR = [
      { nameEn: { contains: s, mode: "insensitive" as const } },
      { nameAr: { contains: s, mode: "insensitive" as const } },
      { contentEn: { contains: s, mode: "insensitive" as const } },
      { contentAr: { contains: s, mode: "insensitive" as const } },
      { clauseKey: { contains: s, mode: "insensitive" as const } },
    ];
  }

  if (input.workspaceId) {
    whereBase.AND = [
      {
        OR: [{ workspaceId: null }, { workspaceId: input.workspaceId }],
      },
    ];
    if (whereBase.OR) {
      const prevOr = whereBase.OR;
      delete whereBase.OR;
      whereBase.AND.push({ OR: prevOr });
    }
  } else {
    whereBase.workspaceId = null;
  }

  let cursorWhere: any = {};
  if (input.cursor) {
    const cursorRecord = await db.standardClause.findUnique({
      where: { id: input.cursor },
      select: { id: true, order: true },
    });
    if (!cursorRecord) {
      throw new ApiError("Cursor not found", 404, "CLAUSE_CURSOR_NOT_FOUND");
    }
    cursorWhere = {
      OR: [
        { order: { gt: cursorRecord.order } },
        { order: cursorRecord.order, id: { gt: cursorRecord.id } },
      ],
    };
  }

  const finalWhere = cursorWhere.OR
    ? { AND: [whereBase, cursorWhere] }
    : whereBase;

  const rows = await db.standardClause.findMany({
    where: finalWhere,
    orderBy: [{ order: "asc" }, { id: "asc" }],
    take: take + 1,
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

  return {
    clauses: page,
    nextCursor,
  };
}

export async function getClauseByIdentifier(identifier: string, workspaceId?: string | null) {
  const trimmed = identifier.trim();
  if (!trimmed) throw new ApiError("Clause not found", 404, "CLAUSE_NOT_FOUND");

  const where: any = {
    ...CLAUSE_CATALOG_VISIBLE_WHERE,
    OR: [{ id: trimmed }, { clauseKey: trimmed }],
  };

  if (workspaceId) {
    const row = await db.standardClause.findFirst({
      where: {
        ...where,
        OR: [
          { AND: [{ id: trimmed }, { workspaceId: null }] },
          { AND: [{ id: trimmed }, { workspaceId }] },
          { AND: [{ clauseKey: trimmed }, { workspaceId: null }] },
          { AND: [{ clauseKey: trimmed }, { workspaceId }] },
        ],
      },
    });
    if (!row) throw new ApiError("Clause not found", 404, "CLAUSE_NOT_FOUND");
    return row;
  } else {
    const row = await db.standardClause.findFirst({
      where: {
        ...CLAUSE_CATALOG_VISIBLE_WHERE,
        workspaceId: null,
        OR: [{ id: trimmed }, { clauseKey: trimmed }],
      },
    });
    if (!row) throw new ApiError("Clause not found", 404, "CLAUSE_NOT_FOUND");
    return row;
  }
}

export interface SelectClausesInput {
  clauseIds: string[];
  templateFamily?: string;
  workspaceId?: string | null;
}

export async function selectClausesForTemplate(input: SelectClausesInput) {
  if (!Array.isArray(input.clauseIds)) {
    throw new ApiError("Invalid request", 400, "CLAUSE_FIELD_INVALID");
  }
  if (input.clauseIds.length > MAX_CLAUSE_SELECT_IDS) {
    throw new ApiError(`Maximum ${MAX_CLAUSE_SELECT_IDS} clauses allowed`, 400, "CLAUSE_FIELD_INVALID");
  }

  const uniqueIds = [...new Set(input.clauseIds.map((s) => s.trim()).filter(Boolean))];

  const baseWhere: any = {
    ...CLAUSE_CATALOG_VISIBLE_WHERE,
  };
  if (input.workspaceId) {
    baseWhere.OR = [{ workspaceId: null }, { workspaceId: input.workspaceId }];
  } else {
    baseWhere.workspaceId = null;
  }

  const selectedRows = await db.standardClause.findMany({
    where: {
      ...baseWhere,
      OR: [
        { id: { in: uniqueIds } },
        { clauseKey: { in: uniqueIds } },
      ],
    },
  });

  const foundMap = new Map<string, typeof selectedRows[number]>();
  for (const r of selectedRows) {
    foundMap.set(r.id, r);
    if (r.clauseKey) foundMap.set(r.clauseKey, r);
  }

  const missing = uniqueIds.filter((id) => !foundMap.has(id));
  if (missing.length > 0) {
    throw new ApiError(`Clause not found: ${missing[0]}`, 404, "CLAUSE_NOT_FOUND");
  }

  const deduplicatedSelected = Array.from(
    new Map(selectedRows.map((r) => [r.id, r])).values()
  );

  const mandatoryWhere: any = {
    ...CLAUSE_CATALOG_VISIBLE_WHERE,
    mandatory: true,
  };
  if (input.workspaceId) {
    mandatoryWhere.OR = [{ workspaceId: null }, { workspaceId: input.workspaceId }];
  } else {
    mandatoryWhere.workspaceId = null;
  }

  if (input.templateFamily) {
    const familyKey = input.templateFamily.trim();
    // GENERAL-mandatory rows apply to every family (design §4.3). When a
    // family is supplied it must exist in the frozen catalog.
    if (!(familyKey in CONTRACT_TEMPLATE_CATALOG)) {
      throw new ApiError(
        "Unknown template family",
        400,
        "CLAUSE_FIELD_INVALID"
      );
    }
  }

  const mandatoryRows = await db.standardClause.findMany({
    where: mandatoryWhere,
    orderBy: [{ order: "asc" }],
  });

  const combinedMap = new Map<string, typeof selectedRows[number]>();
  for (const m of mandatoryRows) combinedMap.set(m.id, m);
  for (const s of deduplicatedSelected) combinedMap.set(s.id, s);

  const combined = Array.from(combinedMap.values()).sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });

  return {
    selected: deduplicatedSelected.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    mandatory: mandatoryRows,
    combined,
  };
}

export interface CreateCustomClauseInput {
  workspaceId: string;
  category: string;
  arabicText: string;
  englishText: string;
  titleEn?: string;
  titleAr?: string;
  mandatory?: boolean;
  order?: number;
}

/** Injectable time and identifier sources; production uses the system defaults. */
export interface CustomClauseRuntime {
  readonly clock?: UtcClock;
  readonly randomUuid?: RandomUuid;
}

export async function createCustomClause(
  input: CreateCustomClauseInput,
  runtime: CustomClauseRuntime = {}
) {
  const workspaceId = input.workspaceId?.trim();
  if (!workspaceId) throw new ApiError("Workspace required", 400, "CLAUSE_FIELD_INVALID");

  const arabicText = (input.arabicText ?? "").trim();
  const englishText = (input.englishText ?? "").trim();

  if (!arabicText || !englishText) {
    throw new ApiError("Both Arabic and English texts are required", 400, "CLAUSE_TRANSLATION_MISSING");
  }

  if (arabicText.length > MAX_CLAUSE_LENGTH || englishText.length > MAX_CLAUSE_LENGTH) {
    throw new ApiError(`Clause text exceeds ${MAX_CLAUSE_LENGTH} characters`, 400, "CLAUSE_FIELD_INVALID");
  }

  if ((input.titleEn && input.titleEn.length > 500) || (input.titleAr && input.titleAr.length > 500)) {
    throw new ApiError("Title too long", 400, "CLAUSE_FIELD_INVALID");
  }

  if (isUnsafeClauseText(arabicText) || isUnsafeClauseText(englishText)) {
    throw new ApiError("Unsafe clause text detected", 400, "UNSAFE_CLAUSE_TEXT");
  }
  if (input.titleEn && isUnsafeClauseText(input.titleEn)) {
    throw new ApiError("Unsafe clause text detected", 400, "UNSAFE_CLAUSE_TEXT");
  }
  if (input.titleAr && isUnsafeClauseText(input.titleAr)) {
    throw new ApiError("Unsafe clause text detected", 400, "UNSAFE_CLAUSE_TEXT");
  }

  const category = (input.category ?? "GENERAL").trim() || "GENERAL";
  if (!isClauseCategory(category)) {
    throw new ApiError(
      "Clause category is not catalog-declared",
      400,
      "CLAUSE_FIELD_INVALID"
    );
  }
  const nameEn = (input.titleEn ?? "").trim() || englishText.slice(0, 100) || "Custom Clause";
  const nameAr = (input.titleAr ?? "").trim() || arabicText.slice(0, 100) || "بند مخصص";

  const maxOrderRow = await db.standardClause.findFirst({
    where: { workspaceId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const order = typeof input.order === "number" ? input.order : (maxOrderRow?.order ?? 1000) + 1;

  // Cryptographic identifier, never pseudo-random generation (design section 3.3).
  const clauseKey = createRuntimeId(
    CUSTOM_CLAUSE_KEY_PREFIX,
    runtime.randomUuid ?? undefined
  );
  const mandatory = Boolean(input.mandatory);
  const provenanceJson = canonicalJson({
    custom: true,
    workspaceId,
    createdAt: utcNow(runtime.clock ?? systemUtcClock).toISOString(),
  });

  const canonicalHash = computeClauseCanonicalHash({
    clauseKey,
    workspaceId,
    category,
    nameAr,
    nameEn,
    contentAr: arabicText,
    contentEn: englishText,
    mandatory,
    order,
    provenanceJson,
  });

  const created = await db.standardClause.create({
    data: customClauseCreateData({
      clauseKey,
      workspaceId,
      category,
      nameEn,
      nameAr,
      contentEn: englishText,
      contentAr: arabicText,
      mandatory,
      order,
      canonicalHash,
      provenanceJson,
    }),
  });

  return created;
}
