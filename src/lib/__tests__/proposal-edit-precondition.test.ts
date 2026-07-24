import { describe, expect, test } from "bun:test";
import { matchesProposalEditPrecondition } from "../proposal-edit-precondition";

describe("proposal editor optimistic concurrency", () => {
  const state = {
    version: 4,
    updatedAt: new Date("2026-07-24T12:00:00.000Z"),
  };

  test("accepts only the exact loaded version and update timestamp", () => {
    expect(
      matchesProposalEditPrecondition(state, {
        version: 4,
        updatedAt: "2026-07-24T12:00:00.000Z",
      })
    ).toBe(true);
    expect(
      matchesProposalEditPrecondition(state, {
        version: 3,
        updatedAt: "2026-07-24T12:00:00.000Z",
      })
    ).toBe(false);
    expect(
      matchesProposalEditPrecondition(state, {
        version: 4,
        updatedAt: "2026-07-24T12:00:01.000Z",
      })
    ).toBe(false);
  });
});
