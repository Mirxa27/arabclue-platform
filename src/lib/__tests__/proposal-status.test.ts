import { describe, expect, test } from "bun:test";
import { isProposalEditLocked } from "../proposal-status";

describe("proposal edit locking", () => {
  test("locks review, approval, and export statuses", () => {
    expect(isProposalEditLocked("IN_REVIEW")).toBe(true);
    expect(isProposalEditLocked("REVIEW")).toBe(true);
    expect(isProposalEditLocked("APPROVED")).toBe(true);
    expect(isProposalEditLocked("EXPORTED")).toBe(true);
  });

  test("keeps editable draft statuses unlocked", () => {
    expect(isProposalEditLocked("DRAFT")).toBe(false);
    expect(isProposalEditLocked("GENERATED")).toBe(false);
    expect(isProposalEditLocked("REVIEWED")).toBe(false);
    expect(isProposalEditLocked(null)).toBe(false);
  });
});

