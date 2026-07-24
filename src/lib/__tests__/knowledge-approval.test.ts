import { describe, expect, test } from "bun:test";
import {
  approveKnowledgeContent,
  certificateKnowledgeContent,
  isKnowledgeHardDeleteAllowed,
  markKnowledgeContentUnreviewed,
  resolveKnowledgeApprovalEvidence,
  revokeKnowledgeContent,
} from "../knowledge-approval";

const content = { title: "ISO 27001", issuer: "Example issuer" };

describe("knowledge approval evidence binding", () => {
  test("requires resolved evidence before approval", () => {
    expect(() =>
      approveKnowledgeContent({
        evidence: undefined as never,
        reviewerId: "reviewer-1",
        content,
      })
    ).toThrow();
  });

  test("resolves a same-workspace checksummed document", async () => {
    const checksum = "a".repeat(64);
    const evidence = await resolveKnowledgeApprovalEvidence({
      workspaceId: "workspace-1",
      request: {
        approved: true,
        provenance: {
          sourceKind: "UPLOADED_DOCUMENT",
          sourceId: "certificate-1",
        },
      },
      now: new Date("2026-07-24T11:00:00.000Z"),
      loadDocument: async () => ({
        id: "certificate-1",
        workspaceId: "workspace-1",
        originalName: "certificate.pdf",
        currentVersion: 2,
        checksum: null,
        versionChecksum: checksum,
      }),
    });
    expect(evidence.evidenceRef).toBe(
      `uploaded-document:certificate-1:v2:sha256:${checksum}`
    );
    expect(evidence.provenance).toMatchObject({
      sourceKind: "UPLOADED_DOCUMENT",
      sourceId: "certificate-1",
      version: 2,
      checksum,
    });
  });

  test("rejects nonexistent, cross-workspace, and unchecksummed evidence", async () => {
    const request = {
      approved: true,
      provenance: {
        sourceKind: "UPLOADED_DOCUMENT",
        sourceId: "certificate-1",
      },
    };
    await expect(
      resolveKnowledgeApprovalEvidence({
        workspaceId: "workspace-1",
        request,
        loadDocument: async () => null,
      })
    ).rejects.toThrow("not found");
    await expect(
      resolveKnowledgeApprovalEvidence({
        workspaceId: "workspace-1",
        request,
        loadDocument: async () => ({
          id: "certificate-1",
          workspaceId: "workspace-2",
          originalName: "certificate.pdf",
          currentVersion: 1,
          checksum: "a".repeat(64),
          versionChecksum: null,
        }),
      })
    ).rejects.toThrow("another workspace");
    await expect(
      resolveKnowledgeApprovalEvidence({
        workspaceId: "workspace-1",
        request,
        loadDocument: async () => ({
          id: "certificate-1",
          workspaceId: "workspace-1",
          originalName: "certificate.pdf",
          currentVersion: 1,
          checksum: null,
          versionChecksum: null,
        }),
      })
    ).rejects.toThrow("checksum");
  });

  test("binds approval to reviewer, timestamp, provenance, and content hash", () => {
    const now = new Date("2026-07-24T12:00:00.000Z");
    const checksum = "a".repeat(64);
    const approved = approveKnowledgeContent({
      evidence: {
        evidenceRef: `uploaded-document:certificate-1:v1:sha256:${checksum}`,
        provenance: {
          sourceKind: "UPLOADED_DOCUMENT",
          sourceId: "certificate-1",
          version: 1,
          checksum,
          originalName: "certificate.pdf",
          capturedAt: "2026-07-24T11:00:00.000Z",
        },
      },
      reviewerId: "reviewer-1",
      content,
      now,
    });

    expect(approved).toMatchObject({
      approved: true,
      reviewStatus: "APPROVED",
      evidenceRef: `uploaded-document:certificate-1:v1:sha256:${checksum}`,
      evidenceDocumentId: "certificate-1",
      evidenceVersion: 1,
      evidenceChecksum: checksum,
      reviewedById: "reviewer-1",
      approvedAt: now,
      revokedAt: null,
    });
    expect(approved.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.parse(approved.provenanceJson ?? "{}")).toMatchObject({
      sourceKind: "UPLOADED_DOCUMENT",
      sourceId: "certificate-1",
    });
  });

  test("normalizes certificate dates before hashing", () => {
    const normalized = certificateKnowledgeContent({
      certType: "ISO",
      name: "ISO 27001",
      issuedAt: new Date("2026-01-01T00:00:00.000Z"),
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
    expect(normalized).toMatchObject({
      issuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
    expect(() => markKnowledgeContentUnreviewed(normalized)).not.toThrow();
  });

  test("substantive edits and explicit revocation fail closed", () => {
    const unreviewed = markKnowledgeContentUnreviewed({
      ...content,
      issuer: "Changed issuer",
    });
    expect(unreviewed).toMatchObject({
      approved: false,
      reviewStatus: "UNREVIEWED",
      evidenceRef: null,
      evidenceDocumentId: null,
      evidenceVersion: null,
      evidenceChecksum: null,
      reviewedById: null,
    });

    const approved = approveKnowledgeContent({
      evidence: {
        evidenceRef: `uploaded-document:certificate-1:v1:sha256:${"a".repeat(64)}`,
        provenance: {
          sourceKind: "UPLOADED_DOCUMENT",
          sourceId: "certificate-1",
          version: 1,
          checksum: "a".repeat(64),
          originalName: "certificate.pdf",
          capturedAt: "2026-07-24T11:00:00.000Z",
        },
      },
      reviewerId: "reviewer-1",
      content,
      now: new Date("2026-07-24T12:00:00.000Z"),
    });
    const revoked = revokeKnowledgeContent({
      request: { approved: false, reason: "Evidence withdrawn" },
      content,
      previous: approved,
      revokerId: "reviewer-2",
      now: new Date("2026-07-24T13:00:00.000Z"),
    });
    expect(revoked).toMatchObject({
      approved: false,
      reviewStatus: "REVOKED",
      evidenceRef: approved.evidenceRef,
      evidenceDocumentId: approved.evidenceDocumentId,
      evidenceVersion: approved.evidenceVersion,
      evidenceChecksum: approved.evidenceChecksum,
      provenanceJson: approved.provenanceJson,
      reviewedById: "reviewer-1",
      approvedAt: new Date("2026-07-24T12:00:00.000Z"),
      revokedAt: new Date("2026-07-24T13:00:00.000Z"),
      revokedById: "reviewer-2",
      revocationReason: "Evidence withdrawn",
    });
    expect(() =>
      revokeKnowledgeContent({
        request: { approved: false },
        content,
        previous: approved,
        revokerId: "reviewer-2",
      })
    ).toThrow();
    expect(() =>
      revokeKnowledgeContent({
        request: { approved: false, reason: "Not approved" },
        content,
        previous: unreviewed,
        revokerId: "reviewer-2",
      })
    ).toThrow("Only approved");
  });

  test("never falls back to a mutable document-level checksum", async () => {
    await expect(
      resolveKnowledgeApprovalEvidence({
        workspaceId: "workspace-1",
        request: {
          approved: true,
          provenance: {
            sourceKind: "UPLOADED_DOCUMENT",
            sourceId: "certificate-1",
          },
        },
        loadDocument: async () => ({
          id: "certificate-1",
          workspaceId: "workspace-1",
          originalName: "certificate.pdf",
          currentVersion: 2,
          checksum: "a".repeat(64),
          versionChecksum: null,
        }),
      })
    ).rejects.toThrow("current version");
  });

  test("permits hard deletion only before any review history exists", () => {
    const pristine = markKnowledgeContentUnreviewed(content);
    expect(isKnowledgeHardDeleteAllowed(pristine)).toBe(true);

    const approved = approveKnowledgeContent({
      evidence: {
        evidenceRef: `uploaded-document:certificate-1:v1:sha256:${"a".repeat(64)}`,
        provenance: {
          sourceKind: "UPLOADED_DOCUMENT",
          sourceId: "certificate-1",
          version: 1,
          checksum: "a".repeat(64),
          originalName: "certificate.pdf",
          capturedAt: "2026-07-24T11:00:00.000Z",
        },
      },
      reviewerId: "reviewer-1",
      content,
    });
    expect(isKnowledgeHardDeleteAllowed(approved)).toBe(false);
    expect(
      isKnowledgeHardDeleteAllowed({
        ...pristine,
        reviewStatus: "REVOKED",
        evidenceRef: approved.evidenceRef,
      })
    ).toBe(false);
  });
});
