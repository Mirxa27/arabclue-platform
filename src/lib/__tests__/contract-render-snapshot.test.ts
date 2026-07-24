import { describe, expect, test } from "bun:test";
import {
  ContractRenderSnapshotError,
  contractExportOptionsFromSnapshot,
  createContractRenderSnapshot,
  validatePersistedContractRenderSnapshot,
} from "../contract-render-snapshot";
import {
  proposalMatchesReviewBinding,
  proposalReviewBinding,
} from "../proposal-review-integrity";

function source() {
  return {
    proposal: {
      id: "contract-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      type: "CONTRACT",
      title: "Services Contract",
      titleAr: "عقد الخدمات",
      contentMd: `# DRAFT CONTRACT | مسودة عقد

### Article 1 — Contractor obligations | المادة 1 — التزامات المتعاقد
:::en
The Contractor shall operate the service.
:::
:::ar
يلتزم المتعاقد بتشغيل الخدمة.
:::`,
      locale: "ar",
      version: 4,
      artifactsJson: JSON.stringify({
        milestones: [{ title: "Production launch", weeks: 8 }],
      }),
    },
    project: {
      id: "project-1",
      title: "Digital services",
      etimadRef: "ETIMAD-42",
      updatedAt: new Date("2026-07-24T10:00:00.000Z"),
    },
    workspace: {
      id: "workspace-1",
      name: "Arabclue Bidder",
      nameAr: "مقدم العرض",
      crNumber: "1010000000",
      vatNumber: "310000000000003",
    },
    brand: {
      id: "brand-1",
      logoUrl: "/uploads/workspace-1/logo.svg",
      primaryColor: "#173F5F",
      secondaryColor: "#132238",
      accentColor: "#D68C20",
      fontFamily: "IBM Plex Sans Arabic",
      tagline: "Trusted delivery",
      taglineAr: "تنفيذ موثوق",
    },
    obligationStates: [
      { obligationId: "article-1", status: "done" },
      { obligationId: "milestone-1", status: "open" },
    ],
  };
}

describe("immutable contract render snapshots", () => {
  test("captures every contract renderer input and validates its canonical binding", () => {
    const canonical = createContractRenderSnapshot(source(), {
      revision: 3,
      capturedAt: new Date("2026-07-24T12:00:00.000Z"),
    });

    expect(canonical.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(canonical.snapshot).toMatchObject({
      schemaVersion: 1,
      snapshotRevision: 3,
      proposal: {
        id: "contract-1",
        title: "Services Contract",
        version: 4,
      },
      project: {
        id: "project-1",
        title: "Digital services",
        etimadRef: "ETIMAD-42",
      },
      workspace: {
        name: "Arabclue Bidder",
        crNumber: "1010000000",
        vatNumber: "310000000000003",
      },
      brand: {
        profileId: "brand-1",
        primaryColor: "#173F5F",
      },
      milestones: [{ title: "Production launch", weeks: 8 }],
    });
    expect(canonical.snapshot.obligations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "article-1", status: "done" }),
        expect.objectContaining({
          id: "milestone-1",
          status: "open",
        }),
      ])
    );
    expect(
      validatePersistedContractRenderSnapshot(canonical.snapshot, {
        proposalId: "contract-1",
        hash: canonical.hash,
        revision: 3,
      })
    ).toMatchObject({ ok: true });
  });

  test("rejects tampering, identity swaps, and stale revision metadata", () => {
    const canonical = createContractRenderSnapshot(source(), {
      revision: 3,
      capturedAt: new Date("2026-07-24T12:00:00.000Z"),
    });
    const tampered = {
      ...canonical.snapshot,
      workspace: {
        ...canonical.snapshot.workspace,
        name: "Changed after approval",
      },
    };

    expect(
      validatePersistedContractRenderSnapshot(tampered, {
        proposalId: "contract-1",
        hash: canonical.hash,
        revision: 3,
      })
    ).toMatchObject({
      ok: false,
      code: "CONTRACT_RENDER_SNAPSHOT_HASH_MISMATCH",
    });
    expect(
      validatePersistedContractRenderSnapshot(canonical.snapshot, {
        proposalId: "another-contract",
        hash: canonical.hash,
        revision: 3,
      })
    ).toMatchObject({
      ok: false,
      code: "CONTRACT_RENDER_SNAPSHOT_IDENTITY_MISMATCH",
    });
    expect(
      validatePersistedContractRenderSnapshot(canonical.snapshot, {
        proposalId: "contract-1",
        hash: canonical.hash,
        revision: 4,
      })
    ).toMatchObject({
      ok: false,
      code: "CONTRACT_RENDER_SNAPSHOT_REVISION_MISMATCH",
    });
  });

  test("final renderer options come only from the frozen snapshot", () => {
    const mutableSource = source();
    const canonical = createContractRenderSnapshot(mutableSource, {
      revision: 1,
      capturedAt: new Date("2026-07-24T12:00:00.000Z"),
    });
    mutableSource.project.title = "Mutated live project";
    mutableSource.workspace.name = "Mutated live company";
    mutableSource.brand.primaryColor = "#000000";
    mutableSource.proposal.contentMd = "Mutated live contract";

    expect(contractExportOptionsFromSnapshot(canonical.snapshot)).toMatchObject({
      title: "Services Contract",
      contentMd: expect.stringContaining("Contractor shall"),
      projectTitle: "Digital services",
      brand: { primaryColor: "#173F5F" },
      company: { name: "Arabclue Bidder" },
    });
  });

  test("binds contract approval rows to contract snapshot hash and revision", () => {
    const canonical = createContractRenderSnapshot(source(), {
      revision: 2,
      capturedAt: new Date("2026-07-24T12:00:00.000Z"),
    });
    const reviewState = {
      ...source().proposal,
      financialFormsJson: null,
      structuredSnapshot: null,
      structuredSnapshotHash: null,
      structuredSnapshotRevision: 0,
      contractRenderSnapshot: canonical.snapshot,
      contractRenderSnapshotHash: canonical.hash,
      contractRenderSnapshotRevision: canonical.revision,
    };
    const binding = proposalReviewBinding(reviewState);

    expect(binding).toMatchObject({
      submittedSnapshotHash: canonical.hash,
      submittedSnapshotRevision: 2,
    });
    expect(proposalMatchesReviewBinding(reviewState, binding)).toBe(true);
    expect(
      proposalMatchesReviewBinding(
        {
          ...reviewState,
          contractRenderSnapshotHash: `sha256:${"b".repeat(64)}`,
        },
        binding
      )
    ).toBe(false);
  });

  test("fails closed for non-contract, malformed artifact, and invalid obligation inputs", () => {
    const nonContract = source();
    nonContract.proposal.type = "PROPOSAL";
    expect(() =>
      createContractRenderSnapshot(nonContract, {
        revision: 1,
        capturedAt: new Date("2026-07-24T12:00:00.000Z"),
      })
    ).toThrow(ContractRenderSnapshotError);

    const malformedArtifacts = source();
    malformedArtifacts.proposal.artifactsJson = "{not-json";
    expect(() =>
      createContractRenderSnapshot(malformedArtifacts, {
        revision: 1,
        capturedAt: new Date("2026-07-24T12:00:00.000Z"),
      })
    ).toThrow("Contract artifacts must be valid JSON");

    const invalidObligation = source();
    invalidObligation.obligationStates = [
      { obligationId: "article-1", status: "pending" },
    ];
    expect(() =>
      createContractRenderSnapshot(invalidObligation, {
        revision: 1,
        capturedAt: new Date("2026-07-24T12:00:00.000Z"),
      })
    ).toThrow('Unsupported obligation state for "article-1"');
  });

  test("returns actionable validation diagnostics for missing and malformed snapshots", () => {
    expect(
      validatePersistedContractRenderSnapshot(null, {
        proposalId: "contract-1",
        hash: null,
        revision: 0,
      })
    ).toMatchObject({
      ok: false,
      code: "CONTRACT_RENDER_SNAPSHOT_REQUIRED",
    });
    expect(
      validatePersistedContractRenderSnapshot(
        {
          schemaVersion: 1,
          snapshotRevision: 1,
          proposal: { id: "contract-1" },
        },
        {
          proposalId: "contract-1",
          hash: `sha256:${"a".repeat(64)}`,
          revision: 1,
        }
      )
    ).toMatchObject({
      ok: false,
      code: "CONTRACT_RENDER_SNAPSHOT_INVALID",
    });
  });
});
