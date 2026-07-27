/**
 * Production persistence adapter for the Comment_Service lifecycle (design
 * section 4.8, requirements 12.1–12.5, 12.9, 12.11, 16.2).
 *
 * This module owns the single external boundary the lifecycle declares —
 * PostgreSQL through Prisma — so the rules in `comment-lifecycle.ts` stay driven
 * by an injected repository and unit tests exercise them against in-memory
 * fakes, following `clause-library-prisma.ts` and `recovery-service-prisma.ts`.
 *
 * Two properties are structural here rather than checked after the fact:
 *
 * - **Tenant scope.** Every read and every write carries
 *   `proposal: { workspaceId }`, so a comment whose proposal belongs to another
 *   workspace cannot be read, amended, or deleted at all (criteria 12.9, 19.5).
 * - **Atomicity.** Each mutation and its audit entry run in one
 *   `$transaction`, so a failed audit append rolls the mutation back and no
 *   deletion is ever recorded without its `COMMENT_DELETE` entry (criteria 12.3,
 *   12.4, 12.5).
 *
 * Concurrency is handled by write predicates instead of a lock: the amendment
 * predicate pins author, unresolved, and not-withdrawn state, and the leaf delete
 * predicate pins "has no reply" through a relation filter, so a reply committed
 * between the read and the write turns the delete into a withdrawal rather than
 * orphaning descendants.
 *
 * A missing table or column surfaces as the typed schema-pending failure, which
 * the shared mapper turns into HTTP 503 `SCHEMA_MIGRATION_PENDING` naming the
 * relation (requirements 16.2, 16.7).
 */

import { Prisma } from "@prisma/client";
import { db } from "./db";
import { asSchemaMigrationPendingError } from "./api-failure";
import {
  WITHDRAWN_COMMENT_CONTENT,
  commentDeleteAuditRecord,
  commentDeleteDisposition,
  normalizeCommentMentions,
  type AmendCommentOutcome,
  type AmendCommentWrite,
  type CommentAuditRecord,
  type CommentProjection,
  type CommentRepository,
  type DeleteCommentOutcome,
  type DeleteCommentWrite,
} from "./comment-lifecycle";

type PrismaClientLike = typeof db;
type PrismaTransaction = Parameters<
  Parameters<PrismaClientLike["$transaction"]>[0]
>[0];

const commentSelect = {
  id: true,
  proposalId: true,
  sectionKey: true,
  content: true,
  mentions: true,
  isResolved: true,
  isWithdrawn: true,
  parentId: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  editedAt: true,
  _count: { select: { replies: true } },
} as const;

/**
 * The selected row shape. `mentions` stays `unknown` because it is stored as
 * JSON; `normalizeCommentMentions` owns the conversion.
 */
type CommentRow = Readonly<{
  id: string;
  proposalId: string;
  sectionKey: string | null;
  content: string;
  mentions: unknown;
  isResolved: boolean;
  isWithdrawn: boolean;
  parentId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  editedAt: Date | null;
  _count: Readonly<{ replies: number }>;
}>;

function toProjection(row: CommentRow): CommentProjection {
  return {
    id: row.id,
    proposalId: row.proposalId,
    sectionKey: row.sectionKey,
    content: row.content,
    mentions: normalizeCommentMentions(row.mentions),
    isResolved: row.isResolved,
    isWithdrawn: row.isWithdrawn,
    parentId: row.parentId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    editedAt: row.editedAt,
    directReplyCount: row._count.replies,
  };
}

/**
 * Tenant-scoped read: the workspace predicate lives on the parent proposal, so a
 * comment of another workspace is never returned.
 *
 * The parameter is the transaction client type; the full client satisfies it, so
 * the same read serves both a standalone lookup and a read inside a transaction.
 */
async function readScopedComment(
  client: PrismaTransaction,
  commentId: string,
  workspaceId: string
): Promise<CommentProjection | null> {
  const row = await client.collaborationComment.findFirst({
    where: { id: commentId, proposal: { workspaceId } },
    select: commentSelect,
  });
  return row ? toProjection(row) : null;
}

/** Appends one audit entry inside the caller's transaction. */
async function appendAuditEntry(
  tx: PrismaTransaction,
  record: CommentAuditRecord,
  occurredAt: Date
): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: record.actorId,
      action: record.action,
      resource: record.resource,
      resourceId: record.resourceId,
      details: JSON.stringify(record.details),
      severity: "INFO",
      success: true,
      createdAt: occurredAt,
    },
  });
}

/**
 * Prisma-backed comment lifecycle persistence.
 *
 * The returned repository is the only production implementation of
 * `CommentRepository`; route handlers depend on the port, not on this module.
 */
export function createPrismaCommentRepository(
  client: PrismaClientLike = db
): CommentRepository {
  return Object.freeze({
    async findCommentForMutation(
      input: Readonly<{ commentId: string; workspaceId: string }>
    ): Promise<CommentProjection | null> {
      return withMappedFailures(() =>
        readScopedComment(client, input.commentId, input.workspaceId)
      );
    },

    async amendComment(input: AmendCommentWrite): Promise<AmendCommentOutcome> {
      return withMappedFailures(() =>
        client.$transaction(async (tx) => {
          // Only `content` and `editedAt` are assignable, so the author,
          // creation timestamp, parent reference, and reply rows are preserved
          // structurally (criterion 12.1). The predicate re-checks authorship and
          // state inside the transaction (criteria 12.2, 12.6, 12.11).
          const amended = await tx.collaborationComment.updateMany({
            where: {
              id: input.commentId,
              proposal: { workspaceId: input.workspaceId },
              createdBy: input.authorId,
              isResolved: false,
              isWithdrawn: false,
            },
            data: { content: input.content, editedAt: input.editedAt },
          });

          const current = await readScopedComment(
            tx,
            input.commentId,
            input.workspaceId
          );

          if (amended.count !== 1 || !current) {
            return { kind: "STATE_CONFLICT" as const, comment: current };
          }

          await appendAuditEntry(tx, input.audit, input.editedAt);
          return { kind: "AMENDED" as const, comment: current };
        })
      );
    },

    async deleteComment(
      input: DeleteCommentWrite
    ): Promise<DeleteCommentOutcome> {
      return withMappedFailures(() =>
        client.$transaction(async (tx) => {
          const current = await readScopedComment(
            tx,
            input.commentId,
            input.workspaceId
          );
          if (!current || current.isWithdrawn) {
            return { kind: "NOT_FOUND" as const };
          }

          if (
            commentDeleteDisposition(current.directReplyCount) ===
            "HARD_DELETED"
          ) {
            // `replies: { none: {} }` makes the leaf branch atomic: a reply
            // committed after the read leaves this delete without effect, and the
            // withdrawal branch below then preserves the tree (criterion 12.4).
            const removed = await tx.collaborationComment.deleteMany({
              where: {
                id: current.id,
                proposal: { workspaceId: input.workspaceId },
                isWithdrawn: false,
                replies: { none: {} },
              },
            });

            if (removed.count === 1) {
              await appendAuditEntry(
                tx,
                commentDeleteAuditRecord({
                  comment: current,
                  actor: input.actor,
                  disposition: "HARD_DELETED",
                  directReplyCount: 0,
                }),
                input.deletedAt
              );
              return { kind: "HARD_DELETED" as const, comment: current };
            }
          }

          const withdrawn = await tx.collaborationComment.updateMany({
            where: {
              id: current.id,
              proposal: { workspaceId: input.workspaceId },
              isWithdrawn: false,
            },
            data: {
              isWithdrawn: true,
              content: WITHDRAWN_COMMENT_CONTENT,
              // Clears the mention list; the projection reports it as empty.
              mentions: Prisma.DbNull,
            },
          });
          if (withdrawn.count !== 1) return { kind: "NOT_FOUND" as const };

          const stored = await readScopedComment(
            tx,
            current.id,
            input.workspaceId
          );
          if (!stored) return { kind: "NOT_FOUND" as const };

          await appendAuditEntry(
            tx,
            commentDeleteAuditRecord({
              comment: stored,
              actor: input.actor,
              disposition: "WITHDRAWN",
              directReplyCount: stored.directReplyCount,
            }),
            input.deletedAt
          );
          return { kind: "WITHDRAWN" as const, comment: stored };
        })
      );
    },
  });
}

/** A missing relation or column becomes the typed schema-pending failure. */
async function withMappedFailures<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const pending = asSchemaMigrationPendingError(error);
    if (pending) throw pending;
    throw error;
  }
}
