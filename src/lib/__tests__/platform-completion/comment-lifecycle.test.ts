/**
 * Feature: platform-completion — comment amendment and reply-preserving
 * deletion (requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.9, 12.10,
 * 12.11).
 *
 * Every test drives the real lifecycle commands against in-memory persistence
 * with a fixed UTC clock: no network call and no database write.
 */

import { describe, expect, test } from "bun:test";
import { Prisma } from "@prisma/client";
import {
  COMMENT_CONTENT_MAX_LENGTH,
  COMMENT_CONTENT_MIN_LENGTH,
  amendCollaborationComment,
  commentDeleteDisposition,
  deleteCollaborationComment,
  normalizeCommentMentions,
  validateCommentContent,
  type CommentActor,
} from "../../comment-lifecycle";
import { mapErrorToApiFailure, resolveFailureStatus } from "../../api-failure";
import { SchemaMigrationPendingError } from "../../prisma-missing-table";
import {
  getCompletionErrorContract,
  isCompletionErrorCode,
} from "../../i18n";
import { fixedUtcClock } from "../../time";
import {
  createFakeCommentRepository,
  type FakeCommentRepository,
} from "../support/comment-fakes";

const WORKSPACE = "workspace-1";
const OTHER_WORKSPACE = "workspace-2";
const PROPOSAL = "proposal-1";
const AUTHOR = "user-author";
const OTHER_MEMBER = "user-other";
const CREATED_AT = new Date("2026-01-01T00:00:00.000Z");
const EDITED_AT = new Date("2026-02-03T04:05:06.000Z");
const clock = fixedUtcClock(EDITED_AT);
const ARABIC = /[\u0600-\u06ff]/u;

function actor(overrides: Partial<CommentActor> = {}): CommentActor {
  return {
    userId: AUTHOR,
    workspaceId: WORKSPACE,
    membershipRole: "MEMBER",
    isWorkspaceManager: false,
    ...overrides,
  };
}

/** One root comment authored by AUTHOR, plus optional direct and nested replies. */
function seedThread(
  repository: FakeCommentRepository,
  options: Readonly<{
    resolved?: boolean;
    withdrawn?: boolean;
    replies?: number;
    nested?: boolean;
    workspaceId?: string;
    mentions?: readonly string[];
  }> = {}
) {
  const workspaceId = options.workspaceId ?? WORKSPACE;
  const root = repository.seedComment({
    id: "comment-root",
    proposalId: PROPOSAL,
    workspaceId,
    sectionKey: "scope",
    content: "Original body.",
    mentions: options.mentions ?? ["user-mentioned"],
    isResolved: options.resolved ?? false,
    isWithdrawn: options.withdrawn ?? false,
    createdBy: AUTHOR,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });

  for (let index = 0; index < (options.replies ?? 0); index += 1) {
    repository.seedComment({
      id: `comment-reply-${index + 1}`,
      proposalId: PROPOSAL,
      workspaceId,
      content: `Reply ${index + 1}.`,
      parentId: root.id,
      createdBy: OTHER_MEMBER,
      createdAt: new Date(CREATED_AT.getTime() + (index + 1) * 1_000),
      updatedAt: new Date(CREATED_AT.getTime() + (index + 1) * 1_000),
    });
  }

  if (options.nested) {
    repository.seedComment({
      id: "comment-reply-nested",
      proposalId: PROPOSAL,
      workspaceId,
      content: "Nested reply.",
      parentId: "comment-reply-1",
      createdBy: OTHER_MEMBER,
      createdAt: new Date(CREATED_AT.getTime() + 9_000),
      updatedAt: new Date(CREATED_AT.getTime() + 9_000),
    });
  }

  return root;
}

/** Every failure code is a registered bilingual completion code. */
function expectRegisteredFailure(code: string, values: Record<string, unknown>) {
  expect(isCompletionErrorCode(code)).toBe(true);
  if (!isCompletionErrorCode(code)) return;
  const contract = getCompletionErrorContract(code, values as never);
  expect(contract.message.ar.trim().length).toBeGreaterThan(0);
  expect(contract.message.en.trim().length).toBeGreaterThan(0);
  expect(ARABIC.test(contract.message.ar)).toBe(true);
  expect(contract.message.ar).not.toContain("{{");
  expect(contract.message.en).not.toContain("{{");
}

describe("content validation (criteria 12.1, 12.10)", () => {
  test("accepts a trimmed value inside the permitted bounds", () => {
    expect(validateCommentContent("  Amended body.  ")).toEqual({
      ok: true,
      content: "Amended body.",
    });
    expect(
      validateCommentContent("x".repeat(COMMENT_CONTENT_MAX_LENGTH))
    ).toEqual({ ok: true, content: "x".repeat(COMMENT_CONTENT_MAX_LENGTH) });
  });

  test("rejects an empty, whitespace-only, oversized, or non-string value", () => {
    for (const value of [
      "",
      "   \n\t ",
      "x".repeat(COMMENT_CONTENT_MAX_LENGTH + 1),
      42,
      null,
      undefined,
    ]) {
      const result = validateCommentContent(value);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.code).toBe("COMMENT_CONTENT_INVALID");
      expect(result.values).toEqual({
        min: COMMENT_CONTENT_MIN_LENGTH,
        max: COMMENT_CONTENT_MAX_LENGTH,
      });
      expectRegisteredFailure(result.code, result.values);
    }
  });

  test("states the permitted length as 1 to 4000 trimmed characters", () => {
    expect(COMMENT_CONTENT_MIN_LENGTH).toBe(1);
    expect(COMMENT_CONTENT_MAX_LENGTH).toBe(4_000);
    // Trailing whitespace beyond the bound is trimmed before the check.
    expect(
      validateCommentContent(`${"x".repeat(COMMENT_CONTENT_MAX_LENGTH)}   `).ok
    ).toBe(true);
  });
});

describe("amendment (criteria 12.1, 12.2, 12.6, 12.9, 12.10, 12.11)", () => {
  test("replaces content, sets the edited timestamp, and retains immutable fields", async () => {
    const repository = createFakeCommentRepository();
    seedThread(repository, { replies: 2, nested: true });

    const result = await amendCollaborationComment({
      repository,
      actor: actor(),
      commentId: "comment-root",
      content: "  Amended body.  ",
      clock,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.comment.content).toBe("Amended body.");
    expect(result.comment.editedAt?.toISOString()).toBe(EDITED_AT.toISOString());
    expect(result.comment.createdAt.toISOString()).toBe(
      CREATED_AT.toISOString()
    );
    expect(result.comment.createdBy).toBe(AUTHOR);
    expect(result.comment.parentId).toBeNull();
    expect(result.comment.sectionKey).toBe("scope");
    expect(result.comment.mentions).toEqual(["user-mentioned"]);
    // Direct and nested replies survive the amendment.
    expect(result.comment.directReplyCount).toBe(2);
    expect(repository.rows()).toHaveLength(4);

    const audits = repository.audits.filter(
      (entry) => entry.record.action === "COMMENT_EDIT"
    );
    expect(audits).toHaveLength(1);
    expect(audits[0].record.details).toMatchObject({
      commentId: "comment-root",
      proposalId: PROPOSAL,
      workspaceId: WORKSPACE,
      actorId: AUTHOR,
      managerOverride: false,
    });
  });

  test("rejects a non-author regardless of workspace role and mutates nothing", async () => {
    for (const membershipRole of ["MEMBER", "ADMIN", "OWNER"]) {
      const repository = createFakeCommentRepository();
      seedThread(repository);

      const result = await amendCollaborationComment({
        repository,
        actor: actor({
          userId: OTHER_MEMBER,
          membershipRole,
          isWorkspaceManager: membershipRole !== "MEMBER",
        }),
        commentId: "comment-root",
        content: "Hijacked body.",
        clock,
      });

      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.code).toBe("COMMENT_EDIT_FORBIDDEN");
      expect(resolveFailureStatus(result.code)).toBe(403);
      expectRegisteredFailure(result.code, result.values);

      const stored = repository.row("comment-root");
      expect(stored?.content).toBe("Original body.");
      expect(stored?.mentions).toEqual(["user-mentioned"]);
      expect(stored?.editedAt).toBeNull();
      expect(stored?.updatedAt.toISOString()).toBe(CREATED_AT.toISOString());
      expect(repository.audits).toHaveLength(0);
    }
  });

  test("rejects an amendment of a resolved comment with a conflict", async () => {
    const repository = createFakeCommentRepository();
    seedThread(repository, { resolved: true });

    const result = await amendCollaborationComment({
      repository,
      actor: actor(),
      commentId: "comment-root",
      content: "Amended body.",
      clock,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("COMMENT_RESOLVED");
    expect(resolveFailureStatus(result.code)).toBe(409);
    expectRegisteredFailure(result.code, result.values);
    expect(repository.row("comment-root")?.content).toBe("Original body.");
    expect(repository.row("comment-root")?.editedAt).toBeNull();
    expect(repository.audits).toHaveLength(0);
  });

  test("reports a withdrawn, unknown, or foreign-workspace comment as not found", async () => {
    const withdrawn = createFakeCommentRepository();
    seedThread(withdrawn, { withdrawn: true });

    const foreign = createFakeCommentRepository();
    seedThread(foreign, { workspaceId: OTHER_WORKSPACE });

    const unknown = createFakeCommentRepository();

    for (const repository of [withdrawn, foreign, unknown]) {
      const result = await amendCollaborationComment({
        repository,
        actor: actor(),
        commentId: "comment-root",
        content: "Amended body.",
        clock,
      });

      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.code).toBe("COMMENT_NOT_FOUND");
      expect(resolveFailureStatus(result.code)).toBe(404);
      expectRegisteredFailure(result.code, result.values);
      expect(repository.audits).toHaveLength(0);
    }

    expect(foreign.row("comment-root")?.content).toBe("Original body.");
  });

  test("validates content before reading any tenant record", async () => {
    const repository = createFakeCommentRepository();
    // Any repository read would raise this failure; a rejected payload must not
    // reach persistence at all.
    repository.failNextOperation(new Error("persistence must not be reached"));

    const result = await amendCollaborationComment({
      repository,
      actor: actor(),
      commentId: "comment-root",
      content: "   ",
      clock,
    });

    expect(result).toEqual({
      ok: false,
      code: "COMMENT_CONTENT_INVALID",
      values: {
        min: COMMENT_CONTENT_MIN_LENGTH,
        max: COMMENT_CONTENT_MAX_LENGTH,
      },
    });
  });

  test("rolls the amendment back when its audit entry cannot be appended", async () => {
    const repository = createFakeCommentRepository();
    seedThread(repository);
    repository.failNextAudit();

    await expect(
      amendCollaborationComment({
        repository,
        actor: actor(),
        commentId: "comment-root",
        content: "Amended body.",
        clock,
      })
    ).rejects.toThrow("audit append failed");

    expect(repository.row("comment-root")?.content).toBe("Original body.");
    expect(repository.row("comment-root")?.editedAt).toBeNull();
    expect(repository.audits).toHaveLength(0);
  });
});

describe("deletion (criteria 12.3, 12.4, 12.5, 12.9, 12.11)", () => {
  test("hard-deletes a leaf comment and audits the removal", async () => {
    const repository = createFakeCommentRepository();
    seedThread(repository);

    const result = await deleteCollaborationComment({
      repository,
      actor: actor(),
      commentId: "comment-root",
      clock,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.disposition).toBe("HARD_DELETED");
    expect(repository.row("comment-root")).toBeNull();
    expect(repository.rows()).toHaveLength(0);

    expect(repository.audits).toHaveLength(1);
    expect(repository.audits[0].record.action).toBe("COMMENT_DELETE");
    expect(repository.audits[0].record.details).toMatchObject({
      commentId: "comment-root",
      proposalId: PROPOSAL,
      actorId: AUTHOR,
      disposition: "HARD_DELETED",
    });
    expect(repository.audits[0].occurredAt.toISOString()).toBe(
      EDITED_AT.toISOString()
    );
  });

  test("hard-deletes a leaf comment whose resolved state is true", async () => {
    const repository = createFakeCommentRepository();
    seedThread(repository, { resolved: true });

    const result = await deleteCollaborationComment({
      repository,
      actor: actor(),
      commentId: "comment-root",
      clock,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.disposition).toBe("HARD_DELETED");
    expect(repository.row("comment-root")).toBeNull();
  });

  test("withdraws a parent, clears content and mentions, and preserves every reply", async () => {
    const repository = createFakeCommentRepository();
    seedThread(repository, { replies: 2, nested: true });
    const before = repository
      .rows()
      .filter((row) => row.id !== "comment-root");

    const result = await deleteCollaborationComment({
      repository,
      actor: actor(),
      commentId: "comment-root",
      clock,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.disposition).toBe("WITHDRAWN");
    expect(result.comment.isWithdrawn).toBe(true);
    expect(result.comment.content).toBe("");
    expect(result.comment.mentions).toEqual([]);
    expect(result.comment.createdAt.toISOString()).toBe(
      CREATED_AT.toISOString()
    );
    expect(result.comment.createdBy).toBe(AUTHOR);

    const stored = repository.row("comment-root");
    expect(stored?.isWithdrawn).toBe(true);
    expect(stored?.content).toBe("");
    expect(stored?.mentions).toBeNull();

    // Every direct and nested reply row is byte-identical to its seeded state.
    const after = repository.rows().filter((row) => row.id !== "comment-root");
    expect(after).toEqual(before);
    expect(after).toHaveLength(3);

    expect(repository.audits).toHaveLength(1);
    expect(repository.audits[0].record.details).toMatchObject({
      disposition: "WITHDRAWN",
      directReplyCount: 2,
    });
  });

  test("withdraws rather than orphans when a reply lands after the leaf read", async () => {
    const repository = createFakeCommentRepository();
    seedThread(repository);
    repository.insertReplyBeforeNextDelete({
      id: "comment-late-reply",
      proposalId: PROPOSAL,
      workspaceId: WORKSPACE,
      parentId: "comment-root",
      content: "Concurrent reply.",
      createdBy: OTHER_MEMBER,
    });

    const result = await deleteCollaborationComment({
      repository,
      actor: actor(),
      commentId: "comment-root",
      clock,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.disposition).toBe("WITHDRAWN");
    expect(repository.row("comment-root")?.isWithdrawn).toBe(true);
    expect(repository.row("comment-late-reply")?.parentId).toBe("comment-root");
  });

  test("lets a workspace owner or administrator delete any comment and records the acting role", async () => {
    for (const membershipRole of ["OWNER", "ADMIN"]) {
      const repository = createFakeCommentRepository();
      seedThread(repository, { replies: 1 });

      const result = await deleteCollaborationComment({
        repository,
        actor: actor({
          userId: OTHER_MEMBER,
          membershipRole,
          isWorkspaceManager: true,
        }),
        commentId: "comment-root",
        clock,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      // The reply-preserving rules apply to the manager path unchanged.
      expect(result.disposition).toBe("WITHDRAWN");
      expect(repository.row("comment-reply-1")?.content).toBe("Reply 1.");
      expect(repository.audits[0].record.details).toMatchObject({
        actorId: OTHER_MEMBER,
        actingRole: membershipRole,
        managerOverride: true,
        disposition: "WITHDRAWN",
      });
    }
  });

  test("records no manager override when a manager deletes their own comment", async () => {
    const repository = createFakeCommentRepository();
    seedThread(repository);

    const result = await deleteCollaborationComment({
      repository,
      actor: actor({ membershipRole: "OWNER", isWorkspaceManager: true }),
      commentId: "comment-root",
      clock,
    });

    expect(result.ok).toBe(true);
    expect(repository.audits[0].record.details).toMatchObject({
      actorId: AUTHOR,
      actingRole: "OWNER",
      managerOverride: false,
    });
  });

  test("rejects a non-author member without the manager override", async () => {
    const repository = createFakeCommentRepository();
    seedThread(repository, { replies: 1 });

    const result = await deleteCollaborationComment({
      repository,
      actor: actor({ userId: OTHER_MEMBER, membershipRole: "MEMBER" }),
      commentId: "comment-root",
      clock,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("COMMENT_DELETE_FORBIDDEN");
    expect(resolveFailureStatus(result.code)).toBe(403);
    expectRegisteredFailure(result.code, result.values);
    expect(repository.row("comment-root")?.content).toBe("Original body.");
    expect(repository.audits).toHaveLength(0);
  });

  test("reports an already withdrawn or foreign-workspace comment as not found", async () => {
    const withdrawn = createFakeCommentRepository();
    seedThread(withdrawn, { withdrawn: true });

    const foreign = createFakeCommentRepository();
    seedThread(foreign, { workspaceId: OTHER_WORKSPACE, replies: 1 });

    for (const repository of [withdrawn, foreign]) {
      const result = await deleteCollaborationComment({
        repository,
        actor: actor({ membershipRole: "OWNER", isWorkspaceManager: true }),
        commentId: "comment-root",
        clock,
      });

      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.code).toBe("COMMENT_NOT_FOUND");
      expect(resolveFailureStatus(result.code)).toBe(404);
      expect(repository.audits).toHaveLength(0);
    }

    expect(foreign.rows()).toHaveLength(2);
    expect(foreign.row("comment-root")?.isWithdrawn).toBe(false);
  });

  test("rolls the deletion back when its audit entry cannot be appended", async () => {
    const repository = createFakeCommentRepository();
    seedThread(repository, { replies: 1 });
    repository.failNextAudit();

    await expect(
      deleteCollaborationComment({
        repository,
        actor: actor(),
        commentId: "comment-root",
        clock,
      })
    ).rejects.toThrow("audit append failed");

    const stored = repository.row("comment-root");
    expect(stored?.isWithdrawn).toBe(false);
    expect(stored?.content).toBe("Original body.");
    expect(stored?.mentions).toEqual(["user-mentioned"]);
    expect(repository.audits).toHaveLength(0);
  });

  test("rolls a hard deletion back when its audit entry cannot be appended", async () => {
    const repository = createFakeCommentRepository();
    seedThread(repository);
    repository.failNextAudit();

    await expect(
      deleteCollaborationComment({
        repository,
        actor: actor(),
        commentId: "comment-root",
        clock,
      })
    ).rejects.toThrow("audit append failed");

    expect(repository.row("comment-root")?.content).toBe("Original body.");
    expect(repository.audits).toHaveLength(0);
  });
});

describe("failure surfacing (requirements 16.2, 18.4)", () => {
  test("maps a missing relation to 503 SCHEMA_MIGRATION_PENDING through the shared mapper", async () => {
    const repository = createFakeCommentRepository();
    seedThread(repository);
    repository.failNextOperation(
      new SchemaMigrationPendingError("CollaborationComment")
    );

    const failed = await amendCollaborationComment({
      repository,
      actor: actor(),
      commentId: "comment-root",
      content: "Amended body.",
      clock,
    }).then(
      () => null,
      (error: unknown) => mapErrorToApiFailure(error)
    );

    expect(failed?.status).toBe(503);
    expect(failed?.body.code).toBe("SCHEMA_MIGRATION_PENDING");
    expect(failed?.body.missingTable).toBe("CollaborationComment");
    expect(failed?.body.message.ar.trim().length).toBeGreaterThan(0);
    expect(failed?.body.message.en.trim().length).toBeGreaterThan(0);
  });

  test("maps a missing column reported by the driver to the same pending failure", async () => {
    const repository = createFakeCommentRepository();
    seedThread(repository);
    repository.failNextOperation(
      new Prisma.PrismaClientKnownRequestError(
        "The column `CollaborationComment.isWithdrawn` does not exist in the current database.",
        { code: "P2022", clientVersion: "test" }
      )
    );

    const failed = await deleteCollaborationComment({
      repository,
      actor: actor(),
      commentId: "comment-root",
      clock,
    }).then(
      () => null,
      (error: unknown) => mapErrorToApiFailure(error)
    );

    expect(failed?.status).toBe(503);
    expect(failed?.body.code).toBe("SCHEMA_MIGRATION_PENDING");
    // The raw driver message never reaches the client body.
    expect(JSON.stringify(failed?.body)).not.toContain("does not exist");
  });
});

describe("pure helpers", () => {
  test("selects the deletion branch from the direct reply count", () => {
    expect(commentDeleteDisposition(0)).toBe("HARD_DELETED");
    expect(commentDeleteDisposition(1)).toBe("WITHDRAWN");
    expect(commentDeleteDisposition(7)).toBe("WITHDRAWN");
  });

  test("normalizes a stored mention list to string identifiers", () => {
    expect(normalizeCommentMentions(["a", "b"])).toEqual(["a", "b"]);
    expect(normalizeCommentMentions(["a", 1, null, "", "b"])).toEqual(["a", "b"]);
    expect(normalizeCommentMentions(null)).toEqual([]);
    expect(normalizeCommentMentions({ a: 1 })).toEqual([]);
  });
});
