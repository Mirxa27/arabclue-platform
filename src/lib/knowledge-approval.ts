import { z } from "zod";
import { computeCanonicalHash } from "./document-templates/contract-templates";

export const knowledgeEvidencePointerSchema = z
  .object({
    sourceKind: z.literal("UPLOADED_DOCUMENT"),
    sourceId: z.string().trim().min(1).max(200),
  })
  .strict();

export const knowledgeProvenanceSchema = knowledgeEvidencePointerSchema
  .extend({
    version: z.number().int().positive(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/i),
    originalName: z.string().trim().min(1).max(500),
    capturedAt: z.string().datetime(),
  })
  .strict();

export const knowledgeApprovalRequestSchema = z
  .object({
    approved: z.literal(true),
    provenance: knowledgeEvidencePointerSchema,
  })
  .strict();

export const knowledgeRevocationRequestSchema = z
  .object({
    approved: z.literal(false),
    reason: z.string().trim().min(1).max(1_000),
  })
  .strict();

export interface KnowledgeApprovalMutation {
  readonly approved: boolean;
  readonly reviewStatus: "UNREVIEWED" | "APPROVED" | "REVOKED";
  readonly evidenceRef: string | null;
  readonly provenanceJson: string | null;
  readonly reviewedById: string | null;
  readonly approvedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly revokedById: string | null;
  readonly revocationReason: string | null;
  readonly contentHash: string;
}

export interface ApprovedKnowledgeState {
  readonly approved: boolean;
  readonly reviewStatus: "UNREVIEWED" | "APPROVED" | "REVOKED";
  readonly evidenceRef: string | null;
  readonly provenanceJson: string | null;
  readonly reviewedById: string | null;
  readonly approvedAt: Date | null;
}

export interface ResolvedKnowledgeEvidence {
  readonly evidenceRef: string;
  readonly provenance: z.infer<typeof knowledgeProvenanceSchema>;
}

export type KnowledgeEvidenceDocument = {
  readonly id: string;
  readonly workspaceId: string;
  readonly originalName: string;
  readonly currentVersion: number;
  readonly checksum: string | null;
  readonly versionChecksum: string | null;
};

type KnowledgeEvidenceLoader = (
  workspaceId: string,
  documentId: string
) => Promise<KnowledgeEvidenceDocument | null>;

function normalizeKnowledgeDate(
  value: Date | string | null | undefined
): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Knowledge content contains an invalid date");
  }
  return date.toISOString();
}

export function certificateKnowledgeContent(record: {
  readonly certType: string;
  readonly name: string;
  readonly number?: string | null;
  readonly issuer?: string | null;
  readonly issuedAt?: Date | string | null;
  readonly expiresAt?: Date | string | null;
  readonly filePath?: string | null;
  readonly notes?: string | null;
}): Record<string, unknown> {
  return {
    certType: record.certType,
    name: record.name,
    number: record.number ?? null,
    issuer: record.issuer ?? null,
    issuedAt: normalizeKnowledgeDate(record.issuedAt),
    expiresAt: normalizeKnowledgeDate(record.expiresAt),
    filePath: record.filePath ?? null,
    notes: record.notes ?? null,
  };
}

export function methodologyKnowledgeContent(record: {
  readonly category: string;
  readonly title: string;
  readonly titleAr?: string | null;
  readonly bodyMd: string;
}): Record<string, unknown> {
  return {
    category: record.category,
    title: record.title,
    titleAr: record.titleAr ?? null,
    bodyMd: record.bodyMd,
  };
}

export function libraryKnowledgeContent(record: {
  readonly title: string;
  readonly titleAr?: string | null;
  readonly category: string;
  readonly bodyMd: string;
  readonly tags?: string | null;
  readonly restricted: boolean;
}): Record<string, unknown> {
  return {
    title: record.title,
    titleAr: record.titleAr ?? null,
    category: record.category,
    bodyMd: record.bodyMd,
    tags: record.tags ?? null,
    restricted: record.restricted,
  };
}

export function pastProjectKnowledgeContent(record: {
  readonly title: string;
  readonly titleAr?: string | null;
  readonly clientName?: string | null;
  readonly clientNameAr?: string | null;
  readonly sector?: string | null;
  readonly contractValue?: number | null;
  readonly currency: string;
  readonly startDate?: Date | string | null;
  readonly endDate?: Date | string | null;
  readonly outcome?: string | null;
  readonly summary: string;
  readonly summaryAr?: string | null;
  readonly tags?: string | null;
}): Record<string, unknown> {
  return {
    title: record.title,
    titleAr: record.titleAr ?? null,
    clientName: record.clientName ?? null,
    clientNameAr: record.clientNameAr ?? null,
    sector: record.sector ?? null,
    contractValue: record.contractValue ?? null,
    currency: record.currency,
    startDate: normalizeKnowledgeDate(record.startDate),
    endDate: normalizeKnowledgeDate(record.endDate),
    outcome: record.outcome ?? null,
    summary: record.summary,
    summaryAr: record.summaryAr ?? null,
    tags: record.tags ?? null,
  };
}

export function hashKnowledgeContent(content: unknown): string {
  return computeCanonicalHash(content);
}

function evidenceReference(
  documentId: string,
  version: number,
  checksum: string
): string {
  return `uploaded-document:${documentId}:v${version}:sha256:${checksum.toLowerCase()}`;
}

async function loadEvidenceDocument(
  workspaceId: string,
  documentId: string
): Promise<KnowledgeEvidenceDocument | null> {
  const { db } = await import("./db");
  const document = await db.uploadedDocument.findFirst({
    where: { id: documentId, workspaceId },
    select: {
      id: true,
      workspaceId: true,
      originalName: true,
      currentVersion: true,
      checksum: true,
    },
  });
  if (!document) return null;
  const version = await db.documentVersion.findUnique({
    where: {
      documentId_version: {
        documentId: document.id,
        version: document.currentVersion,
      },
    },
    select: { checksum: true },
  });
  return {
    ...document,
    versionChecksum: version?.checksum ?? null,
  };
}

/**
 * Resolve an approval pointer against the tenant's immutable uploaded document
 * record. Callers cannot self-attest an arbitrary evidence locator.
 */
export async function resolveKnowledgeApprovalEvidence(input: {
  readonly workspaceId: string;
  readonly request: unknown;
  readonly now?: Date;
  readonly loadDocument?: KnowledgeEvidenceLoader;
}): Promise<ResolvedKnowledgeEvidence> {
  const request = knowledgeApprovalRequestSchema.parse(input.request);
  const loader = input.loadDocument ?? loadEvidenceDocument;
  const document = await loader(
    input.workspaceId,
    request.provenance.sourceId
  );
  if (!document) {
    throw new Error("Knowledge evidence document was not found in this workspace");
  }
  if (document.workspaceId !== input.workspaceId) {
    throw new Error("Knowledge evidence document belongs to another workspace");
  }
  const checksum = document.versionChecksum ?? document.checksum;
  if (!checksum || !/^[a-f0-9]{64}$/i.test(checksum)) {
    throw new Error("Knowledge evidence document has no verifiable checksum");
  }
  const provenance = knowledgeProvenanceSchema.parse({
    sourceKind: "UPLOADED_DOCUMENT",
    sourceId: document.id,
    version: document.currentVersion,
    checksum: checksum.toLowerCase(),
    originalName: document.originalName,
    capturedAt: (input.now ?? new Date()).toISOString(),
  });
  return {
    evidenceRef: evidenceReference(
      provenance.sourceId,
      provenance.version,
      provenance.checksum
    ),
    provenance,
  };
}

export function approveKnowledgeContent(input: {
  readonly evidence: ResolvedKnowledgeEvidence;
  readonly reviewerId: string;
  readonly content: unknown;
  readonly now?: Date;
}): KnowledgeApprovalMutation {
  const provenance = knowledgeProvenanceSchema.parse(input.evidence.provenance);
  const expectedReference = evidenceReference(
    provenance.sourceId,
    provenance.version,
    provenance.checksum
  );
  if (input.evidence.evidenceRef !== expectedReference) {
    throw new Error("Knowledge evidence reference does not match provenance");
  }
  const now = input.now ?? new Date();
  return {
    approved: true,
    reviewStatus: "APPROVED",
    evidenceRef: expectedReference,
    provenanceJson: JSON.stringify(provenance),
    reviewedById: input.reviewerId,
    approvedAt: now,
    revokedAt: null,
    revokedById: null,
    revocationReason: null,
    contentHash: hashKnowledgeContent(input.content),
  };
}

export function revokeKnowledgeContent(input: {
  readonly request: unknown;
  readonly content: unknown;
  readonly previous: ApprovedKnowledgeState;
  readonly revokerId: string;
  readonly now?: Date;
}): KnowledgeApprovalMutation {
  const request = knowledgeRevocationRequestSchema.parse(input.request);
  if (
    !input.previous.approved ||
    input.previous.reviewStatus !== "APPROVED" ||
    !input.previous.evidenceRef ||
    !input.previous.provenanceJson ||
    !input.previous.reviewedById ||
    !input.previous.approvedAt
  ) {
    throw new Error("Only approved knowledge can be revoked");
  }
  return {
    approved: false,
    reviewStatus: "REVOKED",
    evidenceRef: input.previous.evidenceRef,
    provenanceJson: input.previous.provenanceJson,
    reviewedById: input.previous.reviewedById,
    approvedAt: input.previous.approvedAt,
    revokedAt: input.now ?? new Date(),
    revokedById: input.revokerId,
    revocationReason: request.reason,
    contentHash: hashKnowledgeContent(input.content),
  };
}

/** Any substantive edit invalidates the prior evidence binding. */
export function markKnowledgeContentUnreviewed(
  content: unknown
): KnowledgeApprovalMutation {
  return {
    approved: false,
    reviewStatus: "UNREVIEWED",
    evidenceRef: null,
    provenanceJson: null,
    reviewedById: null,
    approvedAt: null,
    revokedAt: null,
    revokedById: null,
    revocationReason: null,
    contentHash: hashKnowledgeContent(content),
  };
}
