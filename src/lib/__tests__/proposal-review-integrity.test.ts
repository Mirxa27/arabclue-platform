import { describe, expect, test } from "bun:test";
import {
  computeProposalReviewSubmissionHash,
  proposalMatchesReviewBinding,
  proposalReviewBinding,
  type ProposalReviewState,
} from "../proposal-review-integrity";

function fixture(): ProposalReviewState {
  return {
    id: "proposal-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    title: "Technical proposal",
    titleAr: "العرض الفني",
    type: "TECHNICAL",
    version: 3,
    contentMd: "# Scope\nEvidence-bound response",
    locale: "ar",
    financialFormsJson:
      '{"currency":"SAR","boqItems":[{"qty":2,"unitPrice":50,"total":100}]}',
    structuredSnapshot: {
      schemaVersion: "1",
      sections: [{ id: "scope", text: "Evidence-bound response" }],
    },
    structuredSnapshotHash: "sha256:snapshot",
    structuredSnapshotRevision: 4,
  };
}

describe("proposal review state binding", () => {
  test("is deterministic across equivalent stored financial JSON", () => {
    const first = fixture();
    const second = {
      ...fixture(),
      financialFormsJson:
        '{ "boqItems": [{ "total": 100, "unitPrice": 50, "qty": 2 }], "currency": "SAR" }',
    };
    expect(computeProposalReviewSubmissionHash(first)).toBe(
      computeProposalReviewSubmissionHash(second)
    );
  });

  test("binds content, pricing, snapshot, title, locale, and version", () => {
    const proposal = fixture();
    const binding = proposalReviewBinding(proposal);
    expect(proposalMatchesReviewBinding(proposal, binding)).toBe(true);

    const mutations: ProposalReviewState[] = [
      { ...proposal, contentMd: "# Changed" },
      { ...proposal, financialFormsJson: '{"currency":"USD"}' },
      {
        ...proposal,
        structuredSnapshot: { schemaVersion: "1", sections: [] },
      },
      { ...proposal, structuredSnapshotHash: "sha256:changed" },
      { ...proposal, structuredSnapshotRevision: 5 },
      { ...proposal, title: "Changed title" },
      { ...proposal, locale: "en" },
      { ...proposal, version: 4 },
    ];
    for (const changed of mutations) {
      expect(proposalMatchesReviewBinding(changed, binding)).toBe(false);
    }
  });

  test("rejects legacy or incomplete review bindings", () => {
    const proposal = fixture();
    expect(
      proposalMatchesReviewBinding(proposal, {
        submissionHash: null,
        submittedProposalVersion: null,
        submittedSnapshotHash: null,
        submittedSnapshotRevision: null,
      })
    ).toBe(false);
  });
});
