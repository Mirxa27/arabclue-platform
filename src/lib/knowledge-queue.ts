/**
 * Knowledge_Approval_Queue read projection (design section 4.7, requirements
 * 11.1, 11.6, 11.7).
 *
 * The module is a pure domain service in the shape of `comment-lifecycle.ts` and
 * `invitation-service.ts`: it holds no Prisma import, so unit tests drive the
 * real ordering, cursor, and projection rules against an in-memory repository
 * with no network call and no database read. `knowledge-queue-prisma.ts` supplies
 * the production adapter.
 *
 * Rules this module owns:
 * - one normalized queue row per Certificate, ContentLibraryItem,
 *   MethodologyAsset, PastProject, and StaffMember record whose decision is
 *   pending in the workspace resolved by Tenant_Context (criteria 11.1, 11.7);
 * - the merged order `submittedAt DESC, recordType ASC, id ASC`, which the
 *   composite keyset cursor reproduces exactly (criteria 11.1, 11.6);
 * - a default page of 25 rows, a requested page above 50 clamped to 50, and a
 *   total that is computed independently of the page size (criterion 11.6);
 * - explicit no-expiry and no-evidence markers rather than a bare null, each
 *   carrying the registered bilingual key the queue view renders (criterion 11.1).
 *
 * Every user-facing string stays in the localization registry: a row carries
 * registered keys, never composed text (requirements 18.5, 19.9).
 */

import { z } from "zod";
import { createKeysetCursorCodec } from "./keyset-cursor";
import { systemUtcClock, utcNow, type UtcClock } from "./time";
import { getDynamicTranslationKey, type TranslationKey } from "./i18n";

/* -------------------------------------------------------------------------- */
/* Vocabulary and bounds                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The five knowledge record types of criterion 11.1, declared in ascending
 * order so the list is also the tie-break order the merged query applies after
 * the submission timestamp. Every member has one registered bilingual label in
 * the `knowledgeRecord` dynamic family.
 */
export const KNOWLEDGE_QUEUE_RECORD_TYPES = [
  "CERTIFICATE",
  "CONTENT_LIBRARY_ITEM",
  "METHODOLOGY_ASSET",
  "PAST_PROJECT",
  "STAFF_MEMBER",
] as const;

export type KnowledgeQueueRecordType =
  (typeof KNOWLEDGE_QUEUE_RECORD_TYPES)[number];

/** The single Zod source for a record type in a cursor or a request. */
export const knowledgeQueueRecordTypeSchema = z.enum(
  KNOWLEDGE_QUEUE_RECORD_TYPES
);

export function isKnowledgeQueueRecordType(
  value: unknown
): value is KnowledgeQueueRecordType {
  return (
    typeof value === "string" &&
    (KNOWLEDGE_QUEUE_RECORD_TYPES as readonly string[]).includes(value)
  );
}

/** Decision states persisted on every knowledge record. */
export const KNOWLEDGE_DECISION_STATES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;

export type KnowledgeDecisionState = (typeof KNOWLEDGE_DECISION_STATES)[number];

/** Only this decision state is listed by the queue (criterion 11.1). */
export const KNOWLEDGE_DECISION_PENDING: KnowledgeDecisionState = "PENDING";

/**
 * Legacy review state that also means "no decision recorded".
 *
 * Four of the five models carry the older `reviewStatus` column, whose
 * `APPROVED`/`REVOKED` values were written by the review path that predates the
 * normalized decision columns. The additive migration defaults `decisionStatus`
 * to `PENDING` for every existing row and backfills nothing, so a record already
 * decided through the legacy path would otherwise reappear as pending. A record
 * is pending only when neither state records a decision.
 */
export const KNOWLEDGE_LEGACY_REVIEW_UNREVIEWED = "UNREVIEWED";

/** Page size applied when the caller supplies none (criterion 11.6). */
export const KNOWLEDGE_QUEUE_PAGE_SIZE_DEFAULT = 25;

/** Upper bound a larger requested page size is clamped to (criterion 11.6). */
export const KNOWLEDGE_QUEUE_PAGE_SIZE_MAX = 50;

/**
 * Clamps a requested page size into the bounds of criterion 11.6.
 *
 * An absent, unparseable, or non-positive value yields the default rather than
 * an unbounded read, so no caller can widen the page.
 */
export function resolveKnowledgeQueuePageSize(requested: unknown): number {
  if (requested === undefined || requested === null) {
    return KNOWLEDGE_QUEUE_PAGE_SIZE_DEFAULT;
  }
  const value =
    typeof requested === "number"
      ? requested
      : typeof requested === "string" && /^\d{1,6}$/u.test(requested.trim())
        ? Number.parseInt(requested.trim(), 10)
        : Number.NaN;
  if (!Number.isSafeInteger(value) || value < 1) {
    return KNOWLEDGE_QUEUE_PAGE_SIZE_DEFAULT;
  }
  return Math.min(value, KNOWLEDGE_QUEUE_PAGE_SIZE_MAX);
}

/* -------------------------------------------------------------------------- */
/* Persisted record projections                                               */
/* -------------------------------------------------------------------------- */

/**
 * Fields every pending knowledge record shares. Names mirror the persisted
 * columns so the Prisma adapter is a straight selection with no reshaping.
 */
type PendingKnowledgeRecordBase = Readonly<{
  id: string;
  workspaceId: string;
  /** Authoritative submission timestamp in UTC (criterion 11.1). */
  submittedAt: Date;
  submittedById: string | null;
  /** Resolved submitter, or null when the account was removed. */
  submitter: Readonly<{ id: string; name: string | null }> | null;
  evidenceDocumentId: string | null;
  evidenceVersion: number | null;
}>;

/**
 * One pending record as its own model stores it.
 *
 * The union keeps each model's real column names — `name`/`nameAr` for a
 * certificate and a staff member, `title`/`titleAr` for the other three, and
 * `expiresAt` only where it exists — so the normalization below is the single
 * place that reconciles them.
 */
export type PendingKnowledgeRecord =
  | (PendingKnowledgeRecordBase &
      Readonly<{
        recordType: "CERTIFICATE";
        name: string;
        expiresAt: Date | null;
      }>)
  | (PendingKnowledgeRecordBase &
      Readonly<{
        recordType: "CONTENT_LIBRARY_ITEM";
        title: string;
        titleAr: string | null;
      }>)
  | (PendingKnowledgeRecordBase &
      Readonly<{
        recordType: "METHODOLOGY_ASSET";
        title: string;
        titleAr: string | null;
      }>)
  | (PendingKnowledgeRecordBase &
      Readonly<{
        recordType: "PAST_PROJECT";
        title: string;
        titleAr: string | null;
      }>)
  | (PendingKnowledgeRecordBase &
      Readonly<{
        recordType: "STAFF_MEMBER";
        name: string;
        nameAr: string | null;
      }>);

/** Expiry column of the record, or the explicit no-expiry marker. */
export type KnowledgeQueueExpiry =
  | Readonly<{
      kind: "EXPIRY_DATE";
      /** ISO 8601 UTC expiry instant, exactly as stored. */
      date: string;
      /** True when the stored instant is at or before the injected clock. */
      expired: boolean;
    }>
  | Readonly<{ kind: "NO_EXPIRY"; markerKey: "knowledge_no_expiry" }>;

/** Supporting evidence document, or the explicit no-evidence marker. */
export type KnowledgeQueueEvidence =
  | Readonly<{
      kind: "EVIDENCE_DOCUMENT";
      documentId: string;
      version: number | null;
    }>
  | Readonly<{ kind: "NO_EVIDENCE"; markerKey: "knowledge_no_evidence" }>;

/** One normalized queue row carrying every field criterion 11.1 requires. */
export type KnowledgeQueueRow = Readonly<{
  recordType: KnowledgeQueueRecordType;
  id: string;
  /** Registered bilingual label of the record type. */
  recordTypeLabelKey: TranslationKey;
  titleAr: string;
  titleEn: string;
  submitterId: string | null;
  submitterName: string | null;
  /** Submission timestamp serialized as ISO 8601 UTC. */
  submittedAt: string;
  expiry: KnowledgeQueueExpiry;
  evidence: KnowledgeQueueEvidence;
}>;

/**
 * Bilingual titles of one record.
 *
 * A certificate stores a single `name` and the other models store an optional
 * Arabic variant. Where only one value is stored it is reproduced in both
 * languages exactly as the tenant entered it; no translation is synthesized
 * (requirement 18.7).
 */
export function knowledgeQueueTitles(
  record: PendingKnowledgeRecord
): Readonly<{ ar: string; en: string }> {
  switch (record.recordType) {
    case "CERTIFICATE":
      return { ar: record.name, en: record.name };
    case "STAFF_MEMBER":
      return { ar: record.nameAr ?? record.name, en: record.name };
    default:
      return { ar: record.titleAr ?? record.title, en: record.title };
  }
}

/** Expiry projection; only a certificate stores an expiry instant. */
export function knowledgeQueueExpiry(
  record: PendingKnowledgeRecord,
  now: Date
): KnowledgeQueueExpiry {
  const expiresAt = record.recordType === "CERTIFICATE" ? record.expiresAt : null;
  if (!expiresAt) {
    return { kind: "NO_EXPIRY", markerKey: "knowledge_no_expiry" };
  }
  return {
    kind: "EXPIRY_DATE",
    date: expiresAt.toISOString(),
    // Same boundary as `knowledge-eligibility.ts`: an instant at the clock is
    // already expired.
    expired: expiresAt.getTime() <= now.getTime(),
  };
}

/** Evidence projection; a pending record usually carries no binding yet. */
export function knowledgeQueueEvidence(
  record: PendingKnowledgeRecord
): KnowledgeQueueEvidence {
  const documentId = record.evidenceDocumentId?.trim();
  if (!documentId) {
    return { kind: "NO_EVIDENCE", markerKey: "knowledge_no_evidence" };
  }
  return {
    kind: "EVIDENCE_DOCUMENT",
    documentId,
    version: record.evidenceVersion ?? null,
  };
}

/**
 * Registered key the queue view renders for an expiry cell, or null when the
 * stored date carries no marker. Keeps the marker vocabulary closed and typed
 * so no view composes a literal (requirement 18.2).
 */
export function knowledgeQueueExpiryMarkerKey(
  expiry: KnowledgeQueueExpiry
): TranslationKey | null {
  if (expiry.kind === "NO_EXPIRY") return expiry.markerKey;
  return expiry.expired ? "knowledge_expired" : null;
}

/** Normalizes one persisted record into the shared queue row. */
export function projectKnowledgeQueueRow(
  record: PendingKnowledgeRecord,
  now: Date
): KnowledgeQueueRow {
  const titles = knowledgeQueueTitles(record);
  return {
    recordType: record.recordType,
    id: record.id,
    recordTypeLabelKey: getDynamicTranslationKey(
      "knowledgeRecord",
      record.recordType
    ),
    titleAr: titles.ar,
    titleEn: titles.en,
    submitterId: record.submittedById ?? record.submitter?.id ?? null,
    submitterName: record.submitter?.name ?? null,
    submittedAt: record.submittedAt.toISOString(),
    expiry: knowledgeQueueExpiry(record, now),
    evidence: knowledgeQueueEvidence(record),
  };
}

/* -------------------------------------------------------------------------- */
/* Merged ordering                                                            */
/* -------------------------------------------------------------------------- */

/** One position in the merged order: every sort key of criterion 11.6. */
export type KnowledgeQueuePosition = Readonly<{
  submittedAt: Date;
  recordType: KnowledgeQueueRecordType;
  id: string;
}>;

/**
 * Total order of the queue: submission timestamp descending, then record type
 * ascending, then identifier ascending. A negative result means `left` is
 * returned before `right`.
 */
export function compareKnowledgeQueuePositions(
  left: KnowledgeQueuePosition,
  right: KnowledgeQueuePosition
): number {
  const bySubmittedAt = right.submittedAt.getTime() - left.submittedAt.getTime();
  if (bySubmittedAt !== 0) return bySubmittedAt;
  if (left.recordType !== right.recordType) {
    return left.recordType < right.recordType ? -1 : 1;
  }
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

/** True when `candidate` sorts strictly after `after` in the merged order. */
export function isAfterKnowledgeQueuePosition(
  candidate: KnowledgeQueuePosition,
  after: KnowledgeQueuePosition | null
): boolean {
  if (!after) return true;
  return compareKnowledgeQueuePositions(candidate, after) > 0;
}

/**
 * Per-record-type keyset bound derived from a composite cursor.
 *
 * The merged order is evaluated one table at a time, so the record type of a
 * table is already fixed relative to the cursor's record type. That collapses
 * the three-key comparison into one of three bounds, each of which the adapter
 * expresses as an index-ordered predicate rather than an offset.
 */
export type KnowledgeQueueKeysetBound =
  /** No cursor: every pending row of the table qualifies. */
  | Readonly<{ kind: "UNBOUNDED" }>
  /** `submittedAt < cursor.submittedAt`. */
  | Readonly<{ kind: "STRICTLY_EARLIER"; submittedAt: Date }>
  /** `submittedAt <= cursor.submittedAt`. */
  | Readonly<{ kind: "EARLIER_OR_SAME_INSTANT"; submittedAt: Date }>
  /** `submittedAt < cursor.submittedAt OR (equal instant AND id > cursor.id)`. */
  | Readonly<{
      kind: "STRICTLY_EARLIER_OR_SAME_INSTANT_AFTER_ID";
      submittedAt: Date;
      id: string;
    }>;

export function knowledgeQueueKeysetBound(
  recordType: KnowledgeQueueRecordType,
  after: KnowledgeQueuePosition | null
): KnowledgeQueueKeysetBound {
  if (!after) return { kind: "UNBOUNDED" };
  if (recordType === after.recordType) {
    return {
      kind: "STRICTLY_EARLIER_OR_SAME_INSTANT_AFTER_ID",
      submittedAt: after.submittedAt,
      id: after.id,
    };
  }
  // A record type after the cursor's type also wins the tie at the same instant.
  return recordType > after.recordType
    ? { kind: "EARLIER_OR_SAME_INSTANT", submittedAt: after.submittedAt }
    : { kind: "STRICTLY_EARLIER", submittedAt: after.submittedAt };
}

/* -------------------------------------------------------------------------- */
/* Composite keyset cursor                                                    */
/* -------------------------------------------------------------------------- */

const knowledgeQueueCursorScopeSchema = z.object({
  workspaceId: z.string().min(1),
});

const knowledgeQueueCursorSortSchema = z.object({
  submittedAt: z.string().min(20).max(40),
  recordType: knowledgeQueueRecordTypeSchema,
  id: z.string().min(1).max(200),
});

/**
 * Versioned cursor over every sort key of the merged order, scoped to the
 * addressed workspace so a cursor issued for one tenant cannot be replayed
 * against another (design 3.3, criteria 11.6, 11.7).
 */
export const KNOWLEDGE_QUEUE_CURSOR_CODEC = createKeysetCursorCodec({
  resource: "knowledge-approval-queue",
  scopeSchema: knowledgeQueueCursorScopeSchema,
  sortSchema: knowledgeQueueCursorSortSchema,
});

export function encodeKnowledgeQueueCursor(
  workspaceId: string,
  position: KnowledgeQueuePosition
): string {
  return KNOWLEDGE_QUEUE_CURSOR_CODEC.encode({
    scope: { workspaceId },
    sort: {
      submittedAt: position.submittedAt.toISOString(),
      recordType: position.recordType,
      id: position.id,
    },
  });
}

/**
 * Decodes a cursor for one workspace, or returns null when it does not match
 * this resource, this workspace, or this ordering (criterion 11.6).
 */
export function decodeKnowledgeQueueCursor(
  cursor: string,
  workspaceId: string
): KnowledgeQueuePosition | null {
  try {
    const decoded = KNOWLEDGE_QUEUE_CURSOR_CODEC.decode(cursor, { workspaceId });
    const submittedAt = new Date(decoded.sort.submittedAt);
    if (!Number.isFinite(submittedAt.getTime())) return null;
    // A cursor is only deterministic when it round-trips the exact instant.
    if (submittedAt.toISOString() !== decoded.sort.submittedAt) return null;
    return {
      submittedAt,
      recordType: decoded.sort.recordType,
      id: decoded.sort.id,
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Persistence boundary                                                       */
/* -------------------------------------------------------------------------- */

export type KnowledgeQueueCounts = Readonly<
  Record<KnowledgeQueueRecordType, number>
>;

export type KnowledgeQueuePageQuery = Readonly<{
  /** Workspace resolved by Tenant_Context; every read is scoped to it. */
  workspaceId: string;
  /**
   * Rows to read per record type. The service asks for one more row than the
   * page needs, so a merged page of `limit - 1` rows can report a next page
   * without a second query.
   */
  limit: number;
  after: KnowledgeQueuePosition | null;
}>;

/**
 * Persistence boundary. An adapter must apply the workspace predicate, the
 * pending predicate, and the per-record-type keyset bound, and must return rows
 * of one record type in the merged order restricted to that type.
 */
export interface KnowledgeQueueRepository {
  listPendingRecords(
    query: KnowledgeQueuePageQuery
  ): Promise<readonly PendingKnowledgeRecord[]>;
  /** Pending row count per record type, independent of any page size. */
  countPendingRecords(
    query: Readonly<{ workspaceId: string }>
  ): Promise<KnowledgeQueueCounts>;
}

export type KnowledgeQueueServiceDependencies = Readonly<{
  repository: KnowledgeQueueRepository;
  clock?: UtcClock;
}>;

/* -------------------------------------------------------------------------- */
/* Commands and results                                                       */
/* -------------------------------------------------------------------------- */

export type ListKnowledgeQueueCommand = Readonly<{
  workspace: Readonly<{ id: string }>;
  /** Raw requested page size; clamped by `resolveKnowledgeQueuePageSize`. */
  pageSize?: unknown;
  cursor?: string | null;
}>;

export type ListKnowledgeQueueResult =
  | Readonly<{
      ok: true;
      status: 200;
      rows: readonly KnowledgeQueueRow[];
      nextCursor: string | null;
      hasMore: boolean;
      /** Total pending records of the workspace, independent of the page size. */
      total: number;
      counts: KnowledgeQueueCounts;
      pageSize: number;
    }>
  | Readonly<{ ok: false; status: 400; code: "INVALID_QUEUE_CURSOR" }>;

export interface KnowledgeQueueService {
  listPendingQueue(
    command: ListKnowledgeQueueCommand
  ): Promise<ListKnowledgeQueueResult>;
}

export function emptyKnowledgeQueueCounts(): KnowledgeQueueCounts {
  return KNOWLEDGE_QUEUE_RECORD_TYPES.reduce<Record<string, number>>(
    (counts, recordType) => {
      counts[recordType] = 0;
      return counts;
    },
    {}
  ) as KnowledgeQueueCounts;
}

export function totalKnowledgeQueueCount(counts: KnowledgeQueueCounts): number {
  return KNOWLEDGE_QUEUE_RECORD_TYPES.reduce(
    (total, recordType) => total + Math.max(0, counts[recordType] ?? 0),
    0
  );
}

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

type ProjectedEntry = Readonly<{
  row: KnowledgeQueueRow;
  position: KnowledgeQueuePosition;
}>;

export function createKnowledgeQueueService(
  dependencies: KnowledgeQueueServiceDependencies
): KnowledgeQueueService {
  const repository = dependencies.repository;
  const clock = dependencies.clock ?? systemUtcClock;

  async function listPendingQueue(
    command: ListKnowledgeQueueCommand
  ): Promise<ListKnowledgeQueueResult> {
    const workspaceId = command.workspace.id;
    const pageSize = resolveKnowledgeQueuePageSize(command.pageSize);

    let after: KnowledgeQueuePosition | null = null;
    const cursor =
      typeof command.cursor === "string" ? command.cursor.trim() : "";
    if (cursor.length > 0) {
      after = decodeKnowledgeQueueCursor(cursor, workspaceId);
      if (!after) {
        return { ok: false, status: 400, code: "INVALID_QUEUE_CURSOR" };
      }
    }

    const now = utcNow(clock);
    const [records, counts] = await Promise.all([
      repository.listPendingRecords({
        workspaceId,
        limit: pageSize + 1,
        after,
      }),
      repository.countPendingRecords({ workspaceId }),
    ]);

    const merged: ProjectedEntry[] = [];
    for (const record of records) {
      // Defense in depth: a row of another workspace, or a row at or before the
      // cursor, never reaches the page even if an adapter widened its predicate
      // (criteria 11.6, 11.7).
      if (record.workspaceId !== workspaceId) continue;
      const position: KnowledgeQueuePosition = {
        submittedAt: record.submittedAt,
        recordType: record.recordType,
        id: record.id,
      };
      if (!isAfterKnowledgeQueuePosition(position, after)) continue;
      merged.push({ row: projectKnowledgeQueueRow(record, now), position });
    }

    merged.sort((left, right) =>
      compareKnowledgeQueuePositions(left.position, right.position)
    );

    const page = merged.slice(0, pageSize);
    const hasMore = merged.length > pageSize;
    const last = page.at(-1);

    return {
      ok: true,
      status: 200,
      rows: page.map((entry) => entry.row),
      nextCursor:
        hasMore && last ? encodeKnowledgeQueueCursor(workspaceId, last.position) : null,
      hasMore,
      total: totalKnowledgeQueueCount(counts),
      counts,
      pageSize,
    };
  }

  return Object.freeze({ listPendingQueue });
}
