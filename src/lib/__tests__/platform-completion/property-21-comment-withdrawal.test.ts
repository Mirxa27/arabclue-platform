/**
 * Feature: platform-completion, Property 21: Parent withdrawal preserves replies
 */

import { describe, expect, test } from "bun:test";
import {
  WITHDRAWN_COMMENT_CONTENT,
  deleteCollaborationComment,
  type CommentActor,
} from "../../comment-lifecycle";
import { fixedUtcClock } from "../../time";
import { createFakeCommentRepository } from "../support/comment-fakes";

const WORKSPACE = "workspace-property-21";
const PROPOSAL = "proposal-property-21";
const AUTHOR = "user-author";
const DELETED_AT = new Date("2026-07-15T12:00:00.000Z");
const clock = fixedUtcClock(DELETED_AT);

function actor(): CommentActor {
  return {
    userId: AUTHOR,
    workspaceId: WORKSPACE,
    membershipRole: "MEMBER",
    isWorkspaceManager: false,
  };
}

describe("Feature: platform-completion, Property 21: Parent withdrawal preserves replies", () => {
  test("deleting a parent with replies withdraws parent and keeps descendants across 100+ trees", async () => {
    let cases = 0;

    for (let seed = 0; seed < 120; seed++) {
      const repository = createFakeCommentRepository();
      const replyCount = 1 + (seed % 4);
      const nested = seed % 2 === 0;

      const parent = repository.seedComment({
        id: `parent-${seed}`,
        proposalId: PROPOSAL,
        workspaceId: WORKSPACE,
        createdBy: AUTHOR,
        content: `Parent body ${seed}`,
        mentions: [`user-${seed % 3}`],
        parentId: null,
      });

      const replyIds: string[] = [];
      for (let r = 0; r < replyCount; r++) {
        const reply = repository.seedComment({
          id: `reply-${seed}-${r}`,
          proposalId: PROPOSAL,
          workspaceId: WORKSPACE,
          createdBy: `replier-${r}`,
          content: `Reply ${seed}.${r}`,
          parentId: parent.id,
        });
        replyIds.push(reply.id);

        if (nested) {
          repository.seedComment({
            id: `nested-${seed}-${r}`,
            proposalId: PROPOSAL,
            workspaceId: WORKSPACE,
            createdBy: `nested-${r}`,
            content: `Nested ${seed}.${r}`,
            parentId: reply.id,
          });
        }
      }

      const before = repository.rows().map((row) => ({
        id: row.id,
        content: row.content,
        parentId: row.parentId,
        isWithdrawn: row.isWithdrawn,
      }));

      const result = await deleteCollaborationComment({
        repository,
        actor: actor(),
        commentId: parent.id,
        clock,
      });
      expect(result.ok).toBe(true);

      const afterParent = repository.row(parent.id);
      expect(afterParent).not.toBeNull();
      expect(afterParent?.isWithdrawn).toBe(true);
      expect(afterParent?.content).toBe(WITHDRAWN_COMMENT_CONTENT);
      expect(afterParent?.mentions).toBeNull();

      for (const replyId of replyIds) {
        const reply = repository.row(replyId);
        expect(reply).not.toBeNull();
        expect(reply?.isWithdrawn).toBe(false);
        expect(reply?.parentId).toBe(parent.id);
        const prior = before.find((row) => row.id === replyId);
        expect(reply?.content).toBe(prior?.content);
      }

      if (nested) {
        for (let r = 0; r < replyCount; r++) {
          const nestedRow = repository.row(`nested-${seed}-${r}`);
          expect(nestedRow).not.toBeNull();
          expect(nestedRow?.isWithdrawn).toBe(false);
          expect(nestedRow?.parentId).toBe(`reply-${seed}-${r}`);
        }
      }

      cases += 1;
    }

    expect(cases).toBeGreaterThanOrEqual(100);
  });
});
