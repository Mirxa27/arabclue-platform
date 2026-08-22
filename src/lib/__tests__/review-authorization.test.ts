/**
 * Guard tests for review separation of duties.
 *
 * Authorization for a review decision is by assignment: `decideProposalReview`
 * rejects a caller who is not the review's `reviewerId`. That makes the
 * *assignment* the real control, and the assignment comes from the workspace
 * approval policy. Editing that policy therefore has to be a manager-only
 * action — otherwise any member who can author a proposal could name themselves
 * sole approver and approve their own submission.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

const read = (relativePath: string) =>
  readFileSync(join(REPO_ROOT, relativePath), "utf8");

describe("approval policy is manager-only", () => {
  const source = read("src/app/api/approval-policy/route.ts");

  test("PUT requires a workspace manager role", () => {
    expect(source).toContain("requireWorkspaceRole");
    expect(source).toContain("WORKSPACE_MANAGER_ROLES");
  });

  test("the manager check is applied before the policy is parsed or written", () => {
    const guardAt = source.indexOf("requireWorkspaceRole");
    const writeAt = source.indexOf("approvalStep.createMany");
    const parseAt = source.indexOf("parseJsonBody");
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(parseAt);
    expect(guardAt).toBeLessThan(writeAt);
  });

  test("GET stays readable by any member", () => {
    // Members need to see who approves their work.
    expect(source).toMatch(/export async function GET[\s\S]*?withTenant\("session"/);
  });
});

describe("review decisions are bound to the assigned reviewer", () => {
  const source = read("src/lib/proposal-review-service.ts");

  test("a caller who is not the assigned reviewer is rejected", () => {
    expect(source).toContain("REVIEW_REVIEWER_MISMATCH");
    expect(source).toMatch(/review\.reviewerId\s*!==\s*input\.reviewerId/);
  });

  test("the reviewer check runs inside the decision transaction", () => {
    const txAt = source.indexOf("db.$transaction");
    const checkAt = source.indexOf("REVIEW_REVIEWER_MISMATCH");
    expect(txAt).toBeGreaterThan(-1);
    expect(checkAt).toBeGreaterThan(txAt);
  });

  test("a decided review cannot be decided again", () => {
    expect(source).toContain("REVIEW_ALREADY_DECIDED");
  });

  test("content changed after submission invalidates the decision", () => {
    expect(source).toContain("REVIEW_STATE_CHANGED");
  });
});
