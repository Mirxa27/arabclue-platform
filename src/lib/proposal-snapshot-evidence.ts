import { db } from "./db";
import type {
  Certificate,
  ContentLibraryItem,
  MethodologyAsset,
  PastProject,
  Prisma,
} from "@prisma/client";
import {
  certificateKnowledgeContent,
  hashKnowledgeContent,
  knowledgeProvenanceSchema,
  libraryKnowledgeContent,
  methodologyKnowledgeContent,
  pastProjectKnowledgeContent,
} from "./knowledge-approval";
import {
  isCertificateValid,
  isLibraryItemEligible,
  isMethodologyEligible,
  isPastProjectEligible,
} from "./knowledge-eligibility";
import type {
  StructuredApprovedEvidenceBinding,
} from "./proposal-snapshot-persistence";
import type { ProposalKnowledgeSourceBinding } from "./proposal-layouts";

export interface StructuredEvidenceCandidates {
  readonly certificates: readonly Certificate[];
  readonly pastProjects: readonly PastProject[];
  readonly libraryItems: readonly ContentLibraryItem[];
  readonly methodologies: readonly MethodologyAsset[];
}

export interface LiveEvidenceDocument {
  readonly id: string;
  readonly workspaceId: string;
  readonly originalName: string;
}

export interface LiveEvidenceVersion {
  readonly documentId: string;
  readonly version: number;
  readonly checksum: string | null;
}

function approvedBinding(
  record: {
    readonly id: string;
    readonly evidenceRef: string | null;
    readonly evidenceDocumentId: string | null;
    readonly evidenceVersion: number | null;
    readonly evidenceChecksum: string | null;
    readonly provenanceJson: string | null;
    readonly reviewedById: string | null;
    readonly approvedAt: Date | null;
    readonly contentHash: string | null;
  },
  recordType: ProposalKnowledgeSourceBinding["recordType"],
  title: { readonly en: string; readonly ar: string }
): StructuredApprovedEvidenceBinding | null {
  if (
    !record.evidenceRef ||
    !record.evidenceDocumentId ||
    !record.evidenceVersion ||
    !record.evidenceChecksum ||
    !record.provenanceJson ||
    !record.reviewedById ||
    !record.approvedAt ||
    !record.contentHash ||
    !/^sha256:[a-f0-9]{64}$/u.test(record.contentHash)
  ) {
    return null;
  }
  let rawProvenance: unknown;
  try {
    rawProvenance = JSON.parse(record.provenanceJson);
  } catch {
    return null;
  }
  const provenance = knowledgeProvenanceSchema.safeParse(rawProvenance);
  if (!provenance.success) return null;
  if (
    provenance.data.sourceId !== record.evidenceDocumentId ||
    provenance.data.version !== record.evidenceVersion ||
    provenance.data.checksum.toLowerCase() !==
      record.evidenceChecksum.toLowerCase()
  ) {
    return null;
  }
  const expectedEvidenceRef =
    `uploaded-document:${record.evidenceDocumentId}:v${record.evidenceVersion}` +
    `:sha256:${record.evidenceChecksum.toLowerCase()}`;
  if (record.evidenceRef !== expectedEvidenceRef) return null;
  const approvedAt = record.approvedAt.toISOString();
  const knowledgeBinding: ProposalKnowledgeSourceBinding = {
    recordType,
    contentHash: record.contentHash,
    evidenceRef: record.evidenceRef,
    reviewStatus: "APPROVED",
    reviewedById: record.reviewedById,
    approvedAt,
    provenance: provenance.data,
  };
  return {
    id: record.id,
    title,
    locator: `approved-knowledge:${recordType.toLowerCase()}:${encodeURIComponent(record.id)}:${record.contentHash}`,
    asOf: approvedAt,
    knowledgeBinding,
  };
}

/**
 * Pure eligibility/binding step used by the database loader and regression
 * tests. Workspace identity is checked again even though production queries
 * are already tenant-scoped.
 */
export function eligibleStructuredEvidenceBindings(
  workspaceId: string,
  candidates: StructuredEvidenceCandidates,
  now = new Date()
): readonly StructuredApprovedEvidenceBinding[] {
  const bindings: StructuredApprovedEvidenceBinding[] = [];
  for (const certificate of candidates.certificates) {
    if (certificate.workspaceId !== workspaceId) continue;
    if (
      !isCertificateValid({
        ...certificate,
        now,
        expectedContentHash: hashKnowledgeContent(
          certificateKnowledgeContent(certificate)
        ),
      }).eligible
    ) {
      continue;
    }
    const binding = approvedBinding(certificate, "CERTIFICATE", {
      en: certificate.name,
      ar: certificate.name,
    });
    if (binding) bindings.push(binding);
  }
  for (const project of candidates.pastProjects) {
    if (project.workspaceId !== workspaceId) continue;
    if (
      !isPastProjectEligible({
        ...project,
        expectedContentHash: hashKnowledgeContent(
          pastProjectKnowledgeContent(project)
        ),
      }).eligible
    ) {
      continue;
    }
    const binding = approvedBinding(project, "PAST_PROJECT", {
      en: project.title,
      ar: project.titleAr ?? project.title,
    });
    if (binding) bindings.push(binding);
  }
  for (const item of candidates.libraryItems) {
    if (item.workspaceId !== workspaceId) continue;
    if (
      !isLibraryItemEligible({
        ...item,
        expectedContentHash: hashKnowledgeContent(
          libraryKnowledgeContent(item)
        ),
      }).eligible
    ) {
      continue;
    }
    const binding = approvedBinding(item, "LIBRARY_ITEM", {
      en: item.title,
      ar: item.titleAr ?? item.title,
    });
    if (binding) bindings.push(binding);
  }
  for (const methodology of candidates.methodologies) {
    if (methodology.workspaceId !== workspaceId) continue;
    if (
      !isMethodologyEligible({
        ...methodology,
        expectedContentHash: hashKnowledgeContent(
          methodologyKnowledgeContent(methodology)
        ),
      }).eligible
    ) {
      continue;
    }
    const binding = approvedBinding(methodology, "METHODOLOGY", {
      en: methodology.title,
      ar: methodology.titleAr ?? methodology.title,
    });
    if (binding) bindings.push(binding);
  }
  return bindings.sort((first, second) => first.id.localeCompare(second.id));
}

/**
 * Keep a privileged binding only while its exact tenant document version is
 * still live. A current document may advance to a newer version; the captured
 * historical version must remain addressable with the same checksum.
 */
export function filterBindingsWithLiveEvidence(
  workspaceId: string,
  bindings: readonly StructuredApprovedEvidenceBinding[],
  documents: readonly LiveEvidenceDocument[],
  versions: readonly LiveEvidenceVersion[]
): readonly StructuredApprovedEvidenceBinding[] {
  const documentMap = new Map(
    documents
      .filter((document) => document.workspaceId === workspaceId)
      .map((document) => [document.id, document])
  );
  const versionMap = new Map(
    versions.map((version) => [
      `${version.documentId}:${version.version}`,
      version,
    ])
  );
  return bindings.filter((binding) => {
    const provenance = binding.knowledgeBinding.provenance;
    const document = documentMap.get(provenance.sourceId);
    const version = versionMap.get(
      `${provenance.sourceId}:${provenance.version}`
    );
    return (
      document?.originalName === provenance.originalName &&
      version?.checksum?.toLowerCase() ===
        provenance.checksum.toLowerCase()
    );
  });
}

/**
 * Resolve only currently eligible knowledge records from the caller's tenant.
 * Content hashes are recomputed so a post-approval edit cannot retain trust.
 */
export async function loadApprovedStructuredEvidenceBindings(
  workspaceId: string,
  claimedIds: readonly string[],
  now = new Date(),
  database: Pick<
    Prisma.TransactionClient,
    | "certificate"
    | "pastProject"
    | "contentLibraryItem"
    | "methodologyAsset"
    | "uploadedDocument"
    | "documentVersion"
  > = db
): Promise<readonly StructuredApprovedEvidenceBinding[]> {
  const ids = [...new Set(claimedIds)];
  if (ids.length === 0) return [];
  const reviewedWhere = {
    id: { in: ids },
    workspaceId,
    approved: true,
    reviewStatus: "APPROVED" as const,
    revokedAt: null,
    evidenceRef: { not: null },
    provenanceJson: { not: null },
    reviewedById: { not: null },
    approvedAt: { not: null },
    contentHash: { not: null },
  };
  const [certificateRows, pastRows, libraryRows, methodologyRows] =
    await Promise.all([
      database.certificate.findMany({
        where: {
          ...reviewedWhere,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
      database.pastProject.findMany({ where: reviewedWhere }),
      database.contentLibraryItem.findMany({
        where: { ...reviewedWhere, restricted: false },
      }),
      database.methodologyAsset.findMany({ where: reviewedWhere }),
    ]);

  const bindings = eligibleStructuredEvidenceBindings(
    workspaceId,
    {
      certificates: certificateRows,
      pastProjects: pastRows,
      libraryItems: libraryRows,
      methodologies: methodologyRows,
    },
    now
  );
  const sourceIds = [
    ...new Set(
      bindings.map(
        (binding) => binding.knowledgeBinding.provenance.sourceId
      )
    ),
  ];
  if (sourceIds.length === 0) return [];
  const [documents, versions] = await Promise.all([
    database.uploadedDocument.findMany({
      where: { id: { in: sourceIds }, workspaceId },
      select: { id: true, workspaceId: true, originalName: true },
    }),
    database.documentVersion.findMany({
      where: { documentId: { in: sourceIds } },
      select: { documentId: true, version: true, checksum: true },
    }),
  ]);
  return filterBindingsWithLiveEvidence(
    workspaceId,
    bindings,
    documents,
    versions
  );
}
