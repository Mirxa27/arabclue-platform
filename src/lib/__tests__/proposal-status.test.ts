import { describe, expect, test } from "bun:test";
import {
  isProposalEditLocked,
  isProposalSubmitBlocked,
  PROPOSAL_EDIT_LOCKED_STATUSES,
  PROPOSAL_SUBMIT_BLOCKED_STATUSES,
} from "../proposal-status";

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

  test("edit-lock set matches the exported constant list", () => {
    for (const status of PROPOSAL_EDIT_LOCKED_STATUSES) {
      expect(isProposalEditLocked(status)).toBe(true);
    }
  });
});

describe("proposal submit blocking", () => {
  test("blocks resubmit while already in or past review", () => {
    expect(isProposalSubmitBlocked("IN_REVIEW")).toBe(true);
    expect(isProposalSubmitBlocked("REVIEW")).toBe(true);
    expect(isProposalSubmitBlocked("REVIEWED")).toBe(true);
    expect(isProposalSubmitBlocked("APPROVED")).toBe(true);
    expect(isProposalSubmitBlocked("EXPORTED")).toBe(true);
  });

  test("allows submit from draft/generated/rejected", () => {
    expect(isProposalSubmitBlocked("DRAFT")).toBe(false);
    expect(isProposalSubmitBlocked("GENERATED")).toBe(false);
    expect(isProposalSubmitBlocked("REJECTED")).toBe(false);
    expect(isProposalSubmitBlocked(null)).toBe(false);
  });

  test("submit-blocked set matches the exported constant list", () => {
    for (const status of PROPOSAL_SUBMIT_BLOCKED_STATUSES) {
      expect(isProposalSubmitBlocked(status)).toBe(true);
    }
  });

  test("REVIEWED blocks submit but remains editable until approval", () => {
    expect(isProposalSubmitBlocked("REVIEWED")).toBe(true);
    expect(isProposalEditLocked("REVIEWED")).toBe(false);
  });
});
