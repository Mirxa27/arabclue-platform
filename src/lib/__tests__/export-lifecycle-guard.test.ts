/**
 * Guard tests for the export lifecycle transition.
 *
 * Producing a download artifact is harmless; advancing a proposal from APPROVED
 * to EXPORTED is not. The transition ran inside a GET gated only by
 * requireSession, so it was reachable by browser prefetch, by a cross-origin
 * tag, and by a read-only REVIEWER. The route stays a GET because links,
 * iframes and in-app previews depend on it; the mutating branch is what is
 * now gated.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const source = readFileSync(
  join(REPO_ROOT, "src/app/api/proposals/[id]/download/route.ts"),
  "utf8"
);

describe("shouldMarkProposalExported requires an explicit mutation allowance", () => {
  test("mutationAllowed is part of the decision inputs", () => {
    expect(source).toContain("readonly mutationAllowed: boolean;");
  });

  test("the transition is gated on it first", () => {
    expect(source).toMatch(
      /return\s*\(\s*input\.mutationAllowed\s*&&\s*input\.policyRequestedTransition/
    );
  });

  test("the existing integrity preconditions are retained", () => {
    expect(source).toContain('input.currentStatus === "APPROVED"');
    expect(source).toContain("input.authoritative");
    expect(source).toContain("input.completeBoundReviewChain");
  });
});

describe("exportMutationAllowed", () => {
  test("requires a writer role so a REVIEWER can download but not export", () => {
    expect(source).toMatch(/if \(!canWriteRole\(role\)\) return false;/);
  });

  test("rejects a cross-origin request", () => {
    expect(source).toContain("sec-fetch-site");
    expect(source).toMatch(/site !== "same-origin"/);
  });

  test("rejects a prefetch", () => {
    expect(source).toContain("sec-purpose");
    expect(source).toMatch(/includes\("prefetch"\)/);
  });

  test("is wired into the transition decision", () => {
    expect(source).toContain(
      "mutationAllowed: exportMutationAllowed(req, session.user.role)"
    );
  });
});

describe("optimistic concurrency on the transition is preserved", () => {
  test("the update is still guarded and a lost race is a 409", () => {
    expect(source).toContain("EXPORT_STATE_CHANGED");
    expect(source).toMatch(/transition\.count !== 1/);
  });
});
