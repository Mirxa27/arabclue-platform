/**
 * Comment_Service amendment and reply-preserving deletion (design section 4.8,
 * requirements 12.1–12.6, 12.9–12.11).
 *
 * The lifecycle rules live here as pure decisions over an injected
 * `CommentRepository`, following `clause-library.ts` and `recovery-service.ts`:
 * the domain module holds no Prisma import, so unit tests drive the real rules
 * against an in-memory fake with no network call and no database write. The
 * production boundary is `comment-lifecycle-prisma.ts`.
 *
 * Rules this module owns:
 * - an amendment replaces content and sets an edited timestamp only; the author,
 *   creation timestamp, parent reference, and every reply row are untouched
 *   because the write input cannot address them (criterion 12.1);
 * - only the author may amend, whatever their workspace role (criterion 12.2);
 * - a resolved comment cannot be amended (criterion 12.6) and a withdrawn or
 *   foreign-workspace comment is a not-found result (criterion 12.11);
 * - deletion hard-deletes a leaf and withdraws a parent that has at least one
 *   direct reply, clearing content and mentions while keeping every descendant
 *   (criteria 12.3, 12.4);
 * - the owner/administrator override applies to deletion only (criterion 12.5).
 *
 * Every failure is a registered bilingual completion code; the route maps it
 * through the shared failure mapper and never composes a message itself
 * (requirements 18.4, 19.9).
 */

import { systemUtcClock, utcNow, type UtcClock } from "./time";
import type { CompletionErrorCode } from "./i18n";

/** Permitted trimmed amendment length (criteria 12.1, 12.10). */
export const COMMENT_CONTENT_MIN_LENGTH = 1;
export const COMMENT_CONTENT_MAX_LENGTH = 4_000;

/** Stored content of a withdrawn comment (criterion 12.4). */
export const WITHDRAWN_COMMENT_CONTENT = "";

/* -------------------------------------------------------------------------- */
/* Projections                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One stored comment as the lifecycle reads it.
 *
 * `directReplyCount` is the count of direct reply rows, which selects the
 * deletion branch in criteria 12.3 and 12.4.
 */
export type CommentProjection = Readonly<{
  id: string;
  proposalId: string;
  sectionKey: string | null;
  content: string;
  mentions: readonly string[];
  isResolved: boolean;
  isWithdrawn: boolean;
  parentId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  editedAt: Date | null;
  directReplyCount: number;
}>;

/** The caller, already resolved through Tenant_Context by the route. */
export type CommentActor = Readonly<{
  userId: string;
  /** Workspace resolved by Tenant_Context; every read and write is scoped to it. */
  workspaceId: string;
  /** Workspace membership role, recorded on the delete audit entry. */
  membershipRole: string;
  /** True for a workspace owner/administrator: deletion override only. */
  isWorkspaceManager: boolean;
}>;

export type CommentDeleteDisposition = "HARD_DELETED" | "WITHDRAWN";

/* -------------------------------------------------------------------------- */
/* Audit records                                                              */
/* -------------------------------------------------------------------------- */

export type CommentAuditAction = "COMMENT_EDIT" | "COMMENT_DELETE";

/**
 * Audit entry the repository appends inside the same transaction as the
 * mutation (criteria 12.3, 12.4, 12.5).
 *
 * The shape is built here so the Prisma adapter and the test fake record
 * identical content: actor identifier, comment identifier, proposal identifier,
 * and the acting role.
 */
export type CommentAuditRecord = Readonly<{
  action: CommentAuditAction;
  actorId: string;
  resource: "CollaborationComment";
  resourceId: string;
  details: Readonly<{
    commentId: string;
    proposalId: string;
    workspaceId: string;
    actorId: string;
    actingRole: string;
    managerOverride: boolean;
    disposition?: CommentDeleteDisposition;
    directReplyCount?: number;
  }>;
}>;

/** Audit content for an accepted amendment. */
export function commentEditAuditRecord(
  input: Readonly<{ comment: CommentProjection; actor: CommentActor }>
): CommentAuditRecord {
  return {
    action: "COMMENT_EDIT",
    actorId: input.actor.userId,
    resource: "CollaborationComment",
    resourceId: input.comment.id,
    details: {
      commentId: input.comment.id,
      proposalId: input.comment.proposalId,
      workspaceId: input.actor.workspaceId,
      actorId: input.actor.userId,
      actingRole: input.actor.membershipRole,
      managerOverride: false,
    },
  };
}

/** Audit content for a deletion, naming the disposition and the acting role. */
export function commentDeleteAuditRecord(
  input: Readonly<{
    comment: Pick<CommentProjection, "id" | "proposalId">;
    actor: CommentActor;
    disposition: CommentDeleteDisposition;
    directReplyCount: number;
  }>
): CommentAuditRecord {
  return {
    action: "COMMENT_DELETE",
    actorId: input.actor.userId,
    resource: "CollaborationComment",
    resourceId: input.comment.id,
    details: {
      commentId: input.comment.id,
      proposalId: input.comment.proposalId,
      workspaceId: input.actor.workspaceId,
      actorId: input.actor.userId,
      actingRole: input.actor.membershipRole,
      managerOverride: input.actor.isWorkspaceManager,
      disposition: input.disposition,
      directReplyCount: input.directReplyCount,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Persistence port                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Amendment write.
 *
 * Only `content` and `editedAt` are writable, so the immutable author, creation
 * timestamp, parent reference, and reply rows are preserved structurally
 * (criterion 12.1). `authorId` is a write predicate, not an assignment: the
 * update applies only while the stored row is still authored by that user and is
 * neither resolved nor withdrawn.
 */
export type AmendCommentWrite = Readonly<{
  commentId: string;
  workspaceId: string;
  authorId: string;
  content: string;
  editedAt: Date;
  audit: CommentAuditRecord;
}>;

export type AmendCommentOutcome =
  | Readonly<{ kind: "AMENDED"; comment: CommentProjection }>
  /**
   * The stored row no longer satisfies the amendment predicate. `comment` is the
   * row as re-read inside the same transaction, or `null` when it is gone, so the
   * service reclassifies the race deterministically.
   */
  | Readonly<{ kind: "STATE_CONFLICT"; comment: CommentProjection | null }>;

/**
 * Deletion write.
 *
 * The repository selects the branch atomically: it hard-deletes only while the
 * row has no direct reply, and otherwise withdraws it, clears its content, and
 * clears its mention list without touching a descendant. It appends the
 * `COMMENT_DELETE` audit entry in the same transaction as that mutation.
 */
export type DeleteCommentWrite = Readonly<{
  commentId: string;
  workspaceId: string;
  actor: CommentActor;
  deletedAt: Date;
}>;

export type DeleteCommentOutcome =
  | Readonly<{
      kind: CommentDeleteDisposition;
      comment: CommentProjection;
    }>
  /** Absent from the workspace, or already withdrawn (criterion 12.11). */
  | Readonly<{ kind: "NOT_FOUND" }>;

/**
 * Persistence boundary for the comment lifecycle.
 *
 * Every method resolves the comment through its proposal's workspace, so a
 * comment outside the resolved workspace is unreachable rather than filtered
 * after the fact (criteria 12.9, 19.5).
 */
export type CommentRepository = Readonly<{
  findCommentForMutation(
    input: Readonly<{ commentId: string; workspaceId: string }>
  ): Promise<CommentProjection | null>;
  amendComment(input: AmendCommentWrite): Promise<AmendCommentOutcome>;
  deleteComment(input: DeleteCommentWrite): Promise<DeleteCommentOutcome>;
}>;

/* -------------------------------------------------------------------------- */
/* Results                                                                    */
/* -------------------------------------------------------------------------- */

export type CommentFailureCode = Extract<
  CompletionErrorCode,
  | "COMMENT_CONTENT_INVALID"
  | "COMMENT_EDIT_FORBIDDEN"
  | "COMMENT_DELETE_FORBIDDEN"
  | "COMMENT_RESOLVED"
  | "COMMENT_NOT_FOUND"
>;

export type CommentFailure = Readonly<{
  ok: false;
  code: CommentFailureCode;
  /** Named values interpolated into the registered bilingual message. */
  values: Readonly<Record<string, string | number>>;
}>;

export type CommentAmendmentResult =
  | Readonly<{ ok: true; comment: CommentProjection }>
  | CommentFailure;

export type CommentDeletionResult =
  | Readonly<{
      ok: true;
      disposition: CommentDeleteDisposition;
      comment: CommentProjection;
    }>
  | CommentFailure;

function failure(
  code: CommentFailureCode,
  values: Readonly<Record<string, string | number>> = {}
): CommentFailure {
  return { ok: false, code, values };
}

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/** Mention list of a stored row, normalized to string identifiers. */
export function normalizeCommentMentions(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.length > 0
  );
}

export type CommentContentResult =
  | Readonly<{ ok: true; content: string }>
  | CommentFailure;

/**
 * Trims submitted amendment content and enforces the permitted length.
 *
 * A rejected value carries `COMMENT_CONTENT_INVALID` with the permitted bounds
 * so both locales state the same limits (criterion 12.10). The bound is checked
 * against the trimmed value, matching criterion 12.1.
 */
export function validateCommentContent(value: unknown): CommentContentResult {
  const bounds = {
    min: COMMENT_CONTENT_MIN_LENGTH,
    max: COMMENT_CONTENT_MAX_LENGTH,
  } as const;

  if (typeof value !== "string") return failure("COMMENT_CONTENT_INVALID", bounds);

  const content = value.trim();
  if (
    content.length < COMMENT_CONTENT_MIN_LENGTH ||
    content.length > COMMENT_CONTENT_MAX_LENGTH
  ) {
    return failure("COMMENT_CONTENT_INVALID", bounds);
  }

  return { ok: true, content };
}

/**
 * Deletion branch for a stored comment: a leaf is removed and a comment with at
 * least one direct reply is withdrawn (criteria 12.3, 12.4). Both persistence
 * implementations select their branch through this function, so the rule has one
 * definition.
 */
export function commentDeleteDisposition(
  directReplyCount: number
): CommentDeleteDisposition {
  return directReplyCount > 0 ? "WITHDRAWN" : "HARD_DELETED";
}

/**
 * Classifies a stored row against the amendment rules, in the order the
 * criteria establish: an absent or withdrawn row is not found (12.11), a
 * non-author is forbidden whatever their role (12.2), and a resolved comment is
 * a conflict (12.6).
 */
function classifyAmendmentTarget(
  comment: CommentProjection | null,
  actorId: string
): CommentFailure | null {
  if (!comment || comment.isWithdrawn) return failure("COMMENT_NOT_FOUND");
  if (comment.createdBy !== actorId) return failure("COMMENT_EDIT_FORBIDDEN");
  if (comment.isResolved) return failure("COMMENT_RESOLVED");
  return null;
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

export type AmendCommentCommand = Readonly<{
  repository: CommentRepository;
  actor: CommentActor;
  commentId: string;
  content: unknown;
  clock?: UtcClock;
}>;

/**
 * Amends one comment (criteria 12.1, 12.2, 12.6, 12.9, 12.10, 12.11).
 *
 * The content bound is checked before any tenant read so a rejected payload
 * touches no record. The repository write then carries the author, unresolved,
 * and not-withdrawn predicates, so a state change committed between the read and
 * the write cannot produce an amendment; that race is reclassified from the row
 * re-read inside the same transaction rather than reported as a generic error.
 */
export async function amendCollaborationComment(
  command: AmendCommentCommand
): Promise<CommentAmendmentResult> {
  const content = validateCommentContent(command.content);
  if (!content.ok) return content;

  const current = await command.repository.findCommentForMutation({
    commentId: command.commentId,
    workspaceId: command.actor.workspaceId,
  });

  const rejected = classifyAmendmentTarget(current, command.actor.userId);
  if (rejected) return rejected;
  if (!current) return failure("COMMENT_NOT_FOUND");

  const outcome = await command.repository.amendComment({
    commentId: current.id,
    workspaceId: command.actor.workspaceId,
    authorId: command.actor.userId,
    content: content.content,
    editedAt: utcNow(command.clock ?? systemUtcClock),
    audit: commentEditAuditRecord({ comment: current, actor: command.actor }),
  });

  if (outcome.kind === "AMENDED") {
    return { ok: true, comment: outcome.comment };
  }

  return (
    classifyAmendmentTarget(outcome.comment, command.actor.userId) ??
    failure("COMMENT_NOT_FOUND")
  );
}

export type DeleteCommentCommand = Readonly<{
  repository: CommentRepository;
  actor: CommentActor;
  commentId: string;
  clock?: UtcClock;
}>;

/**
 * Deletes one comment with reply preservation (criteria 12.3, 12.4, 12.5, 12.9,
 * 12.11).
 *
 * The resolved state of the target is irrelevant here: criterion 12.3 permits
 * deletion regardless of it. The owner/administrator override is applied only on
 * this path, so a manager still cannot amend another member's comment.
 */
export async function deleteCollaborationComment(
  command: DeleteCommentCommand
): Promise<CommentDeletionResult> {
  const current = await command.repository.findCommentForMutation({
    commentId: command.commentId,
    workspaceId: command.actor.workspaceId,
  });

  if (!current || current.isWithdrawn) return failure("COMMENT_NOT_FOUND");

  const isAuthor = current.createdBy === command.actor.userId;
  if (!isAuthor && !command.actor.isWorkspaceManager) {
    return failure("COMMENT_DELETE_FORBIDDEN");
  }

  const outcome = await command.repository.deleteComment({
    commentId: current.id,
    workspaceId: command.actor.workspaceId,
    actor: {
      ...command.actor,
      // A manager deleting their own comment is not an override.
      isWorkspaceManager: !isAuthor && command.actor.isWorkspaceManager,
    },
    deletedAt: utcNow(command.clock ?? systemUtcClock),
  });

  if (outcome.kind === "NOT_FOUND") return failure("COMMENT_NOT_FOUND");

  return {
    ok: true,
    disposition: outcome.kind,
    comment: outcome.comment,
  };
}
