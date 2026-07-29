/**
 * Prisma adapter for KnowledgeDecisionRepository (requirements 11.2–11.5).
 *
 * Performs the serializable first-decision-wins transaction for every knowledge
 * record type. Missing schema objects become SCHEMA_MIGRATION_PENDING.
 */

import { db } from "./db";
import { asSchemaMigrationPendingError } from "./api-failure";
import {
  createKnowledgeDecisionService,
  type KnowledgeDecisionRepository,
  type KnowledgeDecisionSnapshot,
  type KnowledgeDecisionWrite,
  type KnowledgeDecisionWriteOutcome,
} from "./knowledge-decision";
import type { KnowledgeQueueRecordType } from "./knowledge-queue";

type PrismaClientLike = typeof db;

type DelegateName =
  | "certificate"
  | "contentLibraryItem"
  | "methodologyAsset"
  | "pastProject"
  | "staffMember";

function delegateFor(
  recordType: KnowledgeQueueRecordType
): DelegateName {
  switch (recordType) {
    case "CERTIFICATE":
      return "certificate";
    case "CONTENT_LIBRARY_ITEM":
      return "contentLibraryItem";
    case "METHODOLOGY_ASSET":
      return "methodologyAsset";
    case "PAST_PROJECT":
      return "pastProject";
    case "STAFF_MEMBER":
      return "staffMember";
  }
}

function snapshotFromRow(
  recordType: KnowledgeQueueRecordType,
  row: {
    id: string;
    decisionStatus: string;
    reviewedById: string | null;
    decisionAt: Date | null;
  }
): KnowledgeDecisionSnapshot {
  const status =
    row.decisionStatus === "APPROVED" || row.decisionStatus === "REJECTED"
      ? row.decisionStatus
      : "PENDING";
  return {
    recordType,
    recordId: row.id,
    status,
    reviewerId: row.reviewedById,
    decisionAt: row.decisionAt,
  };
}

async function withMappedFailures<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const pending = asSchemaMigrationPendingError(error);
    if (pending) throw pending;
    throw error;
  }
}

export function createPrismaKnowledgeDecisionRepository(
  client: PrismaClientLike = db
): KnowledgeDecisionRepository {
  return Object.freeze({
    async recordDecision(
      input: KnowledgeDecisionWrite
    ): Promise<KnowledgeDecisionWriteOutcome> {
      return withMappedFailures(async () => {
        return client.$transaction(
          async (tx) => {
            const name = delegateFor(input.recordType);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const model = (tx as any)[name] as {
              findFirst: (args: unknown) => Promise<{
                id: string;
                decisionStatus: string;
                reviewedById: string | null;
                decisionAt: Date | null;
                currentVersion?: number;
              } | null>;
              update: (args: unknown) => Promise<unknown>;
            };

            const existing = await model.findFirst({
              where: {
                id: input.recordId,
                workspaceId: input.workspaceId,
              },
              select: {
                id: true,
                decisionStatus: true,
                reviewedById: true,
                decisionAt: true,
              },
            });

            if (!existing) return { kind: "NOT_FOUND" as const };

            if (
              existing.decisionStatus === "APPROVED" ||
              existing.decisionStatus === "REJECTED"
            ) {
              return {
                kind: "ALREADY_DECIDED" as const,
                decision: snapshotFromRow(input.recordType, existing),
              };
            }

            if (input.decision.action === "APPROVE") {
              const evidenceDoc = await tx.uploadedDocument.findFirst({
                where: {
                  id: input.decision.evidenceDocumentId,
                  workspaceId: input.workspaceId,
                },
                select: { id: true, currentVersion: true },
              });
              if (!evidenceDoc) {
                return { kind: "NOT_FOUND" as const };
              }

              const version = await tx.documentVersion.findFirst({
                where: {
                  documentId: evidenceDoc.id,
                  version: evidenceDoc.currentVersion,
                },
                select: { version: true, checksum: true },
              });
              if (!version?.checksum) {
                return { kind: "EVIDENCE_VERSION_MISSING" as const };
              }

              const hasLegacyReview =
                input.recordType !== "STAFF_MEMBER";

              await model.update({
                where: { id: input.recordId },
                data: {
                  decisionStatus: "APPROVED",
                  reviewedById: input.reviewerId,
                  decisionAt: input.decidedAt,
                  decisionReasonAr: null,
                  decisionReasonEn: null,
                  evidenceDocumentId: evidenceDoc.id,
                  evidenceVersion: version.version,
                  evidenceChecksum: version.checksum,
                  ...(hasLegacyReview
                    ? {
                        approved: true,
                        reviewStatus: "APPROVED",
                        approvedAt: input.decidedAt,
                        revokedAt: null,
                        revokedById: null,
                        revocationReason: null,
                      }
                    : {}),
                },
              });

              return {
                kind: "DECIDED" as const,
                decision: {
                  recordType: input.recordType,
                  recordId: input.recordId,
                  status: "APPROVED",
                  reviewerId: input.reviewerId,
                  decisionAt: input.decidedAt,
                },
              };
            }

            const hasLegacyReview = input.recordType !== "STAFF_MEMBER";
            await model.update({
              where: { id: input.recordId },
              data: {
                decisionStatus: "REJECTED",
                reviewedById: input.reviewerId,
                decisionAt: input.decidedAt,
                decisionReasonAr: input.decision.reasonAr,
                decisionReasonEn: input.decision.reasonEn,
                ...(hasLegacyReview
                  ? {
                      approved: false,
                      reviewStatus: "REVOKED",
                      revokedAt: input.decidedAt,
                      revokedById: input.reviewerId,
                      revocationReason: input.decision.reasonEn,
                    }
                  : {}),
              },
            });

            return {
              kind: "DECIDED" as const,
              decision: {
                recordType: input.recordType,
                recordId: input.recordId,
                status: "REJECTED",
                reviewerId: input.reviewerId,
                decisionAt: input.decidedAt,
              },
            };
          },
          {
            isolationLevel: "Serializable",
            maxWait: 5_000,
            timeout: 10_000,
          }
        );
      });
    },
  });
}

export function createPrismaKnowledgeDecisionService(
  client: PrismaClientLike = db
) {
  return createKnowledgeDecisionService({
    repository: createPrismaKnowledgeDecisionRepository(client),
  });
}
