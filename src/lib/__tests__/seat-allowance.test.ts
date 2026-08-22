/**
 * Guard tests for seat capacity.
 *
 * Seat allowance is a billing control, so it has to apply wherever a
 * membership is created. The invitation flow enforced it; the direct-add path
 * on POST /api/workspaces created the WorkspaceMember row itself and skipped
 * it, so a manager could grow a workspace past its plan simply by using that
 * endpoint instead of sending an invitation.
 *
 * The rule now lives in one exported predicate rather than a closure inside
 * the invitation service.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isSeatAllowanceExhausted } from "@/lib/invitation-service";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

describe("isSeatAllowanceExhausted", () => {
  test("an unbounded plan is never exhausted", () => {
    expect(
      isSeatAllowanceExhausted({
        seatAllowance: null,
        memberCount: 9999,
        pendingInvitationCount: 9999,
      })
    ).toBe(false);
  });

  test.each([0, -1, 1.5, Number.NaN])(
    "a non-positive or non-integral allowance (%p) is treated as unbounded",
    (allowance) => {
      expect(
        isSeatAllowanceExhausted({
          seatAllowance: allowance,
          memberCount: 100,
          pendingInvitationCount: 0,
        })
      ).toBe(false);
    }
  );

  test("members alone can exhaust the allowance", () => {
    expect(
      isSeatAllowanceExhausted({
        seatAllowance: 3,
        memberCount: 3,
        pendingInvitationCount: 0,
      })
    ).toBe(true);
  });

  test("pending invitations count against the allowance", () => {
    expect(
      isSeatAllowanceExhausted({
        seatAllowance: 3,
        memberCount: 2,
        pendingInvitationCount: 1,
      })
    ).toBe(true);
  });

  test("there is room below the allowance", () => {
    expect(
      isSeatAllowanceExhausted({
        seatAllowance: 3,
        memberCount: 1,
        pendingInvitationCount: 1,
      })
    ).toBe(false);
  });

  test("a negative pending adjustment frees a seat", () => {
    // Used when re-issuing an invitation that already occupies a seat.
    expect(
      isSeatAllowanceExhausted(
        { seatAllowance: 3, memberCount: 2, pendingInvitationCount: 1 },
        -1
      )
    ).toBe(false);
  });
});

describe("every membership-creating path enforces capacity", () => {
  test("the direct-add endpoint checks before creating", () => {
    const source = readFileSync(
      join(REPO_ROOT, "src/app/api/workspaces/route.ts"),
      "utf8"
    );
    expect(source).toContain("isSeatAllowanceExhausted");
    expect(source).toContain("SEAT_LIMIT_REACHED");

    const checkAt = source.indexOf("isSeatAllowanceExhausted");
    const createAt = source.indexOf("db.workspaceMember.create(");
    expect(checkAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(-1);
    expect(checkAt).toBeLessThan(createAt);
  });

  test("the invitation service uses the same shared predicate", () => {
    const source = readFileSync(
      join(REPO_ROOT, "src/lib/invitation-service.ts"),
      "utf8"
    );
    expect(source).toContain("export function isSeatAllowanceExhausted");
    // No second copy of the rule.
    const definitions = source.match(/function isSeatAllowanceExhausted/g) ?? [];
    expect(definitions).toHaveLength(1);
  });
});
