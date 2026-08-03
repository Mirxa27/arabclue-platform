/**
 * Prisma persistence for the normalized knowledge approval queue
 * (requirements 11.1, 11.6, 11.7).
 *
 * Every model query carries the resolved workspace, pending-state, and keyset
 * predicates. The pure service in `knowledge-queue.ts` owns normalization,
 * merged ordering, cursor validation, and page construction; this adapter only
 * translates those rules into bounded, index-ordered database reads.
 */

import { db } from "./db";
import { asSchemaMigrationPendingError } from "./api-failure";
import {
  KNOWLEDGE_DECISION_PENDING,
  KNOWLEDGE_LEGACY_REVIEW_UNREVIEWED,
  createKnowledgeQueueService,
  knowledgeQueueKeysetBound,
  type KnowledgeQueuePosition,
  type KnowledgeQueueRecordType,
  type KnowledgeQueueRepository,
  type PendingKnowledgeRecord,
} from "./knowledge-queue";

type PrismaClientLike = typeof db;

const commonSelect = {
  id: true,
  workspaceId: true,
  submittedAt: true,
  submittedById: true,
  submitter: { select: { id: true, name: true } },
  evidenceDocumentId: true,
  evidenceVersion: true,
} as const;

const legacyPendingWhere = {
  decisionStatus: KNOWLEDGE_DECISION_PENDING,
  reviewStatus: KNOWLEDGE_LEGACY_REVIEW_UNREVIEWED,
} as const;

const pendingWhere = {
  decisionStatus: KNOWLEDGE_DECISION_PENDING,
} as const;

/** Prisma predicate equivalent of one model's portion of the merged cursor. */
function keysetWhere(
  recordType: KnowledgeQueueRecordType,
  after: KnowledgeQueuePosition | null
) {
  const bound = knowledgeQueueKeysetBound(recordType, after);
  switch (bound.kind) {
    case "UNBOUNDED":
      return {};
    case "STRICTLY_EARLIER":
      return { submittedAt: { lt: bound.submittedAt } };
    case "EARLIER_OR_SAME_INSTANT":
      return { submittedAt: { lte: bound.submittedAt } };
    case "STRICTLY_EARLIER_OR_SAME_INSTANT_AFTER_ID":
      return {
        OR: [
          { submittedAt: { lt: bound.submittedAt } },
          { submittedAt: bound.submittedAt, id: { gt: bound.id } },
        ],
      };
  }
}

/**
 * Bounded Prisma implementation of the queue repository.
 *
 * Reading `limit` rows from every source is sufficient for a global page of
 * `limit` rows: no source can contribute more than that many rows to the merged
 * prefix. The service asks for page-size + 1 and performs the final merge/slice.
 */
export function createPrismaKnowledgeQueueRepository(
  client: PrismaClientLike = db
): KnowledgeQueueRepository {
  return Object.freeze({
    async listPendingRecords(query) {
      return withMappedFailures(async () => {
        const { workspaceId, limit, after } = query;
        const [
          certificates,
          contentLibraryItems,
          methodologyAssets,
          pastProjects,
          staffMembers,
        ] = await Promise.all([
          client.certificate.findMany({
            where: {
              workspaceId,
              ...legacyPendingWhere,
              ...keysetWhere("CERTIFICATE", after),
            },
            select: { ...commonSelect, name: true, expiresAt: true },
            orderBy: [{ submittedAt: "desc" }, { id: "asc" }],
            take: limit,
          }),
          client.contentLibraryItem.findMany({
            where: {
              workspaceId,
              ...legacyPendingWhere,
              ...keysetWhere("CONTENT_LIBRARY_ITEM", after),
            },
            select: { ...commonSelect, title: true, titleAr: true },
            orderBy: [{ submittedAt: "desc" }, { id: "asc" }],
            take: limit,
          }),
          client.methodologyAsset.findMany({
            where: {
              workspaceId,
              ...legacyPendingWhere,
              ...keysetWhere("METHODOLOGY_ASSET", after),
            },
            select: { ...commonSelect, title: true, titleAr: true },
            orderBy: [{ submittedAt: "desc" }, { id: "asc" }],
            take: limit,
          }),
          client.pastProject.findMany({
            where: {
              workspaceId,
              ...legacyPendingWhere,
              ...keysetWhere("PAST_PROJECT", after),
            },
            select: { ...commonSelect, title: true, titleAr: true },
            orderBy: [{ submittedAt: "desc" }, { id: "asc" }],
            take: limit,
          }),
          client.staffMember.findMany({
            where: {
              workspaceId,
              ...pendingWhere,
              ...keysetWhere("STAFF_MEMBER", after),
            },
            select: { ...commonSelect, name: true, nameAr: true },
            orderBy: [{ submittedAt: "desc" }, { id: "asc" }],
            take: limit,
          }),
        ]);

        const records: PendingKnowledgeRecord[] = [
          ...certificates.map((record) => ({
            ...record,
            recordType: "CERTIFICATE" as const,
          })),
          ...contentLibraryItems.map((record) => ({
            ...record,
            recordType: "CONTENT_LIBRARY_ITEM" as const,
          })),
          ...methodologyAssets.map((record) => ({
            ...record,
            recordType: "METHODOLOGY_ASSET" as const,
          })),
          ...pastProjects.map((record) => ({
            ...record,
            recordType: "PAST_PROJECT" as const,
          })),
          ...staffMembers.map((record) => ({
            ...record,
            recordType: "STAFF_MEMBER" as const,
          })),
        ];
        return records;
      });
    },

    async countPendingRecords({ workspaceId }) {
      return withMappedFailures(async () => {
        const [
          certificates,
          contentLibraryItems,
          methodologyAssets,
          pastProjects,
          staffMembers,
        ] = await Promise.all([
          client.certificate.count({
            where: { workspaceId, ...legacyPendingWhere },
          }),
          client.contentLibraryItem.count({
            where: { workspaceId, ...legacyPendingWhere },
          }),
          client.methodologyAsset.count({
            where: { workspaceId, ...legacyPendingWhere },
          }),
          client.pastProject.count({
            where: { workspaceId, ...legacyPendingWhere },
          }),
          client.staffMember.count({
            where: { workspaceId, ...pendingWhere },
          }),
        ]);

        return {
          CERTIFICATE: certificates,
          CONTENT_LIBRARY_ITEM: contentLibraryItems,
          METHODOLOGY_ASSET: methodologyAssets,
          PAST_PROJECT: pastProjects,
          STAFF_MEMBER: staffMembers,
        };
      });
    },
  });
}

/** Production service wiring used by the route handler. */
export function createPrismaKnowledgeQueueService(
  client: PrismaClientLike = db
) {
  return createKnowledgeQueueService({
    repository: createPrismaKnowledgeQueueRepository(client),
  });
}

/** A missing table or column becomes the shared HTTP 503 schema-pending error. */
async function withMappedFailures<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const pending = asSchemaMigrationPendingError(error);
    if (pending) throw pending;
    throw error;
  }
}
