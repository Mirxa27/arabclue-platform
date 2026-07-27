/**
 * In-memory comment persistence fake for the platform-completion comment
 * lifecycle tests (design section 4.8, requirements 12.1–12.5, 12.9, 12.11).
 *
 * The store holds `CollaborationComment` rows across workspaces in one array and
 * the repository it exposes reproduces the Prisma adapter's behaviour: the
 * workspace predicate resolves through the parent proposal, the amendment write
 * assigns content and the edited timestamp only, the leaf delete carries the
 * "has no reply" predicate, and each mutation plus its audit entry commit
 * together or not at all. A test can therefore assert reply preservation, audit
 * atomicity, and tenant isolation instead of assuming them.
 *
 * This module is imported by path rather than re-exported from
 * `support/index.ts`, following `clause-fakes.ts`, so the shared barrel stays
 * free of domain modules. No test using this fake performs network or database
 * I/O.
 */

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
} from "../../comment-lifecycle";

export type FakeCommentRow = {
  id: string;
  proposalId: string;
  /** Workspace of the parent proposal; the repository resolves scope through it. */
  workspaceId: string;
  sectionKey: string | null;
  content: string;
  mentions: readonly string[] | null;
  isResolved: boolean;
  isWithdrawn: boolean;
  parentId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  editedAt: Date | null;
};

export type FakeAuditRow = Readonly<{
  record: CommentAuditRecord;
  occurredAt: Date;
}>;

export type FakeCommentRepository = CommentRepository &
  Readonly<{
    /** Every stored row, ordered by creation, as a defensive copy. */
    rows(): readonly FakeCommentRow[];
    row(id: string): FakeCommentRow | null;
    /** Audit entries appended by a committed mutation, in order. */
    readonly audits: readonly FakeAuditRow[];
    seedComment(row: Partial<FakeCommentRow> & { id: string }): FakeCommentRow;
    /**
     * Makes the next audit append throw, so a test can assert the mutation rolls
     * back with it.
     */
    failNextAudit(error?: Error): void;
    /**
     * Inserts a reply immediately before the next delete write, reproducing a
     * reply that landed after the lifecycle read the target as a leaf.
     */
    insertReplyBeforeNextDelete(row: Partial<FakeCommentRow> & { id: string }): void;
    /** Raises the given failure from the next repository call. */
    failNextOperation(error: Error): void;
  }>;

const DEFAULT_ROW: Omit<FakeCommentRow, "id"> = Object.freeze({
  proposalId: "proposal-1",
  workspaceId: "workspace-1",
  sectionKey: null,
  content: "Seeded comment body.",
  mentions: [],
  isResolved: false,
  isWithdrawn: false,
  parentId: null,
  createdBy: "user-author",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  editedAt: null,
});

function clone(row: FakeCommentRow): FakeCommentRow {
  return {
    ...row,
    mentions: row.mentions === null ? null : [...row.mentions],
    createdAt: new Date(row.createdAt.getTime()),
    updatedAt: new Date(row.updatedAt.getTime()),
    editedAt: row.editedAt === null ? null : new Date(row.editedAt.getTime()),
  };
}

export function createFakeCommentRepository(): FakeCommentRepository {
  const rows: FakeCommentRow[] = [];
  const audits: FakeAuditRow[] = [];
  let pendingAuditFailure: Error | null = null;
  let pendingOperationFailure: Error | null = null;
  let pendingReplyInsert: FakeCommentRow | null = null;

  const directReplyCount = (id: string): number =>
    rows.filter((row) => row.parentId === id).length;

  const scoped = (commentId: string, workspaceId: string): FakeCommentRow | null =>
    rows.find((row) => row.id === commentId && row.workspaceId === workspaceId) ??
    null;

  const project = (row: FakeCommentRow): CommentProjection => ({
    id: row.id,
    proposalId: row.proposalId,
    sectionKey: row.sectionKey,
    content: row.content,
    mentions: normalizeCommentMentions(row.mentions),
    isResolved: row.isResolved,
    isWithdrawn: row.isWithdrawn,
    parentId: row.parentId,
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt.getTime()),
    updatedAt: new Date(row.updatedAt.getTime()),
    editedAt: row.editedAt === null ? null : new Date(row.editedAt.getTime()),
    directReplyCount: directReplyCount(row.id),
  });

  /** Runs a write with all-or-nothing semantics over the row array and audits. */
  async function transaction<T>(body: () => Promise<T>): Promise<T> {
    const rowSnapshot = rows.map(clone);
    const auditSnapshot = [...audits];
    try {
      return await body();
    } catch (error) {
      rows.splice(0, rows.length, ...rowSnapshot);
      audits.splice(0, audits.length, ...auditSnapshot);
      throw error;
    }
  }

  function appendAudit(record: CommentAuditRecord, occurredAt: Date): void {
    if (pendingAuditFailure) {
      const failure = pendingAuditFailure;
      pendingAuditFailure = null;
      throw failure;
    }
    audits.push({ record, occurredAt: new Date(occurredAt.getTime()) });
  }

  function consumeOperationFailure(): void {
    if (!pendingOperationFailure) return;
    const failure = pendingOperationFailure;
    pendingOperationFailure = null;
    throw failure;
  }

  return Object.freeze({
    audits,

    rows: () => rows.map(clone),

    row: (id: string) => {
      const found = rows.find((row) => row.id === id);
      return found ? clone(found) : null;
    },

    seedComment: (row) => {
      const record: FakeCommentRow = { ...DEFAULT_ROW, ...row };
      rows.push(record);
      return clone(record);
    },

    failNextAudit: (error = new Error("audit append failed")) => {
      pendingAuditFailure = error;
    },

    insertReplyBeforeNextDelete: (row) => {
      pendingReplyInsert = { ...DEFAULT_ROW, ...row };
    },

    failNextOperation: (error: Error) => {
      pendingOperationFailure = error;
    },

    findCommentForMutation: async (
      input: Readonly<{ commentId: string; workspaceId: string }>
    ): Promise<CommentProjection | null> => {
      consumeOperationFailure();
      const row = scoped(input.commentId, input.workspaceId);
      return row ? project(row) : null;
    },

    amendComment: async (
      input: AmendCommentWrite
    ): Promise<AmendCommentOutcome> => {
      consumeOperationFailure();
      return transaction(async () => {
        const row = scoped(input.commentId, input.workspaceId);
        const matches =
          row !== null &&
          row.createdBy === input.authorId &&
          !row.isResolved &&
          !row.isWithdrawn;

        if (!row || !matches) {
          return { kind: "STATE_CONFLICT" as const, comment: row ? project(row) : null };
        }

        row.content = input.content;
        row.editedAt = new Date(input.editedAt.getTime());
        row.updatedAt = new Date(input.editedAt.getTime());

        appendAudit(input.audit, input.editedAt);
        return { kind: "AMENDED" as const, comment: project(row) };
      });
    },

    deleteComment: async (
      input: DeleteCommentWrite
    ): Promise<DeleteCommentOutcome> => {
      consumeOperationFailure();
      return transaction(async () => {
        const row = scoped(input.commentId, input.workspaceId);
        if (!row || row.isWithdrawn) return { kind: "NOT_FOUND" as const };

        const target = project(row);

        if (pendingReplyInsert) {
          rows.push(pendingReplyInsert);
          pendingReplyInsert = null;
        }

        if (
          commentDeleteDisposition(target.directReplyCount) === "HARD_DELETED" &&
          directReplyCount(row.id) === 0
        ) {
          const index = rows.findIndex((candidate) => candidate.id === row.id);
          rows.splice(index, 1);
          appendAudit(
            commentDeleteAuditRecord({
              comment: target,
              actor: input.actor,
              disposition: "HARD_DELETED",
              directReplyCount: 0,
            }),
            input.deletedAt
          );
          return { kind: "HARD_DELETED" as const, comment: target };
        }

        row.isWithdrawn = true;
        row.content = WITHDRAWN_COMMENT_CONTENT;
        row.mentions = null;
        row.updatedAt = new Date(input.deletedAt.getTime());

        const stored = project(row);
        appendAudit(
          commentDeleteAuditRecord({
            comment: stored,
            actor: input.actor,
            disposition: "WITHDRAWN",
            directReplyCount: stored.directReplyCount,
          }),
          input.deletedAt
        );
        return { kind: "WITHDRAWN" as const, comment: stored };
      });
    },
  });
}
