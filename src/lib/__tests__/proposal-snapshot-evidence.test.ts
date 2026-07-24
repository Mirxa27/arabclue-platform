import { describe, expect, test } from "bun:test";
import type { PastProject } from "@prisma/client";
import {
  hashKnowledgeContent,
  pastProjectKnowledgeContent,
} from "../knowledge-approval";
import {
  eligibleStructuredEvidenceBindings,
  filterBindingsWithLiveEvidence,
} from "../proposal-snapshot-evidence";

function approvedPastProject(
  overrides: Partial<PastProject> = {}
): PastProject {
  const record: PastProject = {
    id: "past-project-1",
    workspaceId: "workspace-1",
    brandProfileId: null,
    title: "Approved digital programme",
    titleAr: "برنامج رقمي معتمد",
    clientName: "Authority",
    clientNameAr: "الجهة",
    sector: "GOV",
    contractValue: null,
    currency: "SAR",
    startDate: null,
    endDate: null,
    outcome: "COMPLETED",
    summary: "Delivered the approved programme scope.",
    summaryAr: "تم تنفيذ نطاق البرنامج المعتمد.",
    vectorId: null,
    embeddingJson: null,
    tags: "digital",
    approved: true,
    reviewStatus: "APPROVED",
    evidenceRef: `uploaded-document:doc-1:v2:sha256:${"b".repeat(64)}`,
    evidenceDocumentId: "doc-1",
    evidenceVersion: 2,
    evidenceChecksum: "b".repeat(64),
    evidenceDocumentId: "doc-1",
    evidenceVersion: 2,
    evidenceChecksum: "b".repeat(64),
    provenanceJson: JSON.stringify({
      sourceKind: "UPLOADED_DOCUMENT",
      sourceId: "doc-1",
      version: 2,
      checksum: "b".repeat(64),
      originalName: "approved-evidence.pdf",
      capturedAt: "2026-07-24T10:00:00.000Z",
    }),
    reviewedById: "reviewer-1",
    approvedAt: new Date("2026-07-24T11:00:00.000Z"),
    contentHash: null,
    revokedAt: null,
    revokedById: null,
    revocationReason: null,
    createdAt: new Date("2026-07-24T09:00:00.000Z"),
    updatedAt: new Date("2026-07-24T11:00:00.000Z"),
    ...overrides,
  };
  if (overrides.contentHash === undefined) {
    record.contentHash = hashKnowledgeContent(
      pastProjectKnowledgeContent(record)
    );
  }
  return record;
}

function candidates(projects: readonly PastProject[]) {
  return {
    certificates: [],
    pastProjects: projects,
    libraryItems: [],
    methodologies: [],
  };
}

describe("structured proposal evidence resolver", () => {
  test("binds exact server-approved hash, provenance version, and canonical locator", () => {
    const project = approvedPastProject();
    const result = eligibleStructuredEvidenceBindings(
      "workspace-1",
      candidates([project])
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: project.id,
      title: {
        en: project.title,
        ar: project.titleAr,
      },
      knowledgeBinding: {
        recordType: "PAST_PROJECT",
        contentHash: project.contentHash,
        evidenceRef: project.evidenceRef,
        reviewStatus: "APPROVED",
        reviewedById: "reviewer-1",
        provenance: {
          sourceId: "doc-1",
          version: 2,
        },
      },
    });
    expect(result[0].locator).toContain(project.contentHash as string);
  });

  test("excludes another tenant, revoked evidence, and content edited after approval", () => {
    const approved = approvedPastProject();
    const otherTenant = approvedPastProject({
      id: "past-project-other",
      workspaceId: "workspace-other",
    });
    const revoked = approvedPastProject({
      id: "past-project-revoked",
      revokedAt: new Date("2026-07-24T12:00:00.000Z"),
    });
    const edited = {
      ...approvedPastProject({ id: "past-project-edited" }),
      summary: "Content changed after its stored approval hash.",
    };

    const result = eligibleStructuredEvidenceBindings(
      "workspace-1",
      candidates([otherTenant, revoked, edited])
    );
    expect(result).toEqual([]);
  });

  test("does not invent a binding for a fake or absent id", () => {
    expect(
      eligibleStructuredEvidenceBindings("workspace-1", candidates([]))
    ).toEqual([]);
  });

  test("requires the exact live tenant document version and checksum", () => {
    const bindings = eligibleStructuredEvidenceBindings(
      "workspace-1",
      candidates([approvedPastProject()])
    );
    const document = {
      id: "doc-1",
      workspaceId: "workspace-1",
      originalName: "approved-evidence.pdf",
    };
    const version = {
      documentId: "doc-1",
      version: 2,
      checksum: "b".repeat(64),
    };

    expect(
      filterBindingsWithLiveEvidence(
        "workspace-1",
        bindings,
        [document],
        [version]
      )
    ).toHaveLength(1);
    expect(
      filterBindingsWithLiveEvidence(
        "workspace-1",
        bindings,
        [],
        [version]
      )
    ).toEqual([]);
    expect(
      filterBindingsWithLiveEvidence(
        "workspace-1",
        bindings,
        [document],
        [{ ...version, checksum: "c".repeat(64) }]
      )
    ).toEqual([]);
    expect(
      filterBindingsWithLiveEvidence(
        "workspace-1",
        bindings,
        [{ ...document, workspaceId: "workspace-other" }],
        [version]
      )
    ).toEqual([]);
  });
});
