import { describe, expect, test } from "bun:test";
import {
  resolveProposalDownloadFormat,
  resolveProposalExportLifecycle,
  shouldMarkProposalExported,
} from "../../app/api/proposals/[id]/download/route";

describe("proposal download format resolution", () => {
  test("defaults only an omitted format to the guarded ZIP path", () => {
    expect(resolveProposalDownloadFormat(null)).toBe("zip");
  });

  test("normalizes documented aliases", () => {
    expect(resolveProposalDownloadFormat("ea-matrix")).toBe("xlsx-matrix");
    expect(resolveProposalDownloadFormat("boq")).toBe("xlsx-boq");
  });

  test("rejects unknown values instead of falling through to ZIP generation", () => {
    expect(resolveProposalDownloadFormat("anything")).toBeNull();
    expect(resolveProposalDownloadFormat("ZIP")).toBeNull();
    expect(resolveProposalDownloadFormat("")).toBeNull();
  });

  test("labels only a validated final artifact as authoritative", () => {
    expect(
      resolveProposalExportLifecycle({
        proposalStatus: "APPROVED",
        finalArtifactRequested: true,
        hasValidatedRenderSnapshot: true,
      })
    ).toEqual({ authoritative: true, lifecycle: "APPROVED" });
    expect(
      resolveProposalExportLifecycle({
        proposalStatus: "EXPORTED",
        finalArtifactRequested: true,
        hasValidatedRenderSnapshot: true,
      })
    ).toEqual({ authoritative: true, lifecycle: "EXPORTED" });
    expect(
      resolveProposalExportLifecycle({
        proposalStatus: "DRAFT",
        finalArtifactRequested: true,
        hasValidatedRenderSnapshot: true,
      })
    ).toEqual({
      authoritative: false,
      lifecycle: "NON_AUTHORITATIVE_PREVIEW",
    });
  });

  test("promotes only an approved authoritative export with its bound review chain", () => {
    const approved = {
      mutationAllowed: true,
      policyRequestedTransition: true,
      currentStatus: "APPROVED",
      authoritative: true,
      completeBoundReviewChain: true,
    };
    expect(shouldMarkProposalExported(approved)).toBe(true);
    expect(
      shouldMarkProposalExported({
        ...approved,
        currentStatus: "DRAFT",
      })
    ).toBe(false);
    expect(
      shouldMarkProposalExported({
        ...approved,
        authoritative: false,
      })
    ).toBe(false);
    expect(
      shouldMarkProposalExported({
        ...approved,
        completeBoundReviewChain: false,
      })
    ).toBe(false);
  });

  // The download route is a GET because links, iframes and in-app previews
  // depend on it, so the artifact is reachable by prefetch, by a cross-origin
  // tag, and by a read-only REVIEWER. Producing it is harmless; advancing
  // APPROVED to EXPORTED is not.
  test("never promotes when the request may not mutate lifecycle state", () => {
    expect(
      shouldMarkProposalExported({
        mutationAllowed: false,
        policyRequestedTransition: true,
        currentStatus: "APPROVED",
        authoritative: true,
        completeBoundReviewChain: true,
      })
    ).toBe(false);
  });
});
